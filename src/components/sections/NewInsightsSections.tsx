'use client';

import { DashboardData, PlayerMeta } from '@/types/dashboard';
import { SectionCard } from '@/components/SectionCard';

interface Props { data: DashboardData; }

function Avatar({ p, sm }: { p: PlayerMeta; sm?: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-bold flex-shrink-0 ${sm ? 'w-6 h-6 text-[10px]' : 'w-7 h-7 text-[11px]'}`}
      style={{ backgroundColor: p.color.bg, color: p.color.text }}
    >{p.initials}</span>
  );
}

function pmap(players: PlayerMeta[]) { return new Map(players.map((p) => [p.pid, p])); }
const pct = (n: number, d: number) => (d > 0 ? Math.round((100 * n) / d) : null);
const per = (n: number, g: number) => (g > 0 ? n / g : 0);

// ─── Areas for Improvement (pb.vision coaching flags) ──────────────────────────

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

export function CoachingSection({ data }: Props) {
  const { coaching, players } = data;
  const pm = pmap(players);
  const withData = coaching.filter((c) => c.items.length > 0);
  if (withData.length === 0) return null;

  return (
    <SectionCard title="Areas for Improvement">
      <p className="text-sm text-gray-500 -mt-2 mb-4">
        pb.vision&apos;s own coaching flags — each player&apos;s lowest-scoring metrics (higher relevance = bigger opportunity).
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {players.map((p) => {
          const c = coaching.find((x) => x.pid === p.pid);
          if (!c || c.items.length === 0) return null;
          const worst = c.items.slice(0, 4);
          return (
            <div key={p.pid} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <Avatar p={pm.get(p.pid)!} />
                <span className="font-semibold text-gray-800">{p.name}</span>
              </div>
              <div className="space-y-2">
                {worst.map((it) => {
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

// ─── Rally Impact (clutch vs liability) ────────────────────────────────────────

export function RallyImpactSection({ data }: Props) {
  const { rallyImpact, players } = data;
  const pm = pmap(players);
  const rows = rallyImpact.filter((r) => r.games > 0);
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => per(b.won - b.lostDirect - b.setup, b.games) - per(a.won - a.lostDirect - a.setup, a.games));

  return (
    <SectionCard title="Rally Impact — Winners vs Points Given Away">
      <p className="text-sm text-gray-500 -mt-2 mb-4">
        Per game: clean winners you hit, vs points you gave away. <strong className="text-gray-600">Lost</strong> = your rally-ending errors; <strong className="text-gray-600">Set up</strong> = your pop-ups the opponent put away. Net = winners − both.
      </p>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 font-medium">
              <th className="text-left px-5 py-3">Player</th>
              <th className="text-right px-4 py-3">Winners/g</th>
              <th className="text-right px-4 py-3">Lost/g</th>
              <th className="text-right px-4 py-3">Set up opp/g</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">Net/g</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sorted.map((r) => {
              const net = per(r.won - r.lostDirect - r.setup, r.games);
              return (
                <tr key={r.pid} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3"><div className="flex items-center gap-2"><Avatar p={pm.get(r.pid)!} sm /><span className="text-gray-700 font-medium">{pm.get(r.pid)!.name}</span></div></td>
                  <td className="px-4 py-3 text-right tabular-nums text-emerald-700 font-semibold">{per(r.won, r.games).toFixed(1)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{per(r.lostDirect, r.games).toFixed(1)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{per(r.setup, r.games).toFixed(1)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums font-bold ${net >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{net > 0 ? '+' : ''}{net.toFixed(1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

// ─── Targeting (aggressor vs picked-on) ────────────────────────────────────────

export function TargetingSection({ data }: Props) {
  const { targeting, players } = data;
  const pm = pmap(players);
  const rows = targeting.filter((r) => r.games > 0);
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => per(b.attacks, b.games) - per(a.attacks, a.games));

  return (
    <SectionCard title="Targeting — Who Attacks, Who Gets Picked On">
      <p className="text-sm text-gray-500 -mt-2 mb-4">
        Per game. <strong className="text-gray-600">Attacks/Finish</strong> = how much you go on offense. <strong className="text-gray-600">Pop-ups</strong> and <strong className="text-gray-600">Got attacked</strong> = how often you give the opponent a ball to put away.
      </p>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 font-medium">
              <th className="text-left px-5 py-3">Player</th>
              <th className="text-right px-4 py-3">Attacks/g</th>
              <th className="text-right px-4 py-3">Finish/g</th>
              <th className="text-right px-4 py-3">Pop-ups/g</th>
              <th className="text-right px-4 py-3">Got attacked/g</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sorted.map((r) => (
              <tr key={r.pid} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3"><div className="flex items-center gap-2"><Avatar p={pm.get(r.pid)!} sm /><span className="text-gray-700 font-medium">{pm.get(r.pid)!.name}</span></div></td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-800">{per(r.attacks, r.games).toFixed(1)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-600">{per(r.fin, r.games).toFixed(1)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-600">{per(r.pop, r.games).toFixed(1)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-amber-700">{per(r.gotAttacked, r.games).toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

// ─── Kitchen arrival: serving vs receiving ─────────────────────────────────────

export function KitchenServeReceiveSection({ data }: Props) {
  const { kitchenSR, players } = data;
  const pm = pmap(players);
  const rows = kitchenSR.filter((r) => r.serveDen + r.recvDen > 0);
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => (pct(b.serveNum, b.serveDen) ?? 0) - (pct(a.serveNum, a.serveDen) ?? 0));

  const Cell = ({ n, d }: { n: number; d: number }) => {
    const v = pct(n, d);
    if (v === null) return <span className="text-gray-300">—</span>;
    const color = v >= 90 ? 'text-emerald-700' : v >= 70 ? 'text-gray-800' : 'text-amber-600';
    return <><span className={`font-semibold tabular-nums ${color}`}>{v}%</span><span className="text-gray-400 text-xs ml-1">({n}/{d})</span></>;
  };

  return (
    <SectionCard title="Kitchen Arrival — Serving vs Receiving">
      <p className="text-sm text-gray-500 -mt-2 mb-4">
        How often each player personally gets to the kitchen, split by role. Receiving is almost automatic; serving is the hard part (and the team&apos;s biggest leak).
      </p>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 font-medium">
              <th className="text-left px-5 py-3">Player</th>
              <th className="text-right px-4 py-3">Serving</th>
              <th className="text-right px-4 py-3">Receiving</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sorted.map((r) => (
              <tr key={r.pid} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3"><div className="flex items-center gap-2"><Avatar p={pm.get(r.pid)!} sm /><span className="text-gray-700 font-medium">{pm.get(r.pid)!.name}</span></div></td>
                <td className="px-4 py-3 text-right"><Cell n={r.serveNum} d={r.serveDen} /></td>
                <td className="px-4 py-3 text-right"><Cell n={r.recvNum} d={r.recvDen} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
