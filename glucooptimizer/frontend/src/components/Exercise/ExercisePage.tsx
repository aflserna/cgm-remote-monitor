import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Plus, Shield, AlertTriangle, CheckCircle, Dumbbell, Zap, Heart } from 'lucide-react';
import { exerciseApi } from '../../services/api';

const TYPE_ICONS: Record<string, React.ReactNode> = {
  strength: <Dumbbell size={16} />,
  hiit: <Zap size={16} />,
  cardio: <Heart size={16} />,
};

const TYPE_LABELS: Record<string, string> = {
  strength: 'Fuerza', hiit: 'HIIT', cardio: 'Cardio', yoga: 'Yoga', other: 'Otro',
};

const STATUS_COLORS: Record<string, string> = {
  safe: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  caution: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  unsafe: 'text-red-400 bg-red-500/10 border-red-500/30',
  no_nightscout: 'text-slate-400 bg-slate-800 border-slate-700',
};

interface ExerciseProgram {
  id: string;
  category: string;
  name: string;
  duration: number;
  glucoseNote: string;
  exercises: Array<{ name: string; sets: number; reps: string | number; rest: number }>;
}

export default function ExercisePage() {
  const [date] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState<'log' | 'programs'>('log');
  const [form, setForm] = useState({ type: 'strength', name: '', duration: '45', intensity: '7', notes: '' });
  const [preCheck, setPreCheck] = useState<Record<string, unknown> | null>(null);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['exercise', date],
    queryFn: () => exerciseApi.getByDate(date),
  });

  const { data: programs } = useQuery({
    queryKey: ['exercise-programs'],
    queryFn: exerciseApi.getPrograms,
  });

  const logSession = useMutation({
    mutationFn: exerciseApi.log,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise', date] });
      setShowForm(false);
    },
  });

  const checkSafety = async () => {
    const check = await exerciseApi.preCheck(form.type, Number(form.duration));
    setPreCheck(check);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    logSession.mutate({
      type: form.type,
      name: form.name || TYPE_LABELS[form.type],
      timestamp: new Date().toISOString(),
      duration: Number(form.duration),
      intensity: Number(form.intensity),
      notes: form.notes,
    });
  };

  const startProgram = (program: ExerciseProgram) => {
    setForm({ type: program.category, name: program.name, duration: String(program.duration), intensity: '7', notes: '' });
    setShowForm(true);
    setActiveTab('log');
    checkSafety();
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Ejercicio</h1>
        <button className="btn-primary flex items-center gap-2 text-sm" onClick={() => { setShowForm(!showForm); if (!showForm) checkSafety(); }}>
          <Plus size={14} /> Registrar
        </button>
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-900 rounded-xl p-1 border border-slate-800">
        {(['log', 'programs'] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
            {tab === 'log' ? 'Hoy' : 'Programas'}
          </button>
        ))}
      </div>

      {/* Log tab */}
      {activeTab === 'log' && (
        <div className="space-y-4">
          {/* Pre-exercise safety check */}
          {preCheck && (
            <div className={`card border ${STATUS_COLORS[(preCheck.status as string)] || STATUS_COLORS.safe}`}>
              <div className="flex items-start gap-3">
                {preCheck.status === 'safe' ? <CheckCircle size={18} /> : preCheck.status === 'unsafe' ? <AlertTriangle size={18} /> : <Shield size={18} />}
                <div className="flex-1">
                  <p className="font-medium text-sm">Chequeo pre-ejercicio</p>
                  {preCheck.currentGlucose && (
                    <p className="text-xs opacity-80 mt-0.5">
                      Glucosa: {String(preCheck.currentGlucose)} mg/dL · IOB: {typeof preCheck.iob === 'number' ? preCheck.iob.toFixed(1) : '—'}u
                    </p>
                  )}
                  {(preCheck.warnings as string[])?.map((w, i) => (
                    <p key={i} className="text-xs mt-1">⚠ {w}</p>
                  ))}
                  {(preCheck.recommendations as string[])?.map((r, i) => (
                    <p key={i} className="text-xs mt-0.5 opacity-70">→ {r}</p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Form */}
          {showForm && (
            <div className="card space-y-4">
              <h2 className="font-semibold text-white">Nueva sesión</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(TYPE_LABELS).filter(([k]) => k !== 'other').map(([value, label]) => (
                    <button key={value} type="button"
                      onClick={() => { setForm({ ...form, type: value }); checkSafety(); }}
                      className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm border transition-colors ${form.type === value ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600'}`}>
                      {TYPE_ICONS[value]} {label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Nombre (opcional)</label>
                    <input className="input" placeholder={TYPE_LABELS[form.type]} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Duración (min)</label>
                    <input className="input" type="number" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} required />
                  </div>
                </div>
                <div>
                  <label className="label">Intensidad: {form.intensity}/10</label>
                  <input type="range" min="1" max="10" className="w-full accent-emerald-500" value={form.intensity} onChange={(e) => setForm({ ...form, intensity: e.target.value })} />
                </div>
                <div className="flex gap-3">
                  <button type="submit" className="btn-primary" disabled={logSession.isPending}>
                    {logSession.isPending ? 'Guardando...' : 'Guardar sesión'}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
                </div>
              </form>
            </div>
          )}

          {/* Today's sessions */}
          {data?.sessions?.length === 0 ? (
            <div className="card text-center py-10">
              <Dumbbell size={32} className="text-slate-600 mx-auto mb-2" />
              <p className="text-slate-500">Sin sesiones hoy</p>
            </div>
          ) : (
            data?.sessions?.map((s: { _id: string; type: string; name: string; duration: number; intensity: number }) => (
              <div key={s._id} className="card flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.type === 'strength' ? 'bg-purple-500/10 text-purple-400' : s.type === 'hiit' ? 'bg-yellow-500/10 text-yellow-400' : 'bg-blue-500/10 text-blue-400'}`}>
                  {TYPE_ICONS[s.type] || <Dumbbell size={16} />}
                </div>
                <div>
                  <p className="text-white font-medium">{s.name || TYPE_LABELS[s.type]}</p>
                  <p className="text-xs text-slate-400">{s.duration} min · Intensidad {s.intensity}/10</p>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Programs tab */}
      {activeTab === 'programs' && (
        <div className="grid gap-4">
          {programs?.map((program: ExerciseProgram) => (
            <div key={program.id} className="card space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm ${program.category === 'strength' ? 'bg-purple-500/10 text-purple-400' : program.category === 'hiit' ? 'bg-yellow-500/10 text-yellow-400' : 'bg-blue-500/10 text-blue-400'}`}>
                    {TYPE_ICONS[program.category]}
                  </div>
                  <div>
                    <p className="text-white font-medium">{program.name}</p>
                    <p className="text-xs text-slate-400">{program.duration} min · {TYPE_LABELS[program.category]}</p>
                  </div>
                </div>
                <button className="btn-secondary text-sm" onClick={() => startProgram(program)}>Iniciar</button>
              </div>
              <div className="space-y-1">
                {program.exercises.map((ex, i) => (
                  <div key={i} className="flex justify-between text-xs text-slate-400 py-1 border-b border-slate-800 last:border-0">
                    <span>{ex.name}</span>
                    <span>{ex.sets} x {ex.reps}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500 bg-slate-800 px-3 py-2 rounded-lg">
                🩸 {program.glucoseNote}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
