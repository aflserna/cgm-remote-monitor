const express = require('express');
const axios = require('axios');
const NightscoutService = require('../services/nightscoutService');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

const ML_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

// GET /api/predictions/glucose - predict glucose at t+30, t+60, t+90
router.get('/glucose', authMiddleware, async (req, res) => {
  try {
    if (!req.user.nightscout.connected) {
      return res.status(400).json({ error: 'Nightscout not connected' });
    }

    const ns = new NightscoutService(req.user.nightscout.url, req.user.nightscout.apiSecret);
    const features = await ns.getMLFeatures(3);

    const mlResponse = await axios.post(
      `${ML_URL}/predict/glucose`,
      {
        userId: req.user._id.toString(),
        features,
        modelVersion: req.user.mlModel.modelVersion,
      },
      { timeout: 15000 }
    );

    res.json(mlResponse.data);
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      return res.status(503).json({ error: 'ML service unavailable', fallback: true });
    }
    res.status(500).json({ error: err.message });
  }
});

// POST /api/predictions/simulate - "what if I eat X now?"
router.post('/simulate', authMiddleware, async (req, res) => {
  try {
    if (!req.user.nightscout.connected) {
      return res.status(400).json({ error: 'Nightscout not connected' });
    }

    const { meal, exercise } = req.body;
    const ns = new NightscoutService(req.user.nightscout.url, req.user.nightscout.apiSecret);
    const features = await ns.getMLFeatures(3);

    const mlResponse = await axios.post(
      `${ML_URL}/predict/simulate`,
      {
        userId: req.user._id.toString(),
        features,
        simulatedMeal: meal || null,
        simulatedExercise: exercise || null,
        modelVersion: req.user.mlModel.modelVersion,
      },
      { timeout: 15000 }
    );

    res.json(mlResponse.data);
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      return res.status(503).json({ error: 'ML service unavailable' });
    }
    res.status(500).json({ error: err.message });
  }
});

// GET /api/predictions/optimal-meal-timing - best time to eat given current glucose
router.get('/optimal-meal-timing', authMiddleware, async (req, res) => {
  try {
    if (!req.user.nightscout.connected) {
      return res.status(400).json({ error: 'Nightscout not connected' });
    }

    const ns = new NightscoutService(req.user.nightscout.url, req.user.nightscout.apiSecret);
    const [glucose, deviceStatus] = await Promise.all([
      ns.getCurrentGlucose(),
      ns.getDeviceStatus(),
    ]);

    const currentGlucose = glucose?.glucose;
    const trend = glucose?.direction;
    const iob = deviceStatus?.iob || 0;
    const cob = deviceStatus?.cob || 0;

    const targets = req.user.targets;
    let recommendation = {};

    // Simple rule-based timing (will be replaced by ML in future iterations)
    if (currentGlucose > targets.glucoseHigh) {
      recommendation = {
        status: 'wait',
        message: 'Glucose is above target. Wait until it drops below 180 mg/dL.',
        waitMinutes: null,
      };
    } else if (currentGlucose < targets.glucoseLow + 20) {
      recommendation = {
        status: 'eat_now',
        message: 'Glucose is near low threshold. Eat soon or treat with fast carbs first.',
        waitMinutes: 0,
      };
    } else if (trend === 'DoubleUp' || trend === 'SingleUp') {
      recommendation = {
        status: 'wait',
        message: 'Glucose is rising. Wait 15-20 min for bolus to take effect before eating.',
        waitMinutes: 20,
      };
    } else if (iob > 1.0 && cob < 5) {
      recommendation = {
        status: 'caution',
        message: `Active insulin (${iob.toFixed(1)}u) without carbs active. Eating now may cause hypoglycemia later.`,
        waitMinutes: null,
      };
    } else {
      recommendation = {
        status: 'good',
        message: 'Good time to eat. Glucose is in range and stable.',
        waitMinutes: 0,
      };
    }

    res.json({
      currentGlucose,
      trend,
      iob,
      cob,
      recommendation,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
