'use client';

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

// ss=0 appears to be right side, ss=1 left side based on pb.vision convention
const SIDE_LABEL: Record<number, string> = { 0: 'Right', 1: 'Left' };

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

export function KitchenPairingsSection({ data }: Props) {
  const pairings = buildPairings(data);
  if (pairings.length === 0) return null;

  // Collect all side keys present across all pairings (should be 0 and 1)
  const allSides = [...new Set(pairings.flatMap((p) => [...p.bySide.keys()]))].sort();

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
              <th className="text-left px-5 py-3">Pairing</th>
              {allSides.map((side) => (
                <th key={side} className="text-right px-4 py-3">
                  P1 on {SIDE_LABEL[side] ?? `Side ${side}`}
                </th>
              ))}
              <th className="text-right px-5 py-3 hidden md:table-cell">Total serves</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {pairings.map((p) => (
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
                  const val = s ? pct(s) : null;
                  return (
                    <td key={side} className="px-4 py-3 text-right">
                      {val !== null ? (
                        <span className="font-semibold tabular-nums text-gray-800">{val}%</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                      {s && s.rallies > 0 && (
                        <span className="text-gray-400 text-xs ml-1">({s.rallies})</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-5 py-3 text-right text-gray-400 tabular-nums hidden md:table-cell">
                  {p.totalRallies}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">
        &ldquo;P1&rdquo; is the first player listed (alphabetical). Side 0/1 maps to pb.vision&apos;s court sides — verify with your data which is left vs right.
      </p>
    </section>
  );
}
