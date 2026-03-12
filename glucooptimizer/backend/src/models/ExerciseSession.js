const mongoose = require('mongoose');

const exerciseSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    timestamp: { type: Date, required: true, index: true },
    endTime: { type: Date },

    type: {
      type: String,
      enum: ['strength', 'hiit', 'cardio', 'yoga', 'other'],
      required: true,
    },
    name: { type: String },         // e.g. "Push/Pull/Legs - Push day"
    duration: { type: Number },     // minutes
    intensity: { type: Number, min: 1, max: 10 },

    // Cardio-specific
    cardio: {
      avgHeartRate: Number,
      maxHeartRate: Number,
      distanceKm: Number,
    },

    // Strength-specific
    strength: {
      muscleGroups: [String],       // chest, back, legs, shoulders, arms, core
      sets: Number,
      totalVolume: Number,          // kg * reps
    },

    // Glucose context
    glucoseContext: {
      beforeExercise: Number,       // mg/dL (15 min before)
      duringExercise: [{ minute: Number, glucose: Number }],
      afterExercise1h: Number,
      afterExercise2h: Number,
      afterExercise4h: Number,
      lowestDuringOrAfter: Number,
      insulinSensitivityEffect: Number, // % change vs baseline
    },

    // Pre/post actions taken
    actions: {
      reducedBasal: Boolean,
      temporaryBasalPercent: Number,
      preExerciseSnack: Boolean,
      preExerciseSnackCarbs: Number,
    },

    notes: String,
    completed: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ExerciseSession', exerciseSessionSchema);
