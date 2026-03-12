const express = require('express');
const { body, validationResult } = require('express-validator');
const ExerciseSession = require('../models/ExerciseSession');
const NightscoutService = require('../services/nightscoutService');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Exercise glucose impact profiles (minutes post-start)
const EXERCISE_GLUCOSE_PROFILES = {
  strength: {
    description: 'Initial hyperglycemic effect, then sensitizing for 12-24h',
    duringRisk: 'low_hypo',
    postRisk: 'moderate_hypo',
    sensitizationHours: 24,
    recommendation: 'May need slightly less insulin for meals in next 24h',
  },
  hiit: {
    description: 'Biphasic: hyperglycemia during, hypoglycemia after (up to 12h)',
    duringRisk: 'low_hypo',
    postRisk: 'high_hypo',
    sensitizationHours: 12,
    recommendation: 'Watch for nocturnal hypoglycemia. Consider snack before bed.',
  },
  cardio: {
    description: 'Hypoglycemic during and after exercise',
    duringRisk: 'high_hypo',
    postRisk: 'moderate_hypo',
    sensitizationHours: 6,
    recommendation: 'Reduce basal 60-90 min before. Target glucose 140-160 before starting.',
  },
};

// POST /api/exercise - log an exercise session
router.post(
  '/',
  authMiddleware,
  [
    body('type').isIn(['strength', 'hiit', 'cardio', 'yoga', 'other']),
    body('timestamp').isISO8601(),
    body('duration').optional().isNumeric(),
    body('intensity').optional().isInt({ min: 1, max: 10 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const sessionData = { ...req.body, userId: req.user._id };

      // Fetch glucose context from NS
      if (req.user.nightscout.connected) {
        try {
          const ns = new NightscoutService(req.user.nightscout.url, req.user.nightscout.apiSecret);
          const glucose = await ns.getCurrentGlucose();
          sessionData.glucoseContext = { beforeExercise: glucose?.glucose };
        } catch {
          // Don't fail if NS is unavailable
        }
      }

      const session = await ExerciseSession.create(sessionData);
      const profile = EXERCISE_GLUCOSE_PROFILES[req.body.type] || {};

      res.status(201).json({ session, glucoseProfile: profile });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/exercise?date=2024-01-15
router.get('/', authMiddleware, async (req, res) => {
  try {
    const date = req.query.date ? new Date(req.query.date) : new Date();
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const sessions = await ExerciseSession.find({
      userId: req.user._id,
      timestamp: { $gte: start, $lte: end },
    }).sort({ timestamp: 1 });

    const totalMinutes = sessions.reduce((sum, s) => sum + (s.duration || 0), 0);

    res.json({ sessions, totalMinutes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/exercise/pre-check - safety check before exercising
router.get('/pre-check', authMiddleware, async (req, res) => {
  try {
    const exerciseType = req.query.type || 'cardio';
    const plannedDuration = parseInt(req.query.duration) || 45;

    if (!req.user.nightscout.connected) {
      return res.json({ status: 'no_nightscout', message: 'Connect Nightscout for safety check' });
    }

    const ns = new NightscoutService(req.user.nightscout.url, req.user.nightscout.apiSecret);
    const [glucose, deviceStatus] = await Promise.all([
      ns.getCurrentGlucose(),
      ns.getDeviceStatus(),
    ]);

    const currentGlucose = glucose?.glucose;
    const iob = deviceStatus?.iob || 0;
    const trend = glucose?.direction;

    let status = 'safe';
    const warnings = [];
    const recommendations = [];

    // Safety thresholds by exercise type
    const minGlucose = exerciseType === 'cardio' ? 126 : 100;
    const maxGlucose = 270;

    if (currentGlucose < 90) {
      status = 'unsafe';
      warnings.push('Glucose too low to exercise safely');
      recommendations.push('Consume 15-20g fast carbs and recheck in 15 min');
    } else if (currentGlucose < minGlucose) {
      status = 'caution';
      warnings.push(`Glucose below recommended minimum for ${exerciseType} (${minGlucose} mg/dL)`);
      recommendations.push(`Consider eating 15g carbs before starting`);
    }

    if (currentGlucose > maxGlucose) {
      status = 'unsafe';
      warnings.push('Glucose too high - check ketones before exercising');
    }

    if (iob > 1.5 && exerciseType !== 'strength') {
      status = status === 'safe' ? 'caution' : status;
      warnings.push(`High IOB (${iob.toFixed(1)}u) increases hypoglycemia risk`);
      recommendations.push('Consider reducing intensity or duration');
    }

    if (trend === 'DoubleDown' || trend === 'SingleDown') {
      status = status === 'safe' ? 'caution' : status;
      warnings.push('Glucose is falling - monitor closely');
    }

    res.json({
      status,
      currentGlucose,
      trend,
      iob,
      warnings,
      recommendations,
      profile: EXERCISE_GLUCOSE_PROFILES[exerciseType],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/exercise/programs - library of exercise programs
router.get('/programs', authMiddleware, (req, res) => {
  const programs = [
    {
      id: 'ppl_push',
      category: 'strength',
      name: 'Push Day (PPL)',
      duration: 60,
      muscleGroups: ['chest', 'shoulders', 'triceps'],
      exercises: [
        { name: 'Bench Press', sets: 4, reps: '8-10', rest: 90 },
        { name: 'Overhead Press', sets: 3, reps: '8-10', rest: 90 },
        { name: 'Incline DB Press', sets: 3, reps: '10-12', rest: 75 },
        { name: 'Lateral Raises', sets: 3, reps: '12-15', rest: 60 },
        { name: 'Tricep Pushdowns', sets: 3, reps: '12-15', rest: 60 },
      ],
      glucoseNote: 'Expect glucose rise during. Enhanced insulin sensitivity for 24h post.',
    },
    {
      id: 'ppl_pull',
      category: 'strength',
      name: 'Pull Day (PPL)',
      duration: 60,
      muscleGroups: ['back', 'biceps', 'rear_delts'],
      exercises: [
        { name: 'Deadlift', sets: 4, reps: '5-6', rest: 120 },
        { name: 'Barbell Row', sets: 4, reps: '8-10', rest: 90 },
        { name: 'Pull-ups', sets: 3, reps: 'max', rest: 90 },
        { name: 'Face Pulls', sets: 3, reps: '15-20', rest: 60 },
        { name: 'Bicep Curls', sets: 3, reps: '10-12', rest: 60 },
      ],
      glucoseNote: 'Similar to Push Day. Focus on adequate protein post-workout.',
    },
    {
      id: 'ppl_legs',
      category: 'strength',
      name: 'Leg Day (PPL)',
      duration: 70,
      muscleGroups: ['quads', 'hamstrings', 'glutes', 'calves'],
      exercises: [
        { name: 'Squat', sets: 4, reps: '6-8', rest: 120 },
        { name: 'Romanian Deadlift', sets: 3, reps: '8-10', rest: 90 },
        { name: 'Leg Press', sets: 3, reps: '10-12', rest: 90 },
        { name: 'Leg Curl', sets: 3, reps: '12-15', rest: 60 },
        { name: 'Calf Raises', sets: 4, reps: '15-20', rest: 60 },
      ],
      glucoseNote: 'Leg day has highest glucose impact. Watch for hypoglycemia 12-24h after.',
    },
    {
      id: 'hiit_tabata',
      category: 'hiit',
      name: 'Tabata HIIT',
      duration: 25,
      exercises: [
        { name: 'Burpees', sets: 8, reps: '20s on / 10s off', rest: 0 },
        { name: 'Jump Squats', sets: 8, reps: '20s on / 10s off', rest: 0 },
        { name: 'Mountain Climbers', sets: 8, reps: '20s on / 10s off', rest: 0 },
        { name: 'High Knees', sets: 8, reps: '20s on / 10s off', rest: 0 },
      ],
      glucoseNote: 'HIIT: glucose spikes during, then drops significantly 2-6h after. Check before bed.',
    },
    {
      id: 'cardio_zone2',
      category: 'cardio',
      name: 'Zone 2 Cardio (Fat Burning)',
      duration: 45,
      exercises: [
        { name: 'Steady-state cardio (treadmill/bike/row)', sets: 1, reps: '45 min at 60-70% max HR', rest: 0 },
      ],
      glucoseNote: 'Zone 2 maximizes fat oxidation and insulin sensitivity. Glucose may drop steadily during.',
    },
  ];

  res.json(programs);
});

module.exports = router;
