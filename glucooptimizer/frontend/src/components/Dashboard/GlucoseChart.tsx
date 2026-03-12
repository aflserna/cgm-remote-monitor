import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { format } from 'date-fns';
import { GlucoseEntry } from '../../types';

interface Props {
  entries: GlucoseEntry[];
  predictions?: { time: string; glucose: number; low: number; high: number }[];
  targetLow?: number;
  targetHigh?: number;
}

function getGlucoseColor(value: number, low: number, high: number) {
  if (value < low) return '#ef4444';
  if (value > high) return '#f59e0b';
  return '#22c55e';
}

const CustomDot = (props: { cx?: number; cy?: number; payload?: { glucose: number }; low: number; high: number }) => {
  const { cx, cy, payload, low, high } = props;
  if (!cx || !cy || !payload) return null;
  const color = getGlucoseColor(payload.glucose, low, high);
  return <circle cx={cx} cy={cy} r={3} fill={color} stroke="none" />;
};

export default function GlucoseChart({ entries, predictions = [], targetLow = 70, targetHigh = 180 }: Props) {
  const historicalData = entries.map((e) => ({
    time: e.time,
    glucose: e.glucose,
    label: format(new Date(e.time), 'HH:mm'),
  }));

  const predictionData = predictions.map((p) => ({
    time: p.time,
    predicted: p.glucose,
    predLow: p.low,
    predHigh: p.high,
    label: format(new Date(p.time), 'HH:mm'),
  }));

  const allData = [...historicalData, ...predictionData].sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
  );

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={allData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="glucoseGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="predGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis
          dataKey="label"
          tick={{ fill: '#64748b', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[40, 350]}
          tick={{ fill: '#64748b', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 12, fontSize: 12 }}
          labelStyle={{ color: '#94a3b8' }}
          itemStyle={{ color: '#e2e8f0' }}
        />
        <ReferenceLine y={targetLow} stroke="#ef4444" strokeDasharray="4 2" strokeWidth={1} />
        <ReferenceLine y={targetHigh} stroke="#f59e0b" strokeDasharray="4 2" strokeWidth={1} />

        {/* Historical glucose */}
        <Area
          type="monotone"
          dataKey="glucose"
          stroke="#22c55e"
          strokeWidth={2}
          fill="url(#glucoseGrad)"
          dot={<CustomDot low={targetLow} high={targetHigh} />}
          activeDot={{ r: 5, fill: '#22c55e' }}
          connectNulls
        />

        {/* Predicted glucose */}
        <Area
          type="monotone"
          dataKey="predicted"
          stroke="#6366f1"
          strokeWidth={2}
          strokeDasharray="5 3"
          fill="url(#predGrad)"
          dot={false}
          connectNulls
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
