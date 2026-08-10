'use client';

import { useMemo, useState } from 'react';
import { DashboardData, PlayerMeta } from '@/types/dashboard';

interface Props {
  data: DashboardData;
}

// Raw counts for one (side, serving-or-receiving) bucket.
interface Bucket { n: number; reached: number; wonEarly: number; won: number }
function emptyBucket(): Bucket { return { n: 0, reached: 0, wonEarly: 0, won: 0 }; }
function addBucket(a: Bucket, b: Bucket): Bucket {
  return { n: a.n + b.n, reached: a.reached + b.reached, wonEarly: a.wonEarly + b.wonEarly, won: a.won + b.won };
}

// Serving + receiving buckets for one court side.
interface SideCell { srv: Bucket; rcv: Bucket }
function emptyCell(): SideCell { return { srv: emptyBucket(), rcv: emptyBucket() }; }

interface Pairing {
  p1: PlayerMeta;
  p2: PlayerMeta;
  bySide: Map<number, SideCell>;   // keyed by P1's physical side: 0 = Left, 1 = Right
  overall: SideCell;
}

// From pb.vision rally.pls: 0 = Left, 1 = Right
const SIDE_LABEL: Record<number, string> = { 0: 'Left', 1: 'Right' };

type Scope = 'serving' | 'returning' | 'both';
type Metric = 'kitchen' | 'early' | 'won';

const METRICS: { key: Metric; label: string; color: string }[] = [
  { key: 'kitchen', label: 'Kit', color: 'text-gray-800' },
  { key: 'early', label: 'Early', color: 'text-amber-600' },
  { key: 'won', label: 'Win', color: 'text-emerald-700' },
];

// Combine a side cell's serving/receiving buckets according to the chosen scope.
function scoped(cell: SideCell | undefined, scope: Scope): Bucket {
  if (!cell) return emptyBucket();
  if (scope === 'serving') return cell.srv;
  if (scope === 'returning') return cell.rcv;
  return addBucket(cell.srv, cell.rcv);
}

function metricPct(b: Bucket, m: Metric): number | null {
  if (b.n === 0) return null;
  const num = m === 'kitchen' ? b.reached : m === 'early' ? b.wonEarly : b.won;
  return Math.round((num / b.n) * 100);
}

function buildPairings(data: DashboardData): Pairing[] {
  const { players, rallySides } = data;
  const playerMap = new Map(players.map((p) => [p.pid, p]));

  const map = new Map<string, { pids: [string, string]; bySide: Map<number, SideCell>; overall: SideCell }>();

  for (const row of rallySides) {
    const names = Object.keys(row.sides).sort();
    if (names.length !== 2) continue;
    const [pid1, pid2] = names;
    if (!playerMap.has(pid1) || !playerMap.has(pid2)) continue;

    const key = `${pid1}|${pid2}`;
    if (!map.has(key)) map.set(key, { pids: [pid1, pid2], bySide: new Map(), overall: emptyCell() });
    const rec = map.get(key)!;

    const bump = (cell: SideCell) => {
      const b = row.serving ? cell.srv : cell.rcv;
      b.n++;
      if (row.reached) b.reached++;
      if (row.won) b.won++;
      if (row.won && !row.reached) b.wonEarly++;
    };
    bump(rec.overall);

    const p1Side = row.sides[pid1];
    if (p1Side === 0 || p1Side === 1) {
      if (!rec.bySide.has(p1Side)) rec.bySide.set(p1Side, emptyCell());
      bump(rec.bySide.get(p1Side)!);
    }
  }

  return [...map.values()]
    .map((p) => ({ p1: playerMap.get(p.pids[0])!, p2: playerMap.get(p.pids[1])!, bySide: p.bySide, overall: p.overall }))
    .filter((p) => p.overall.srv.n + p.overall.rcv.n > 0);
}

type SortKey = 'pairing' | 'overall' | `side:${number}`;
type SortDir = 'asc' | 'desc';

function cmpNullable(a: number | null, b: number | null, dir: SortDir): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return dir === 'asc' ? a - b : b - a;
}

function SortArrow({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span className={`ml-1 text-[10px] ${active ? 'text-gray-700' : 'text-gray-300'}`}>
      {active ? (dir === 'asc' ? '▲' : '▼') : '▲'}
    </span>
  );
}

// The three metric rows for one cell, under the chosen scope.
function MetricStack({ cell, scope }: { cell: SideCell | undefined; scope: Scope }) {
  const b = scoped(cell, scope);
  if (b.n === 0) return <span className="text-gray-300">—</span>;
  return (
    <div className="inline-flex flex-col items-end leading-tight tabular-nums">
      {METRICS.map((m) => {
        const v = metricPct(b, m.key);
        return (
          <div key={m.key} className="flex items-baseline gap-2">
            <span className="text-gray-400 text-[10px] uppercase tracking-wide w-9 text-left">{m.label}</span>
            <span className={`font-semibold ${m.color} w-9 text-right`}>{v}%</span>
          </div>
        );
      })}
      <span className="text-gray-400 text-[10px] mt-0.5">({b.n})</span>
    </div>
  );
}

export function PairingSideSection({ data }: Props) {
  const pairings = buildPairings(data);
  const [sortKey, setSortKey] = useState<SortKey>('overall');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [scope, setScope] = useState<Scope>('serving');
  const [sortMetric, setSortMetric] = useState<Metric>('won');

  const allSides = useMemo(
    () => [...new Set(pairings.flatMap((p) => [...p.bySide.keys()]))].sort(),
    [pairings]
  );

  const sortedRows = useMemo(() => {
    const cellPct = (cell: SideCell | undefined) => metricPct(scoped(cell, scope), sortMetric);
    const arr = [...pairings];
    arr.sort((a, b) => {
      if (sortKey === 'pairing') {
        const an = `${a.p1.name} ${a.p2.name}`.toLowerCase();
        const bn = `${b.p1.name} ${b.p2.name}`.toLowerCase();
        const c = an.localeCompare(bn);
        return sortDir === 'asc' ? c : -c;
      }
      const aCell = sortKey === 'overall' ? a.overall : a.bySide.get(Number(sortKey.slice(5)));
      const bCell = sortKey === 'overall' ? b.overall : b.bySide.get(Number(sortKey.slice(5)));
      const c = cmpNullable(cellPct(aCell), cellPct(bCell), sortDir);
      if (c !== 0) return c;
      return scoped(b.overall, scope).n - scoped(a.overall, scope).n;
    });
    return arr;
  }, [pairings, sortKey, sortDir, scope, sortMetric]);

  if (pairings.length === 0) return null;

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'pairing' ? 'asc' : 'desc'); }
  }

  const SCOPES: { key: Scope; label: string }[] = [
    { key: 'serving', label: 'Serving' },
    { key: 'returning', label: 'Returning' },
    { key: 'both', label: 'Both' },
  ];

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between border-b border-gray-200 pb-2 gap-3 flex-wrap">
        <h2 className="text-xl font-bold text-gray-800">Kitchen &amp; Win by Court Side</h2>
        {/* Scope tabs */}
        <div className="inline-flex rounded-lg bg-gray-100 p-0.5 text-xs">
          {SCOPES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setScope(s.key)}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${
                scope === s.key ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap -mt-1">
        <p className="text-sm text-gray-500">
          <strong className="text-gray-700">Kit</strong> = reached the kitchen · <strong className="text-amber-600">Early</strong> = won before the kitchen · <strong className="text-emerald-700">Win</strong> = won overall. Split by which side the first player is on.
        </p>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-gray-400">Sort by</span>
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setSortMetric(m.key)}
              className={`px-2 py-0.5 rounded-full font-medium transition-colors ${
                sortMetric === m.key ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 font-medium">
              <th className="text-left px-5 py-3">
                <button type="button" onClick={() => handleSort('pairing')} className="inline-flex items-center hover:text-gray-800 transition-colors">
                  Pairing<SortArrow active={sortKey === 'pairing'} dir={sortDir} />
                </button>
              </th>
              {allSides.map((side) => {
                const key = `side:${side}` as SortKey;
                return (
                  <th key={side} className="text-right px-4 py-3">
                    <button type="button" onClick={() => handleSort(key)} className="inline-flex items-center hover:text-gray-800 transition-colors">
                      P1 on {SIDE_LABEL[side] ?? `Side ${side}`}<SortArrow active={sortKey === key} dir={sortDir} />
                    </button>
                  </th>
                );
              })}
              <th className="text-right px-4 py-3 font-semibold text-gray-600">
                <button type="button" onClick={() => handleSort('overall')} className="inline-flex items-center hover:text-gray-800 transition-colors">
                  Overall<SortArrow active={sortKey === 'overall'} dir={sortDir} />
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sortedRows.map((p) => (
              <tr key={`${p.p1.pid}|${p.p2.pid}`} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3 align-top">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-bold flex-shrink-0" style={{ backgroundColor: p.p1.color.bg, color: p.p1.color.text }}>{p.p1.initials}</span>
                    <span className="text-gray-700 font-medium">{p.p1.name}</span>
                    <span className="text-gray-300 text-xs">+</span>
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-bold flex-shrink-0" style={{ backgroundColor: p.p2.color.bg, color: p.p2.color.text }}>{p.p2.initials}</span>
                    <span className="text-gray-700 font-medium">{p.p2.name}</span>
                  </div>
                </td>
                {allSides.map((side) => (
                  <td key={side} className="px-4 py-3 text-right align-top">
                    <div className="flex items-center justify-end gap-1.5 mb-1">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-bold flex-shrink-0" style={{ backgroundColor: p.p1.color.bg, color: p.p1.color.text }}>{p.p1.initials}</span>
                      <span className="text-gray-500 text-xs">{p.p1.name}</span>
                    </div>
                    <MetricStack cell={p.bySide.get(side)} scope={scope} />
                  </td>
                ))}
                <td className="px-4 py-3 text-right align-top">
                  <div className="mb-1 text-xs text-gray-400">&nbsp;</div>
                  <MetricStack cell={p.overall} scope={scope} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">
        &ldquo;P1&rdquo; is the first player listed (alphabetical). Left/Right reflects which side P1 is standing on that rally. Count in parentheses is the number of rallies in the selected scope.
      </p>
    </section>
  );
}
