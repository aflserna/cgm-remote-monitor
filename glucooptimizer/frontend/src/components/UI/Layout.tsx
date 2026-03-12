import { Outlet, NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Salad,
  Dumbbell,
  BrainCircuit,
  BarChart3,
  Settings,
  LogOut,
  Activity,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/nutrition', icon: Salad, label: 'Nutrición' },
  { to: '/exercise', icon: Dumbbell, label: 'Ejercicio' },
  { to: '/predictions', icon: BrainCircuit, label: 'Predicciones' },
  { to: '/analytics', icon: BarChart3, label: 'Análisis' },
  { to: '/settings', icon: Settings, label: 'Ajustes' },
];

export default function Layout() {
  const { logout, user } = useAuthStore();

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-16 lg:w-60 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
        {/* Logo */}
        <div className="p-4 lg:p-5 border-b border-slate-800 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center shrink-0">
            <Activity size={18} className="text-white" />
          </div>
          <span className="hidden lg:block font-bold text-white text-sm">GlucoOptimizer</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-sm font-medium ${
                  isActive
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`
              }
            >
              <Icon size={18} className="shrink-0" />
              <span className="hidden lg:block">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User + logout */}
        <div className="p-2 border-t border-slate-800">
          <div className="hidden lg:block px-3 py-2 text-xs text-slate-500 truncate">{user?.email}</div>
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors w-full text-sm"
          >
            <LogOut size={16} className="shrink-0" />
            <span className="hidden lg:block">Salir</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
