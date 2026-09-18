'use client';

import { useMemo, useState } from 'react';
import { PlayerMeta } from '@/types/dashboard';

export interface TrendRow { pid: string; night: string; ts: number }
export interface MetricDef<T extends TrendRow = TrendRow> {
  key: string;
  label: string;
  value: (r: T) => number | null;
  pct: boolean;
}

const shortNight = (n: string) => { const m = n.match(/^(\d+)\/(\d+)/); return m ? `${m[1]}/${m[2]}` : n; };

function Chart<T extends TrendRow>({ nightTrends, players, metrics, selectedPids }: {
  nightTrends: T[]; players: PlayerMeta[]; metrics: MetricDef<T>[]; selectedPids: Set<string>;
}) {
  const [metricKey, setMetricKey] = useState(metrics[0].key);
  const metric = metrics.find((m) => m.key === metricKey) ?? metrics[0];

  const nights = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of nightTrends) if (!m.has(r.night)) m.set(r.night, r.ts);
    return [...m.entries()].sort((a, b) => a[1] - b[1]).map(([night]) => night);
  }, [nightTrends]);
  const rowMap = useMemo(() => { const m = new Map<string, T>(); for (const r of nightTrends) m.set(`${r.pid}|${r.night}`, r); return m; }, [nightTrends]);

  const series = players.filter((p) => selectedPids.has(p.pid)).map((p) => ({
    p,
    pts: nights.map((n, i) => { const row = rowMap.get(`${p.pid}|${n}`); const v = row ? metric.value(row) : null; return { i, v }; }).filter((d) => d.v !== null) as { i: number; v: number }[],
  })).filter((s) => s.pts.length > 0);

  const allV = series.flatMap((s) => s.pts.map((d) => d.v));
  let lo = allV.length ? Math.min(...allV) : 0, hi = allV.length ? Math.max(...allV) : 1;
  const pad = (hi - lo) * 0.15 || (metric.pct ? 5 : 0.2);
  lo -= pad; hi += pad;
  if (metric.pct) { lo = Math.max(0, lo); hi = Math.min(100, hi); }
  if (hi - lo < 1e-6) hi = lo + 1;

  const W = 760, H = 300, mL = 42, mR = 14, mT = 14, mB = 38;
  const iw = W - mL - mR, ih = H - mT - mB;
  const x = (i: number) => mL + (nights.length <= 1 ? iw / 2 : (i / (nights.length - 1)) * iw);
  const y = (v: number) => mT + ih - ((v - lo) / (hi - lo)) * ih;
  const fmt = (v: number) => (metric.pct ? `${Math.round(v)}%` : v.toFixed(2));
  const ticks = Array.from({ length: 4 }, (_, k) => lo + (k / 3) * (hi - lo));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1 text-xs mb-3">
        {metrics.map((m) => (
          <button key={m.key} type="button" onClick={() => setMetricKey(m.key)}
            className={`px-2.5 py-1 rounded-full font-medium transition-colors ${metricKey === m.key ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            {m.label}
          </button>
        ))}
      </div>
      {series.length === 0 ? (
        <div className="text-sm text-gray-400 py-12 text-center">No data for the selected players / metric.</div>
      ) : (
        <div className="w-full overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 480 }} role="img" aria-label={`${metric.label} per night`}>
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
                {s.pts.map((d) => <circle key={d.i} cx={x(d.i)} cy={y(d.v)} r={3.5} fill={s.p.color.text} stroke="#fff" strokeWidth={1.5} />)}
              </g>
            ))}
          </svg>
        </div>
      )}
    </div>
  );
}

/**
 * Always-visible inline trend chart with its own player toggles. Metrics that
 * don't exist for a night produce null values and are simply not plotted, so a
 * newer-only metric's line starts at the first night it has data — no fake zeros.
 */
export function TrendChartInline<T extends TrendRow>({ title, metrics, rows, players: allPlayers }: { title: string; metrics: MetricDef<T>[]; rows: T[]; players: PlayerMeta[] }) {
  const havePids = useMemo(() => new Set(rows.map((r) => r.pid)), [rows]);
  const players = allPlayers.filter((p) => havePids.has(p.pid));
  const [selected, setSelected] = useState<Set<string>>(() => new Set(allPlayers.map((p) => p.pid)));
  if (players.length === 0) return null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
      <Chart nightTrends={rows} players={players} metrics={metrics} selectedPids={selected} />
      <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
        {players.map((p) => {
          const on = selected.has(p.pid);
          return (
            <button key={p.pid} type="button"
              onClick={() => setSelected((s) => { const n = new Set(s); if (n.has(p.pid)) n.delete(p.pid); else n.add(p.pid); return n; })}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${on ? 'border-gray-300 bg-white text-gray-700' : 'border-gray-200 bg-gray-50 text-gray-300'}`}>
              <span className="w-3 h-1 rounded-full" style={{ backgroundColor: on ? p.color.text : '#d4d2c9' }} />
              {p.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TrendButton<T extends TrendRow>({ title, metrics, rows, players: allPlayers }: { title: string; metrics: MetricDef<T>[]; rows: T[]; players: PlayerMeta[] }) {
  const [open, setOpen] = useState(false);
  // players that actually have any night-trend data
  const havePids = useMemo(() => new Set(rows.map((r) => r.pid)), [rows]);
  const players = allPlayers.filter((p) => havePids.has(p.pid));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // initialise selection to all when first opened
  function openModal() { if (selected.size === 0) setSelected(new Set(players.map((p) => p.pid))); setOpen(true); }

  if (players.length === 0) return null;

  return (
    <>
      <button type="button" onClick={openModal}
        className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 border border-gray-200 rounded-full px-3 py-1 hover:bg-gray-50 transition-colors flex-shrink-0"
        title="View trends over time">
        <span aria-hidden>📈</span> Trends
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-1">
              <h3 className="text-lg font-bold text-gray-800">{title} <span className="font-normal text-gray-400 text-sm">— over time</span></h3>
              <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>
            <p className="text-xs text-gray-400 mb-3">Each point is one night. Pick metrics above the chart and players below.</p>

            <Chart nightTrends={rows} players={players} metrics={metrics} selectedPids={selected} />

            <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-400 self-center mr-1">Players:</span>
              {players.map((p) => {
                const on = selected.has(p.pid);
                return (
                  <button key={p.pid} type="button"
                    onClick={() => setSelected((s) => { const n = new Set(s); if (n.has(p.pid)) n.delete(p.pid); else n.add(p.pid); return n; })}
                    className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${on ? 'border-gray-300 bg-white text-gray-700' : 'border-gray-200 bg-gray-50 text-gray-300'}`}>
                    <span className="w-3 h-1 rounded-full" style={{ backgroundColor: on ? p.color.text : '#d4d2c9' }} />
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
