import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Droplets, Zap, Activity, Flame, BrainCircuit, RefreshCw, TrendingDown, AlertCircle } from 'lucide-react';
import { nsApi, analyticsApi, predictionsApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import GlucoseChart from './GlucoseChart';
import GlucoseBadge from './GlucoseBadge';

function StatCard({ label, value, unit, icon: Icon, color = 'emerald' }: {
  label: string; value: string | number | null; unit?: string; icon: React.ElementType; color?: string;
}) {
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-400 bg-emerald-500/10',
    blue: 'text-blue-400 bg-blue-500/10',
    orange: 'text-orange-400 bg-orange-500/10',
    purple: 'text-purple-400 bg-purple-500/10',
    red: 'text-red-400 bg-red-500/10',
  };

  return (
    <div className="card-sm flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorMap[color]}`}>
        <Icon size={18} className={colorMap[color].split(' ')[0]} />
      </div>
      <div>
        <p className="text-slate-500 text-xs">{label}</p>
        <p className="text-white font-semibold text-lg">
          {value ?? '—'}
          {unit && <span className="text-slate-400 text-sm ml-1">{unit}</span>}
        </p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const today = format(new Date(), 'yyyy-MM-dd');

  const { data: current, refetch: refetchCurrent, isFetching } = useQuery({
    queryKey: ['ns-current'],
    queryFn: nsApi.getCurrent,
    refetchInterval: 60_000, // refresh every minute
    enabled: !!user?.nightscoutConnected,
  });

  const { data: entries } = useQuery({
    queryKey: ['ns-entries', 3],
    queryFn: () => nsApi.getEntries(3),
    refetchInterval: 300_000,
    enabled: !!user?.nightscoutConnected,
  });

  const { data: dailyScore } = useQuery({
    queryKey: ['daily-score', today],
    queryFn: () => analyticsApi.getDaily(today),
    refetchInterval: 300_000,
  });

  const { data: prediction } = useQuery({
    queryKey: ['prediction'],
    queryFn: predictionsApi.getGlucose,
    refetchInterval: 300_000,
    enabled: !!user?.nightscoutConnected,
    retry: false,
  });

  const { data: basalData } = useQuery({
    queryKey: ['basal'],
    queryFn: analyticsApi.getBasal,
    refetchInterval: 300_000,
  });

  const glucose = current?.glucose;
  const device = current?.deviceStatus;

  // Build prediction points for chart
  const predictionPoints = prediction && !prediction.fallback
    ? [
        { time: new Date(Date.now() + 30 * 60000).toISOString(), glucose: prediction.t30?.glucose, low: prediction.t30?.confidenceInterval?.[0], high: prediction.t30?.confidenceInterval?.[1] },
        { time: new Date(Date.now() + 60 * 60000).toISOString(), glucose: prediction.t60?.glucose, low: prediction.t60?.confidenceInterval?.[0], high: prediction.t60?.confidenceInterval?.[1] },
        { time: new Date(Date.now() + 90 * 60000).toISOString(), glucose: prediction.t90?.glucose, low: prediction.t90?.confidenceInterval?.[0], high: prediction.t90?.confidenceInterval?.[1] },
      ]
    : [];

  const score = dailyScore?.scores;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">
            {format(new Date(), "EEEE d 'de' MMMM", { locale: es })}
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">Hola, {user?.name}</p>
        </div>
        <button onClick={() => refetchCurrent()} className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {!user?.nightscoutConnected && (
        <div className="card border-yellow-500/30 bg-yellow-500/5">
          <p className="text-yellow-400 text-sm font-medium">
            Nightscout no conectado. Ve a{' '}
            <a href="/settings" className="underline">Ajustes</a> para conectar tu instancia.
          </p>
        </div>
      )}

      {/* Glucose + chart */}
      {user?.nightscoutConnected && (
        <div className="card space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-sm font-medium text-slate-400 mb-3">Glucosa en tiempo real</h2>
              {glucose ? (
                <GlucoseBadge
                  glucose={glucose.glucose}
                  direction={glucose.direction}
                  delta={glucose.delta}
                  targetLow={user.targets.glucoseLow}
                  targetHigh={user.targets.glucoseHigh}
                />
              ) : (
                <div className="text-slate-500 text-sm">Sin datos de glucosa</div>
              )}
            </div>
            {prediction && !prediction.fallback && (
              <div className="text-right space-y-1">
                <p className="text-xs text-slate-500">Predicción</p>
                <div className="flex gap-3">
                  {[30, 60, 90].map((min) => {
                    const key = `t${min}` as 't30' | 't60' | 't90';
                    const val = prediction[key]?.glucose;
                    return val ? (
                      <div key={min} className="text-center">
                        <p className="text-xs text-slate-500">+{min}m</p>
                        <p className="text-white font-mono font-semibold">{Math.round(val)}</p>
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            )}
          </div>
          <GlucoseChart
            entries={entries || []}
            predictions={predictionPoints}
            targetLow={user.targets.glucoseLow}
            targetHigh={user.targets.glucoseHigh}
          />
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="IOB" value={device?.iob?.toFixed(1) ?? null} unit="u" icon={Droplets} color="blue" />
        <StatCard label="COB" value={device?.cob?.toFixed(0) ?? null} unit="g" icon={Zap} color="orange" />
        <StatCard label="Basal" value={device?.basalRate?.toFixed(2) ?? null} unit="u/h" icon={Activity} color="purple" />
        <StatCard label="Score hoy" value={score?.total ?? null} unit="/100" icon={Flame} color="emerald" />
      </div>

      {/* Daily score breakdown */}
      {score && (
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <BrainCircuit size={16} className="text-emerald-400" />
            <h2 className="text-sm font-semibold text-slate-200">Score del día</h2>
            <span className="ml-auto text-2xl font-bold text-white">{score.total}</span>
            <span className="text-slate-500 text-sm">/100</span>
          </div>
          <div className="space-y-3">
            {[
              { label: 'Glucosa (TIR)', value: score.glucose, weight: '40%', color: 'bg-emerald-500' },
              { label: 'Nutrición', value: score.nutrition, weight: '30%', color: 'bg-blue-500' },
              { label: 'Ejercicio', value: score.exercise, weight: '20%', color: 'bg-purple-500' },
              { label: 'Lipolisis', value: score.lipolysis, weight: '10%', color: 'bg-orange-500' },
            ].map(({ label, value, weight, color }) => (
              <div key={label}>
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span>{label}</span>
                  <span className="text-white font-medium">{value}<span className="text-slate-500"> / 100</span></span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Basal insulin + recommendations */}
      {basalData && (
        <div className="card space-y-4">
          <div className="flex items-center gap-2">
            <TrendingDown size={16} className="text-purple-400" />
            <h2 className="text-sm font-semibold text-slate-200">Insulina basal</h2>
            {basalData.estimatedDailyBasal && (
              <span className="ml-auto text-purple-400 font-semibold">{basalData.estimatedDailyBasal}u/día estimadas</span>
            )}
          </div>
          {basalData.currentBasal && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-900 rounded-xl px-4 py-3">
                <p className="text-xs text-slate-500">Basal actual</p>
                <p className="text-white font-semibold">{basalData.currentBasal.toFixed(3)} u/h</p>
              </div>
              {basalData.tempBasalPercent !== null && basalData.tempBasalPercent !== 100 && (
                <div className="bg-slate-900 rounded-xl px-4 py-3">
                  <p className="text-xs text-slate-500">Basal temporal</p>
                  <p className={`font-semibold ${basalData.tempBasalPercent < 100 ? 'text-emerald-400' : 'text-yellow-400'}`}>
                    {basalData.tempBasalPercent}%
                  </p>
                </div>
              )}
            </div>
          )}
          {basalData.recommendations?.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Recomendaciones para minimizar basal</p>
              {basalData.recommendations.map((rec: { type: string; priority: string; title: string; text: string }, i: number) => (
                <div key={i} className={`flex gap-3 px-3 py-2.5 rounded-xl text-sm border ${
                  rec.priority === 'high' ? 'bg-purple-500/10 border-purple-500/20' :
                  rec.priority === 'info' ? 'bg-slate-800 border-slate-700' :
                  'bg-slate-900 border-slate-800'
                }`}>
                  <AlertCircle size={15} className={rec.priority === 'high' ? 'text-purple-400 mt-0.5 shrink-0' : 'text-slate-500 mt-0.5 shrink-0'} />
                  <div>
                    <p className={`font-medium text-xs ${rec.priority === 'high' ? 'text-purple-300' : 'text-slate-300'}`}>{rec.title}</p>
                    <p className="text-slate-400 text-xs mt-0.5">{rec.text}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TIR summary */}
      {dailyScore?.glucoseMetrics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'TIR (70-180)', value: `${dailyScore.glucoseMetrics.tirPercent}%`, good: dailyScore.glucoseMetrics.tirPercent >= 70 },
            { label: 'TIR Estricto (70-140)', value: `${dailyScore.glucoseMetrics.tirTightPercent}%`, good: dailyScore.glucoseMetrics.tirTightPercent >= 50 },
            { label: 'Tiempo bajo (<70)', value: `${dailyScore.glucoseMetrics.timeBelowPercent}%`, good: dailyScore.glucoseMetrics.timeBelowPercent < 4 },
            { label: 'CV', value: `${dailyScore.glucoseMetrics.cv}%`, good: dailyScore.glucoseMetrics.cv < 36 },
          ].map(({ label, value, good }) => (
            <div key={label} className="card-sm text-center">
              <p className="text-slate-500 text-xs mb-1">{label}</p>
              <p className={`text-xl font-bold font-mono ${good ? 'text-emerald-400' : 'text-yellow-400'}`}>{value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
