'use client';

import { useMemo, useState } from 'react';
import { DashboardData, PlayerMeta } from '@/types/dashboard';

interface Props {
  data: DashboardData;
}

interface SideStat { rallies: number; kitchen: number; win: number }

interface PairingStats {
  p1: PlayerMeta;
  p2: PlayerMeta;
  // keyed by p1's actual physical side that rally (from rally.pls): 0 = Left, 1 = Right
  bySide: Map<number, SideStat>;
  overall: SideStat;
}

// From pb.vision rally.pls: 0 = Left, 1 = Right
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
    overall: SideStat;
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
      pairingMap.set(key, { pids: [pid1, pid2], bySide: new Map(), overall: { rallies: 0, kitchen: 0, win: 0 } });
    }
    // "Kitchen" success = reached the kitchen OR won the point before having to
    // (e.g. a drive winner). A fast win isn't penalized as a kitchen failure.
    const kitchenSuccess = rally.reached || rally.won;

    const p = pairingMap.get(key)!;
    p.overall.rallies++;
    if (kitchenSuccess) p.overall.kitchen++;
    if (rally.won) p.overall.win++;

    // pid1's actual physical side this rally, read directly from rally.pls.
    const pid1Side = rally.sides[pid1];
    if (pid1Side === 0 || pid1Side === 1) {
      if (!p.bySide.has(pid1Side)) p.bySide.set(pid1Side, { rallies: 0, kitchen: 0, win: 0 });
      const s = p.bySide.get(pid1Side)!;
      s.rallies++;
      if (kitchenSuccess) s.kitchen++;
      if (rally.won) s.win++;
    }
  }

  return [...pairingMap.values()]
    .filter((p) => playerMap.has(p.pids[0]) && playerMap.has(p.pids[1]) && p.overall.rallies > 0)
    .sort((a, b) => b.overall.rallies - a.overall.rallies)
    .map((p) => ({
      p1: playerMap.get(p.pids[0])!,
      p2: playerMap.get(p.pids[1])!,
      bySide: p.bySide,
      overall: p.overall,
    }));
}

function kitchenPct(s: SideStat) {
  return s.rallies > 0 ? Math.round((s.kitchen / s.rallies) * 100) : null;
}
function winPct(s: SideStat) {
  return s.rallies > 0 ? Math.round((s.win / s.rallies) * 100) : null;
}

// sortKey: 'pairing' | 'overall' | `side:${n}`
type SortKey = 'pairing' | 'overall' | `side:${number}`;
type SortDir = 'asc' | 'desc';
type SortMetric = 'kitchen' | 'win';

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

// Renders the Kitchen % / Win % pair for one stat cell.
function StatPair({ s }: { s: SideStat | undefined }) {
  if (!s || s.rallies === 0) return <span className="text-gray-300">—</span>;
  const k = kitchenPct(s);
  const w = winPct(s);
  return (
    <div className="inline-flex flex-col items-end leading-tight">
      <div className="flex items-baseline gap-2 tabular-nums">
        <span className="text-gray-400 text-[10px] uppercase tracking-wide">Kit</span>
        <span className="font-semibold text-gray-800 w-9 text-right">{k}%</span>
      </div>
      <div className="flex items-baseline gap-2 tabular-nums">
        <span className="text-gray-400 text-[10px] uppercase tracking-wide">Win</span>
        <span className="font-semibold text-emerald-700 w-9 text-right">{w}%</span>
      </div>
      <span className="text-gray-400 text-[10px] mt-0.5">({s.rallies})</span>
    </div>
  );
}

export function KitchenPairingsSection({ data }: Props) {
  const pairings = buildPairings(data);
  const [sortKey, setSortKey] = useState<SortKey>('overall');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [sortMetric, setSortMetric] = useState<SortMetric>('kitchen');

  // Collect all side keys present across all pairings (should be 0 and 1)
  const allSides = useMemo(
    () => [...new Set(pairings.flatMap((p) => [...p.bySide.keys()]))].sort(),
    [pairings]
  );

  const sortedRows = useMemo(() => {
    const metricPct = (s: SideStat | undefined) =>
      !s ? null : sortMetric === 'kitchen' ? kitchenPct(s) : winPct(s);
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
      return c !== 0 ? c : b.overall.rallies - a.overall.rallies;
    });
    return arr;
  }, [pairings, sortKey, sortDir, sortMetric]);

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
      <div className="flex items-end justify-between border-b border-gray-200 pb-2 gap-3 flex-wrap">
        <h2 className="text-xl font-bold text-gray-800">
          Kitchen Arrival &amp; Win by Pairing &amp; Side
        </h2>
        {/* Which metric the sortable columns sort by */}
        <div className="flex items-center gap-1 text-xs">
          <span className="text-gray-400">Sort by</span>
          {(['kitchen', 'win'] as SortMetric[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setSortMetric(m)}
              className={`px-2 py-0.5 rounded-full font-medium transition-colors ${
                sortMetric === m ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {m === 'kitchen' ? 'Kitchen %' : 'Win %'}
            </button>
          ))}
        </div>
      </div>
      <p className="text-sm text-gray-500 -mt-1">
        Serving rallies split by which side the first player is on. <strong className="text-gray-600">Kit</strong> = reached the kitchen <em>or</em> won the point before having to (e.g. a drive winner); <strong className="text-emerald-700">Win</strong> = won the point.
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
                <td className="px-5 py-3 align-top">
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
                {allSides.map((side) => (
                  <td key={side} className="px-4 py-3 text-right align-top">
                    <div className="flex items-center justify-end gap-1.5 mb-1">
                      <span
                        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-bold flex-shrink-0"
                        style={{ backgroundColor: p.p1.color.bg, color: p.p1.color.text }}
                      >{p.p1.initials}</span>
                      <span className="text-gray-500 text-xs">{p.p1.name}</span>
                    </div>
                    <StatPair s={p.bySide.get(side)} />
                  </td>
                ))}
                <td className="px-4 py-3 text-right align-top">
                  <div className="mb-1 text-xs text-gray-400">&nbsp;</div>
                  <StatPair s={p.overall} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">
        &ldquo;P1&rdquo; is the first player listed (alphabetical). Left/Right reflects which side P1 is standing on when their team serves. Count in parentheses is the number of serving rallies.
      </p>
    </section>
  );
}
