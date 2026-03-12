import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { CheckCircle, XCircle, Wifi, Target, BrainCircuit, User } from 'lucide-react';
import { nsApi, authApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';

export default function SettingsPage() {
  const { user, setUser } = useAuthStore();
  const [nsStatus, setNsStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [nsLoading, setNsLoading] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

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

  const profileForm = useForm({
    defaultValues: {
      weightKg: user?.profile?.weightKg || '',
      heightCm: user?.profile?.heightCm || '',
      age: user?.profile?.age || '',
      gender: user?.profile?.gender || 'male',
      activityLevel: user?.profile?.activityLevel || 'moderate',
      carbRatio: user?.profile?.carbRatio || 10,
      insulinSensitivity: user?.profile?.insulinSensitivity || 50,
    },
  });

  const saveTargets = async (data: Record<string, number>) => {
    try {
      await authApi.updateTargets(data);
      const me = await authApi.me();
      setUser(me);
    } catch {
      // handle error
    }
  };

  const saveProfile = async (data: Record<string, unknown>) => {
    try {
      const payload: Record<string, unknown> = {};
      if (data.weightKg) payload.weightKg = Number(data.weightKg);
      if (data.heightCm) payload.heightCm = Number(data.heightCm);
      if (data.age) payload.age = Number(data.age);
      if (data.gender) payload.gender = data.gender;
      if (data.activityLevel) payload.activityLevel = data.activityLevel;
      if (data.carbRatio) payload.carbRatio = Number(data.carbRatio);
      if (data.insulinSensitivity) payload.insulinSensitivity = Number(data.insulinSensitivity);
      await authApi.updateProfile(payload);
      const me = await authApi.me();
      setUser(me);
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    } catch {
      // handle error
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-white">Configuración</h1>

      {/* Personal profile */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2">
          <User size={16} className="text-emerald-400" />
          <h2 className="font-semibold text-white">Perfil personal</h2>
          <span className="text-xs text-slate-500 ml-1">Para cálculo de kcal quemadas y bolo</span>
        </div>
        <form onSubmit={profileForm.handleSubmit(saveProfile)} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Peso (kg)</label>
              <input className="input" type="number" step="0.1" placeholder="70" {...profileForm.register('weightKg')} />
            </div>
            <div>
              <label className="label">Altura (cm)</label>
              <input className="input" type="number" placeholder="175" {...profileForm.register('heightCm')} />
            </div>
            <div>
              <label className="label">Edad</label>
              <input className="input" type="number" placeholder="30" {...profileForm.register('age')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Sexo</label>
              <select className="input" {...profileForm.register('gender')}>
                <option value="male">Hombre</option>
                <option value="female">Mujer</option>
                <option value="other">Otro</option>
              </select>
            </div>
            <div>
              <label className="label">Nivel de actividad</label>
              <select className="input" {...profileForm.register('activityLevel')}>
                <option value="sedentary">Sedentario</option>
                <option value="light">Ligero (1-2 días/sem)</option>
                <option value="moderate">Moderado (3-4 días/sem)</option>
                <option value="active">Activo (5+ días/sem)</option>
                <option value="very_active">Muy activo</option>
              </select>
            </div>
          </div>
          <div className="border-t border-slate-800 pt-4">
            <p className="text-xs text-slate-500 mb-3">Parámetros de insulina — necesarios para calcular bolo recomendado</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Ratio CH (g/u)</label>
                <input className="input" type="number" step="0.5" placeholder="10" {...profileForm.register('carbRatio')} />
                <p className="text-xs text-slate-600 mt-1">Gramos de CH por unidad de insulina</p>
              </div>
              <div>
                <label className="label">Factor sensibilidad (mg/dL/u)</label>
                <input className="input" type="number" step="1" placeholder="50" {...profileForm.register('insulinSensitivity')} />
                <p className="text-xs text-slate-600 mt-1">Cuánto baja la glucosa por unidad</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" className="btn-primary">Guardar perfil</button>
            {profileSaved && (
              <span className="flex items-center gap-1 text-emerald-400 text-sm">
                <CheckCircle size={14} /> Guardado
              </span>
            )}
          </div>
        </form>
      </div>

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
