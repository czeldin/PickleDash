'use client';

import { DashboardData, PlayerMeta, RallyImpactRow, TargetingRow, KitchenSRRow, NightTrendRow } from '@/types/dashboard';
import { SectionCard } from '@/components/SectionCard';
import { SortableTable, ColumnDef } from '@/components/SortableTable';
import { TrendButton, MetricDef } from '@/components/TrendChart';

interface Props { data: DashboardData; }

const g = (v: number, r: NightTrendRow) => (r.gamesPlayed > 0 ? v / r.gamesPlayed : null);
const rt = (n: number, d: number) => (d > 0 ? (100 * n) / d : null);

const RALLY_METRICS: MetricDef<NightTrendRow>[] = [
  { key: 'net', label: 'Net/g', value: (r) => g(r.riWon - r.riLost - r.riSetup, r), pct: false },
  { key: 'winners', label: 'Winners/g', value: (r) => g(r.riWon, r), pct: false },
  { key: 'lost', label: 'Lost/g', value: (r) => g(r.riLost, r), pct: false },
  { key: 'setup', label: 'Set up opp/g', value: (r) => g(r.riSetup, r), pct: false },
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
      <p className="text-sm text-gray-500 -mt-2 mb-4">
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
                  const color = v < 55 ? 'text-red-600' : v < 75 ? 'text-amber-600' : 'text-gray-700';
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
  if (rows.length === 0) return null;

  const columns: ColumnDef<RallyImpactRow>[] = [
    { key: 'won', header: 'Winners/g', getValue: (r) => per(r.won, r.games), render: (r) => <span className="tabular-nums font-semibold text-emerald-700">{per(r.won, r.games).toFixed(1)}</span> },
    { key: 'lost', header: 'Lost/g', getValue: (r) => per(r.lostDirect, r.games), render: (r) => num(per(r.lostDirect, r.games)) },
    { key: 'setup', header: 'Set up opp/g', getValue: (r) => per(r.setup, r.games), render: (r) => num(per(r.setup, r.games)) },
    {
      key: 'net', header: 'Net/g',
      getValue: (r) => per(r.won - r.lostDirect - r.setup, r.games),
      render: (r) => { const n = per(r.won - r.lostDirect - r.setup, r.games); return <span className={`tabular-nums font-bold ${n >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{n > 0 ? '+' : ''}{n.toFixed(1)}</span>; },
    },
  ];

  return (
    <SectionCard title="Rally Impact — Winners vs Points Given Away" action={<TrendButton title="Rally Impact" metrics={RALLY_METRICS} rows={data.nightTrends} players={data.players} />}>
      <p className="text-sm text-gray-500 -mt-2 mb-4">
        Per game: clean winners you hit, vs points you gave away. <strong className="text-gray-600">Lost</strong> = your rally-ending errors; <strong className="text-gray-600">Set up</strong> = your pop-ups the opponent put away. Net = winners − both.
      </p>
      <SortableTable rows={rows} columns={columns} players={players} defaultSortKey="net" />
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
    { key: 'clean', header: 'Winners/g', getValue: (r) => per(r.clean, r.games), render: (r) => <span className="tabular-nums text-emerald-700">{per(r.clean, r.games).toFixed(1)}</span> },
    {
      key: 'convert', header: 'Finish win %', getValue: (r) => pct(r.clean, r.fin) ?? -1,
      render: (r) => { const v = pct(r.clean, r.fin); if (v === null) return <span className="text-gray-300">—</span>; const c = v >= 42 ? 'text-emerald-700' : v >= 37 ? 'text-gray-800' : 'text-red-600'; return <span className={`tabular-nums font-semibold ${c}`}>{v}%</span>; },
    },
    { key: 'pop', header: 'Pop-ups/g', getValue: (r) => per(r.pop, r.games), render: (r) => num(per(r.pop, r.games)) },
    { key: 'gotAttacked', header: 'Got attacked/g', getValue: (r) => per(r.gotAttacked, r.games), render: (r) => <span className="tabular-nums text-amber-700">{per(r.gotAttacked, r.games).toFixed(1)}</span> },
  ];

  return (
    <SectionCard title="Targeting — Who Attacks, Who Gets Picked On" action={<TrendButton title="Targeting" metrics={TARGETING_METRICS} rows={data.nightTrends} players={data.players} />}>
      <p className="text-sm text-gray-500 -mt-2 mb-4">
        Per game. <strong className="text-gray-600">Attacks</strong> = how much you go on offense; <strong className="text-emerald-700">Winners</strong> = clean put-aways; <strong className="text-gray-600">Finish win %</strong> = of your put-away attempts, how many you convert (skill, not volume). <strong className="text-gray-600">Pop-ups / Got attacked</strong> = how often you give the opponent a ball to put away.
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
    const color = v >= 90 ? 'text-emerald-700' : v >= 70 ? 'text-gray-800' : 'text-amber-600';
    return <span><span className={`font-semibold tabular-nums ${color}`}>{v}%</span><span className="text-gray-400 text-xs ml-1">({n}/{d})</span></span>;
  };

  const columns: ColumnDef<KitchenSRRow>[] = [
    { key: 'serve', header: 'Serving', getValue: (r) => pct(r.serveNum, r.serveDen) ?? -1, render: (r) => cell(r.serveNum, r.serveDen) },
    { key: 'recv', header: 'Receiving', getValue: (r) => pct(r.recvNum, r.recvDen) ?? -1, render: (r) => cell(r.recvNum, r.recvDen) },
  ];

  return (
    <SectionCard title="Kitchen Arrival — Serving vs Receiving" action={<TrendButton title="Kitchen arrival" metrics={KITCHEN_SR_METRICS} rows={data.nightTrends} players={data.players} />}>
      <p className="text-sm text-gray-500 -mt-2 mb-4">
        How often each player personally gets to the kitchen, split by role. Receiving is almost automatic; serving is the hard part (and the team&apos;s biggest leak).
      </p>
      <SortableTable rows={rows} columns={columns} players={players} defaultSortKey="serve" />
    </SectionCard>
  );
}
