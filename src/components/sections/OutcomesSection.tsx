'use client';

import { useState } from 'react';
import { DashboardData, OutcomeStatsRow, LossReasonRow, PartnerAdjRow, PlayerMeta } from '@/types/dashboard';
import { SectionCard } from '@/components/SectionCard';
import { SortableTable, ColumnDef } from '@/components/SortableTable';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { InfoTip } from '@/components/InfoTip';
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
const REASONS: { keys: ReasonKey[]; label: string; tone: string; hint: string }[] = [
  { keys: ['ownNet', 'ownKitchen'], label: 'We hit into net / short', tone: 'bg-red-500', hint: 'The rally-ending shot was ours and didn’t make it over — the net stopped it, or it fell short of the net on our own side. pb.vision can’t reliably tell these apart near the net (it tags many net-cords as "short"), so they’re combined here.' },
  { keys: ['ownOut'], label: 'We hit out', tone: 'bg-orange-500', hint: 'The rally-ending shot was ours and landed out.' },
  { keys: ['popupExploited'], label: 'We popped it up', tone: 'bg-fuchsia-500', hint: 'A dink/drop of ours popped up and the opponents attacked it out of the air.' },
  { keys: ['oppWinner'], label: 'They hit a winner', tone: 'bg-slate-400', hint: 'The opponents ended the rally with a clean winner or putaway — not our error.' },
  { keys: ['other'], label: 'Unattributed', tone: 'bg-gray-300', hint: 'The rally ended but the final shot could not be classified from the data (no fault or winner tag).' },
];

/** Why We Lost — grouped by cause, one bar per player, for easy comparison. */
export function LossReasonsSection({ data, focusPid }: Props) {
  const [perGame, setPerGame] = useState(true);
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
  // max across everything for a shared x-scale
  const maxVal = Math.max(
    ...players.flatMap((p) => REASONS.map(({ keys }) => val(rowOf(p.pid), keys))),
    0.001,
  );
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
        Every lost rally charged to the cause of its final shot — a <strong>team</strong> stat, so both partners share each loss.
        &ldquo;We…&rdquo; are your side&apos;s own errors (the fixable ones); &ldquo;They hit a winner&rdquo; is earned against you.
        {perGame ? ' Shown per game played (fair across different game counts).' : ' Raw totals this selection.'} Hover a cause for its definition.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        {REASONS.map(({ keys, label, tone, hint }) => (
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
                  return (
                    <div key={p.pid} className="flex items-center gap-2">
                      <span className={`w-16 text-xs shrink-0 text-right ${isFocus ? 'font-semibold text-blue-700' : 'text-gray-500'}`}>{p.name}</span>
                      <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                        <div className={`h-full ${tone} ${isFocus ? '' : 'opacity-80'}`} style={{ width: `${Math.max(w, v > 0 ? 2 : 0)}%` }} />
                      </div>
                      <span className={`w-9 text-xs tabular-nums shrink-0 ${isFocus ? 'font-semibold text-gray-800' : 'text-gray-500'}`}>{fmt(v)}</span>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
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

