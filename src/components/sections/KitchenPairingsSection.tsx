'use client';

import { DashboardData, KitchenByGameRow, PlayerMeta } from '@/types/dashboard';

interface Props {
  data: DashboardData;
}

interface PairingStats {
  p1: PlayerMeta;
  p2: PlayerMeta;
  games: number;
  ralliesTotal: number;
  ralliesKitchen: number;
}

function buildPairings(data: DashboardData): PairingStats[] {
  const { players, kitchenByGame } = data;
  const playerMap = new Map(players.map((p) => [p.pid, p]));

  // Group by session
  const bySession = new Map<string, KitchenByGameRow[]>();
  for (const row of kitchenByGame) {
    if (!bySession.has(row.sessionKey)) bySession.set(row.sessionKey, []);
    bySession.get(row.sessionKey)!.push(row);
  }

  const pairingMap = new Map<string, {
    pids: [string, string];
    games: number;
    ralliesTotal: number;
    ralliesKitchen: number;
  }>();

  for (const rows of bySession.values()) {
    const teams = new Map<number, KitchenByGameRow[]>();
    for (const row of rows) {
      if (!teams.has(row.team)) teams.set(row.team, []);
      teams.get(row.team)!.push(row);
    }
    for (const teamRows of teams.values()) {
      if (teamRows.length !== 2) continue;
      const sorted = [...teamRows].sort((x, y) => x.pid.localeCompare(y.pid));
      const p1 = sorted[0], p2 = sorted[1];
      const key = `${p1.pid}|${p2.pid}`;
      if (!pairingMap.has(key)) {
        pairingMap.set(key, { pids: [p1.pid, p2.pid], games: 0, ralliesTotal: 0, ralliesKitchen: 0 });
      }
      const p = pairingMap.get(key)!;
      p.games++;
      // Both players share the same team rally stats — use p1's
      p.ralliesTotal += p1.teamRalliesTotal;
      p.ralliesKitchen += p1.teamRalliesKitchen;
    }
  }

  return [...pairingMap.values()]
    .filter((p) => playerMap.has(p.pids[0]) && playerMap.has(p.pids[1]) && p.ralliesTotal > 0)
    .sort((a, b) => (b.ralliesKitchen / b.ralliesTotal) - (a.ralliesKitchen / a.ralliesTotal))
    .map((p) => ({
      p1: playerMap.get(p.pids[0])!,
      p2: playerMap.get(p.pids[1])!,
      games: p.games,
      ralliesTotal: p.ralliesTotal,
      ralliesKitchen: p.ralliesKitchen,
    }));
}

export function KitchenPairingsSection({ data }: Props) {
  const pairings = buildPairings(data);
  if (pairings.length === 0) return null;

  const pcts = pairings.map((p) => p.ralliesKitchen / p.ralliesTotal);
  const maxPct = Math.max(...pcts);
  const minPct = Math.min(...pcts);

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-gray-800 border-b border-gray-200 pb-2">
        Kitchen Arrival by Pairing
      </h2>
      <p className="text-sm text-gray-500 -mt-1">
        % of serving rallies where the team reached the kitchen, for each partner combination.
      </p>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 font-medium">
              <th className="text-left px-5 py-3">Pairing</th>
              <th className="text-right px-5 py-3">Kitchen %</th>
              <th className="text-right px-5 py-3 hidden md:table-cell">Rallies</th>
              <th className="text-right px-5 py-3 hidden md:table-cell">Games</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {pairings.map((p) => {
              const pct = p.ralliesKitchen / p.ralliesTotal;
              const pctDisplay = Math.round(pct * 100);
              const isTop = pct === maxPct && maxPct > minPct;
              const isBot = pct === minPct && maxPct > minPct;
              return (
                <tr key={`${p.p1.pid}|${p.p2.pid}`} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
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
                  <td className="px-5 py-3 text-right">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-sm font-semibold tabular-nums ${
                      isTop ? 'bg-emerald-100 text-emerald-700' :
                      isBot ? 'bg-red-100 text-red-600' :
                      'text-gray-700'
                    }`}>
                      {pctDisplay}%
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right text-gray-400 tabular-nums hidden md:table-cell">
                    {p.ralliesKitchen}/{p.ralliesTotal}
                  </td>
                  <td className="px-5 py-3 text-right text-gray-400 tabular-nums hidden md:table-cell">
                    {p.games}g
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
