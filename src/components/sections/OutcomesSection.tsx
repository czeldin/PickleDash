'use client';

import { useMemo, useState } from 'react';
import { DashboardData, OutcomeStatsRow, LossReasonRow, PartnerAdjRow, PartnerWinnersRow, PlayerMeta } from '@/types/dashboard';
import { SectionCard } from '@/components/SectionCard';
import { SortableTable, ColumnDef } from '@/components/SortableTable';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { InfoTip } from '@/components/InfoTip';
import { qualifiedPids } from '@/lib/qualified';
import { categoryById, clipsFor, ClipModalController } from '@/components/filmClips';

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
  // Column leaders (among qualified players only, so a small sample can't be the
  // highlighted best). Map of column key → the leading value.
  const { pids: qPids } = qualifiedPids(rows);
  const q = rows.filter((r) => qPids.has(r.pid));
  const maxOf = (f: (o: OutcomeStatsRow) => number | null) => {
    const vals = q.map(f).filter((v): v is number => v != null);
    return vals.length ? Math.max(...vals) : null;
  };
  const leaders = {
    games: maxOf((o) => pct(o.gamesWon, o.gamesLost)),
    net: maxOf((o) => o.netPointsPerGame),
    points: maxOf((o) => pct(o.pointsWon, o.pointsLost)),
    rallies: maxOf((o) => pct(o.ralliesWon, o.ralliesLost)),
  };

  const Cell = ({ w, l, lead }: { w: number; l: number; lead: boolean }) => {
    const p = pct(w, l);
    return (
      <span className={`tabular-nums inline-flex items-center gap-1 ${lead ? 'bg-green-100 text-green-800 rounded-full px-2 py-0.5' : ''}`}>
        <span className="font-medium">{w}–{l}</span>
        <span className={`text-xs ${lead ? 'text-green-700' : 'text-gray-400'}`}>{p == null ? '' : `${p}%`}</span>
      </span>
    );
  };
  const isLead = (v: number | null, lead: number | null) => v != null && lead != null && v === lead;

  const columns: ColumnDef<OutcomeStatsRow>[] = [
    { key: 'games', header: 'Games', getValue: (o) => pct(o.gamesWon, o.gamesLost) ?? -1, render: (o) => <Cell w={o.gamesWon} l={o.gamesLost} lead={qPids.has(o.pid) && isLead(pct(o.gamesWon, o.gamesLost), leaders.games)} /> },
    {
      key: 'net', header: 'Net Pts / G', getValue: (o) => o.netPointsPerGame,
      render: (o) => {
        const lead = qPids.has(o.pid) && isLead(o.netPointsPerGame, leaders.net);
        return (
          <span className={`tabular-nums font-medium ${lead ? 'bg-green-100 text-green-800 rounded-full px-2 py-0.5' : o.netPointsPerGame >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            {o.netPointsPerGame >= 0 ? '+' : ''}{o.netPointsPerGame.toFixed(1)}
          </span>
        );
      },
    },
    { key: 'points', header: 'Points', getValue: (o) => pct(o.pointsWon, o.pointsLost) ?? -1, render: (o) => <Cell w={o.pointsWon} l={o.pointsLost} lead={qPids.has(o.pid) && isLead(pct(o.pointsWon, o.pointsLost), leaders.points)} /> },
    { key: 'rallies', header: 'Rallies', getValue: (o) => pct(o.ralliesWon, o.ralliesLost) ?? -1, render: (o) => <Cell w={o.ralliesWon} l={o.ralliesLost} lead={qPids.has(o.pid) && isLead(pct(o.ralliesWon, o.ralliesLost), leaders.rallies)} /> },
  ];

  return (
    <SectionCard title="Outcomes — Games · Points · Rallies">
      <p className="text-xs text-gray-400 -mt-1.5 mb-3">
        Three lenses on winning. A player can win <em>games</em> but lose the <em>rally</em> battle (carried by a partner),
        or vice-versa. <strong>Net Pts / G</strong> = points won − lost, per game (a points margin).
        <span className="ml-1">The <span className="bg-green-100 text-green-800 rounded-full px-1.5">green</span> value leads each column (qualified players only).</span>
      </p>
      <SortableTable rows={rows} columns={columns} players={data.players} defaultSortKey="games" />
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
      <p className="text-xs text-gray-400 -mt-1.5 mb-3">
        <strong>Approximate.</strong> <em>Expected</em> = the rally win% your partners posted overall; <em>Actual</em> = yours.
        Positive <em>lift</em> = you won more than your partners&apos; own baseline (you tended to raise them). This is a rough
        control for partner quality, not opponents — not the full adjusted model.
      </p>
      <SortableTable rows={sorted} columns={partnerCols} players={data.players} defaultSortKey="lift" />
    </SectionCard>
  );
}

// ─── Team Winners by Partner (matrix) ───────────────────────────────────────
// Answers: "my personal winners/game is lower, but if I seed my partner, does
// our TEAM hit as many winners?" — for EVERY player, not just one focal player.
// Cell [row R, col C] = R's team winners/game when paired with C, MINUS C's team
// winners/game WITHOUT R. Positive (green) = R's presence lifts a C-partnered
// team's winner output; negative (red) = it lowers it. The matrix is asymmetric
// on purpose: [R,C] is "does R lift C" and [C,R] is "does C lift R" — different
// questions. Diagonal and unplayed / thin (<MIN_GAMES) pairings are blank.
export function TeamWinnersByPartnerSection({ data }: { data: DashboardData }) {
  const rows = data.partnerWinners;
  const MIN_GAMES = 2; // ignore one-off pairings — too noisy to compare

  // Lookups: pair (r.pid,r.partnerPid) row, and each player's overall baseline.
  const { pairMap, overall, activePids } = useMemo(() => {
    const pairMap = new Map<string, PartnerWinnersRow>();
    const overall = new Map<string, { games: number; tw: number }>();
    const active = new Set<string>();
    for (const r of rows ?? []) {
      pairMap.set(`${r.pid}|${r.partnerPid}`, r);
      const a = overall.get(r.pid) ?? { games: 0, tw: 0 };
      a.games += r.games; a.tw += r.teamWinners; overall.set(r.pid, a);
      if (r.games >= MIN_GAMES) { active.add(r.pid); active.add(r.partnerPid); }
    }
    return { pairMap, overall, activePids: active };
  }, [rows]);

  if (!rows || rows.length === 0 || activePids.size === 0) return null;

  // Players that appear in at least one qualifying pairing, in dashboard order.
  const ps = data.players.filter((p) => activePids.has(p.pid));

  // delta(row lifter, col partner): row's team-wins/g WITH col, minus col's
  // team-wins/g WITHOUT row. null when they never played >=MIN_GAMES together.
  const cell = (rowPid: string, colPid: string): { delta: number; games: number } | null => {
    const pair = pairMap.get(`${rowPid}|${colPid}`);
    if (!pair || pair.games < MIN_GAMES) return null;
    const ov = overall.get(colPid) ?? { games: 0, tw: 0 };
    const otherGames = ov.games - pair.games;
    const otherTw = ov.tw - pair.teamWinners;
    if (otherGames <= 0) return null; // col only ever played with row → no baseline
    return { delta: pair.teamWinnersPerGame - otherTw / otherGames, games: pair.games };
  };

  // Green→red background by delta magnitude (cap at ±3 team winners/g).
  const bg = (d: number) => {
    const t = Math.max(-1, Math.min(1, d / 3));
    if (t >= 0) return `rgba(22, 163, 74, ${0.10 + 0.45 * t})`;   // green-600
    return `rgba(220, 38, 38, ${0.10 + 0.45 * -t})`;              // red-600
  };

  return (
    <SectionCard title="Team Winners by Partner">
      <p className="text-xs text-gray-400 -mt-1.5 mb-3">
        Each cell shows how much a <strong>row</strong> player lifts (or lowers) a <strong>column</strong> partner&apos;s team winners per game:
        the row player&apos;s clean team winners/game <em>with</em> that partner, minus the partner&apos;s team winners/game <em>without</em> them.
        <span className="text-green-700"> Green</span> = the row player&apos;s teams score more winners with that partner (a sign of setting them up
        rather than finishing yourself); <span className="text-red-600">red</span> = fewer. Read a row to see whom a player lifts. pb.vision has no
        &quot;assist&quot; label, so this is team output, not proof of a specific feed; it doesn&apos;t adjust for opponents. Pairings under {MIN_GAMES} games are blank.
      </p>
      <div className="overflow-x-auto">
        <table className="text-sm border-separate" style={{ borderSpacing: 0 }}>
          <thead>
            <tr>
              <th
                className="sticky left-0 z-10 text-left px-3 py-2 font-semibold text-white"
                style={{ backgroundColor: '#334155' }}
              >
                <span className="text-xs opacity-80">lifts ↓ · partner →</span>
              </th>
              {ps.map((p) => (
                <th key={p.pid} className="px-2 py-2 font-semibold text-white text-center" style={{ backgroundColor: '#334155' }}>
                  <span className="inline-flex flex-col items-center gap-1">
                    <PlayerAvatar player={p} size="sm" />
                    <span className="text-[11px] leading-none">{p.name}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ps.map((row) => (
              <tr key={row.pid}>
                <th
                  className="sticky left-0 z-10 text-left px-3 py-2 font-medium bg-white border-t border-gray-100"
                  style={{ color: row.color.text }}
                >
                  <span className="inline-flex items-center gap-2 whitespace-nowrap">
                    <PlayerAvatar player={row} size="sm" />
                    {row.name}
                  </span>
                </th>
                {ps.map((col) => {
                  if (col.pid === row.pid) {
                    return <td key={col.pid} className="border-t border-l border-gray-100 bg-gray-50" />;
                  }
                  const c = cell(row.pid, col.pid);
                  return (
                    <td
                      key={col.pid}
                      className="border-t border-l border-gray-100 text-center tabular-nums px-2 py-2"
                      style={c ? { backgroundColor: bg(c.delta) } : undefined}
                      title={c ? `${row.name} with ${col.name}: ${c.delta >= 0 ? '+' : ''}${c.delta.toFixed(1)} team winners/g vs ${col.name} without ${row.name} (${c.games} games)` : `${row.name} & ${col.name}: fewer than ${MIN_GAMES} games`}
                    >
                      {c ? (
                        <span className={`font-semibold ${c.delta >= 0 ? 'text-green-800' : 'text-red-800'}`}>
                          {c.delta >= 0 ? '+' : ''}{c.delta.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-gray-300">·</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

const partnerCols: ColumnDef<PartnerAdjRow>[] = [
  { key: 'actual', header: 'Actual', getValue: (r) => r.actualWinPct, render: (r) => <span className="tabular-nums text-gray-700">{r.actualWinPct.toFixed(0)}%</span> },
  { key: 'expected', header: 'Expected', getValue: (r) => r.expectedWinPct, render: (r) => <span className="tabular-nums text-gray-500">{r.expectedWinPct.toFixed(0)}%</span> },
  {
    key: 'lift', header: 'Lift', getValue: (r) => r.lift,
    render: (r) => (
      <span className={`tabular-nums font-medium ${r.lift >= 0 ? 'text-green-700' : 'text-red-600'}`}>
        {r.lift >= 0 ? '+' : ''}{r.lift.toFixed(1)}
      </span>
    ),
  },
];

type ReasonKey = keyof Omit<LossReasonRow, 'pid' | 'ralliesLost'>;
// `keys` is summed — 'into net / short' combines ownNet + ownKitchen because
// pb.vision cannot reliably separate a ball that hit the net from one that fell
// just short of it (its near-net tracking tags many net balls as "short"), so we
// stopped presenting them as distinct causes.
// `filmCat` is the Film Room category id whose clip queue matches this cause —
// clicking a player's bar opens that queue in the video modal. Causes with no
// matching queue (opponent winners, unattributed) are not clickable.
const REASONS: { keys: ReasonKey[]; label: string; tone: string; hint: string; filmCat?: string }[] = [
  { keys: ['ownNet', 'ownKitchen'], label: 'We hit into net / short', tone: 'bg-red-500', filmCat: 'net-errors', hint: 'The rally-ending shot was ours and didn’t make it over — the net stopped it, or it fell short of the net on our own side. pb.vision can’t reliably tell these apart near the net (it tags many net-cords as "short"), so they’re combined here.' },
  { keys: ['ownOut'], label: 'We hit out', tone: 'bg-orange-500', filmCat: 'out-errors', hint: 'The rally-ending shot was ours and landed out.' },
  { keys: ['popupExploited'], label: 'We popped it up', tone: 'bg-fuchsia-500', filmCat: 'popped-up', hint: 'A rally we lost where someone popped a dink/drop up and the opponents attacked it. The pop-up is treated as the root cause even if the point technically ended a shot or two later (it put us on defense). Charged to whoever popped it, not their partner. Matches Rally Impact’s "Popped up (lost)".' },
  { keys: ['oppWinner'], label: 'They hit a winner', tone: 'bg-slate-400', filmCat: 'fed-winners', hint: 'The opponents ended the rally with a clean winner or putaway — not our error. The film shows your feed right before it (the ball they attacked).' },
  // 'Unattributed' (the `other` residual) intentionally omitted — it's a
  // non-actionable "couldn't classify" bucket, not a cause worth showing.
];

/** Why We Lost — grouped by cause, one bar per player, for easy comparison. */
export function LossReasonsSection({ data, focusPid }: Props) {
  const [perGame, setPerGame] = useState(true);
  // Which (player, cause) film queue is open, if any.
  const [film, setFilm] = useState<{ pid: string; catId: string } | null>(null);
  const gameNum = useMemo(() => {
    const m = new Map<string, number>();
    data.sessions.forEach((s, i) => m.set(s.key, i + 1));
    return m;
  }, [data.sessions]);
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
  // games played per pid, for per-game normalization
  const gamesOf = new Map<string, number>((data.outcomeStats ?? []).map((o) => [o.pid, o.gamesPlayed]));
  const players = data.players.filter((p) => rows.some((r) => r.pid === p.pid && r.ralliesLost > 0));

  // value for a (player, cause), raw or per-game — sums the cause's keys.
  const val = (r: LossReasonRow, keys: ReasonKey[]) => {
    const raw = keys.reduce((sum, k) => sum + r[k], 0);
    if (!perGame) return raw;
    const g = gamesOf.get(r.pid) ?? 0;
    return g > 0 ? raw / g : 0;
  };
  const rowOf = (pid: string) => rows.find((r) => r.pid === pid)!;
  // Each cause scales to its OWN max, so a small cause (pop-ups) is still
  // readable next to a big one (net errors) — the leader fills the track. The
  // numeric labels remain for comparing magnitudes across causes.
  const maxFor = (keys: ReasonKey[]) =>
    Math.max(...players.map((p) => val(rowOf(p.pid), keys)), 0.001);
  const fmt = (v: number) => (perGame ? v.toFixed(1) : String(Math.round(v)));

  return (
    <SectionCard
      title="Why We Lost — Lost Rallies by Cause"
      action={
        <div className="flex items-center bg-gray-100 rounded-lg p-0.5 text-xs">
          <button onClick={() => setPerGame(true)} className={`px-2.5 py-1 rounded-md font-medium ${perGame ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Per game</button>
          <button onClick={() => setPerGame(false)} className={`px-2.5 py-1 rounded-md font-medium ${!perGame ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Total</button>
        </div>
      }
    >
      <p className="text-xs text-gray-400 -mt-1.5 mb-3">
        Each lost rally charged to the <strong>individual</strong> whose shot caused it — the player who hit the fault or the pop-up, not their partner.
        &ldquo;We…&rdquo; are your own errors (the fixable ones); &ldquo;They hit a winner&rdquo; is earned against you (charged to whoever fed the ball they put away).
        {perGame ? ' Shown per game played (fair across different game counts).' : ' Raw totals this selection.'} Hover a cause for its definition.
        {data.courtShots && <> Click a <strong>&ldquo;We…&rdquo;</strong> bar to watch those rallies.</>}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        {REASONS.map(({ keys, label, tone, hint, filmCat }) => {
          const cat = filmCat ? categoryById(filmCat) : undefined;
          const maxVal = maxFor(keys);
          return (
          <div key={label}>
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`w-2.5 h-2.5 rounded-sm ${tone}`} />
              <span className="text-sm font-semibold text-gray-700">{label}</span>
              <InfoTip text={hint} />
            </div>
            <div className="space-y-1">
              {[...players]
                .sort((a, b) => val(rowOf(b.pid), keys) - val(rowOf(a.pid), keys))
                .map((p) => {
                  const v = val(rowOf(p.pid), keys);
                  const w = (100 * v) / maxVal;
                  const isFocus = p.pid === focusPid;
                  const nClips = cat ? clipsFor(data.courtShots, p.pid, cat).length : 0;
                  const clickable = !!cat && nClips > 0;
                  const bar = (
                    <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden relative group">
                      <div className={`h-full ${tone} ${isFocus ? '' : 'opacity-80'}`} style={{ width: `${Math.max(w, v > 0 ? 2 : 0)}%` }} />
                      {clickable && (
                        <span className="absolute inset-0 hidden group-hover:flex items-center justify-center text-[10px] font-semibold text-white bg-black/45 rounded">
                          ▶ View Film ({nClips})
                        </span>
                      )}
                    </div>
                  );
                  return (
                    <div key={p.pid} className="flex items-center gap-2">
                      <span className={`w-16 text-xs shrink-0 text-right ${isFocus ? 'font-semibold text-blue-700' : 'text-gray-500'}`}>{p.name}</span>
                      {clickable ? (
                        <button
                          type="button"
                          onClick={() => setFilm({ pid: p.pid, catId: filmCat! })}
                          className="flex-1 cursor-pointer"
                          aria-label={`Watch ${p.name}'s ${label} rallies`}
                        >
                          {bar}
                        </button>
                      ) : bar}
                      <span className={`w-9 text-xs tabular-nums shrink-0 ${isFocus ? 'font-semibold text-gray-800' : 'text-gray-500'}`}>{fmt(v)}</span>
                    </div>
                  );
                })}
            </div>
          </div>
          );
        })}
      </div>

      {film && (() => {
        const cat = categoryById(film.catId);
        if (!cat) return null;
        const clips = clipsFor(data.courtShots, film.pid, cat);
        if (clips.length === 0) return null;
        const name = data.players.find((p) => p.pid === film.pid)?.name ?? 'Player';
        return (
          <ClipModalController
            clips={clips}
            topic={`${name}: ${cat.label}`}
            gameNum={gameNum}
            startIndex={0}
            wholeRally={cat.wholeRally}
            onClose={() => setFilm(null)}
          />
        );
      })()}
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
      <p className="text-xs text-gray-400 -mt-1.5 mb-3">Highest pb.vision overall rating in each game this selection.</p>
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

