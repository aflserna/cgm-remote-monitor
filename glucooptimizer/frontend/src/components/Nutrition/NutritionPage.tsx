import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Plus, Search, Trash2, Salad } from 'lucide-react';
import { mealsApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { Meal } from '../../types';

const MEAL_TYPES = [
  { value: 'breakfast', label: 'Desayuno' },
  { value: 'lunch', label: 'Almuerzo' },
  { value: 'dinner', label: 'Cena' },
  { value: 'snack', label: 'Snack' },
  { value: 'pre_exercise', label: 'Pre-ejercicio' },
  { value: 'post_exercise', label: 'Post-ejercicio' },
];

interface FoodResult {
  id: string;
  name: string;
  brand: string;
  per100g: { carbs: number; protein: number; fat: number; kcal: number; fiber: number };
}

function MacroBadge({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return (
    <div className={`text-center px-3 py-2 rounded-xl ${color}`}>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="font-semibold text-white text-sm">{Math.round(value)}<span className="text-xs text-slate-400 ml-0.5">{unit}</span></p>
    </div>
  );
}

export default function NutritionPage() {
  const { user } = useAuthStore();
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [showForm, setShowForm] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [form, setForm] = useState({ name: '', mealType: 'snack', carbs: '', protein: '', fat: '', kcal: '', notes: '' });
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['meals', date],
    queryFn: () => mealsApi.getByDate(date),
  });

  const { data: searchResults, refetch: runSearch, isFetching: searching } = useQuery({
    queryKey: ['food-search', searchQ],
    queryFn: () => mealsApi.searchFood(searchQ),
    enabled: false,
  });

  const logMeal = useMutation({
    mutationFn: mealsApi.log,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meals', date] });
      setShowForm(false);
      setForm({ name: '', mealType: 'snack', carbs: '', protein: '', fat: '', kcal: '', notes: '' });
    },
  });

  const deleteMeal = useMutation({
    mutationFn: mealsApi.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meals', date] }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    logMeal.mutate({
      name: form.name,
      mealType: form.mealType,
      timestamp: new Date(`${date}T${format(new Date(), 'HH:mm')}`).toISOString(),
      macros: {
        carbs: Number(form.carbs) || 0,
        protein: Number(form.protein) || 0,
        fat: Number(form.fat) || 0,
        kcal: Number(form.kcal) || 0,
      },
      notes: form.notes,
    });
  };

  const fillFromFood = (food: FoodResult, grams: number) => {
    const ratio = grams / 100;
    setForm((f) => ({
      ...f,
      name: food.name,
      carbs: String(Math.round(food.per100g.carbs * ratio)),
      protein: String(Math.round(food.per100g.protein * ratio)),
      fat: String(Math.round(food.per100g.fat * ratio)),
      kcal: String(Math.round(food.per100g.kcal * ratio)),
    }));
    setShowForm(true);
  };

  const totals = data?.totals || { kcal: 0, carbs: 0, protein: 0, fat: 0 };
  const targets = user?.targets;

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Nutrición</h1>
        <div className="flex items-center gap-3">
          <input type="date" className="input w-auto text-sm" value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="btn-primary flex items-center gap-2 text-sm" onClick={() => setShowForm(!showForm)}>
            <Plus size={14} /> Comida
          </button>
        </div>
      </div>

      {/* Daily totals vs targets */}
      {targets && (
        <div className="card">
          <h2 className="text-sm font-medium text-slate-400 mb-4">Resumen del día</h2>
          <div className="grid grid-cols-4 gap-3 mb-4">
            <MacroBadge label="Kcal" value={totals.kcal} unit="kcal" color="bg-orange-500/10" />
            <MacroBadge label="Carbos" value={totals.carbs} unit="g" color="bg-yellow-500/10" />
            <MacroBadge label="Proteína" value={totals.protein} unit="g" color="bg-blue-500/10" />
            <MacroBadge label="Grasa" value={totals.fat} unit="g" color="bg-purple-500/10" />
          </div>
          <div className="space-y-2">
            {[
              { label: 'Kcal', current: totals.kcal, target: targets.dailyKcal, color: 'bg-orange-500' },
              { label: 'Carbos', current: totals.carbs, target: targets.carbsG, color: 'bg-yellow-500' },
              { label: 'Proteína', current: totals.protein, target: targets.proteinG, color: 'bg-blue-500' },
            ].map(({ label, current, target, color }) => (
              <div key={label}>
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>{label}</span>
                  <span>{Math.round(current)} / {target}</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full">
                  <div className={`h-full ${color} rounded-full`} style={{ width: `${Math.min(100, (current / target) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
          {targets.dailyKcal > totals.kcal && (
            <p className="text-xs text-emerald-400 mt-3">
              Déficit: {targets.dailyKcal - Math.round(totals.kcal)} kcal restantes
            </p>
          )}
        </div>
      )}

      {/* Food search */}
      <div className="card space-y-3">
        <h2 className="text-sm font-medium text-slate-400">Buscar alimento</h2>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="ej: arroz, pollo, manzana..."
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
          />
          <button className="btn-secondary flex items-center gap-2" onClick={() => runSearch()} disabled={searching}>
            <Search size={14} /> {searching ? '...' : 'Buscar'}
          </button>
        </div>
        {searchResults?.length > 0 && (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {searchResults.map((food: FoodResult) => (
              <div key={food.id} className="flex items-center justify-between bg-slate-800 px-3 py-2 rounded-lg text-sm">
                <div>
                  <p className="text-white">{food.name}</p>
                  <p className="text-xs text-slate-500">{food.per100g.carbs}g CH · {food.per100g.protein}g P · {food.per100g.kcal}kcal (por 100g)</p>
                </div>
                <button className="btn-secondary text-xs px-2 py-1" onClick={() => fillFromFood(food, 100)}>
                  Usar 100g
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Log form */}
      {showForm && (
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-white">Registrar comida</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Nombre</label>
                <input className="input" placeholder="ej: Arroz con pollo" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <label className="label">Tipo</label>
                <select className="input" value={form.mealType} onChange={(e) => setForm({ ...form, mealType: e.target.value })}>
                  {MEAL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="label">CH (g)</label>
                <input className="input" type="number" placeholder="0" value={form.carbs} onChange={(e) => setForm({ ...form, carbs: e.target.value })} required />
              </div>
              <div>
                <label className="label">Proteína (g)</label>
                <input className="input" type="number" placeholder="0" value={form.protein} onChange={(e) => setForm({ ...form, protein: e.target.value })} />
              </div>
              <div>
                <label className="label">Grasa (g)</label>
                <input className="input" type="number" placeholder="0" value={form.fat} onChange={(e) => setForm({ ...form, fat: e.target.value })} />
              </div>
              <div>
                <label className="label">Kcal</label>
                <input className="input" type="number" placeholder="auto" value={form.kcal} onChange={(e) => setForm({ ...form, kcal: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-3">
              <button type="submit" className="btn-primary" disabled={logMeal.isPending}>
                {logMeal.isPending ? 'Guardando...' : 'Guardar'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {/* Meals list */}
      <div className="space-y-3">
        {data?.meals?.length === 0 && (
          <div className="card text-center py-10">
            <Salad size={32} className="text-slate-600 mx-auto mb-2" />
            <p className="text-slate-500">Sin comidas registradas hoy</p>
          </div>
        )}
        {data?.meals?.map((meal: Meal) => (
          <div key={meal._id} className="card flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-white font-medium">{meal.name}</span>
                <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">
                  {MEAL_TYPES.find((t) => t.value === meal.mealType)?.label}
                </span>
              </div>
              <div className="flex gap-3 text-xs text-slate-400">
                <span>{meal.macros.carbs}g CH</span>
                <span>{meal.macros.protein}g P</span>
                <span>{meal.macros.fat}g G</span>
                <span className="text-orange-400">{meal.macros.kcal} kcal</span>
                {meal.glucoseContext?.atMeal && (
                  <span className="text-emerald-400">Glucosa: {meal.glucoseContext.atMeal} mg/dL</span>
                )}
              </div>
            </div>
            <button onClick={() => deleteMeal.mutate(meal._id)} className="text-slate-600 hover:text-red-400 transition-colors">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
