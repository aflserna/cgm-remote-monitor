import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { BarChart3, Trophy, Flame, Activity } from 'lucide-react';
import { analyticsApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';

function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${value}%` }} />
    </div>
  );
}

export default function AnalyticsPage() {
  const { user } = useAuthStore();

  const { data: weekly } = useQuery({
    queryKey: ['weekly'],
    queryFn: analyticsApi.getWeekly,
    refetchInterval: 300_000,
  });

  const { data: achievements } = useQuery({
    queryKey: ['achievements'],
    queryFn: analyticsApi.getAchievements,
  });

  const chartData = weekly?.days?.map((d: { date: string; scores?: { total: number }; glucoseMetrics?: { tirPercent: number } }) => ({
    day: format(parseISO(d.date), 'EEE', { locale: es }),
    score: d.scores?.total || 0,
    tir: d.glucoseMetrics?.tirPercent || 0,
  })) || [];

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2">
        <BarChart3 size={20} className="text-blue-400" />
        <h1 className="text-xl font-bold text-white">Análisis</h1>
      </div>

      {/* Weekly averages */}
      {weekly?.averages && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'TIR promedio', value: `${weekly.averages.tir}%`, good: weekly.averages.tir >= 70, icon: Activity },
            { label: 'Score semanal', value: weekly.averages.dailyScore, good: weekly.averages.dailyScore >= 70, icon: BarChart3 },
            { label: 'Lipolisis', value: weekly.averages.lipolysis, good: weekly.averages.lipolysis >= 60, icon: Flame },
          ].map(({ label, value, good, icon: Icon }) => (
            <div key={label} className="card text-center">
              <Icon size={16} className={`mx-auto mb-2 ${good ? 'text-emerald-400' : 'text-yellow-400'}`} />
              <p className={`text-2xl font-bold ${good ? 'text-emerald-400' : 'text-yellow-400'}`}>{value}</p>
              <p className="text-xs text-slate-400 mt-1">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Score chart */}
      {chartData.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-medium text-slate-400 mb-4">Score diario — últimos 7 días</h2>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
              <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#94a3b8' }}
              />
              <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                {chartData.map((entry: { score: number }, index: number) => (
                  <Cell key={index} fill={entry.score >= 70 ? '#22c55e' : entry.score >= 50 ? '#f59e0b' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* TIR chart */}
      {chartData.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-medium text-slate-400 mb-4">TIR (70-180) — últimos 7 días</h2>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
              <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                formatter={(v) => [`${v}%`, 'TIR']}
              />
              <Bar dataKey="tir" radius={[4, 4, 0, 0]}>
                {chartData.map((entry: { tir: number }, index: number) => (
                  <Cell key={index} fill={entry.tir >= 70 ? '#22c55e' : entry.tir >= 50 ? '#f59e0b' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Achievements */}
      {achievements && (
        <div className="card space-y-4">
          <div className="flex items-center gap-2">
            <Trophy size={16} className="text-yellow-400" />
            <h2 className="font-semibold text-white">Logros</h2>
            <span className="ml-auto text-xs text-slate-400">{achievements.unlocked?.length} / {achievements.all?.length}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {achievements.all?.map((a: { id: string; name: string; description: string; icon: string; points: number }) => {
              const isUnlocked = achievements.unlocked?.includes(a.id);
              return (
                <div key={a.id} className={`p-3 rounded-xl border ${isUnlocked ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-slate-800 border-slate-700 opacity-50'}`}>
                  <div className="flex items-start gap-2">
                    <span className="text-xl">{a.icon}</span>
                    <div>
                      <p className={`text-sm font-medium ${isUnlocked ? 'text-yellow-400' : 'text-slate-400'}`}>{a.name}</p>
                      <p className="text-xs text-slate-500">{a.description}</p>
                      <p className="text-xs text-slate-600 mt-0.5">+{a.points} pts</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-2 bg-slate-800 rounded-xl px-4 py-3">
            <Flame size={16} className="text-orange-400" />
            <span className="text-sm text-slate-300">Racha actual: <span className="text-white font-semibold">{user?.stats?.currentStreakDays || 0} días</span></span>
            <span className="ml-auto text-sm text-slate-400">{achievements.totalPoints} pts totales</span>
          </div>
        </div>
      )}
    </div>
  );
}
