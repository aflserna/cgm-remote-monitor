const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true, minlength: 8 },
    name: { type: String, required: true },

    // Nightscout connection
    nightscout: {
      url: { type: String, default: '' },
      apiSecret: { type: String, default: '' }, // stored as hash for validation
      apiSecretHash: { type: String, default: '' },
      connected: { type: Boolean, default: false },
      lastSync: { type: Date },
    },

    // Personal targets
    targets: {
      glucoseLow: { type: Number, default: 70 },
      glucoseHigh: { type: Number, default: 180 },
      glucoseTightHigh: { type: Number, default: 140 },
      dailyKcal: { type: Number, default: 1800 },
      carbsG: { type: Number, default: 150 },
      proteinG: { type: Number, default: 130 },
      fatG: { type: Number, default: 60 },
    },

    // Model state
    mlModel: {
      personalDataDays: { type: Number, default: 0 },
      lastFineTuned: { type: Date },
      modelVersion: { type: String, default: 'base' },
    },

    // Gamification
    stats: {
      currentStreakDays: { type: Number, default: 0 },
      longestStreakDays: { type: Number, default: 0 },
      totalPoints: { type: Number, default: 0 },
      achievements: [{ id: String, unlockedAt: Date }],
    },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 12);
  }
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
