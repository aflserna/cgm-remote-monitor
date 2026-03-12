import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { authApi } from './services/api';
import Layout from './components/UI/Layout';
import LoginPage from './components/Settings/LoginPage';
import DashboardPage from './components/Dashboard/DashboardPage';
import NutritionPage from './components/Nutrition/NutritionPage';
import ExercisePage from './components/Exercise/ExercisePage';
import PredictionsPage from './components/Predictions/PredictionsPage';
import AnalyticsPage from './components/Analytics/AnalyticsPage';
import SettingsPage from './components/Settings/SettingsPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuthStore();
  if (!token) return <Navigate to="/login" replace />;
  if (!user) return null;
  return <>{children}</>;
}

export default function App() {
  const { token, setUser, logout, isLoading } = useAuthStore();

  useEffect(() => {
    if (!token) {
      useAuthStore.setState({ isLoading: false });
      return;
    }
    authApi
      .me()
      .then(setUser)
      .catch(() => logout());
  }, [token]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-emerald-400 text-lg font-semibold animate-pulse">GlucoOptimizer</div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="nutrition" element={<NutritionPage />} />
        <Route path="exercise" element={<ExercisePage />} />
        <Route path="predictions" element={<PredictionsPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
