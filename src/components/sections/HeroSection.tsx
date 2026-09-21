'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
} from 'recharts';
import { DashboardData, PlayerMeta, HeroStats } from '@/types/dashboard';

interface Props {
  data: DashboardData;
}

interface ChartRow {
  pid: string;
  label: string;
  dupr: number;
  color: string;
  bgColor: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomYAxisTick({ x, y, payload, rows }: any) {
  const row: ChartRow | undefined = rows.find((r: ChartRow) => r.label === payload.value);
  if (!row) return null;

  return (
    <g transform={`translate(${x},${y})`}>
      <text x={-90} y={0} dy="0.35em" textAnchor="start" fontSize={14} fontWeight={600} fill={row.color}>
        {row.label.length > 11 ? row.label.slice(0, 10) + '…' : row.label}
      </text>
    </g>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RatingLabel({ x, y, width, height, value }: any) {
  if (value == null || value === 0) return null;
  return (
    <text
      x={(x as number) + (width as number) + 8}
      y={(y as number) + (height as number) / 2}
      dy="0.35em"
      fontSize={16}
      fontWeight={800}
      fill="#111827"
    >
      {(value as number).toFixed(2)}
    </text>
  );
}

export function HeroSection({ data }: Props) {
  const { players, hero } = data;
  const playerMap = new Map<string, PlayerMeta>(players.map((p) => [p.pid, p]));

  const sorted = [...hero]
    .filter((h) => h.dupr > 0)
    .sort((a, b) => b.dupr - a.dupr);

  const rows: ChartRow[] = sorted.map((h: HeroStats) => {
    const player = playerMap.get(h.pid);
    return {
      pid: player?.initials ?? h.pid,
      label: player?.name ?? h.pid,
      dupr: h.dupr,
      color: player?.color.text ?? '#374151',
      bgColor: player?.color.bg ?? '#f3f4f6',
    };
  });

  const chartHeight = Math.max(100, rows.length * 72);

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-gray-800 border-b border-gray-200 pb-2">
        Player Overview
      </h2>
      <div className="flex flex-col md:flex-row gap-4 items-stretch">

        {/* Rating bar chart */}
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-6 min-w-0">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Overall Rating</p>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart
              layout="vertical"
              data={rows}
              margin={{ top: 4, right: 48, bottom: 4, left: 8 }}
            >
              <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                type="number"
                domain={[3.75, 4.75]}
                ticks={[3.75, 4.0, 4.25, 4.5, 4.75]}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={90}
                tick={(props) => <CustomYAxisTick {...props} rows={rows} />}
                axisLine={false}
                tickLine={false}
              />
              <Bar dataKey="dupr" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                {rows.map((row) => (
                  <Cell key={row.label} fill={row.color} />
                ))}
                <LabelList content={<RatingLabel />} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Record tile */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-6 w-full md:w-60 md:flex-shrink-0">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Record</p>
          <div className="space-y-3">
            {[...sorted].sort((a, b) => {
            const aR = (a.wins + a.losses) > 0 ? a.wins / (a.wins + a.losses) : 0;
            const bR = (b.wins + b.losses) > 0 ? b.wins / (b.wins + b.losses) : 0;
            return bR - aR;
          }).map((h: HeroStats) => {
              const player = playerMap.get(h.pid);
              const total = h.wins + h.losses;
              const winPct = total > 0 ? h.wins / total : 0;
              return (
                <div key={h.pid}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold" style={{ color: player?.color.text }}>{player?.name ?? h.pid}</span>
                    <span className="text-sm font-bold tabular-nums" style={{ color: player?.color.text }}>
                      {h.wins}W–{h.losses}L
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${winPct * 100}%`, backgroundColor: player?.color.text }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 w-8 text-right tabular-nums">
                      {total > 0 ? `${Math.round(winPct * 100)}%` : '—'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {h.gamesPlayed} games · {h.totalShots.toLocaleString()} shots
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* MVP by game tile */}
        <MvpByGameTile data={data} playerMap={playerMap} />

      </div>
    </section>
  );
}

function MvpByGameTile({ data, playerMap }: { data: DashboardData; playerMap: Map<string, PlayerMeta> }) {
  const rows = data.skillRatingsByGame;
  if (!rows || rows.length === 0) return null;
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
  // Across multiple nights a single global "G1..GN" is confusing (each night has
  // its own G1..). Number games WITHIN their night and show the night label.
  const multiNight = new Set(mvps.map((r) => r.nightLabel)).size > 1;
  const perNightIdx = new Map<string, number>();
  // Drop a trailing "/YY" year to keep the date short (e.g. "8/5" not "8/5/26").
  const shortDate = (label: string) => label.replace(/\/\d{2,4}$/, '');
  const gameLabel = (r: (typeof mvps)[number]) => {
    const n = (perNightIdx.get(r.nightLabel) ?? 0) + 1;
    perNightIdx.set(r.nightLabel, n);
    return multiNight ? `${shortDate(r.nightLabel)} G${n}` : `G${n}`;
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-6 w-full md:w-60 md:flex-shrink-0">
      <div className="flex items-baseline justify-between mb-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">MVP by Game</p>
        <span className="text-[11px] text-gray-400 tabular-nums">{mvps.length} {mvps.length === 1 ? 'game' : 'games'}</span>
      </div>
      {/* Show a generous number of games before scrolling. The old ~200px cap hid
          games (e.g. a 2-night, 16-game selection showed only the first ~7), which
          read as "a whole night is missing". ~14 rows fit before we scroll, and the
          count above makes it clear when there are more. */}
      <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1">
        {mvps.map((r, i) => {
          const p = playerMap.get(r.pid);
          return (
            <div key={r.sessionKey + i} className="relative group flex items-center gap-2 rounded-md px-1 -mx-1 hover:bg-gray-50 cursor-default">
              <span className={`text-xs text-gray-400 tabular-nums shrink-0 ${multiNight ? 'w-14' : 'w-6'}`}>{gameLabel(r)}</span>
              <span className="text-sm font-semibold truncate flex-1" style={{ color: p?.color.text }}>{p?.name ?? r.pid}</span>
              <span className="text-xs text-gray-400 tabular-nums shrink-0">{r.overall.toFixed(2)}</span>
              {r.sessionName && (
                <span className="pointer-events-none absolute left-2 bottom-full mb-1 z-50 hidden group-hover:block whitespace-nowrap rounded-lg bg-gray-900 text-white text-xs px-2.5 py-1.5 shadow-lg">
                  {r.sessionName}
                  <span className="absolute left-4 top-full -mt-px border-4 border-transparent border-t-gray-900" />
                </span>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-gray-400 mt-3">Highest pb.vision rating each game.</p>
    </div>
  );
}
