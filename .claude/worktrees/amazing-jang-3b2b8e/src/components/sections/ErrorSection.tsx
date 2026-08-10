'use client';

import { DashboardData, ErrorRow, PlayerMeta } from '@/types/dashboard';
import { SortableTable, ColumnDef } from '@/components/SortableTable';
import { SectionCard } from '@/components/SectionCard';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';

interface Props {
  data: DashboardData;
}

function errCell(perGame: number, color = 'text-gray-700') {
  if (perGame === 0) return <span className="text-gray-300">0</span>;
  return <span className={`text-sm font-medium ${color}`}>{perGame.toFixed(1)}</span>;
}

function TotalChart({ errors, players }: { errors: ErrorRow[]; players: PlayerMeta[] }) {
  const playerMap = new Map(players.map((p) => [p.pid, p]));
  const sorted = [...errors].sort((a, b) => b.totalPerGame - a.totalPerGame);
  const chartData = sorted.map((r) => {
    const p = playerMap.get(r.pid);
    return { name: p?.name ?? r.pid, value: parseFloat(r.totalPerGame.toFixed(1)), color: p?.color.text ?? '#185FA5', bg: p?.color.bg ?? '#E6F1FB' };
  });
  const maxVal = Math.max(...chartData.map((d) => d.value)) * 1.2 || 1;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Total errors per game</p>
      <ResponsiveContainer width="100%" height={chartData.length * 48 + 32}>
        <BarChart layout="vertical" data={chartData} margin={{ top: 0, right: 48, left: 0, bottom: 0 }} barCategoryGap="35%">
          <XAxis type="number" domain={[0, maxVal]} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 13, fill: '#374151', fontWeight: 500 }} axisLine={false} tickLine={false} width={110} />
          <Tooltip
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(val: any) => [`${val} / game`, 'Total errors']}
            contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {chartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
            <LabelList dataKey="value" position="right" style={{ fontSize: 12, fill: '#6b7280' }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any) => `${v}`}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ErrorSection({ data }: Props) {
  const { errors, players } = data;

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
      header: 'Kitchen / game',
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
    <SectionCard title="Error Breakdown">
      <p className="text-xs text-gray-400 -mt-2 mb-4">
        All values normalized per game. Popups (amber) = ball stayed in but set up the opponent.
      </p>
      <TotalChart errors={errors} players={players} />
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
