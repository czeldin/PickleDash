'use client';

import { useMemo, useState } from 'react';
import { DashboardData, NightTrendRow, PlayerMeta } from '@/types/dashboard';

interface Props { data: DashboardData; }

const rate = (n: number, d: number) => (d > 0 ? (100 * n) / d : null);

interface Metric { key: string; label: string; value: (r: NightTrendRow) => number | null; pct: boolean; }
const METRICS: Metric[] = [
  { key: 'win', label: 'Game win %', value: (r) => rate(r.gamesWon, r.gamesPlayed), pct: true },
  { key: 'rating', label: 'Overall rating', value: (r) => (r.ratingW > 0 ? r.ratingSum / r.ratingW : null), pct: false },
  { key: 'kserve', label: 'Kitchen on serve %', value: (r) => rate(r.kServeNum, r.kServeDen), pct: true },
  { key: 'dropsel', label: '3rd-shot drop %', value: (r) => rate(r.dropN, r.dropN + r.driveN), pct: true },
  { key: 'dropkit', label: 'Drop → kitchen %', value: (r) => rate(r.dropKitchen, r.dropN), pct: true },
  { key: 'finish', label: 'Finish win %', value: (r) => rate(r.finClean, r.finAtt), pct: true },
];

const shortNight = (n: string) => { const m = n.match(/^(\d+)\/(\d+)/); return m ? `${m[1]}/${m[2]}` : n; };

export function TrendsSection({ data }: Props) {
  const { nightTrends, players } = data;
  const [metricKey, setMetricKey] = useState('win');
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const metric = METRICS.find((m) => m.key === metricKey)!;

  // unique nights, chronological
  const nights = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of nightTrends) if (!m.has(r.night)) m.set(r.night, r.ts);
    return [...m.entries()].sort((a, b) => a[1] - b[1]).map(([night]) => night);
  }, [nightTrends]);

  const rowMap = useMemo(() => { const m = new Map<string, NightTrendRow>(); for (const r of nightTrends) m.set(`${r.pid}|${r.night}`, r); return m; }, [nightTrends]);

  const series = useMemo(() => players.map((p) => ({
    p,
    pts: nights.map((n, i) => { const row = rowMap.get(`${p.pid}|${n}`); const v = row ? metric.value(row) : null; return { i, v }; }).filter((d) => d.v !== null) as { i: number; v: number }[],
  })).filter((s) => s.pts.length > 0 && !hidden.has(s.p.pid)), [players, nights, rowMap, metric, hidden]);

  if (nights.length === 0 || players.length === 0) return null;

  // y domain
  const allV = series.flatMap((s) => s.pts.map((d) => d.v));
  let lo = allV.length ? Math.min(...allV) : 0, hi = allV.length ? Math.max(...allV) : 1;
  const pad = (hi - lo) * 0.15 || (metric.pct ? 5 : 0.2);
  lo -= pad; hi += pad;
  if (metric.pct) { lo = Math.max(0, lo); hi = Math.min(100, hi); }
  if (hi - lo < 1e-6) hi = lo + 1;

  // layout
  const W = 760, H = 280, mL = 42, mR = 14, mT = 14, mB = 38;
  const iw = W - mL - mR, ih = H - mT - mB;
  const x = (i: number) => mL + (nights.length <= 1 ? iw / 2 : (i / (nights.length - 1)) * iw);
  const y = (v: number) => mT + ih - ((v - lo) / (hi - lo)) * ih;
  const fmt = (v: number) => (metric.pct ? `${Math.round(v)}%` : v.toFixed(2));
  const ticks = Array.from({ length: 4 }, (_, k) => lo + (k / 3) * (hi - lo));

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between border-b border-gray-200 pb-2 gap-3 flex-wrap">
        <h2 className="text-xl font-bold text-gray-800">Trends over time</h2>
        <div className="flex flex-wrap items-center gap-1 text-xs">
          {METRICS.map((m) => (
            <button key={m.key} type="button" onClick={() => setMetricKey(m.key)}
              className={`px-2.5 py-1 rounded-full font-medium transition-colors ${metricKey === m.key ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
        <div className="w-full overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 480 }} role="img" aria-label={`${metric.label} per night by player`}>
            {ticks.map((t, k) => (
              <g key={k}>
                <line x1={mL} y1={y(t)} x2={W - mR} y2={y(t)} stroke="#eceae3" strokeWidth={1} />
                <text x={mL - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="#9a9890">{fmt(t)}</text>
              </g>
            ))}
            {nights.map((n, i) => (
              <text key={n} x={x(i)} y={H - mB + 16} textAnchor="middle" fontSize={10} fill="#9a9890">{shortNight(n)}</text>
            ))}
            {series.map((s) => (
              <g key={s.p.pid}>
                {s.pts.length > 1 && (
                  <polyline fill="none" stroke={s.p.color.text} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
                    points={s.pts.map((d) => `${x(d.i)},${y(d.v)}`).join(' ')} />
                )}
                {s.pts.map((d) => (
                  <circle key={d.i} cx={x(d.i)} cy={y(d.v)} r={3.5} fill={s.p.color.text} stroke="#fff" strokeWidth={1.5} />
                ))}
              </g>
            ))}
          </svg>
        </div>
        {/* Legend (click to toggle a player) */}
        <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-gray-50">
          {players.map((p) => {
            const off = hidden.has(p.pid);
            return (
              <button key={p.pid} type="button"
                onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(p.pid)) n.delete(p.pid); else n.add(p.pid); return n; })}
                className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border transition-colors ${off ? 'border-gray-200 bg-gray-50 text-gray-300' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
                <span className="w-3 h-1 rounded-full" style={{ backgroundColor: off ? '#d4d2c9' : (p as PlayerMeta).color.text }} />
                {p.name}
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-gray-400">Each point is one night. Click a player to hide/show. Nights with no data for the selected metric are skipped.</p>
    </section>
  );
}
