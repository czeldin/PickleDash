'use client';

import { DashboardData, OutcomeStatsRow, LossReasonRow, PlayerMeta } from '@/types/dashboard';
import { SectionCard } from '@/components/SectionCard';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { qualifiedPids } from '@/lib/qualified';

interface Props {
  data: DashboardData;
  focusPid: string | null;
}

const pct = (w: number, l: number) => (w + l > 0 ? Math.round((100 * w) / (w + l)) : null);

function playerById(players: PlayerMeta[], pid: string) {
  return players.find((p) => p.pid === pid);
}

/** Games / Points / Rallies — three win-rate lenses side by side. */
export function OutcomesSection({ data }: Props) {
  const rows = data.outcomeStats;
  if (!rows || rows.length === 0) {
    return (
      <SectionCard title="Outcomes — Games · Points · Rallies">
        <p className="text-sm text-gray-400 py-6 text-center">
          Needs pb.vision augmented insights (per-rally scoring). Available on newer nights.
        </p>
      </SectionCard>
    );
  }
  const sorted = [...rows].sort((a, b) => (pct(b.gamesWon, b.gamesLost) ?? -1) - (pct(a.gamesWon, a.gamesLost) ?? -1));

  const Cell = ({ w, l }: { w: number; l: number }) => {
    const p = pct(w, l);
    return (
      <span className="tabular-nums">
        <span className="text-gray-800 font-medium">{w}–{l}</span>
        <span className="text-gray-400 text-xs ml-1">{p == null ? '' : `${p}%`}</span>
      </span>
    );
  };

  return (
    <SectionCard title="Outcomes — Games · Points · Rallies">
      <p className="text-xs text-gray-400 -mt-2 mb-3">
        Three lenses on winning. A player can win <em>games</em> but lose the <em>rally</em> battle (carried by a partner),
        or vice-versa. <strong>Net/g</strong> = points won − lost, per game.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b border-gray-200">
              <th className="py-2 pr-2">Player</th>
              <th className="py-2 px-2">Games</th>
              <th className="py-2 px-2">Points</th>
              <th className="py-2 px-2">Rallies</th>
              <th className="py-2 px-2">Net/g</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((o) => {
              const p = playerById(data.players, o.pid);
              if (!p) return null;
              return (
                <tr key={o.pid} className="border-b border-gray-100">
                  <td className="py-2 pr-2">
                    <span className="inline-flex items-center gap-1.5"><PlayerAvatar player={p} size="sm" /> {p.name}</span>
                  </td>
                  <td className="py-2 px-2"><Cell w={o.gamesWon} l={o.gamesLost} /></td>
                  <td className="py-2 px-2"><Cell w={o.pointsWon} l={o.pointsLost} /></td>
                  <td className="py-2 px-2"><Cell w={o.ralliesWon} l={o.ralliesLost} /></td>
                  <td className={`py-2 px-2 tabular-nums font-medium ${o.netPointsPerGame >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {o.netPointsPerGame >= 0 ? '+' : ''}{o.netPointsPerGame.toFixed(1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

/** Lightweight partner-adjusted rally win% — actual vs partners' baseline. */
export function PartnerAdjSection({ data }: Props) {
  const rows = data.partnerAdj;
  if (!rows || rows.length === 0) return null;
  const sorted = [...rows].filter((r) => r.rallies > 0).sort((a, b) => b.lift - a.lift);
  if (sorted.length === 0) return null;

  return (
    <SectionCard title="Partner-Adjusted Rally Win %">
      <p className="text-xs text-gray-400 -mt-2 mb-3">
        <strong>Approximate.</strong> <em>Expected</em> = the rally win% your partners posted overall; <em>Actual</em> = yours.
        Positive <em>lift</em> = you won more than your partners&apos; own baseline (you tended to raise them). This is a rough
        control for partner quality, not opponents — not the full adjusted model.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b border-gray-200">
              <th className="py-2 pr-2">Player</th>
              <th className="py-2 px-2">Actual</th>
              <th className="py-2 px-2">Expected</th>
              <th className="py-2 px-2">Lift</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const p = playerById(data.players, r.pid);
              if (!p) return null;
              return (
                <tr key={r.pid} className="border-b border-gray-100">
                  <td className="py-2 pr-2">
                    <span className="inline-flex items-center gap-1.5"><PlayerAvatar player={p} size="sm" /> {p.name}</span>
                  </td>
                  <td className="py-2 px-2 tabular-nums text-gray-700">{r.actualWinPct.toFixed(0)}%</td>
                  <td className="py-2 px-2 tabular-nums text-gray-500">{r.expectedWinPct.toFixed(0)}%</td>
                  <td className={`py-2 px-2 tabular-nums font-medium ${r.lift >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {r.lift >= 0 ? '+' : ''}{r.lift.toFixed(1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

const REASONS: { key: keyof Omit<LossReasonRow, 'pid' | 'ralliesLost'>; label: string; tone: string }[] = [
  { key: 'ownNet', label: 'Into net', tone: 'bg-red-500' },
  { key: 'ownOut', label: 'Hit out', tone: 'bg-orange-500' },
  { key: 'ownKitchen', label: 'Kitchen/short', tone: 'bg-amber-500' },
  { key: 'ownUnforced', label: 'Unforced', tone: 'bg-rose-400' },
  { key: 'popupExploited', label: 'Popped up → put away', tone: 'bg-fuchsia-500' },
  { key: 'oppWinner', label: 'Opponent winner', tone: 'bg-slate-400' },
  { key: 'other', label: 'Unattributed', tone: 'bg-gray-300' },
];

/** Why We Lost — attribution of lost rallies to causes, per player. */
export function LossReasonsSection({ data, focusPid }: Props) {
  const rows = data.lossReasons;
  if (!rows || rows.length === 0) {
    return (
      <SectionCard title="Why We Lost — Lost Rallies by Cause">
        <p className="text-sm text-gray-400 py-6 text-center">
          Needs pb.vision augmented insights (rally-ending shot detail). Available on newer nights.
        </p>
      </SectionCard>
    );
  }
  // Focus player first, then the rest by rallies lost.
  const sorted = [...rows].sort((a, b) => {
    if (a.pid === focusPid) return -1;
    if (b.pid === focusPid) return 1;
    return b.ralliesLost - a.ralliesLost;
  });

  return (
    <SectionCard title="Why We Lost — Lost Rallies by Cause">
      <p className="text-xs text-gray-400 -mt-2 mb-3">
        Each rally your team lost, charged to the cause of the final shot. Own errors are the fixable ones;
        opponent winners are earned against you. Bars are proportional within each player.
      </p>
      <div className="space-y-3">
        {sorted.map((r) => {
          const p = playerById(data.players, r.pid);
          if (!p || r.ralliesLost === 0) return null;
          const isFocus = r.pid === focusPid;
          return (
            <div key={r.pid} className={`rounded-lg p-3 ${isFocus ? 'bg-blue-50 ring-1 ring-blue-200' : 'bg-gray-50'}`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-800">
                  <PlayerAvatar player={p} size="sm" /> {p.name}
                </span>
                <span className="text-xs text-gray-400">{r.ralliesLost} rallies lost</span>
              </div>
              <div className="flex h-4 rounded overflow-hidden">
                {REASONS.map(({ key, label, tone }) => {
                  const v = r[key];
                  if (!v) return null;
                  const w = (100 * v) / r.ralliesLost;
                  return <div key={key} className={tone} style={{ width: `${w}%` }} title={`${label}: ${v} (${Math.round(w)}%)`} />;
                })}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                {REASONS.map(({ key, label, tone }) => {
                  const v = r[key];
                  if (!v) return null;
                  return (
                    <span key={key} className="inline-flex items-center gap-1 text-xs text-gray-500">
                      <span className={`w-2 h-2 rounded-sm ${tone}`} /> {label} {v}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

/** Top Performer by Game — the highest pb.vision overall rating in each game. */
export function TopPerformerByGameSection({ data }: Props) {
  const rows = data.skillRatingsByGame;
  if (!rows || rows.length === 0) return null;
  // Group by session, pick the max-overall player per session.
  const bySession = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!bySession.has(r.sessionKey)) bySession.set(r.sessionKey, []);
    bySession.get(r.sessionKey)!.push(r);
  }
  const mvps = [...bySession.values()]
    .map((rs) => rs.reduce((best, r) => (r.overall > best.overall ? r : best), rs[0]))
    .filter((r) => r.overall > 0)
    .sort((a, b) => a.timestamp - b.timestamp || a.sessionKey.localeCompare(b.sessionKey));
  if (mvps.length === 0) return null;

  return (
    <SectionCard title="Top Performer by Game">
      <p className="text-xs text-gray-400 -mt-2 mb-3">Highest pb.vision overall rating in each game this selection.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {mvps.map((r, i) => {
          const p = playerById(data.players, r.pid);
          if (!p) return null;
          return (
            <div key={r.sessionKey + i} className="rounded-lg bg-gray-50 p-2.5">
              <p className="text-xs text-gray-400 truncate mb-1" title={r.sessionName}>{r.sessionName}</p>
              <div className="flex items-center gap-1.5">
                <PlayerAvatar player={p} size="sm" />
                <span className="text-sm font-medium text-gray-800 truncate">{p.name}</span>
                <span className="text-xs text-gray-500 ml-auto tabular-nums">{r.overall.toFixed(2)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

/** Small leaderboard strip: category leaders among QUALIFIED players. */
export function LeaderboardSection({ data }: Props) {
  const rows = data.outcomeStats;
  if (!rows || rows.length === 0) return null;
  const { threshold, pids } = qualifiedPids(rows);
  const q = rows.filter((r) => pids.has(r.pid));
  if (q.length === 0) return null;

  const leader = (
    metric: (o: OutcomeStatsRow) => number | null,
  ): { p: PlayerMeta; v: number } | null => {
    let best: { p: PlayerMeta; v: number } | null = null;
    for (const o of q) {
      const v = metric(o);
      if (v == null) continue;
      const p = playerById(data.players, o.pid);
      if (!p) continue;
      if (!best || v > best.v) best = { p, v };
    }
    return best;
  };

  const cats: { label: string; get: () => { p: PlayerMeta; v: number } | null; fmt: (v: number) => string }[] = [
    { label: 'Game win %', get: () => leader((o) => pct(o.gamesWon, o.gamesLost)), fmt: (v) => `${v}%` },
    { label: 'Point win %', get: () => leader((o) => pct(o.pointsWon, o.pointsLost)), fmt: (v) => `${v}%` },
    { label: 'Rally win %', get: () => leader((o) => pct(o.ralliesWon, o.ralliesLost)), fmt: (v) => `${v}%` },
    { label: 'Net pts/game', get: () => leader((o) => o.netPointsPerGame), fmt: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}` },
  ];

  return (
    <SectionCard title="Leaderboard">
      <p className="text-xs text-gray-400 -mt-2 mb-3">
        Category leaders among qualified players (≥ {threshold} game{threshold === 1 ? '' : 's'} this selection), so small samples don&apos;t top a list.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cats.map(({ label, get, fmt }) => {
          const res = get();
          return (
            <div key={label} className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs text-gray-400 mb-1">{label}</p>
              {res ? (
                <div className="flex items-center gap-1.5">
                  <PlayerAvatar player={res.p} size="sm" />
                  <span className="text-sm font-semibold text-gray-800">{res.p.name}</span>
                  <span className="text-sm text-gray-500 ml-auto tabular-nums">{fmt(res.v)}</span>
                </div>
              ) : <p className="text-sm text-gray-300">—</p>}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
