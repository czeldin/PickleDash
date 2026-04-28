'use client';

import { DashboardData, SpeedRow, PlayerMeta } from '@/types/dashboard';
import { SectionCard } from '@/components/SectionCard';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts';

interface Props {
  data: DashboardData;
}

interface SpeedChartProps {
  rows: SpeedRow[];
  players: PlayerMeta[];
  title: string;
}

function SpeedChart({ rows, players, title }: SpeedChartProps) {
  const playerMap = new Map(players.map((p) => [p.pid, p]));

  const chartData = rows
    .filter((r) => r.avgMph > 0 || r.topMph > 0)
    .sort((a, b) => b.avgMph - a.avgMph)
    .map((r) => {
      const p = playerMap.get(r.pid);
      return {
        name: p?.name ?? r.pid,
        avg: parseFloat(r.avgMph.toFixed(1)),
        top: parseFloat(r.topMph.toFixed(1)),
        color: p?.color.text ?? '#185FA5',
        bg: p?.color.bg ?? '#E6F1FB',
      };
    });

  if (chartData.length === 0) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">{title}</h3>
        <p className="text-gray-400 text-sm">No data</p>
      </div>
    );
  }

  const maxVal = Math.ceil(Math.max(...chartData.map((d) => d.top)) * 1.15 / 5) * 5;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">{title}</h3>
      <div className="flex gap-4 text-xs mb-1">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block bg-current opacity-80" style={{ color: '#185FA5', backgroundColor: '#185FA5' }} />Avg mph</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block border border-gray-300 bg-gray-100" />Top mph</span>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <ResponsiveContainer width="100%" height={chartData.length * 56 + 40}>
          <BarChart
            layout="vertical"
            data={chartData}
            margin={{ top: 0, right: 48, left: 0, bottom: 0 }}
            barCategoryGap="30%"
            barGap={4}
          >
            <XAxis type="number" domain={[0, maxVal]} tickFormatter={(v) => `${Math.round(v)}`} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} unit=" mph" />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 13, fill: '#374151', fontWeight: 500 }} axisLine={false} tickLine={false} width={100} />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(val: any, name: any) => [`${val} mph`, name === 'avg' ? 'Avg' : 'Top']}
              contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
            />
            <Bar dataKey="avg" name="Avg" radius={[0, 4, 4, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
              <LabelList dataKey="avg" position="right" style={{ fontSize: 12, fill: '#6b7280' }} // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any) => `${v}`} />
            </Bar>
            <Bar dataKey="top" name="Top" radius={[0, 4, 4, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.bg} stroke={entry.color} strokeWidth={1} />
              ))}
              <LabelList dataKey="top" position="right" style={{ fontSize: 12, fill: '#6b7280' }} // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any) => `${v}`} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function SpeedSection({ data }: Props) {
  const { serveSpeed, driveSpeed, players } = data;

  return (
    <SectionCard title="Speed">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <SpeedChart rows={serveSpeed} players={players} title="Serve Speed" />
        <SpeedChart rows={driveSpeed} players={players} title="Drive Speed" />
      </div>
    </SectionCard>
  );
}
