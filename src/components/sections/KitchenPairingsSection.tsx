'use client';

import { DashboardData, KitchenByGameRow, PlayerMeta } from '@/types/dashboard';

interface Props {
  data: DashboardData;
}

interface PairingStats {
  p1: PlayerMeta;
  p2: PlayerMeta;
  games: number;
  p1Hits: number; p1Total: number;
  p2Hits: number; p2Total: number;
}

function buildPairings(data: DashboardData): PairingStats[] {
  const { players, kitchenByGame } = data;
  const playerMap = new Map(players.map((p) => [p.pid, p]));

  const bySession = new Map<string, KitchenByGameRow[]>();
  for (const row of kitchenByGame) {
    if (!bySession.has(row.sessionKey)) bySession.set(row.sessionKey, []);
    bySession.get(row.sessionKey)!.push(row);
  }

  const pairingMap = new Map<string, {
    pids: [string, string];
    games: number;
    stats: Record<string, { hits: number; total: number }>;
  }>();

  for (const rows of bySession.values()) {
    const teams = new Map<number, KitchenByGameRow[]>();
    for (const row of rows) {
      if (!teams.has(row.team)) teams.set(row.team, []);
      teams.get(row.team)!.push(row);
    }
    for (const teamRows of teams.values()) {
      if (teamRows.length !== 2) continue;
      const [a, b] = [...teamRows].sort((x, y) => x.pid.localeCompare(y.pid));
      const key = `${a.pid}|${b.pid}`;
      if (!pairingMap.has(key)) {
        pairingMap.set(key, {
          pids: [a.pid, b.pid],
          games: 0,
          stats: { [a.pid]: { hits: 0, total: 0 }, [b.pid]: { hits: 0, total: 0 } },
        });
      }
      const p = pairingMap.get(key)!;
      p.games++;
      for (const row of teamRows) {
        const s = p.stats[row.pid];
        if (s) { s.hits += row.k3dHits + row.k5dHits; s.total += row.k3dTotal + row.k5dTotal; }
      }
    }
  }

  return [...pairingMap.values()]
    .filter((p) => playerMap.has(p.pids[0]) && playerMap.has(p.pids[1]))
    .sort((a, b) => b.games - a.games)
    .map((p) => ({
      p1: playerMap.get(p.pids[0])!,
      p2: playerMap.get(p.pids[1])!,
      games: p.games,
      p1Hits: p.stats[p.pids[0]].hits,
      p1Total: p.stats[p.pids[0]].total,
      p2Hits: p.stats[p.pids[1]].hits,
      p2Total: p.stats[p.pids[1]].total,
    }));
}

function pct(hits: number, total: number) {
  return total > 0 ? Math.round((hits / total) * 100) : null;
}

function PlayerBar({ player, hits, total }: { player: PlayerMeta; hits: number; total: number }) {
  const val = pct(hits, total);
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-bold flex-shrink-0"
            style={{ backgroundColor: player.color.bg, color: player.color.text }}
          >{player.initials}</span>
          <span className="text-xs font-medium text-gray-700">{player.name}</span>
        </div>
        <span className="text-xs tabular-nums font-semibold" style={{ color: val !== null ? player.color.text : undefined }}>
          {val !== null ? `${val}%` : '—'}
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        {val !== null && (
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${val}%`, backgroundColor: player.color.text }}
          />
        )}
      </div>
      {total > 0 && (
        <p className="text-[10px] text-gray-400 mt-0.5">{hits}/{total} drops</p>
      )}
    </div>
  );
}

export function KitchenPairingsSection({ data }: Props) {
  const pairings = buildPairings(data);
  if (pairings.length === 0) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-gray-800 border-b border-gray-200 pb-2">
        Getting to Kitchen by Pairing
      </h2>
      <p className="text-sm text-gray-500 -mt-1">
        Each player&apos;s drop → kitchen arrival rate in games they played as partners (3rd + 5th shot drops combined).
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {pairings.map((p) => (
          <div key={`${p.p1.pid}|${p.p2.pid}`} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold"
                  style={{ backgroundColor: p.p1.color.bg, color: p.p1.color.text }}
                >{p.p1.initials}</span>
                <span className="text-xs font-semibold text-gray-500">+</span>
                <span
                  className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold"
                  style={{ backgroundColor: p.p2.color.bg, color: p.p2.color.text }}
                >{p.p2.initials}</span>
              </div>
              <span className="text-[10px] text-gray-400">{p.games} game{p.games !== 1 ? 's' : ''} together</span>
            </div>
            <div className="flex gap-4">
              <PlayerBar player={p.p1} hits={p.p1Hits} total={p.p1Total} />
              <PlayerBar player={p.p2} hits={p.p2Hits} total={p.p2Total} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
