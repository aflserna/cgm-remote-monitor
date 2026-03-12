import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { CheckCircle, XCircle, Wifi, Target, BrainCircuit } from 'lucide-react';
import { nsApi, authApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';

export default function SettingsPage() {
  const { user, setUser } = useAuthStore();
  const [nsStatus, setNsStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [nsLoading, setNsLoading] = useState(false);

  const nsForm = useForm({ defaultValues: { url: '', apiSecret: '' } });
  const targetsForm = useForm({
    defaultValues: {
      glucoseLow: user?.targets.glucoseLow || 70,
      glucoseHigh: user?.targets.glucoseHigh || 180,
      glucoseTightHigh: user?.targets.glucoseTightHigh || 140,
      dailyKcal: user?.targets.dailyKcal || 1800,
      carbsG: user?.targets.carbsG || 150,
      proteinG: user?.targets.proteinG || 130,
      fatG: user?.targets.fatG || 60,
    },
  });

  const connectNS = async (data: { url: string; apiSecret: string }) => {
    setNsLoading(true);
    setNsStatus(null);
    try {
      const res = await nsApi.connect(data);
      setNsStatus({ ok: true, message: `Conectado a ${res.nsName} v${res.version}` });
      const me = await authApi.me();
      setUser(me);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Error de conexión';
      setNsStatus({ ok: false, message: msg });
    } finally {
      setNsLoading(false);
    }
  };

  const saveTargets = async (data: Record<string, number>) => {
    try {
      await authApi.updateTargets(data);
      const me = await authApi.me();
      setUser(me);
    } catch {
      // handle error
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-white">Configuración</h1>

      {/* Nightscout connection */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2">
          <Wifi size={16} className="text-emerald-400" />
          <h2 className="font-semibold text-white">Conexión Nightscout</h2>
          {user?.nightscoutConnected && (
            <span className="ml-auto flex items-center gap-1 text-xs text-emerald-400">
              <CheckCircle size={12} /> Conectado
            </span>
          )}
        </div>
        <form onSubmit={nsForm.handleSubmit(connectNS)} className="space-y-4">
          <div>
            <label className="label">URL de Nightscout</label>
            <input
              className="input"
              placeholder="https://tuinstancia.herokuapp.com"
              {...nsForm.register('url', { required: true })}
            />
          </div>
          <div>
            <label className="label">API Secret</label>
            <input
              className="input"
              type="password"
              placeholder="Tu API secret"
              {...nsForm.register('apiSecret', { required: true })}
            />
          </div>
          {nsStatus && (
            <div className={`flex items-center gap-2 text-sm px-4 py-3 rounded-xl ${nsStatus.ok ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'}`}>
              {nsStatus.ok ? <CheckCircle size={14} /> : <XCircle size={14} />}
              {nsStatus.message}
            </div>
          )}
          <button type="submit" className="btn-primary" disabled={nsLoading}>
            {nsLoading ? 'Conectando...' : 'Conectar'}
          </button>
        </form>
      </div>

      {/* Targets */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-blue-400" />
          <h2 className="font-semibold text-white">Objetivos personales</h2>
        </div>
        <form onSubmit={targetsForm.handleSubmit(saveTargets)} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Glucosa baja (mg/dL)</label>
              <input className="input" type="number" {...targetsForm.register('glucoseLow', { valueAsNumber: true })} />
            </div>
            <div>
              <label className="label">Glucosa alta (mg/dL)</label>
              <input className="input" type="number" {...targetsForm.register('glucoseHigh', { valueAsNumber: true })} />
            </div>
            <div>
              <label className="label">TIR estricto (mg/dL)</label>
              <input className="input" type="number" {...targetsForm.register('glucoseTightHigh', { valueAsNumber: true })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Calorías diarias (kcal)</label>
              <input className="input" type="number" {...targetsForm.register('dailyKcal', { valueAsNumber: true })} />
            </div>
            <div>
              <label className="label">Carbohidratos (g)</label>
              <input className="input" type="number" {...targetsForm.register('carbsG', { valueAsNumber: true })} />
            </div>
            <div>
              <label className="label">Proteína (g)</label>
              <input className="input" type="number" {...targetsForm.register('proteinG', { valueAsNumber: true })} />
            </div>
            <div>
              <label className="label">Grasa (g)</label>
              <input className="input" type="number" {...targetsForm.register('fatG', { valueAsNumber: true })} />
            </div>
          </div>
          <button type="submit" className="btn-primary">Guardar objetivos</button>
        </form>
      </div>

      {/* ML Model status */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2">
          <BrainCircuit size={16} className="text-purple-400" />
          <h2 className="font-semibold text-white">Estado del modelo IA</h2>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Versión del modelo</span>
            <span className="text-white capitalize">{user?.mlModel.modelVersion || 'base'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Días de datos personales</span>
            <span className="text-white">{user?.mlModel.personalDataDays || 0} / 30 para personalizar</span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full mt-2">
            <div
              className="h-full bg-purple-500 rounded-full transition-all"
              style={{ width: `${Math.min(100, ((user?.mlModel.personalDataDays || 0) / 30) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-slate-500">
            {(user?.mlModel.personalDataDays || 0) < 30
              ? `Acumula ${30 - (user?.mlModel.personalDataDays || 0)} días más de datos para activar el modelo personal`
              : 'Modelo personal activo. Se mejora continuamente con tus datos.'}
          </p>
        </div>
      </div>
    </div>
  );
}
