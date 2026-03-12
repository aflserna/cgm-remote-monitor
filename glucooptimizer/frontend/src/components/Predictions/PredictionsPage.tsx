import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BrainCircuit, Utensils, Dumbbell, Clock, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { predictionsApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';

function PredictionCard({ label, value, interval, minutesFromNow }: {
  label: string; value: number; interval: [number, number]; minutesFromNow: number;
}) {
  const isLow = value < 70;
  const isHigh = value > 180;
  const colorClass = isLow ? 'text-red-400' : isHigh ? 'text-yellow-400' : 'text-emerald-400';
  const bgClass = isLow ? 'bg-red-500/10 border-red-500/30' : isHigh ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-emerald-500/10 border-emerald-500/30';

  return (
    <div className={`card border text-center ${bgClass}`}>
      <p className="text-slate-400 text-xs mb-1">
        <Clock size={10} className="inline mr-1" />+{minutesFromNow} min
      </p>
      <p className={`text-4xl font-bold font-mono ${colorClass}`}>{Math.round(value)}</p>
      <p className="text-xs text-slate-500 mt-1">mg/dL</p>
      {interval && (
        <p className="text-xs text-slate-600 mt-1">{Math.round(interval[0])} – {Math.round(interval[1])}</p>
      )}
      <p className="text-xs font-medium mt-2 text-slate-400">{label}</p>
      {(isLow || isHigh) && (
        <p className={`text-xs font-bold mt-1 ${isLow ? 'text-red-400' : 'text-yellow-400'}`}>
          {isLow ? 'RIESGO HIPO' : 'RIESGO HIPER'}
        </p>
      )}
    </div>
  );
}

export default function PredictionsPage() {
  const { user } = useAuthStore();
  const [simMeal, setSimMeal] = useState({ carbs: '', protein: '', fat: '' });
  const [simExercise, setSimExercise] = useState({ type: 'cardio', duration: '45' });
  const [simResult, setSimResult] = useState<Record<string, unknown> | null>(null);
  const [simLoading, setSimLoading] = useState(false);

  const { data: prediction, isLoading, error } = useQuery({
    queryKey: ['prediction'],
    queryFn: predictionsApi.getGlucose,
    refetchInterval: 300_000,
    enabled: !!user?.nightscoutConnected,
    retry: false,
  });

  const { data: timing } = useQuery({
    queryKey: ['meal-timing'],
    queryFn: predictionsApi.getOptimalMealTiming,
    refetchInterval: 60_000,
    enabled: !!user?.nightscoutConnected,
  });

  const runSimulation = async () => {
    setSimLoading(true);
    try {
      const result = await predictionsApi.simulate({
        meal: simMeal.carbs ? { carbs: Number(simMeal.carbs), protein: Number(simMeal.protein), fat: Number(simMeal.fat) } : undefined,
        exercise: simExercise.duration ? { type: simExercise.type, duration: Number(simExercise.duration) } : undefined,
      });
      setSimResult(result);
    } catch {
      setSimResult({ error: 'Servicio ML no disponible aún' });
    } finally {
      setSimLoading(false);
    }
  };

  const TREND_ICONS: Record<string, React.ReactNode> = {
    rising: <TrendingUp size={14} className="text-yellow-400" />,
    rapid_rise: <TrendingUp size={14} className="text-red-400" />,
    stable: <Minus size={14} className="text-emerald-400" />,
    falling: <TrendingDown size={14} className="text-blue-400" />,
    rapid_fall: <TrendingDown size={14} className="text-red-400" />,
  };

  const TIMING_STATUS_STYLES: Record<string, string> = {
    good: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    eat_now: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
    wait: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
    caution: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
    no_nightscout: 'bg-slate-800 border-slate-700 text-slate-400',
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2">
        <BrainCircuit size={20} className="text-purple-400" />
        <h1 className="text-xl font-bold text-white">Predicciones IA</h1>
      </div>

      {!user?.nightscoutConnected && (
        <div className="card border border-yellow-500/30 bg-yellow-500/5">
          <p className="text-yellow-400 text-sm">Conecta Nightscout en Ajustes para activar las predicciones.</p>
        </div>
      )}

      {/* Glucose predictions */}
      {user?.nightscoutConnected && (
        <div className="space-y-4">
          <h2 className="text-sm font-medium text-slate-400">Glucosa predicha</h2>

          {isLoading && <div className="text-slate-400 text-sm">Calculando predicciones...</div>}

          {error || prediction?.fallback ? (
            <div className="card border border-slate-700">
              <p className="text-slate-400 text-sm">
                El servicio ML estará disponible una vez que configures el ml-service de Python.
                <br />
                <span className="text-slate-500 text-xs mt-1 block">Ver instrucciones en README.</span>
              </p>
            </div>
          ) : prediction ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {TREND_ICONS[prediction.trend] || <Minus size={14} />}
                <span className="text-slate-400 text-sm capitalize">{prediction.trend?.replace('_', ' ')}</span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <PredictionCard label="30 minutos" value={prediction.t30?.glucose} interval={prediction.t30?.confidenceInterval} minutesFromNow={30} />
                <PredictionCard label="60 minutos" value={prediction.t60?.glucose} interval={prediction.t60?.confidenceInterval} minutesFromNow={60} />
                <PredictionCard label="90 minutos" value={prediction.t90?.glucose} interval={prediction.t90?.confidenceInterval} minutesFromNow={90} />
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Optimal meal timing */}
      {timing && (
        <div className={`card border ${TIMING_STATUS_STYLES[timing.status as string] || TIMING_STATUS_STYLES.no_nightscout}`}>
          <div className="flex items-start gap-3">
            <Utensils size={18} />
            <div>
              <p className="font-medium text-sm">Momento óptimo para comer</p>
              <p className="text-sm opacity-80 mt-1">{timing.message}</p>
              {timing.waitMinutes > 0 && (
                <p className="text-xs mt-1 opacity-60">Esperar ~{timing.waitMinutes} minutos</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Simulator */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-white text-sm flex items-center gap-2">
          <BrainCircuit size={16} className="text-purple-400" />
          Simulador "¿Qué pasa si...?"
        </h2>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <p className="text-xs font-medium text-slate-400 flex items-center gap-1">
              <Utensils size={12} /> Comida (ahora)
            </p>
            <input className="input text-sm" type="number" placeholder="CH (g)" value={simMeal.carbs} onChange={(e) => setSimMeal({ ...simMeal, carbs: e.target.value })} />
            <input className="input text-sm" type="number" placeholder="Proteína (g)" value={simMeal.protein} onChange={(e) => setSimMeal({ ...simMeal, protein: e.target.value })} />
            <input className="input text-sm" type="number" placeholder="Grasa (g)" value={simMeal.fat} onChange={(e) => setSimMeal({ ...simMeal, fat: e.target.value })} />
          </div>
          <div className="space-y-3">
            <p className="text-xs font-medium text-slate-400 flex items-center gap-1">
              <Dumbbell size={12} /> Ejercicio (próxima hora)
            </p>
            <select className="input text-sm" value={simExercise.type} onChange={(e) => setSimExercise({ ...simExercise, type: e.target.value })}>
              <option value="strength">Fuerza</option>
              <option value="hiit">HIIT</option>
              <option value="cardio">Cardio</option>
            </select>
            <input className="input text-sm" type="number" placeholder="Duración (min)" value={simExercise.duration} onChange={(e) => setSimExercise({ ...simExercise, duration: e.target.value })} />
          </div>
        </div>

        <button className="btn-primary w-full" onClick={runSimulation} disabled={simLoading || !user?.nightscoutConnected}>
          {simLoading ? 'Simulando...' : 'Simular impacto en glucosa'}
        </button>

        {simResult && (
          <div className="bg-slate-800 rounded-xl p-4 text-sm">
            {simResult.error ? (
              <p className="text-slate-400">{String(simResult.error)}</p>
            ) : (
              <pre className="text-slate-300 text-xs overflow-auto">{JSON.stringify(simResult, null, 2)}</pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
