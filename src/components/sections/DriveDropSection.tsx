'use client';

import { DashboardData, DriveDropRow, NightTrendRow } from '@/types/dashboard';
import { SectionCard } from '@/components/SectionCard';
import { SortableTable, ColumnDef } from '@/components/SortableTable';
import { cbText, cbDeltaText, cbArrow } from '@/lib/cbColors';
import { TrendButton, MetricDef } from '@/components/TrendChart';

interface Props { data: DashboardData; }

const rt = (n: number, d: number) => (d > 0 ? (100 * n) / d : null);
const DD_METRICS: MetricDef<NightTrendRow>[] = [
  { key: 'drop', label: '3rd drop win %', value: (r: NightTrendRow) => rt(r.dropWon, r.dropN), pct: true },
  { key: 'dnd', label: 'Drive-and-drop win %', value: (r: NightTrendRow) => rt(r.dndWon, r.dndN), pct: true },
  { key: 'off', label: 'Drive → offense win %', value: (r: NightTrendRow) => rt(r.offWon, r.offN), pct: true },
  { key: 'dropsel', label: '3rd drop %', value: (r: NightTrendRow) => rt(r.dropN, r.dropN + r.driveN), pct: true },
];

const pct = (n: number, d: number) => (d > 0 ? Math.round((100 * n) / d) : null);

function winCell(won: number, n: number, sub?: string) {
  const v = pct(won, n);
  if (v === null) return <span className="text-gray-300">—</span>;
  const color = v >= 50 ? cbText('good') : v >= 42 ? 'text-gray-800' : cbText('bad');
  return (
    <span>
      <span className={`font-semibold tabular-nums ${color}`}>{v}%</span>
      <span className="text-gray-400 text-xs ml-1">({won}/{n})</span>
      {sub && <span className="block text-[11px] text-amber-600">{sub}</span>}
    </span>
  );
}

const dropWin = (r: DriveDropRow) => pct(r.dropWon, r.dropN);
const dndWin = (r: DriveDropRow) => pct(r.dndWon, r.dndN);
const gapVal = (r: DriveDropRow) => { const d = dropWin(r), n = dndWin(r); return d !== null && n !== null ? d - n : null; };

export function DriveDropSection({ data }: Props) {
  const { driveDrop, players } = data;
  const pm = new Map(players.map((p) => [p.pid, p]));
  const rows = driveDrop.filter((r) => pm.has(r.pid) && r.dropN + r.driveN >= 5);
  if (rows.length === 0) return null;

  const columns: ColumnDef<DriveDropRow>[] = [
    { key: 'drop', header: '3rd drop win', getValue: (r) => dropWin(r) ?? -1, render: (r) => winCell(r.dropWon, r.dropN) },
    {
      key: 'dnd', header: 'Drive-and-drop win', getValue: (r) => dndWin(r) ?? -1,
      render: (r) => winCell(r.dndWon, r.dndN, pct(r.dndPop, r.dndN) !== null ? `${pct(r.dndPop, r.dndN)}% pop-up` : undefined),
    },
    { key: 'off', header: 'Drive → offense win', getValue: (r) => pct(r.offWon, r.offN) ?? -1, render: (r) => winCell(r.offWon, r.offN) },
    {
      key: 'gap', header: 'Gap (drop − D&D)', getValue: (r) => gapVal(r) ?? -999,
      render: (r) => { const g = gapVal(r); return g === null ? <span className="text-gray-300">—</span> : <span className={`tabular-nums font-bold ${cbDeltaText(g, false)}`}>{cbArrow(g, false)} {g > 0 ? '+' : ''}{g} pts</span>; },
    },
  ];

  return (
    <SectionCard title="Drive-and-Drop Analysis" action={<TrendButton title="Drive-and-drop" metrics={DD_METRICS} rows={data.nightTrends} players={data.players} />}>
      <p className="text-sm text-gray-500 -mt-1.5 mb-3">
        For each player&apos;s own 3rd shots. A <strong className="text-gray-600">drive-and-drop</strong> (drive the 3rd, drop the 5th) usually forces a hard reset — it wins less than just dropping the 3rd. <strong className="text-amber-600">Gap</strong> = points per 100 you lose by drive-and-dropping instead of dropping the 3rd (orange = drop is the better play).
      </p>
      <SortableTable rows={rows} columns={columns} players={players} defaultSortKey="gap" />
      <p className="text-xs text-gray-400 mt-3">
        &ldquo;Drive → offense&rdquo; is when the drive earned a 5th-shot drive or attack instead of a reset (the drive working as intended).
      </p>
    </SectionCard>
  );
}
