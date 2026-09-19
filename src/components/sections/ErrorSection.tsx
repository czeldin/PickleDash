'use client';

import { DashboardData, ErrorRow, ShotAccuracyRow, PlayerMeta } from '@/types/dashboard';
import { SortableTable, ColumnDef } from '@/components/SortableTable';
import { SectionCard } from '@/components/SectionCard';
import { TrendButton } from '@/components/TrendChart';
import { ERROR_METRICS } from '@/components/trendMetrics';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';

interface Props {
  data: DashboardData;
}

function errCell(perGame: number, color = 'text-gray-700') {
  if (perGame === 0) return <span className="text-gray-300">0</span>;
  return <span className={`text-sm font-medium ${color}`}>{perGame.toFixed(1)}</span>;
}

// Headline tile = pb.vision's own Shot Accuracy % (share of shots that landed
// IN — `trends.shot_accuracy.in`, a direct pb.vision metric, category A in
// PROVENANCE.md). This is the same number pb.vision headlines on its own
// leaderboard, so it lines up exactly. Higher is better, so sort descending.
function AccuracyChart({ shotAccuracy, players }: { shotAccuracy: ShotAccuracyRow[]; players: PlayerMeta[] }) {
  const playerMap = new Map(players.map((p) => [p.pid, p]));
  const sorted = [...shotAccuracy].sort((a, b) => b.inPct - a.inPct);
  const chartData = sorted.map((r) => {
    const p = playerMap.get(r.pid);
    return { name: p?.name ?? r.pid, value: parseFloat((r.inPct * 100).toFixed(1)), color: p?.color.text ?? '#185FA5' };
  });
  if (chartData.length === 0) return null;
  const minVal = Math.min(...chartData.map((d) => d.value));
  // Zoom the axis to the players' band (accuracy clusters high, ~85-95%),
  // so small real differences are visible instead of a wall of near-full bars.
  const lo = Math.max(0, Math.floor((minVal - 5) / 5) * 5);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Shot accuracy — % of shots that landed in</p>
      <ResponsiveContainer width="100%" height={chartData.length * 48 + 32}>
        <BarChart layout="vertical" data={chartData} margin={{ top: 0, right: 52, left: 0, bottom: 0 }} barCategoryGap="35%">
          <XAxis type="number" domain={[lo, 100]} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            tickFormatter={(v: any) => `${v}%`} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 13, fill: '#374151', fontWeight: 500 }} axisLine={false} tickLine={false} width={110} />
          <Tooltip
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(val: any) => [`${val}%`, 'Shot accuracy']}
            contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {chartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
            <LabelList dataKey="value" position="right" style={{ fontSize: 12, fill: '#6b7280' }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any) => `${v}%`}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ErrorSection({ data }: Props) {
  const { errors, shotAccuracy, players } = data;

  const columns: ColumnDef<ErrorRow>[] = [
    {
      key: 'totalPerGame',
      header: 'Total / game',
      getValue: (row) => row.totalPerGame,
      render: (row) => <span className="text-sm font-bold text-gray-900">{row.totalPerGame.toFixed(1)}</span>,
    },
    {
      key: 'net',
      header: 'Net / game',
      getValue: (row) => row.net,
      render: (row) => errCell(row.net, 'text-red-600'),
    },
    {
      key: 'out',
      header: 'Out / game',
      getValue: (row) => row.out,
      render: (row) => errCell(row.out, 'text-orange-600'),
    },
    {
      key: 'kitchen',
      header: 'Short / game',
      getValue: (row) => row.kitchen,
      render: (row) => errCell(row.kitchen, 'text-purple-600'),
    },
    {
      key: 'popups',
      header: 'Popups / game',
      getValue: (row) => row.popups,
      render: (row) => errCell(row.popups, 'text-amber-600'),
    },
    {
      key: 'unforced',
      header: 'Unforced / game',
      getValue: (row) => row.unforced,
      render: (row) => errCell(row.unforced, 'text-red-500'),
    },
    {
      key: 'forced',
      header: 'Forced / game',
      getValue: (row) => row.forced,
      render: (row) => errCell(row.forced, 'text-gray-500'),
    },
  ];

  return (
    <SectionCard title="Error Breakdown" action={<TrendButton title="Errors" metrics={ERROR_METRICS} rows={data.nightTrends} players={data.players} />}>
      <p className="text-xs text-gray-400 -mt-1.5 mb-3">
        Headline is pb.vision&apos;s own <strong>shot accuracy</strong> (share of shots that landed in) — the exact number on pb.vision&apos;s leaderboard. The table below breaks the misses down per game: <strong>Short</strong> = a ball that landed short on your own side (didn&apos;t clear the net) — not a kitchen foot fault, which pb.vision doesn&apos;t track. Popups (amber) stayed in but set up the opponent, so they&apos;re shown separately and not counted as faults.
      </p>
      <AccuracyChart shotAccuracy={shotAccuracy} players={players} />
      <SortableTable
        rows={errors}
        columns={columns}
        players={players}
        defaultSortKey="totalPerGame"
        defaultSortDir="desc"
      />
    </SectionCard>
  );
}
