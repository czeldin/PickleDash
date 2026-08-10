'use client';

import { useMemo, useState } from 'react';
import { DashboardData, PlayerMeta } from '@/types/dashboard';

interface Props {
  data: DashboardData;
}

interface SideStat { rallies: number; kitchen: number }

interface PairingStats {
  p1: PlayerMeta;
  p2: PlayerMeta;
  // keyed by p1's side: ss value when p1 is the server, or inverse when p2 serves
  bySide: Map<number, SideStat>;
  totalRallies: number;
}

// Confirmed from pb.vision: ss=0 = Left, ss=1 = Right
const SIDE_LABEL: Record<number, string> = { 0: 'Left', 1: 'Right' };

function buildPairings(data: DashboardData): PairingStats[] {
  const { players, kitchenByGame, servingRallies } = data;
  const playerMap = new Map(players.map((p) => [p.pid, p]));

  // sessionKey → Map<pid, team>
  const sessionTeamMap = new Map<string, Map<string, number>>();
  for (const row of kitchenByGame) {
    if (!sessionTeamMap.has(row.sessionKey)) sessionTeamMap.set(row.sessionKey, new Map());
    sessionTeamMap.get(row.sessionKey)!.set(row.pid, row.team);
  }

  const pairingMap = new Map<string, {
    pids: [string, string];
    bySide: Map<number, SideStat>;
    totalRallies: number;
  }>();

  for (const rally of servingRallies) {
    const teams = sessionTeamMap.get(rally.sessionKey);
    if (!teams) continue;

    // Find the two players on the serving team in this session
    const teamPids = [...teams.entries()]
      .filter(([, t]) => t === rally.servingTeam)
      .map(([pid]) => pid);
    if (teamPids.length !== 2) continue;

    const sorted = [...teamPids].sort();
    const [pid1, pid2] = sorted;
    if (!playerMap.has(pid1) || !playerMap.has(pid2)) continue;

    const key = `${pid1}|${pid2}`;
    if (!pairingMap.has(key)) {
      pairingMap.set(key, { pids: [pid1, pid2], bySide: new Map(), totalRallies: 0 });
    }
    const p = pairingMap.get(key)!;
    p.totalRallies++;

    // Determine pid1's side: if pid1 served, their side = rally.servedSide
    // if pid2 served, pid1's side = the other side (1 - rally.servedSide, assuming binary 0/1)
    const pid1Served = rally.servedByPid === pid1;
    const pid1Side = pid1Served ? rally.servedSide : (rally.servedSide === 0 ? 1 : 0);

    if (!p.bySide.has(pid1Side)) p.bySide.set(pid1Side, { rallies: 0, kitchen: 0 });
    const s = p.bySide.get(pid1Side)!;
    s.rallies++;
    if (rally.reachedKitchen) s.kitchen++;
  }

  return [...pairingMap.values()]
    .filter((p) => playerMap.has(p.pids[0]) && playerMap.has(p.pids[1]) && p.totalRallies > 0)
    .sort((a, b) => b.totalRallies - a.totalRallies)
    .map((p) => ({
      p1: playerMap.get(p.pids[0])!,
      p2: playerMap.get(p.pids[1])!,
      bySide: p.bySide,
      totalRallies: p.totalRallies,
    }));
}

function pct(s: SideStat) {
  return s.rallies > 0 ? Math.round((s.kitchen / s.rallies) * 100) : null;
}

// A pairing row with precomputed values so sorting doesn't recompute per compare.
interface PairingRow {
  p1: PlayerMeta;
  p2: PlayerMeta;
  bySide: Map<number, SideStat>;
  totalRallies: number;
  totalKitchen: number;
  sidePct: Map<number, number | null>;
  overallPct: number | null;
}

// sortKey: 'pairing' | 'overall' | `side:${n}`
type SortKey = 'pairing' | 'overall' | `side:${number}`;
type SortDir = 'asc' | 'desc';

// Compare with nulls always sorted last, regardless of direction.
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

export function KitchenPairingsSection({ data }: Props) {
  const pairings = buildPairings(data);
  const [sortKey, setSortKey] = useState<SortKey>('overall');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Collect all side keys present across all pairings (should be 0 and 1)
  const allSides = useMemo(
    () => [...new Set(pairings.flatMap((p) => [...p.bySide.keys()]))].sort(),
    [pairings]
  );

  const rows: PairingRow[] = useMemo(
    () =>
      pairings.map((p) => {
        const sidePct = new Map<number, number | null>();
        for (const side of allSides) {
          const s = p.bySide.get(side);
          sidePct.set(side, s ? pct(s) : null);
        }
        const totalKitchen = [...p.bySide.values()].reduce((s, r) => s + r.kitchen, 0);
        const overallPct = p.totalRallies > 0 ? Math.round((totalKitchen / p.totalRallies) * 100) : null;
        return { ...p, totalKitchen, sidePct, overallPct };
      }),
    [pairings, allSides]
  );

  const sortedRows = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      if (sortKey === 'pairing') {
        const an = `${a.p1.name} ${a.p2.name}`.toLowerCase();
        const bn = `${b.p1.name} ${b.p2.name}`.toLowerCase();
        const c = an.localeCompare(bn);
        return sortDir === 'asc' ? c : -c;
      }
      if (sortKey === 'overall') {
        const c = cmpNullable(a.overallPct, b.overallPct, sortDir);
        return c !== 0 ? c : b.totalRallies - a.totalRallies;
      }
      // side:N
      const side = Number(sortKey.slice(5));
      const c = cmpNullable(a.sidePct.get(side) ?? null, b.sidePct.get(side) ?? null, sortDir);
      return c !== 0 ? c : b.totalRallies - a.totalRallies;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  if (pairings.length === 0) return null;

  // Click a header: toggle direction if already active, else select it with a
  // sensible default direction (desc for numbers, asc for the name column).
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
      <h2 className="text-xl font-bold text-gray-800 border-b border-gray-200 pb-2">
        Kitchen Arrival by Pairing &amp; Side
      </h2>
      <p className="text-sm text-gray-500 -mt-1">
        % of serving rallies where the team reached the kitchen, split by which side the first player is on.
      </p>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 font-medium">
              <th className="text-left px-5 py-3">
                <button
                  type="button"
                  onClick={() => handleSort('pairing')}
                  className="inline-flex items-center hover:text-gray-800 transition-colors"
                >
                  Pairing
                  <SortArrow active={sortKey === 'pairing'} dir={sortDir} />
                </button>
              </th>
              {allSides.map((side) => {
                const key = `side:${side}` as SortKey;
                return (
                  <th key={side} className="text-right px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleSort(key)}
                      className="inline-flex items-center hover:text-gray-800 transition-colors"
                    >
                      P1 on {SIDE_LABEL[side] ?? `Side ${side}`}
                      <SortArrow active={sortKey === key} dir={sortDir} />
                    </button>
                  </th>
                );
              })}
              <th className="text-right px-4 py-3 font-semibold text-gray-600">
                <button
                  type="button"
                  onClick={() => handleSort('overall')}
                  className="inline-flex items-center hover:text-gray-800 transition-colors"
                >
                  Overall
                  <SortArrow active={sortKey === 'overall'} dir={sortDir} />
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sortedRows.map((p) => (
              <tr key={`${p.p1.pid}|${p.p2.pid}`} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="inline-flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-bold flex-shrink-0"
                      style={{ backgroundColor: p.p1.color.bg, color: p.p1.color.text }}
                    >{p.p1.initials}</span>
                    <span className="text-gray-700 font-medium">{p.p1.name}</span>
                    <span className="text-gray-300 text-xs">+</span>
                    <span
                      className="inline-flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-bold flex-shrink-0"
                      style={{ backgroundColor: p.p2.color.bg, color: p.p2.color.text }}
                    >{p.p2.initials}</span>
                    <span className="text-gray-700 font-medium">{p.p2.name}</span>
                  </div>
                </td>
                {allSides.map((side) => {
                  const s = p.bySide.get(side);
                  const val = p.sidePct.get(side) ?? null;
                  return (
                    <td key={side} className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <span
                          className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-bold flex-shrink-0"
                          style={{ backgroundColor: p.p1.color.bg, color: p.p1.color.text }}
                        >{p.p1.initials}</span>
                        <span className="text-gray-500 text-xs">{p.p1.name}</span>
                      </div>
                      <div className="mt-0.5">
                        {val !== null ? (
                          <span className="font-semibold tabular-nums text-gray-800">{val}%</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                        {s && s.rallies > 0 && (
                          <span className="text-gray-400 text-xs ml-1">({s.kitchen}/{s.rallies})</span>
                        )}
                      </div>
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-right">
                  {p.overallPct !== null ? (
                    <span className="font-bold tabular-nums text-gray-900">{p.overallPct}%</span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                  <span className="text-gray-400 text-xs ml-1">({p.totalKitchen}/{p.totalRallies})</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">
        &ldquo;P1&rdquo; is the first player listed (alphabetical). Left/Right reflects which side P1 is standing on when their team serves. Counts show (kitchen arrivals / serving rallies).
      </p>
    </section>
  );
}
