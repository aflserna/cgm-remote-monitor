export interface User {
  id: string;
  email: string;
  name: string;
  nightscoutConnected: boolean;
  targets: {
    glucoseLow: number;
    glucoseHigh: number;
    glucoseTightHigh: number;
    dailyKcal: number;
    carbsG: number;
    proteinG: number;
    fatG: number;
  };
  profile?: {
    weightKg?: number;
    heightCm?: number;
    age?: number;
    gender?: string;
    activityLevel?: string;
    carbRatio?: number;
    insulinSensitivity?: number;
  };
  mlModel: {
    personalDataDays: number;
    lastFineTuned: string | null;
    modelVersion: string;
  };
  stats: {
    currentStreakDays: number;
    longestStreakDays: number;
    totalPoints: number;
    achievements: Array<{ id: string; unlockedAt: string }>;
  };
}

export interface GlucoseEntry {
  time: string;
  glucose: number;
  direction: string;
  delta: number;
}

export interface DeviceStatus {
  time: string;
  iob: number | null;
  cob: number | null;
  basalRate: number | null;
  tempBasalPercent: number | null;
  reservoir: number | null;
  batteryPercent: number | null;
}

export interface Prediction {
  t30: { glucose: number; confidenceInterval: [number, number] };
  t60: { glucose: number; confidenceInterval: [number, number] };
  t90: { glucose: number; confidenceInterval: [number, number] };
  trend: 'rising' | 'stable' | 'falling' | 'rapid_rise' | 'rapid_fall';
  timestamp: string;
}

export interface Meal {
  _id: string;
  name: string;
  timestamp: string;
  mealType: string;
  macros: {
    carbs: number;
    protein: number;
    fat: number;
    kcal: number;
    fiber: number;
    glycemicIndex: number;
  };
  glucoseContext?: {
    atMeal: number;
    trend: string;
    iob: number;
    cob: number;
  };
}

export interface ExerciseSession {
  _id: string;
  type: 'strength' | 'hiit' | 'cardio' | 'yoga' | 'other';
  name: string;
  timestamp: string;
  duration: number;
  intensity: number;
  kcalBurned?: number;
}

export interface DailyScore {
  date: string;
  scores: {
    glucose: number;
    nutrition: number;
    exercise: number;
    lipolysis: number;
    total: number;
  };
  glucoseMetrics: {
    tirPercent: number;
    tirTightPercent: number;
    timeBelowPercent: number;
    timeAbovePercent: number;
    averageGlucose: number;
    cv: number;
    gmi: number;
  } | null;
  nutritionMetrics: {
    kcal: number;
    carbs: number;
    protein: number;
    fat: number;
    caloricDeficit: number;
    mealsLogged: number;
  };
  exerciseMetrics: {
    totalMinutes: number;
    sessionsCount: number;
    types: string[];
  };
  lipolysisScore: {
    score: number;
    caloricDeficitScore: number;
    avgInsulinScore: number;
    activityScore: number;
  };
}
