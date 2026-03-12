from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import numpy as np
from datetime import datetime, timedelta
import os

app = FastAPI(title="GlucoOptimizer ML Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001", "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- Schemas ----

class CGMEntry(BaseModel):
    time: str
    glucose: float
    direction: Optional[str] = "Flat"
    delta: Optional[float] = 0.0

class DeviceStatus(BaseModel):
    iob: Optional[float] = 0.0
    cob: Optional[float] = 0.0
    basalRate: Optional[float] = None
    tempBasalPercent: Optional[float] = None

class Features(BaseModel):
    cgmSeries: List[CGMEntry]
    currentStatus: Optional[DeviceStatus] = None
    boluses: Optional[list] = []
    carbs: Optional[list] = []
    tempBasals: Optional[list] = []

class PredictRequest(BaseModel):
    userId: str
    features: Features
    modelVersion: Optional[str] = "base"

class SimulatedMeal(BaseModel):
    carbs: Optional[float] = 0
    protein: Optional[float] = 0
    fat: Optional[float] = 0

class SimulatedExercise(BaseModel):
    type: str
    duration: int

class SimulateRequest(BaseModel):
    userId: str
    features: Features
    simulatedMeal: Optional[SimulatedMeal] = None
    simulatedExercise: Optional[SimulatedExercise] = None
    modelVersion: Optional[str] = "base"


# ---- Feature engineering ----

def build_feature_vector(features: Features):
    """Build ML feature vector from NS data."""
    cgm = sorted(features.cgmSeries, key=lambda x: x.time)

    # Last 36 CGM values (3 hours at 5min intervals), pad with 0 if not enough
    glucose_vals = [e.glucose for e in cgm[-36:]]
    while len(glucose_vals) < 36:
        glucose_vals.insert(0, glucose_vals[0] if glucose_vals else 120.0)

    # Basic stats of recent glucose
    recent = np.array(glucose_vals[-12:])  # last 1h
    current_glucose = glucose_vals[-1] if glucose_vals else 120.0
    glucose_trend = (glucose_vals[-1] - glucose_vals[-6]) / 5 if len(glucose_vals) >= 6 else 0  # rate of change
    glucose_accel = (glucose_vals[-1] - 2 * glucose_vals[-3] + glucose_vals[-6]) if len(glucose_vals) >= 6 else 0

    iob = features.currentStatus.iob or 0.0 if features.currentStatus else 0.0
    cob = features.currentStatus.cob or 0.0 if features.currentStatus else 0.0

    now = datetime.now()
    hour_sin = np.sin(2 * np.pi * now.hour / 24)
    hour_cos = np.cos(2 * np.pi * now.hour / 24)
    dow_sin = np.sin(2 * np.pi * now.weekday() / 7)

    features_vec = np.array([
        current_glucose / 300.0,          # normalized current glucose
        glucose_trend / 5.0,              # rate of change
        glucose_accel / 5.0,              # acceleration
        np.mean(recent) / 300.0,          # mean last hour
        np.std(recent) / 100.0,           # variability
        iob / 10.0,                       # normalized IOB
        cob / 100.0,                      # normalized COB
        hour_sin, hour_cos, dow_sin,      # time features
    ], dtype=np.float32)

    return features_vec, current_glucose, glucose_trend


# ---- Prediction models (rule-based + learned coefficients as base) ----

class GlucosePredictor:
    """
    Base glucose predictor using physiological rules + statistical correction.
    Acts as fallback when personal LSTM model is not yet trained.
    Improved via fine-tuning with personal data (see training/finetune.py).
    """

    # Empirical glucose dynamics coefficients
    # Based on OpenAPS Data Commons analysis
    INSULIN_EFFECT_CURVE = {  # fraction of insulin effect at t minutes
        30: 0.28, 60: 0.52, 90: 0.71
    }
    COB_ABSORPTION_RATE = 0.3  # g/min absorbed
    GLUCOSE_PER_CARB = 3.5     # mg/dL per gram of carbs absorbed

    def predict(self, features_vec: np.ndarray, current_glucose: float, glucose_trend: float,
                iob: float, cob: float, minutes: int) -> tuple[float, float, float]:
        """
        Predict glucose at t+minutes.
        Returns: (predicted_glucose, lower_bound, upper_bound)
        """
        # Baseline: extrapolate trend (dampened)
        trend_factor = 0.7 ** (minutes / 30)  # trend dampens over time
        trend_component = glucose_trend * minutes * trend_factor

        # Insulin effect: glucose drop from active insulin
        insulin_effect_fraction = self.INSULIN_EFFECT_CURVE.get(
            min(minutes, 90),
            0.71  # max at 90min
        )
        insulin_component = -iob * insulin_effect_fraction * 40  # ~40 mg/dL per unit

        # COB effect: glucose rise from active carbs
        carbs_absorbed = min(cob, self.COB_ABSORPTION_RATE * minutes)
        cob_component = carbs_absorbed * self.GLUCOSE_PER_CARB

        # Combined prediction
        predicted = current_glucose + trend_component + insulin_component + cob_component

        # Physiological bounds
        predicted = np.clip(predicted, 40, 400)

        # Confidence interval widens with time
        uncertainty = 15 + (minutes / 30) * 20  # ±35 at 90min
        lower = max(40, predicted - uncertainty)
        upper = min(400, predicted + uncertainty)

        return float(predicted), float(lower), float(upper)


def get_trend_label(current: float, prediction_90: float) -> str:
    delta = prediction_90 - current
    if delta > 30: return "rapid_rise"
    if delta > 10: return "rising"
    if delta < -30: return "rapid_fall"
    if delta < -10: return "falling"
    return "stable"


predictor = GlucosePredictor()


# ---- Endpoints ----

@app.get("/health")
def health():
    return {"status": "ok", "model": "base-physiological", "timestamp": datetime.now().isoformat()}


@app.post("/predict/glucose")
def predict_glucose(req: PredictRequest):
    try:
        features_vec, current_glucose, glucose_trend = build_feature_vector(req.features)

        iob = req.features.currentStatus.iob or 0.0 if req.features.currentStatus else 0.0
        cob = req.features.currentStatus.cob or 0.0 if req.features.currentStatus else 0.0

        p30, l30, h30 = predictor.predict(features_vec, current_glucose, glucose_trend, iob, cob, 30)
        p60, l60, h60 = predictor.predict(features_vec, current_glucose, glucose_trend, iob, cob, 60)
        p90, l90, h90 = predictor.predict(features_vec, current_glucose, glucose_trend, iob, cob, 90)

        return {
            "t30": {"glucose": round(p30), "confidenceInterval": [round(l30), round(h30)]},
            "t60": {"glucose": round(p60), "confidenceInterval": [round(l60), round(h60)]},
            "t90": {"glucose": round(p90), "confidenceInterval": [round(l90), round(h90)]},
            "trend": get_trend_label(current_glucose, p90),
            "currentGlucose": round(current_glucose),
            "model": req.modelVersion,
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/predict/simulate")
def simulate(req: SimulateRequest):
    try:
        features_vec, current_glucose, glucose_trend = build_feature_vector(req.features)

        iob = req.features.currentStatus.iob or 0.0 if req.features.currentStatus else 0.0
        cob = req.features.currentStatus.cob or 0.0 if req.features.currentStatus else 0.0

        # Base predictions (without simulation)
        base_30, _, _ = predictor.predict(features_vec, current_glucose, glucose_trend, iob, cob, 30)
        base_60, _, _ = predictor.predict(features_vec, current_glucose, glucose_trend, iob, cob, 60)
        base_90, _, _ = predictor.predict(features_vec, current_glucose, glucose_trend, iob, cob, 90)

        # Add meal impact
        meal_impact_30 = meal_impact_60 = meal_impact_90 = 0.0
        if req.simulatedMeal and req.simulatedMeal.carbs:
            c = req.simulatedMeal.carbs
            p = req.simulatedMeal.protein or 0
            f = req.simulatedMeal.fat or 0

            # Meal absorption curve (simplified)
            # Carbs: peak at ~45-60 min, protein ~30% glucogenic effect at 90-120min
            # Fat slows absorption
            absorption_modifier = 1.0 - (f / 100) * 0.3  # fat slows absorption
            meal_impact_30 = c * 3.0 * 0.4 * absorption_modifier  # 40% absorbed at 30min
            meal_impact_60 = c * 3.0 * 0.85 * absorption_modifier  # 85% at 60min (peak)
            meal_impact_90 = c * 3.0 * 0.7 * absorption_modifier + p * 0.6  # declining + protein

        # Add exercise impact
        exercise_impact_30 = exercise_impact_60 = exercise_impact_90 = 0.0
        if req.simulatedExercise:
            etype = req.simulatedExercise.type
            dur = req.simulatedExercise.duration
            intensity_factor = min(dur / 45, 1.5)

            if etype == "cardio":
                # Glucose drops during cardio
                exercise_impact_30 = -intensity_factor * 15
                exercise_impact_60 = -intensity_factor * 25
                exercise_impact_90 = -intensity_factor * 30
            elif etype == "hiit":
                # Initial spike, then drop
                exercise_impact_30 = intensity_factor * 15   # adrenaline spike
                exercise_impact_60 = -intensity_factor * 10  # then drop
                exercise_impact_90 = -intensity_factor * 25  # continued drop
            elif etype == "strength":
                # Mild hyperglycemia
                exercise_impact_30 = intensity_factor * 10
                exercise_impact_60 = intensity_factor * 5
                exercise_impact_90 = -intensity_factor * 5   # slight sensitization

        sim_30 = np.clip(base_30 + meal_impact_30 + exercise_impact_30, 40, 400)
        sim_60 = np.clip(base_60 + meal_impact_60 + exercise_impact_60, 40, 400)
        sim_90 = np.clip(base_90 + meal_impact_90 + exercise_impact_90, 40, 400)

        return {
            "currentGlucose": round(current_glucose),
            "baseline": {
                "t30": round(base_30), "t60": round(base_60), "t90": round(base_90)
            },
            "simulated": {
                "t30": round(sim_30), "t60": round(sim_60), "t90": round(sim_90)
            },
            "mealImpact": {
                "t30": round(meal_impact_30), "t60": round(meal_impact_60), "t90": round(meal_impact_90)
            },
            "exerciseImpact": {
                "t30": round(exercise_impact_30), "t60": round(exercise_impact_60), "t90": round(exercise_impact_90)
            },
            "riskFlags": {
                "hypoRisk": sim_60 < 70 or sim_90 < 70,
                "hyperRisk": sim_60 > 250,
                "lowestPredicted": round(min(sim_30, sim_60, sim_90)),
                "highestPredicted": round(max(sim_30, sim_60, sim_90)),
            },
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
