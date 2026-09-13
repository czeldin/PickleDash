'use client';

import { useMemo, useState } from 'react';
import { DashboardData, SkillRatingsRow, SkillRatingsByGameRow } from '@/types/dashboard';
import { SortableTable, ColumnDef } from '@/components/SortableTable';
import { SectionCard } from '@/components/SectionCard';
import { TrendButton, MetricDef, TrendRow } from '@/components/TrendChart';

interface Props {
  data: DashboardData;
}

// All skills pb.vision has ever sent. Newer exports use court IQ / kitchen /
// ball control / targeting; older ones use serve / return / agility / consistency;
// offense, defense and overall appear in both. Columns with no data in the current
// view are hidden, and a coverage badge flags columns backed by only some nights.
// "Overall" is pb.vision's own authoritative rating (row.overall), never re-derived.
const ALL_SKILLS = ['courtIq', 'kitchenGame', 'ballControl', 'targeting', 'offense', 'defense', 'serve', 'return', 'agility', 'consistency'] as const;
type SkillKey = typeof ALL_SKILLS[number];
const SKILL_LABELS: Record<string, string> = {
  courtIq: 'Court IQ', kitchenGame: 'Kitchen', ballControl: 'Ball Ctrl', targeting: 'Targeting',
  offense: 'Offense', defense: 'Defense',
  serve: 'Serve', return: 'Return', agility: 'Agility', consistency: 'Consist',
};

function getOverall(row: { overall?: number }): number {
  return row.overall ?? 0;
}

// ── Per-night skill rollup for the trend chart ──
type SkillNightRow = TrendRow & Record<'overall' | SkillKey, number>;
function buildSkillNightRows(byGame: SkillRatingsByGameRow[]): SkillNightRow[] {
  const KEYS: (SkillKey | 'overall')[] = ['overall', ...ALL_SKILLS];
  const m = new Map<string, { pid: string; night: string; ts: number; sums: Record<string, number>; ws: Record<string, number> }>();
  for (const r of byGame) {
    const key = `${r.pid}|${r.nightLabel}`;
    let e = m.get(key);
    if (!e) { e = { pid: r.pid, night: r.nightLabel, ts: r.timestamp, sums: {}, ws: {} }; m.set(key, e); }
    for (const k of KEYS) { const v = r[k] ?? 0; if (v > 0) { e.sums[k] = (e.sums[k] ?? 0) + v * r.shotCount; e.ws[k] = (e.ws[k] ?? 0) + r.shotCount; } }
  }
  return [...m.values()].map((e) => {
    const o = { pid: e.pid, night: e.night, ts: e.ts } as SkillNightRow;
    for (const k of KEYS) o[k] = e.ws[k] ? e.sums[k] / e.ws[k] : 0;
    return o;
  });
}
const SKILL_TREND_METRICS: MetricDef<SkillNightRow>[] = [
  { key: 'overall', label: 'Overall', value: (r) => (r.overall > 0 ? r.overall : null), pct: false },
  ...ALL_SKILLS.map((s): MetricDef<SkillNightRow> => ({ key: s, label: SKILL_LABELS[s], value: (r) => (r[s] > 0 ? r[s] : null), pct: false })),
];

// Per-skill night coverage from the by-game rows: how many distinct nights carry
// a value for each skill, and the total nights in view.
function skillNightCoverage(byGame: SkillRatingsByGameRow[]) {
  const total = new Set(byGame.map((r) => r.nightLabel)).size;
  const nights: Record<string, Set<string>> = {};
  for (const r of byGame) {
    for (const s of ALL_SKILLS) {
      if ((r[s] ?? 0) > 0) { (nights[s] ??= new Set()).add(r.nightLabel); }
    }
  }
  const counts: Record<string, number> = {};
  for (const s of ALL_SKILLS) counts[s] = nights[s]?.size ?? 0;
  return { total, counts };
}

function CoverageHeader({ label, nights, total }: { label: string; nights: number; total: number }) {
  const partial = total > 0 && nights > 0 && nights < total;
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      {partial && (
        <span
          title={`Based on ${nights} of ${total} night${total !== 1 ? 's' : ''} — this skill only appears in newer pb.vision exports`}
          className="text-[9px] font-normal text-amber-600 border border-amber-200 rounded px-1 leading-tight normal-case"
        >{nights}n</span>
      )}
    </span>
  );
}

function colorPill(value: number, isMax: boolean, isMin: boolean) {
  const display = value > 0 ? value.toFixed(2) : '—';
  if (isMax) {
    return (
      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">
        {display}
      </span>
    );
  }
  if (isMin && value > 0) {
    return (
      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
        {display}
      </span>
    );
  }
  return <span className="text-sm text-gray-700">{display}</span>;
}

export function SkillRatingsSection({ data }: Props) {
  const { skillRatings, players, skillRatingsByGame } = data;
  const skillNightRows = useMemo(() => buildSkillNightRows(skillRatingsByGame), [skillRatingsByGame]);

  const overallVals = skillRatings.map(getOverall).filter((v) => v > 0);
  const overallMax = overallVals.length ? Math.max(...overallVals) : -1;
  const overallMin = overallVals.length ? Math.min(...overallVals) : -1;

  // Only show skills that have data in the current view; badge those with partial night coverage.
  const visibleSkills = ALL_SKILLS.filter((s) => skillRatings.some((r) => (r[s] ?? 0) > 0));
  const { total: totalNights, counts: nightCounts } = skillNightCoverage(skillRatingsByGame);
  const anyPartial = visibleSkills.some((s) => nightCounts[s] > 0 && nightCounts[s] < totalNights);

  const skillMins: Record<string, number> = {};
  const skillMaxs: Record<string, number> = {};
  for (const skill of visibleSkills) {
    const vals = skillRatings.map((r) => r[skill]).filter((v) => v > 0);
    skillMins[skill] = vals.length ? Math.min(...vals) : -1;
    skillMaxs[skill] = vals.length ? Math.max(...vals) : -1;
  }

  const columns: ColumnDef<SkillRatingsRow>[] = [
    {
      key: 'overall',
      header: 'Overall',
      getValue: (row) => getOverall(row),
      render: (row) => {
        const v = getOverall(row);
        return colorPill(v, v === overallMax && overallMax > 0, v === overallMin && overallMin > 0);
      },
    },
    ...visibleSkills.map((skill: SkillKey) => ({
      key: skill,
      header: <CoverageHeader label={SKILL_LABELS[skill]} nights={nightCounts[skill]} total={totalNights} />,
      getValue: (row: SkillRatingsRow) => row[skill],
      render: (row: SkillRatingsRow) =>
        colorPill(
          row[skill],
          row[skill] === skillMaxs[skill] && skillMaxs[skill] > 0,
          row[skill] === skillMins[skill] && skillMins[skill] > 0
        ),
    })),
  ];

  return (
    <SectionCard title="Skill Ratings Breakdown" action={<TrendButton title="Skill ratings" metrics={SKILL_TREND_METRICS} rows={skillNightRows} players={players} />}>
      <SortableTable
        rows={skillRatings}
        columns={columns}
        players={players}
        defaultSortKey="overall"
      />
      {anyPartial && (
        <p className="text-xs text-gray-400 mt-3">
          The amber <span className="text-amber-600 border border-amber-200 rounded px-1">Nn</span> badge shows how many of your {totalNights} nights back that column — some skills only appear in newer pb.vision exports, so they cover fewer nights than Offense/Defense/Overall.
        </p>
      )}
    </SectionCard>
  );
}

// ─── Players (By Game) view ────────────────────────────────────────────────────

function skillColor(value: number): string {
  if (value <= 0) return 'text-gray-400';
  if (value >= 0.7) return 'text-green-700 font-semibold';
  if (value >= 0.5) return 'text-gray-700';
  return 'text-red-600';
}

type SortCol = 'time' | 'overall' | SkillKey;

// Which skills have any data across these rows (to hide empty columns).
function visibleSkillsFor(rows: SkillRatingsByGameRow[]): SkillKey[] {
  return ALL_SKILLS.filter((s) => rows.some((r) => (r[s] ?? 0) > 0));
}
type SortDir = 'asc' | 'desc';

function SortableHeader({
  label, col, sortCol, sortDir, onSort, left,
}: {
  label: string; col: SortCol; sortCol: SortCol; sortDir: SortDir;
  onSort: (col: SortCol) => void; left?: boolean;
}) {
  const active = sortCol === col;
  const arrow = active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
  return (
    <th
      onClick={() => onSort(col)}
      className={`py-2 text-gray-500 font-medium cursor-pointer select-none hover:text-gray-800 transition-colors ${left ? 'text-left px-4 md:px-5' : 'text-right px-3'} ${active ? 'text-gray-800' : ''}`}
    >
      {label}{arrow}
    </th>
  );
}

function weightedAvg(rows: SkillRatingsByGameRow[], skill: string): number {
  const active = rows.filter((r) => (r[skill as keyof SkillRatingsByGameRow] as number) > 0);
  const totalW = active.reduce((s, r) => s + r.shotCount, 0);
  return totalW > 0
    ? active.reduce((s, r) => s + (r[skill as keyof SkillRatingsByGameRow] as number) * r.shotCount, 0) / totalW
    : 0;
}

function buildAvgRow(rows: SkillRatingsByGameRow[]): Record<string, number> {
  const avg: Record<string, number> = {};
  for (const skill of ALL_SKILLS) avg[skill] = weightedAvg(rows, skill);
  avg.overall = weightedAvg(rows, 'overall');
  return avg;
}

function Delta({ val, base }: { val: number; base: number }) {
  if (val <= 0 || base <= 0) return null;
  const d = val - base;
  if (Math.abs(d) < 0.005) return <span className="text-gray-400 text-xs ml-1">—</span>;
  return (
    <span className={`text-xs ml-1 ${d > 0 ? 'text-green-600' : 'text-red-500'}`}>
      {d > 0 ? '+' : ''}{d.toFixed(2)}
    </span>
  );
}

function PlayerTable({ player, rows, multiNight }: {
  player: { pid: string; name: string; initials: string; color: { bg: string; text: string } };
  rows: SkillRatingsByGameRow[];
  multiNight: boolean;
}) {
  const [sortCol, setSortCol] = useState<SortCol>('time');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  function handleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir(col === 'time' ? 'asc' : 'desc'); }
  }

  const sorted = [...rows].sort((a, b) => {
    let av = 0, bv = 0;
    if (sortCol === 'time') { av = a.timestamp; bv = b.timestamp; }
    else if (sortCol === 'overall') {
      av = getOverall(a);
      bv = getOverall(b);
    } else {
      av = a[sortCol as keyof SkillRatingsByGameRow] as number;
      bv = b[sortCol as keyof SkillRatingsByGameRow] as number;
    }
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  const avgRow = buildAvgRow(rows);
  const avgOverall = avgRow.overall;
  const visible = visibleSkillsFor(rows);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-4 md:px-5 py-3 border-b border-gray-100">
        <span
          className="inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold flex-shrink-0"
          style={{ backgroundColor: player.color.bg, color: player.color.text }}
        >
          {player.initials}
        </span>
        <span className="font-semibold text-gray-900">{player.name}</span>
        <span className="text-xs text-gray-400 ml-auto">{rows.length} {rows.length === 1 ? 'game' : 'games'}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs md:text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <SortableHeader label="Game" col="time" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} left />
              <SortableHeader label="Overall" col="overall" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              {visible.map((s) => (
                <SortableHeader key={s} label={SKILL_LABELS[s]} col={s} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sorted.map((row) => {
              const label = multiNight ? `${row.nightLabel} · ${row.sessionName}` : row.sessionName;
              const ov = getOverall(row);
              return (
                <tr key={row.sessionKey} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 md:px-5 py-2 text-gray-500 whitespace-nowrap">{label}</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-semibold ${skillColor(ov)}`}>
                    {ov > 0 ? ov.toFixed(2) : '—'}
                  </td>
                  {visible.map((skill) => {
                    const v = row[skill as keyof SkillRatingsByGameRow] as number;
                    return (
                      <td key={skill} className={`px-3 py-2 text-right tabular-nums ${skillColor(v)}`}>
                        {v > 0 ? v.toFixed(2) : '—'}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {rows.length > 1 && (
              <tr className="bg-gray-50 border-t border-gray-200 font-semibold">
                <td className="px-4 md:px-5 py-2 text-gray-500">Avg</td>
                <td className={`px-3 py-2 text-right tabular-nums ${skillColor(avgOverall)}`}>
                  {avgOverall > 0 ? avgOverall.toFixed(2) : '—'}
                </td>
                {visible.map((skill) => (
                  <td key={skill} className={`px-3 py-2 text-right tabular-nums ${skillColor(avgRow[skill])}`}>
                    {avgRow[skill] > 0 ? avgRow[skill].toFixed(2) : '—'}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── "Playing with X" section ─────────────────────────────────────────────────

function PartnerEffectSection({ data, sessionTeams }: {
  data: DashboardData;
  sessionTeams: Map<string, Map<string, number>>;
}) {
  const { players, skillRatingsByGame } = data;
  const [focalPid, setFocalPid] = useState<string | null>(null);

  const focalPlayer = players.find((p) => p.pid === focalPid);

  return (
    <div className="space-y-6">
      {/* Focal player selector */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-4 md:px-5 py-3 flex flex-wrap items-center gap-3">
        <span className="text-sm text-gray-500 font-medium flex-shrink-0">How does everyone play with:</span>
        <div className="flex flex-wrap gap-2">
          {players.map((p) => {
            const selected = focalPid === p.pid;
            return (
              <button
                key={p.pid}
                onClick={() => setFocalPid(selected ? null : p.pid)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all border ${
                  selected
                    ? 'border-blue-400 bg-blue-50 text-blue-700 shadow-sm'
                    : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300 hover:bg-gray-100'
                }`}
              >
                <span
                  className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold"
                  style={{ backgroundColor: p.color.bg, color: p.color.text }}
                >
                  {p.initials[0]}
                </span>
                {p.name}
              </button>
            );
          })}
        </div>
        {focalPid && (
          <button onClick={() => setFocalPid(null)} className="text-xs text-gray-400 hover:text-gray-600 ml-auto">Clear</button>
        )}
      </div>

      {/* Per-player comparison tables */}
      {focalPlayer && players
        .filter((p) => p.pid !== focalPid)
        .map((player) => {
          const allRows = skillRatingsByGame.filter((r) => r.pid === player.pid);
          if (allRows.length === 0) return null;

          // Games where the focal player was the partner (same team)
          const withRows = allRows.filter((r) => {
            const teams = sessionTeams.get(r.sessionKey);
            if (!teams || !teams.has(focalPid!)) return false;
            return teams.get(focalPid!) === r.team; // same team = partner
          });
          const withoutRows = allRows.filter((r) => {
            const teams = sessionTeams.get(r.sessionKey);
            if (!teams || !teams.has(focalPid!)) return true; // focal not in game
            return teams.get(focalPid!) !== r.team; // focal was opponent
          });

          if (withRows.length === 0) return null; // never played as partners

          const allAvg = buildAvgRow(allRows);
          const withAvg = buildAvgRow(withRows);
          const withoutAvg = withoutRows.length > 0 ? buildAvgRow(withoutRows) : null;
          const allOverall = allAvg.overall;
          const withOverall = withAvg.overall;
          const withoutOverall = withoutAvg ? withoutAvg.overall : 0;
          const visible = visibleSkillsFor(allRows);

          return (
            <div key={player.pid} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 px-4 md:px-5 py-3 border-b border-gray-100">
                <span
                  className="inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold flex-shrink-0"
                  style={{ backgroundColor: player.color.bg, color: player.color.text }}
                >
                  {player.initials}
                </span>
                <span className="font-semibold text-gray-900">{player.name}</span>
                <span className="text-xs text-gray-400 ml-auto">
                  {withRows.length} as partner{withRows.length !== 1 ? 's' : ''}
                  {withoutRows.length > 0 && `, ${withoutRows.length} other`}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs md:text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 md:px-5 py-2 text-gray-500 font-medium w-36"></th>
                      <th className="text-right px-3 py-2 text-gray-500 font-medium">Overall</th>
                      {visible.map((s) => (
                        <th key={s} className="text-right px-3 py-2 text-gray-500 font-medium">{SKILL_LABELS[s]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {/* With focal player */}
                    <tr className="bg-blue-50">
                      <td className="px-4 md:px-5 py-2 text-blue-700 font-semibold whitespace-nowrap">
                        Partner: {focalPlayer.name}
                        <span className="ml-1 font-normal text-blue-400 text-xs">({withRows.length}g)</span>
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums font-semibold ${skillColor(withOverall)}`}>
                        {withOverall > 0 ? withOverall.toFixed(2) : '—'}
                        <Delta val={withOverall} base={allOverall} />
                      </td>
                      {visible.map((skill) => (
                        <td key={skill} className={`px-3 py-2 text-right tabular-nums ${skillColor(withAvg[skill])}`}>
                          {withAvg[skill] > 0 ? withAvg[skill].toFixed(2) : '—'}
                          <Delta val={withAvg[skill]} base={allAvg[skill]} />
                        </td>
                      ))}
                    </tr>

                    {/* Without focal player */}
                    {withoutAvg && withoutRows.length > 0 && (
                      <tr className="bg-gray-50">
                        <td className="px-4 md:px-5 py-2 text-gray-500 font-semibold whitespace-nowrap">
                          Not partner: {focalPlayer.name}
                          <span className="ml-1 font-normal text-gray-400 text-xs">({withoutRows.length}g)</span>
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums font-semibold ${skillColor(withoutOverall)}`}>
                          {withoutOverall > 0 ? withoutOverall.toFixed(2) : '—'}
                          <Delta val={withoutOverall} base={allOverall} />
                        </td>
                        {visible.map((skill) => (
                          <td key={skill} className={`px-3 py-2 text-right tabular-nums ${skillColor(withoutAvg[skill])}`}>
                            {withoutAvg[skill] > 0 ? withoutAvg[skill].toFixed(2) : '—'}
                            <Delta val={withoutAvg[skill]} base={allAvg[skill]} />
                          </td>
                        ))}
                      </tr>
                    )}

                    {/* Overall avg */}
                    <tr className="border-t border-gray-200">
                      <td className="px-4 md:px-5 py-2 text-gray-400 font-semibold">Overall avg</td>
                      <td className={`px-3 py-2 text-right tabular-nums font-semibold ${skillColor(allOverall)}`}>
                        {allOverall > 0 ? allOverall.toFixed(2) : '—'}
                      </td>
                      {visible.map((skill) => (
                        <td key={skill} className={`px-3 py-2 text-right tabular-nums ${skillColor(allAvg[skill])}`}>
                          {allAvg[skill] > 0 ? allAvg[skill].toFixed(2) : '—'}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
    </div>
  );
}

export function PlayerSkillsByGame({ data }: Props) {
  const { players, skillRatingsByGame } = data;
  const multiNight = new Set(skillRatingsByGame.map((r) => r.nightLabel)).size > 1;

  // Build sessionKey → Map<pid, team> for partner detection
  const sessionTeams = new Map<string, Map<string, number>>();
  for (const row of skillRatingsByGame) {
    if (!sessionTeams.has(row.sessionKey)) sessionTeams.set(row.sessionKey, new Map());
    sessionTeams.get(row.sessionKey)!.set(row.pid, row.team);
  }

  return (
    <div className="max-w-7xl mx-auto px-3 md:px-4 py-6 md:py-8 space-y-12">
      {/* Per-game breakdown tables */}
      <div className="space-y-8">
        {players.map((player) => {
          const rows = skillRatingsByGame.filter((r) => r.pid === player.pid);
          if (rows.length === 0) return null;
          return <PlayerTable key={player.pid} player={player} rows={rows} multiNight={multiNight} />;
        })}
      </div>

      {/* "Playing with X" comparison section */}
      <PartnerEffectSection data={data} sessionTeams={sessionTeams} />
    </div>
  );
}
