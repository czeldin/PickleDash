'use client';

import { useMemo, useState } from 'react';
import { DashboardData, PlayerMeta } from '@/types/dashboard';

interface Props {
  data: DashboardData;
}

interface WinStat {
  srvN: number; srvW: number;   // serving rallies / wins
  rcvN: number; rcvW: number;   // receiving rallies / wins
}
function emptyStat(): WinStat { return { srvN: 0, srvW: 0, rcvN: 0, rcvW: 0 }; }

interface PairingWin {
  p1: PlayerMeta;
  p2: PlayerMeta;
  bySide: Map<number, WinStat>;   // keyed by P1's physical side: 0 = Left, 1 = Right
  overall: WinStat;
}

// From pb.vision rally.pls: 0 = Left, 1 = Right
const SIDE_LABEL: Record<number, string> = { 0: 'Left', 1: 'Right' };

function buildPairings(data: DashboardData): PairingWin[] {
  const { players, rallySides } = data;
  const playerMap = new Map(players.map((p) => [p.pid, p]));

  const map = new Map<string, { pids: [string, string]; bySide: Map<number, WinStat>; overall: WinStat }>();

  for (const row of rallySides) {
    const names = Object.keys(row.sides).sort();
    if (names.length !== 2) continue;
    const [pid1, pid2] = names;
    if (!playerMap.has(pid1) || !playerMap.has(pid2)) continue;

    const key = `${pid1}|${pid2}`;
    if (!map.has(key)) {
      map.set(key, { pids: [pid1, pid2], bySide: new Map(), overall: emptyStat() });
    }
    const rec = map.get(key)!;

    const add = (st: WinStat) => {
      if (row.serving) { st.srvN++; if (row.won) st.srvW++; }
      else { st.rcvN++; if (row.won) st.rcvW++; }
    };
    add(rec.overall);

    const p1Side = row.sides[pid1];
    if (p1Side === 0 || p1Side === 1) {
      if (!rec.bySide.has(p1Side)) rec.bySide.set(p1Side, emptyStat());
      add(rec.bySide.get(p1Side)!);
    }
  }

  return [...map.values()]
    .map((p) => ({
      p1: playerMap.get(p.pids[0])!,
      p2: playerMap.get(p.pids[1])!,
      bySide: p.bySide,
      overall: p.overall,
    }))
    .filter((p) => p.overall.srvN + p.overall.rcvN > 0);
}

function srvPct(s: WinStat) { return s.srvN > 0 ? Math.round((s.srvW / s.srvN) * 100) : null; }
function rcvPct(s: WinStat) { return s.rcvN > 0 ? Math.round((s.rcvW / s.rcvN) * 100) : null; }

type SortKey = 'pairing' | 'overall' | `side:${number}`;
type SortDir = 'asc' | 'desc';
type SortMetric = 'serving' | 'receiving';

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

// Renders serving-win% and receiving-win% for one stat cell.
function WinPair({ s }: { s: WinStat | undefined }) {
  if (!s || (s.srvN === 0 && s.rcvN === 0)) return <span className="text-gray-300">—</span>;
  const sp = srvPct(s);
  const rp = rcvPct(s);
  return (
    <div className="inline-flex flex-col items-end leading-tight">
      <div className="flex items-baseline gap-2 tabular-nums">
        <span className="text-gray-400 text-[10px] uppercase tracking-wide">Srv</span>
        {sp !== null ? (
          <span className="font-semibold text-gray-800 w-16 text-right">{sp}% <span className="text-gray-400 text-[10px] font-normal">({s.srvW}/{s.srvN})</span></span>
        ) : <span className="text-gray-300 w-16 text-right">—</span>}
      </div>
      <div className="flex items-baseline gap-2 tabular-nums">
        <span className="text-gray-400 text-[10px] uppercase tracking-wide">Rcv</span>
        {rp !== null ? (
          <span className="font-semibold text-indigo-700 w-16 text-right">{rp}% <span className="text-gray-400 text-[10px] font-normal">({s.rcvW}/{s.rcvN})</span></span>
        ) : <span className="text-gray-300 w-16 text-right">—</span>}
      </div>
    </div>
  );
}

export function WinBySideSection({ data }: Props) {
  const pairings = buildPairings(data);
  const [sortKey, setSortKey] = useState<SortKey>('overall');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [sortMetric, setSortMetric] = useState<SortMetric>('serving');

  const allSides = useMemo(
    () => [...new Set(pairings.flatMap((p) => [...p.bySide.keys()]))].sort(),
    [pairings]
  );

  const sortedRows = useMemo(() => {
    const metricPct = (s: WinStat | undefined) =>
      !s ? null : sortMetric === 'serving' ? srvPct(s) : rcvPct(s);
    const arr = [...pairings];
    arr.sort((a, b) => {
      if (sortKey === 'pairing') {
        const an = `${a.p1.name} ${a.p2.name}`.toLowerCase();
        const bn = `${b.p1.name} ${b.p2.name}`.toLowerCase();
        const c = an.localeCompare(bn);
        return sortDir === 'asc' ? c : -c;
      }
      const aStat = sortKey === 'overall' ? a.overall : a.bySide.get(Number(sortKey.slice(5)));
      const bStat = sortKey === 'overall' ? b.overall : b.bySide.get(Number(sortKey.slice(5)));
      const c = cmpNullable(metricPct(aStat), metricPct(bStat), sortDir);
      const aN = (a.overall.srvN + a.overall.rcvN);
      const bN = (b.overall.srvN + b.overall.rcvN);
      return c !== 0 ? c : bN - aN;
    });
    return arr;
  }, [pairings, sortKey, sortDir, sortMetric]);

  if (pairings.length === 0) return null;

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'pairing' ? 'asc' : 'desc');
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between border-b border-gray-200 pb-2 gap-3 flex-wrap">
        <h2 className="text-xl font-bold text-gray-800">
          Win Rate by Court Side
        </h2>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-gray-400">Sort by</span>
          {(['serving', 'receiving'] as SortMetric[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setSortMetric(m)}
              className={`px-2 py-0.5 rounded-full font-medium transition-colors ${
                sortMetric === m ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {m === 'serving' ? 'Serving' : 'Receiving'}
            </button>
          ))}
        </div>
      </div>
      <p className="text-sm text-gray-500 -mt-1">
        Point win rate split by which side the first player is on, broken out by <strong className="text-gray-600">Srv</strong> (team was serving) and <strong className="text-indigo-700">Rcv</strong> (team was receiving).
      </p>
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
                    <WinPair s={p.bySide.get(side)} />
                  </td>
                ))}
                <td className="px-4 py-3 text-right align-top">
                  <div className="mb-1 text-xs text-gray-400">&nbsp;</div>
                  <WinPair s={p.overall} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">
        &ldquo;P1&rdquo; is the first player listed (alphabetical). Left/Right reflects which side P1 is standing on that rally. Counts show (wins / rallies).
      </p>
    </section>
  );
}
