'use client';

import { useMemo, useState } from 'react';
import { DashboardData, PlayerMeta, RallyImpactRow, TargetingRow, KitchenSRRow, NightTrendRow } from '@/types/dashboard';
import { SectionCard } from '@/components/SectionCard';
import { SortableTable, ColumnDef } from '@/components/SortableTable';
import { TrendButton, MetricDef } from '@/components/TrendChart';
import { categoryById, clipsFor, ClipModalController } from '@/components/filmClips';
import { cbText, cbDeltaText } from '@/lib/cbColors';

interface Props { data: DashboardData; }

const g = (v: number, r: NightTrendRow) => (r.gamesPlayed > 0 ? v / r.gamesPlayed : null);
const rt = (n: number, d: number) => (d > 0 ? (100 * n) / d : null);

const RALLY_METRICS: MetricDef<NightTrendRow>[] = [
  { key: 'net', label: 'Net/g', value: (r) => g(r.riWon - r.riLost - r.riSetup, r), pct: false },
  { key: 'winners', label: 'Winners/g', value: (r) => g(r.riWon, r), pct: false },
  { key: 'lost', label: 'Lost/g', value: (r) => g(r.riLost, r), pct: false },
  { key: 'setup', label: 'Popped up (lost)/g', value: (r) => g(r.riSetup, r), pct: false },
];
const TARGETING_METRICS: MetricDef<NightTrendRow>[] = [
  { key: 'attacks', label: 'Attacks/g', value: (r) => g(r.attacks, r), pct: false },
  { key: 'winners', label: 'Winners/g', value: (r) => g(r.finClean, r), pct: false },
  { key: 'finish', label: 'Finish win %', value: (r) => rt(r.finClean, r.finAtt), pct: true },
  { key: 'pop', label: 'Pop-ups/g', value: (r) => g(r.pop, r), pct: false },
  { key: 'got', label: 'Got attacked/g', value: (r) => g(r.gotAttacked, r), pct: false },
];
const KITCHEN_SR_METRICS: MetricDef<NightTrendRow>[] = [
  { key: 'serve', label: 'Serving %', value: (r) => rt(r.kServeNum, r.kServeDen), pct: true },
  { key: 'recv', label: 'Receiving %', value: (r) => rt(r.kRecvNum, r.kRecvDen), pct: true },
];

const pct = (n: number, d: number) => (d > 0 ? Math.round((100 * n) / d) : null);
const per = (n: number, g: number) => (g > 0 ? n / g : 0);
const num = (v: number, d = 1) => <span className="tabular-nums text-gray-800">{v.toFixed(d)}</span>;

function pmap(players: PlayerMeta[]) { return new Map(players.map((p) => [p.pid, p])); }
function withPlayer<T extends { pid: string }>(rows: T[], pm: Map<string, PlayerMeta>): T[] {
  return rows.filter((r) => pm.has(r.pid));
}

// ─── Areas for Improvement (pb.vision coaching flags) — card grid, not a table ──

const KIND_LABELS: Record<string, string> = {
  kitchen_arrival_percentage_on_serve: 'Kitchen arrival on serve',
  legal_third_shot_percentage: 'Legal 3rd shot',
  dink_consistency: 'Dink consistency',
  rallies_won_with_speedups: 'Rallies won w/ speed-ups',
  drop_shot_consistency: 'Drop-shot consistency',
  return_quality: 'Return quality',
  rallies_won_with_resets: 'Rallies won w/ resets',
  serve_quality: 'Serve quality',
  third_shot_quality: '3rd-shot quality',
  legal_serve_percentage: 'Legal serve %',
};
const label = (k: string) => KIND_LABELS[k] ?? k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function Avatar({ p }: { p: PlayerMeta }) {
  return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-bold flex-shrink-0"
      style={{ backgroundColor: p.color.bg, color: p.color.text }}>{p.initials}</span>
  );
}

export function CoachingSection({ data }: Props) {
  const { coaching, players } = data;
  const pm = pmap(players);
  if (coaching.filter((c) => c.items.length > 0).length === 0) return null;

  return (
    <SectionCard title="Areas for Improvement">
      <p className="text-sm text-gray-500 -mt-1.5 mb-3">
        pb.vision&apos;s own coaching flags — each player&apos;s lowest-scoring metrics (higher relevance = bigger opportunity).
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {players.map((p) => {
          const c = coaching.find((x) => x.pid === p.pid);
          if (!c || c.items.length === 0) return null;
          return (
            <div key={p.pid} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <Avatar p={pm.get(p.pid)!} />
                <span className="font-semibold text-gray-800">{p.name}</span>
              </div>
              <div className="space-y-2">
                {c.items.slice(0, 4).map((it) => {
                  const v = Math.round(it.value * 100);
                  const color = v < 55 ? 'text-orange-700' : v < 75 ? 'text-amber-600' : 'text-gray-700';
                  return (
                    <div key={it.kind} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 text-gray-600">{label(it.kind)}</span>
                      <span className={`font-semibold tabular-nums ${color}`}>{v}%</span>
                      <span className="w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden" title={`relevance ${it.relevance.toFixed(2)}`}>
                        <span className="block h-full bg-gray-400" style={{ width: `${Math.min(100, it.relevance * 100)}%` }} />
                      </span>
                    </div>
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

// ─── Rally Impact ──────────────────────────────────────────────────────────────

export function RallyImpactSection({ data }: Props) {
  const { rallyImpact, players } = data;
  const pm = pmap(players);
  const rows = withPlayer(rallyImpact, pm).filter((r) => r.games > 0);

  // Film modal state: which (player, film category) is open.
  const [film, setFilm] = useState<{ pid: string; catId: string } | null>(null);
  const gameNum = useMemo(() => {
    const m = new Map<string, number>();
    data.sessions.forEach((s, i) => m.set(s.key, i + 1));
    return m;
  }, [data.sessions]);

  // How many of each player's counted winners are pb.vision-suspect (mis-scored
  // soft dinks). Informational: the number is unchanged, but we badge the cell
  // so you know some of these winners need a look. (Kept above the early return
  // so hooks run unconditionally.)
  const suspectWinners = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of data.courtShots ?? []) {
      if (s.riWinner && s.suspectWinner) m.set(s.pid, (m.get(s.pid) ?? 0) + 1);
    }
    return m;
  }, [data.courtShots]);

  if (rows.length === 0) return null;

  // A value cell that opens its matching film queue (if any clips exist).
  // `suspect` (winners column only) badges the cell when some winners may be
  // mis-scored by pb.vision.
  const filmCell = (pid: string, catId: string, value: number, cls: string, suspect = 0) => {
    const cat = categoryById(catId);
    const n = cat ? clipsFor(data.courtShots, pid, cat).length : 0;
    const label = value.toFixed(1);
    const warn = suspect > 0
      ? <span className="text-[10px] text-amber-500" title={`${suspect} of these winners may be mis-scored by pb.vision — click to verify`}>⚠</span>
      : null;
    if (!cat || n === 0 || !data.courtShots) return <span className={`tabular-nums ${cls} inline-flex items-center gap-1`}>{label}{warn}</span>;
    return (
      <button
        type="button"
        onClick={() => setFilm({ pid, catId })}
        className={`tabular-nums ${cls} inline-flex items-center gap-1 hover:underline decoration-dotted group`}
        title={`Watch ${n} clip${n === 1 ? '' : 's'}${suspect > 0 ? ` · ${suspect} may be mis-scored` : ''}`}
      >
        {label}
        {warn}
        <span className="text-[10px] text-gray-400 group-hover:text-blue-500">▶</span>
      </button>
    );
  };

  const columns: ColumnDef<RallyImpactRow>[] = [
    { key: 'won', header: 'Winners/g', getValue: (r) => per(r.won, r.games), render: (r) => filmCell(r.pid, 'ri-winners', per(r.won, r.games), 'font-semibold text-blue-700', suspectWinners.get(r.pid) ?? 0) },
    { key: 'lost', header: 'Lost/g', getValue: (r) => per(r.lostDirect, r.games), render: (r) => filmCell(r.pid, 'ri-lost', per(r.lostDirect, r.games), 'text-gray-700') },
    { key: 'setup', header: 'Popped up (lost)/g', getValue: (r) => per(r.setup, r.games), render: (r) => filmCell(r.pid, 'ri-popped', per(r.setup, r.games), 'text-gray-700') },
    {
      key: 'net', header: 'Net/g',
      getValue: (r) => per(r.won - r.lostDirect - r.setup, r.games),
      render: (r) => { const n = per(r.won - r.lostDirect - r.setup, r.games); return <span className={`tabular-nums font-bold ${cbDeltaText(n)}`}>{n >= 0 ? '▲ +' : '▼ '}{n.toFixed(1)}</span>; },
    },
  ];

  return (
    <SectionCard title="Rally Impact — Winners vs Points Given Away" action={<TrendButton title="Rally Impact" metrics={RALLY_METRICS} rows={data.nightTrends} players={data.players} />}>
      <p className="text-sm text-gray-500 -mt-1.5 mb-3">
        Per game: clean winners you hit, vs points you gave away. <strong className="text-gray-600">Lost</strong> = your own rally-ending errors (net/out/short). <strong className="text-gray-600">Popped up (lost)</strong> = your pop-ups the opponent put away to end the rally — a different set of lost points from Lost, not double-counted. Net = winners − both.
        {data.courtShots && <> Click a value with a <span className="text-blue-500">▶</span> to watch those points. A <span className="text-amber-500">⚠</span> means some of those winners may be mis-scored by pb.vision (a soft dink tagged a put-away when the opponent likely erred) — worth verifying.</>}
      </p>
      <SortableTable rows={rows} columns={columns} players={players} defaultSortKey="net" />

      {film && (() => {
        const cat = categoryById(film.catId);
        if (!cat) return null;
        const clips = clipsFor(data.courtShots, film.pid, cat);
        if (clips.length === 0) return null;
        const name = players.find((p) => p.pid === film.pid)?.name ?? 'Player';
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

// ─── Targeting ─────────────────────────────────────────────────────────────────

export function TargetingSection({ data }: Props) {
  const { targeting, players } = data;
  const pm = pmap(players);
  const rows = withPlayer(targeting, pm).filter((r) => r.games > 0);
  if (rows.length === 0) return null;

  const columns: ColumnDef<TargetingRow>[] = [
    { key: 'attacks', header: 'Attacks/g', getValue: (r) => per(r.attacks, r.games), render: (r) => <span className="tabular-nums font-semibold text-gray-800">{per(r.attacks, r.games).toFixed(1)}</span> },
    { key: 'clean', header: 'Winners/g', getValue: (r) => per(r.clean, r.games), render: (r) => <span className="tabular-nums text-blue-700">{per(r.clean, r.games).toFixed(1)}</span> },
    {
      key: 'convert', header: 'Finish win %', getValue: (r) => pct(r.clean, r.fin) ?? -1,
      render: (r) => { const v = pct(r.clean, r.fin); if (v === null) return <span className="text-gray-300">—</span>; const c = v >= 42 ? cbText('good') : v >= 37 ? cbText('neutral') : cbText('bad'); return <span className={`tabular-nums font-semibold ${c}`}>{v}%</span>; },
    },
    { key: 'pop', header: 'Pop-ups/g', getValue: (r) => per(r.pop, r.games), render: (r) => num(per(r.pop, r.games)) },
    { key: 'gotAttacked', header: 'Got attacked/g', getValue: (r) => per(r.gotAttacked, r.games), render: (r) => <span className="tabular-nums text-amber-700">{per(r.gotAttacked, r.games).toFixed(1)}</span> },
  ];

  return (
    <SectionCard title="Targeting — Who Attacks, Who Gets Picked On" action={<TrendButton title="Targeting" metrics={TARGETING_METRICS} rows={data.nightTrends} players={data.players} />}>
      <p className="text-sm text-gray-500 -mt-1.5 mb-3">
        Per game. <strong className="text-gray-600">Attacks</strong> = how much you go on offense; <strong className="text-blue-700">Winners</strong> = clean put-aways; <strong className="text-gray-600">Finish win %</strong> = of your put-away attempts, how many you convert (skill, not volume). <strong className="text-gray-600">Pop-ups / Got attacked</strong> = how often you give the opponent a ball to put away.
      </p>
      <SortableTable rows={rows} columns={columns} players={players} defaultSortKey="attacks" />
    </SectionCard>
  );
}

// ─── Kitchen arrival: serving vs receiving ─────────────────────────────────────

export function KitchenServeReceiveSection({ data }: Props) {
  const { kitchenSR, players } = data;
  const pm = pmap(players);
  const rows = withPlayer(kitchenSR, pm).filter((r) => r.serveDen + r.recvDen > 0);
  if (rows.length === 0) return null;

  const cell = (n: number, d: number) => {
    const v = pct(n, d);
    if (v === null) return <span className="text-gray-300">—</span>;
    const color = v >= 90 ? 'text-blue-700' : v >= 70 ? 'text-gray-800' : 'text-amber-600';
    return <span><span className={`font-semibold tabular-nums ${color}`}>{v}%</span><span className="text-gray-400 text-xs ml-1">({n}/{d})</span></span>;
  };

  const columns: ColumnDef<KitchenSRRow>[] = [
    { key: 'serve', header: 'Serving', getValue: (r) => pct(r.serveNum, r.serveDen) ?? -1, render: (r) => cell(r.serveNum, r.serveDen) },
    { key: 'recv', header: 'Receiving', getValue: (r) => pct(r.recvNum, r.recvDen) ?? -1, render: (r) => cell(r.recvNum, r.recvDen) },
  ];

  return (
    <SectionCard title="Kitchen Arrival — Serving vs Receiving" action={<TrendButton title="Kitchen arrival" metrics={KITCHEN_SR_METRICS} rows={data.nightTrends} players={data.players} />}>
      <p className="text-sm text-gray-500 -mt-1.5 mb-3">
        How often each player personally gets to the kitchen, split by role. Receiving is almost automatic; serving is the hard part (and the team&apos;s biggest leak).
      </p>
      <SortableTable rows={rows} columns={columns} players={players} defaultSortKey="serve" />
    </SectionCard>
  );
}
