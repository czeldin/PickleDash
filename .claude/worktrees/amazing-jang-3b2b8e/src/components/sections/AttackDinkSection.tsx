'use client';

import { DashboardData, AttackRow, DinkRow } from '@/types/dashboard';
import { SortableTable, ColumnDef } from '@/components/SortableTable';
import { SectionCard } from '@/components/SectionCard';

interface Props {
  data: DashboardData;
}

function buildHighlights<T>(rows: T[], keys: (keyof T)[]) {
  const result = {} as Record<keyof T, { max: number; min: number }>;
  for (const key of keys) {
    const vals = rows.map((r) => r[key] as number).filter((v) => v > 0);
    result[key] = { max: vals.length ? Math.max(...vals) : -1, min: vals.length > 1 ? Math.min(...vals) : -1 };
  }
  return result;
}

function pctCell(pct: number, total: number, isMax: boolean, isMin: boolean) {
  if (total === 0) return <span className="text-gray-400 text-sm">—</span>;
  return (
    <div className="inline-flex items-center gap-1">
      <span className={`text-sm font-semibold px-2 py-0.5 rounded-full ${
        isMax ? 'bg-green-100 text-green-800' : isMin ? 'bg-red-100 text-red-700' : 'text-gray-800'
      }`}>
        {pct.toFixed(0)}%
      </span>
      <span className="text-gray-400 text-xs">({total})</span>
    </div>
  );
}

function numCell(val: number, isMax: boolean, isMin: boolean, decimals = 0) {
  if (val === 0) return <span className="text-gray-400 text-sm">—</span>;
  return (
    <span className={`text-sm font-semibold px-2 py-0.5 rounded-full ${
      isMax ? 'bg-green-100 text-green-800' : isMin ? 'bg-red-100 text-red-700' : 'text-gray-800'
    }`}>
      {val.toFixed(decimals)}
    </span>
  );
}

export function AttackDinkSection({ data }: Props) {
  const { attacks, dinks, players } = data;

  // Filter to players with enough data
  const validAttacks = attacks.filter((r) => r.attackTotal >= 3);
  const validDinks = dinks.filter((r) => r.dinkTotal >= 5);

  const attackHL = buildHighlights(validAttacks, ['attackWinPct', 'attackExcellentPct', 'attackTotal']);
  const dinkHL = buildHighlights(validDinks, ['dinkPerGame', 'dinkExcellentPct']);

  const attackColumns: ColumnDef<AttackRow>[] = [
    {
      key: 'attackTotal',
      header: 'Attacks',
      getValue: (r) => r.attackTotal,
      render: (r) => {
        if (r.attackTotal === 0) return <span className="text-gray-400 text-sm">—</span>;
        const { max, min } = attackHL.attackTotal;
        const isMax = r.attackTotal === max;
        const isMin = r.attackTotal === min && min !== max;
        return numCell(r.attackTotal, isMax, isMin);
      },
    },
    {
      key: 'attackWinPct',
      header: 'Win Rate',
      getValue: (r) => r.attackWinPct,
      render: (r) => {
        const { max, min } = attackHL.attackWinPct;
        return pctCell(r.attackWinPct, r.attackTotal, r.attackWinPct === max && max > 0, r.attackWinPct === min && min >= 0 && min !== max);
      },
    },
    {
      key: 'attackExcellentPct',
      header: 'Quality',
      getValue: (r) => r.attackExcellentPct,
      render: (r) => {
        if (r.attackTotal === 0) return <span className="text-gray-400 text-sm">—</span>;
        const { max, min } = attackHL.attackExcellentPct;
        return pctCell(r.attackExcellentPct, r.attackTotal, r.attackExcellentPct === max && max > 0, r.attackExcellentPct === min && min >= 0 && min !== max);
      },
    },
  ];

  const dinkColumns: ColumnDef<DinkRow>[] = [
    {
      key: 'dinkPerGame',
      header: 'Dinks / Game',
      getValue: (r) => r.dinkPerGame,
      render: (r) => {
        if (r.dinkTotal === 0) return <span className="text-gray-400 text-sm">—</span>;
        const { max, min } = dinkHL.dinkPerGame;
        const isMax = r.dinkPerGame === max;
        const isMin = r.dinkPerGame === min && min !== max;
        return (
          <div className="inline-flex items-center gap-1">
            {numCell(r.dinkPerGame, isMax, isMin, 1)}
            <span className="text-gray-400 text-xs">({r.dinkTotal})</span>
          </div>
        );
      },
    },
    {
      key: 'dinkExcellentPct',
      header: 'Quality',
      getValue: (r) => r.dinkExcellentPct,
      render: (r) => {
        if (r.dinkTotal === 0) return <span className="text-gray-400 text-sm">—</span>;
        const { max, min } = dinkHL.dinkExcellentPct;
        return pctCell(r.dinkExcellentPct, r.dinkTotal, r.dinkExcellentPct === max && max > 0, r.dinkExcellentPct === min && min >= 0 && min !== max);
      },
    },
  ];

  if (validAttacks.length === 0 && validDinks.length === 0) return null;

  return (
    <SectionCard title="Attacking & Dinking">
      <p className="text-xs text-gray-400 -mt-2 mb-4">
        Attacks are speed-ups and overheads (sht=4). Win Rate = team won the rally on that attack. Quality = % rated excellent. Green = best · Red = lowest.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {validAttacks.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Attack Success</h3>
            <SortableTable
              rows={validAttacks}
              columns={attackColumns}
              players={players}
              defaultSortKey="attackWinPct"
            />
          </div>
        )}
        {validDinks.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Dink Quality</h3>
            <SortableTable
              rows={validDinks}
              columns={dinkColumns}
              players={players}
              defaultSortKey="dinkExcellentPct"
            />
          </div>
        )}
      </div>
    </SectionCard>
  );
}
