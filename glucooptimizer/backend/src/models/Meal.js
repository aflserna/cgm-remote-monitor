const mongoose = require('mongoose');

const mealSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    timestamp: { type: Date, required: true, index: true },

    // Macros
    macros: {
      carbs: { type: Number, required: true },    // grams
      protein: { type: Number, default: 0 },       // grams
      fat: { type: Number, default: 0 },           // grams
      kcal: { type: Number, default: 0 },
      fiber: { type: Number, default: 0 },
      glycemicIndex: { type: Number, default: 50 }, // 0-100
    },

    // Food items that compose this meal
    items: [
      {
        name: String,
        quantity: Number,    // grams
        unit: String,
        carbs: Number,
        protein: Number,
        fat: Number,
        kcal: Number,
        glycemicIndex: Number,
        openFoodFactsId: String,
      },
    ],

    // Glucose context at meal time (fetched from NS)
    glucoseContext: {
      atMeal: Number,        // mg/dL
      trend: String,         // rising, stable, falling
      iob: Number,           // units
      cob: Number,           // grams
    },

    // Post-meal glucose impact (populated 3h after meal)
    glucoseImpact: {
      peakValue: Number,
      peakMinutes: Number,   // minutes after meal
      returnToBaseline: Number, // minutes
      maxDelta: Number,
      analyzed: { type: Boolean, default: false },
    },

    notes: String,
    mealType: {
      type: String,
      enum: ['breakfast', 'lunch', 'dinner', 'snack', 'pre_exercise', 'post_exercise'],
      default: 'snack',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Meal', mealSchema);
