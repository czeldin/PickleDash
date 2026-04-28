'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
} from 'recharts';
import { DashboardData, PlayerMeta, HeroStats } from '@/types/dashboard';

interface Props {
  data: DashboardData;
}

interface ChartRow {
  pid: string;
  label: string;
  dupr: number;
  color: string;
  bgColor: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomYAxisTick({ x, y, payload, rows }: any) {
  const row: ChartRow | undefined = rows.find((r: ChartRow) => r.label === payload.value);
  if (!row) return null;

  return (
    <g transform={`translate(${x},${y})`}>
      <circle cx={-18} cy={0} r={14} fill={row.bgColor} />
      <text x={-18} y={0} dy="0.35em" textAnchor="middle" fontSize={9} fontWeight={700} fill={row.color}>
        {row.pid.slice(0, 2).toUpperCase()}
      </text>
      <text x={-36} y={0} dy="0.35em" textAnchor="end" fontSize={12} fontWeight={700} fill="#111827">
        {row.label}
      </text>
    </g>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RatingLabel({ x, y, width, height, value }: any) {
  if (value == null || value === 0) return null;
  return (
    <text
      x={(x as number) + (width as number) + 8}
      y={(y as number) + (height as number) / 2}
      dy="0.35em"
      fontSize={16}
      fontWeight={800}
      fill="#111827"
    >
      {(value as number).toFixed(2)}
    </text>
  );
}

export function HeroSection({ data }: Props) {
  const { players, hero } = data;
  const playerMap = new Map<string, PlayerMeta>(players.map((p) => [p.pid, p]));

  const sorted = [...hero]
    .filter((h) => h.dupr > 0)
    .sort((a, b) => b.dupr - a.dupr);

  const rows: ChartRow[] = sorted.map((h: HeroStats) => {
    const player = playerMap.get(h.pid);
    return {
      pid: player?.initials ?? h.pid,
      label: player?.name ?? h.pid,
      dupr: h.dupr,
      color: player?.color.text ?? '#374151',
      bgColor: player?.color.bg ?? '#f3f4f6',
    };
  });

  const chartHeight = Math.max(100, rows.length * 72);

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-gray-800 border-b border-gray-200 pb-2">
        Player Overview
      </h2>
      <div className="flex gap-4 items-stretch">

        {/* Rating bar chart */}
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-6 min-w-0">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Overall Rating</p>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart
              layout="vertical"
              data={rows}
              margin={{ top: 4, right: 56, bottom: 4, left: 8 }}
            >
              <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                type="number"
                domain={[3.5, 5.25]}
                ticks={[3.5, 4.0, 4.5, 5.0, 5.25]}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={190}
                tick={(props) => <CustomYAxisTick {...props} rows={rows} />}
                axisLine={false}
                tickLine={false}
              />
              <Bar dataKey="dupr" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                {rows.map((row) => (
                  <Cell key={row.label} fill={row.color} />
                ))}
                <LabelList content={<RatingLabel />} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Record tile */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-6 w-56 flex-shrink-0">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Record</p>
          <div className="space-y-3">
            {sorted.map((h: HeroStats) => {
              const player = playerMap.get(h.pid);
              const total = h.wins + h.losses;
              const winPct = total > 0 ? h.wins / total : 0;
              return (
                <div key={h.pid}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-gray-800">{player?.name ?? h.pid}</span>
                    <span className="text-sm font-bold tabular-nums" style={{ color: player?.color.text }}>
                      {h.wins}W–{h.losses}L
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${winPct * 100}%`, backgroundColor: player?.color.text }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 w-8 text-right tabular-nums">
                      {total > 0 ? `${Math.round(winPct * 100)}%` : '—'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {h.gamesPlayed} games · {h.totalShots.toLocaleString()} shots
                  </p>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </section>
  );
}
