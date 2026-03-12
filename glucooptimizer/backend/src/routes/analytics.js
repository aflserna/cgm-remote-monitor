const express = require('express');
const NightscoutService = require('../services/nightscoutService');
const Meal = require('../models/Meal');
const ExerciseSession = require('../models/ExerciseSession');
const DailyScore = require('../models/DailyScore');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Calculate TIR metrics from CGM array
function calculateGlucoseMetrics(entries, low = 70, high = 180, tightHigh = 140) {
  if (!entries.length) return null;

  const values = entries.map((e) => e.glucose || e.sgv).filter(Boolean);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;

  const inRange = values.filter((v) => v >= low && v <= high).length;
  const inTightRange = values.filter((v) => v >= low && v <= tightHigh).length;
  const below = values.filter((v) => v < low).length;
  const above = values.filter((v) => v > high).length;

  const stdDev = Math.sqrt(values.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / values.length);
  const cv = (stdDev / avg) * 100;

  // GMI (Glucose Management Indicator) = 3.31 + 0.02392 * avg
  const gmi = 3.31 + 0.02392 * avg;

  return {
    tirPercent: Math.round((inRange / values.length) * 100),
    tirTightPercent: Math.round((inTightRange / values.length) * 100),
    timeBelowPercent: Math.round((below / values.length) * 100),
    timeAbovePercent: Math.round((above / values.length) * 100),
    averageGlucose: Math.round(avg),
    cv: Math.round(cv * 10) / 10,
    gmi: Math.round(gmi * 10) / 10,
    stdDev: Math.round(stdDev),
    readingsCount: values.length,
  };
}

// Calculate lipolysis score
function calculateLipolysisScore({ caloricDeficit, avgInsulin, activityMinutes, tirPercent }) {
  const deficitScore = Math.min(100, Math.max(0, (caloricDeficit / 500) * 100));
  const insulinScore = Math.min(100, Math.max(0, 100 - (avgInsulin / 50) * 100));
  const activityScore = Math.min(100, (activityMinutes / 60) * 100);
  const tirScore = tirPercent || 0;

  const total = Math.round(
    deficitScore * 0.35 + insulinScore * 0.35 + activityScore * 0.2 + tirScore * 0.1
  );

  return { score: total, caloricDeficitScore: Math.round(deficitScore), avgInsulinScore: Math.round(insulinScore), activityScore: Math.round(activityScore), tirScore: Math.round(tirScore) };
}

// GET /api/analytics/daily?date=2024-01-15
router.get('/daily', authMiddleware, async (req, res) => {
  try {
    const date = req.query.date ? new Date(req.query.date) : new Date();
    const dateStr = date.toISOString().split('T')[0];

    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    // Get data in parallel
    const [meals, exercise] = await Promise.all([
      Meal.find({ userId: req.user._id, timestamp: { $gte: start, $lte: end } }),
      ExerciseSession.find({ userId: req.user._id, timestamp: { $gte: start, $lte: end } }),
    ]);

    // Get CGM data from NS
    let glucoseMetrics = null;
    if (req.user.nightscout.connected) {
      try {
        const ns = new NightscoutService(req.user.nightscout.url, req.user.nightscout.apiSecret);
        const entries = await ns.getEntries(288 + 10); // full day
        glucoseMetrics = calculateGlucoseMetrics(
          entries,
          req.user.targets.glucoseLow,
          req.user.targets.glucoseHigh,
          req.user.targets.glucoseTightHigh
        );
      } catch {
        // NS unavailable
      }
    }

    // Nutrition totals
    const nutritionTotals = meals.reduce(
      (acc, m) => {
        acc.kcal += m.macros.kcal || 0;
        acc.carbs += m.macros.carbs || 0;
        acc.protein += m.macros.protein || 0;
        acc.fat += m.macros.fat || 0;
        return acc;
      },
      { kcal: 0, carbs: 0, protein: 0, fat: 0 }
    );

    const caloricDeficit = req.user.targets.dailyKcal - nutritionTotals.kcal;
    const activityMinutes = exercise.reduce((sum, s) => sum + (s.duration || 0), 0);

    // Calculate lipolysis score
    const lipolysis = calculateLipolysisScore({
      caloricDeficit,
      avgInsulin: 30, // placeholder until we parse NS treatments
      activityMinutes,
      tirPercent: glucoseMetrics?.tirPercent || 0,
    });

    // Component scores
    const glucoseScore = glucoseMetrics
      ? Math.round(glucoseMetrics.tirPercent * 0.6 + Math.max(0, 100 - glucoseMetrics.cv * 2) * 0.4)
      : 0;

    const nutritionScore = Math.min(
      100,
      Math.round(
        (nutritionTotals.kcal > 0 ? Math.max(0, 100 - Math.abs(caloricDeficit - 300) / 5) : 0) * 0.5 +
          (Math.abs(nutritionTotals.protein - req.user.targets.proteinG) < 20 ? 100 : 50) * 0.3 +
          (meals.length >= 3 ? 100 : (meals.length / 3) * 100) * 0.2
      )
    );

    const exerciseScore = Math.min(100, Math.round((activityMinutes / 45) * 100));

    const totalScore = Math.round(
      glucoseScore * 0.4 + nutritionScore * 0.3 + exerciseScore * 0.2 + lipolysis.score * 0.1
    );

    const result = {
      date: dateStr,
      scores: { glucose: glucoseScore, nutrition: nutritionScore, exercise: exerciseScore, lipolysis: lipolysis.score, total: totalScore },
      glucoseMetrics,
      nutritionMetrics: { ...nutritionTotals, caloricDeficit, mealsLogged: meals.length },
      exerciseMetrics: { totalMinutes: activityMinutes, sessionsCount: exercise.length, types: [...new Set(exercise.map((e) => e.type))] },
      lipolysisScore: { ...lipolysis, caloricDeficit, avgDailyInsulin: null },
    };

    // Save/update daily score
    await DailyScore.findOneAndUpdate(
      { userId: req.user._id, date: dateStr },
      { $set: { ...result, userId: req.user._id } },
      { upsert: true }
    );

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/weekly - last 7 days
router.get('/weekly', authMiddleware, async (req, res) => {
  try {
    const end = new Date();
    const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];

    const scores = await DailyScore.find({
      userId: req.user._id,
      date: { $gte: startStr, $lte: endStr },
    }).sort({ date: 1 });

    const avgTir = scores.reduce((sum, s) => sum + (s.glucoseMetrics?.tirPercent || 0), 0) / (scores.length || 1);
    const avgScore = scores.reduce((sum, s) => sum + (s.scores?.total || 0), 0) / (scores.length || 1);
    const avgLipolysis = scores.reduce((sum, s) => sum + (s.lipolysisScore?.score || 0), 0) / (scores.length || 1);

    res.json({
      days: scores,
      averages: {
        tir: Math.round(avgTir),
        dailyScore: Math.round(avgScore),
        lipolysis: Math.round(avgLipolysis),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/achievements - check and return achievements
router.get('/achievements', authMiddleware, async (req, res) => {
  const allAchievements = [
    { id: 'first_meal', name: 'Primera Comida', description: 'Registra tu primera comida', icon: '🥗', points: 10 },
    { id: 'first_exercise', name: 'Primera Sesión', description: 'Registra tu primera sesión de ejercicio', icon: '💪', points: 10 },
    { id: 'streak_7', name: 'Semana de Racha', description: '7 días consecutivos con TIR > 70%', icon: '🔥', points: 100 },
    { id: 'streak_30', name: 'Mes Perfecto', description: '30 días consecutivos con TIR > 70%', icon: '🏆', points: 500 },
    { id: 'no_hypo_7', name: 'Sin Hipoglucemias', description: '7 días sin hipoglucemias nocturnas', icon: '🛡️', points: 150 },
    { id: 'cv_low', name: 'Estabilidad', description: 'CV < 36% durante 7 días', icon: '📊', points: 200 },
    { id: 'model_personal', name: 'IA Calibrada', description: '30 días de datos para modelo personal', icon: '🤖', points: 300 },
    { id: 'lipolysis_30', name: 'Modo Quema', description: 'Score de lipolisis > 70 durante 30 días', icon: '🔥', points: 400 },
  ];

  const unlocked = req.user.stats.achievements.map((a) => a.id);

  res.json({
    all: allAchievements,
    unlocked,
    totalPoints: req.user.stats.totalPoints,
    currentStreak: req.user.stats.currentStreakDays,
  });
});

module.exports = router;
