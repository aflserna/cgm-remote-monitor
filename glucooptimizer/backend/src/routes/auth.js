const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

const signToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });

// POST /api/auth/register
router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('name').trim().notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { email, password, name } = req.body;
      const existing = await User.findOne({ email });
      if (existing) return res.status(409).json({ error: 'Email already registered' });

      const user = await User.create({ email, password, name });
      const token = signToken(user._id);
      res.status(201).json({ token, user: { id: user._id, email, name } });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// POST /api/auth/login
router.post(
  '/login',
  [body('email').isEmail().normalizeEmail(), body('password').notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { email, password } = req.body;
      const user = await User.findOne({ email });
      if (!user || !(await user.comparePassword(password))) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const token = signToken(user._id);
      res.json({
        token,
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          nightscoutConnected: user.nightscout.connected,
          targets: user.targets,
          profile: user.profile,
          mlModel: user.mlModel,
        },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  res.json({
    id: req.user._id,
    email: req.user.email,
    name: req.user.name,
    nightscoutConnected: req.user.nightscout.connected,
    targets: req.user.targets,
    profile: req.user.profile,
    mlModel: req.user.mlModel,
    stats: req.user.stats,
  });
});

// PATCH /api/auth/profile
router.patch('/profile', authMiddleware, async (req, res) => {
  try {
    const allowed = ['weightKg', 'heightCm', 'age', 'gender', 'activityLevel', 'carbRatio', 'insulinSensitivity'];
    const updates = {};
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) updates[`profile.${key}`] = req.body[key];
    });
    const user = await User.findByIdAndUpdate(req.user._id, { $set: updates }, { new: true });
    res.json({ profile: user.profile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/auth/targets
router.patch('/targets', authMiddleware, async (req, res) => {
  try {
    const allowed = ['glucoseLow', 'glucoseHigh', 'glucoseTightHigh', 'dailyKcal', 'carbsG', 'proteinG', 'fatG'];
    const updates = {};
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) updates[`targets.${key}`] = req.body[key];
    });
    const user = await User.findByIdAndUpdate(req.user._id, { $set: updates }, { new: true });
    res.json({ targets: user.targets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
