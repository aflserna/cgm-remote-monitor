import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

// Inject JWT on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Redirect to login on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;

// Auth
export const authApi = {
  register: (data: { email: string; password: string; name: string }) =>
    api.post('/auth/register', data).then((r) => r.data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
  updateTargets: (targets: Record<string, number>) =>
    api.patch('/auth/targets', targets).then((r) => r.data),
};

// Nightscout
export const nsApi = {
  connect: (data: { url: string; apiSecret: string }) =>
    api.post('/nightscout/connect', data).then((r) => r.data),
  getCurrent: () => api.get('/nightscout/current').then((r) => r.data),
  getEntries: (hours = 3) => api.get(`/nightscout/entries?hours=${hours}`).then((r) => r.data),
  getTreatments: (hours = 3) => api.get(`/nightscout/treatments?hours=${hours}`).then((r) => r.data),
};

// Meals
export const mealsApi = {
  log: (meal: Record<string, unknown>) => api.post('/meals', meal).then((r) => r.data),
  getByDate: (date: string) => api.get(`/meals?date=${date}`).then((r) => r.data),
  delete: (id: string) => api.delete(`/meals/${id}`).then((r) => r.data),
  searchFood: (q: string) => api.get(`/meals/search-food?q=${encodeURIComponent(q)}`).then((r) => r.data),
};

// Exercise
export const exerciseApi = {
  log: (session: Record<string, unknown>) => api.post('/exercise', session).then((r) => r.data),
  getByDate: (date: string) => api.get(`/exercise?date=${date}`).then((r) => r.data),
  preCheck: (type: string, duration: number) =>
    api.get(`/exercise/pre-check?type=${type}&duration=${duration}`).then((r) => r.data),
  getPrograms: () => api.get('/exercise/programs').then((r) => r.data),
};

// Predictions
export const predictionsApi = {
  getGlucose: () => api.get('/predictions/glucose').then((r) => r.data),
  simulate: (data: { meal?: Record<string, unknown>; exercise?: Record<string, unknown> }) =>
    api.post('/predictions/simulate', data).then((r) => r.data),
  getOptimalMealTiming: () => api.get('/predictions/optimal-meal-timing').then((r) => r.data),
};

// Analytics
export const analyticsApi = {
  getDaily: (date?: string) =>
    api.get(`/analytics/daily${date ? `?date=${date}` : ''}`).then((r) => r.data),
  getWeekly: () => api.get('/analytics/weekly').then((r) => r.data),
  getAchievements: () => api.get('/analytics/achievements').then((r) => r.data),
};
