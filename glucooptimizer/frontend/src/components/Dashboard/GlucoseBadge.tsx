import { TrendingUp, TrendingDown, Minus, ChevronsUp, ChevronsDown } from 'lucide-react';

interface Props {
  glucose: number;
  direction: string;
  delta?: number;
  targetLow?: number;
  targetHigh?: number;
}

const DIRECTION_ICONS: Record<string, React.ReactNode> = {
  DoubleUp: <ChevronsUp size={20} className="text-red-400" />,
  SingleUp: <TrendingUp size={20} className="text-yellow-400" />,
  FortyFiveUp: <TrendingUp size={18} className="text-yellow-300" />,
  Flat: <Minus size={20} className="text-emerald-400" />,
  FortyFiveDown: <TrendingDown size={18} className="text-yellow-300" />,
  SingleDown: <TrendingDown size={20} className="text-yellow-400" />,
  DoubleDown: <ChevronsDown size={20} className="text-red-400" />,
};

const DIRECTION_ARROWS: Record<string, string> = {
  DoubleUp: '↑↑',
  SingleUp: '↑',
  FortyFiveUp: '↗',
  Flat: '→',
  FortyFiveDown: '↘',
  SingleDown: '↓',
  DoubleDown: '↓↓',
};

export default function GlucoseBadge({ glucose, direction, delta, targetLow = 70, targetHigh = 180 }: Props) {
  const isLow = glucose < targetLow;
  const isHigh = glucose > targetHigh;
  const isUrgentLow = glucose < 55;
  const isUrgentHigh = glucose > 250;

  const colorClass = isUrgentLow || isUrgentHigh
    ? 'text-red-400'
    : isLow || isHigh
    ? 'text-yellow-400'
    : 'text-emerald-400';

  const bgClass = isUrgentLow || isUrgentHigh
    ? 'bg-red-500/10 border-red-500/30'
    : isLow || isHigh
    ? 'bg-yellow-500/10 border-yellow-500/30'
    : 'bg-emerald-500/10 border-emerald-500/30';

  return (
    <div className={`flex items-center gap-3 px-5 py-4 rounded-2xl border ${bgClass}`}>
      <div className={`text-5xl font-bold font-mono ${colorClass}`}>{glucose}</div>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          {DIRECTION_ICONS[direction] || <Minus size={20} />}
          <span className="text-slate-400 text-sm">{DIRECTION_ARROWS[direction] || '?'}</span>
        </div>
        {delta !== undefined && (
          <span className={`text-xs font-mono ${delta > 0 ? 'text-yellow-400' : delta < 0 ? 'text-blue-400' : 'text-slate-400'}`}>
            {delta > 0 ? '+' : ''}{delta} mg/dL
          </span>
        )}
        <span className="text-xs text-slate-500">mg/dL</span>
      </div>
      {(isUrgentLow || isUrgentHigh) && (
        <div className={`text-xs font-bold px-2 py-1 rounded-lg ${isUrgentLow ? 'bg-red-500/20 text-red-400' : 'bg-orange-500/20 text-orange-400'}`}>
          {isUrgentLow ? 'URGENTE BAJO' : 'MUY ALTO'}
        </div>
      )}
    </div>
  );
}
