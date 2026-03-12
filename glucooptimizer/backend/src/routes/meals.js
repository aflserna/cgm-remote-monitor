const express = require('express');
const { body, validationResult } = require('express-validator');
const axios = require('axios');
const Meal = require('../models/Meal');
const NightscoutService = require('../services/nightscoutService');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// POST /api/meals - log a meal
router.post(
  '/',
  authMiddleware,
  [
    body('name').trim().notEmpty(),
    body('timestamp').isISO8601(),
    body('macros.carbs').isNumeric(),
    body('mealType').optional().isIn(['breakfast', 'lunch', 'dinner', 'snack', 'pre_exercise', 'post_exercise']),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const mealData = { ...req.body, userId: req.user._id };

      // Auto-calculate kcal if not provided
      if (!mealData.macros.kcal) {
        const { carbs = 0, protein = 0, fat = 0 } = mealData.macros;
        mealData.macros.kcal = carbs * 4 + protein * 4 + fat * 9;
      }

      // Fetch glucose context from NS if connected
      if (req.user.nightscout.connected) {
        try {
          const ns = new NightscoutService(req.user.nightscout.url, req.user.nightscout.apiSecret);
          const [glucose, deviceStatus] = await Promise.all([
            ns.getCurrentGlucose(),
            ns.getDeviceStatus(),
          ]);
          mealData.glucoseContext = {
            atMeal: glucose?.glucose,
            trend: glucose?.direction,
            iob: deviceStatus?.iob,
            cob: deviceStatus?.cob,
          };
        } catch {
          // Don't fail if NS is unavailable
        }
      }

      const meal = await Meal.create(mealData);

      // Calculate bolus estimate if profile has insulin parameters
      let bolusEstimate = null;
      const carbRatio = req.user.profile?.carbRatio;
      const isf = req.user.profile?.insulinSensitivity;
      if (carbRatio && mealData.macros?.carbs > 0) {
        const targetGlucose = req.user.targets.glucoseLow + (req.user.targets.glucoseHigh - req.user.targets.glucoseLow) / 2;
        const currentGlucose = mealData.glucoseContext?.atMeal || targetGlucose;
        const iob = mealData.glucoseContext?.iob || 0;
        const carbBolus = mealData.macros.carbs / carbRatio;
        const correctionBolus = isf ? (currentGlucose - targetGlucose) / isf : 0;
        const total = Math.max(0, carbBolus + correctionBolus - iob);
        bolusEstimate = {
          carbBolus: Math.round(carbBolus * 10) / 10,
          correctionBolus: Math.round(correctionBolus * 10) / 10,
          iobSubtracted: Math.round(iob * 10) / 10,
          total: Math.round(total * 10) / 10,
          carbRatioUsed: carbRatio,
          isfUsed: isf || null,
        };
      }

      res.status(201).json({ ...meal.toObject(), bolusEstimate });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/meals?date=2024-01-15 - get meals for a date
router.get('/', authMiddleware, async (req, res) => {
  try {
    const date = req.query.date ? new Date(req.query.date) : new Date();
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const meals = await Meal.find({
      userId: req.user._id,
      timestamp: { $gte: start, $lte: end },
    }).sort({ timestamp: 1 });

    // Aggregate daily totals
    const totals = meals.reduce(
      (acc, meal) => {
        acc.kcal += meal.macros.kcal || 0;
        acc.carbs += meal.macros.carbs || 0;
        acc.protein += meal.macros.protein || 0;
        acc.fat += meal.macros.fat || 0;
        return acc;
      },
      { kcal: 0, carbs: 0, protein: 0, fat: 0 }
    );

    res.json({ meals, totals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/meals/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const meal = await Meal.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!meal) return res.status(404).json({ error: 'Meal not found' });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/meals/search-food?q=arroz - search OpenFoodFacts
router.get('/search-food', authMiddleware, async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: 'Query required' });

    const response = await axios.get('https://world.openfoodfacts.org/cgi/search.pl', {
      params: {
        search_terms: query,
        search_simple: 1,
        action: 'process',
        json: 1,
        page_size: 10,
        fields: 'product_name,nutriments,serving_size,brands',
        lc: 'es',
      },
      timeout: 8000,
    });

    const products = (response.data.products || []).map((p) => ({
      id: p.id,
      name: p.product_name,
      brand: p.brands,
      servingSize: p.serving_size,
      per100g: {
        carbs: p.nutriments?.carbohydrates_100g || 0,
        protein: p.nutriments?.proteins_100g || 0,
        fat: p.nutriments?.fat_100g || 0,
        fiber: p.nutriments?.fiber_100g || 0,
        kcal: p.nutriments?.['energy-kcal_100g'] || 0,
      },
    }));

    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
