const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const NightscoutService = require('../services/nightscoutService');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Helper: get NS service for authenticated user
const getNS = (user) => {
  if (!user.nightscout.connected) throw new Error('Nightscout not connected');
  return new NightscoutService(user.nightscout.url, user.nightscout.apiSecret);
};

// POST /api/nightscout/connect - save and validate NS credentials
router.post(
  '/connect',
  authMiddleware,
  [body('url').isURL(), body('apiSecret').notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { url, apiSecret } = req.body;
      const ns = new NightscoutService(url, apiSecret);
      const test = await ns.testConnection();

      if (!test.ok) {
        return res.status(400).json({ error: `Cannot connect to Nightscout: ${test.error}` });
      }

      await User.findByIdAndUpdate(req.user._id, {
        $set: {
          'nightscout.url': url,
          'nightscout.apiSecret': apiSecret,
          'nightscout.connected': true,
          'nightscout.lastSync': new Date(),
        },
      });

      res.json({ connected: true, nsName: test.name, version: test.version });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/nightscout/current - current glucose + IOB/COB
router.get('/current', authMiddleware, async (req, res) => {
  try {
    const ns = getNS(req.user);
    const [glucose, deviceStatus] = await Promise.all([
      ns.getCurrentGlucose(),
      ns.getDeviceStatus(),
    ]);
    res.json({ glucose, deviceStatus });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/nightscout/entries?hours=3 - CGM series
router.get('/entries', authMiddleware, async (req, res) => {
  try {
    const ns = getNS(req.user);
    const hours = Math.min(parseInt(req.query.hours) || 3, 24);
    const count = Math.ceil((hours * 60) / 5) + 5;
    const entries = await ns.getEntries(count);
    res.json(entries);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/nightscout/treatments?hours=3 - treatments
router.get('/treatments', authMiddleware, async (req, res) => {
  try {
    const ns = getNS(req.user);
    const hours = Math.min(parseInt(req.query.hours) || 3, 72);
    const treatments = await ns.getTreatments(hours);
    res.json(treatments);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/nightscout/ml-features - data ready for ML inference
router.get('/ml-features', authMiddleware, async (req, res) => {
  try {
    const ns = getNS(req.user);
    const features = await ns.getMLFeatures(3);
    res.json(features);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
