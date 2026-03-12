const mongoose = require('mongoose');

const dailyScoreSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true }, // YYYY-MM-DD

    // Component scores (0-100)
    scores: {
      glucose: { type: Number, default: 0 },     // 40% weight - based on TIR
      nutrition: { type: Number, default: 0 },   // 30% weight
      exercise: { type: Number, default: 0 },    // 20% weight
      lipolysis: { type: Number, default: 0 },   // 10% weight
      total: { type: Number, default: 0 },
    },

    // Glucose metrics
    glucoseMetrics: {
      tirPercent: Number,          // % time 70-180
      tirTightPercent: Number,     // % time 70-140
      timeBelowPercent: Number,    // % time < 70
      timeAbovePercent: Number,    // % time > 180
      cv: Number,                  // coefficient of variation
      averageGlucose: Number,
      gmi: Number,                 // glucose management indicator
      readingsCount: Number,
    },

    // Nutrition metrics
    nutritionMetrics: {
      totalKcal: Number,
      totalCarbs: Number,
      totalProtein: Number,
      totalFat: Number,
      caloricDeficit: Number,      // target - actual
      mealsLogged: Number,
    },

    // Exercise metrics
    exerciseMetrics: {
      totalMinutes: Number,
      sessionsCount: Number,
      types: [String],
    },

    // Lipolysis score
    lipolysisScore: {
      score: Number,
      caloricDeficitScore: Number,
      avgInsulinScore: Number,
      activityScore: Number,
      tirScore: Number,
      avgDailyInsulin: Number,
    },
  },
  { timestamps: true }
);

dailyScoreSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('DailyScore', dailyScoreSchema);
