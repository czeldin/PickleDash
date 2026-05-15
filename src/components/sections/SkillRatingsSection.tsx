'use client';

import { useState } from 'react';
import { DashboardData, SkillRatingsRow, SkillRatingsByGameRow } from '@/types/dashboard';
import { SortableTable, ColumnDef } from '@/components/SortableTable';
import { SectionCard } from '@/components/SectionCard';

interface Props {
  data: DashboardData;
}

const SKILLS: (keyof Omit<SkillRatingsRow, 'pid'>)[] = [
  'serve', 'return', 'offense', 'defense', 'agility', 'consistency',
];

function overallScore(row: Pick<SkillRatingsRow, 'serve' | 'return' | 'offense' | 'defense' | 'agility' | 'consistency'>): number {
  const vals = [row.serve, row.return, row.offense, row.defense, row.agility, row.consistency].filter((v) => v > 0);
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
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
  const { skillRatings, players } = data;

  const overallVals = skillRatings.map(overallScore).filter((v) => v > 0);
  const overallMax = overallVals.length ? Math.max(...overallVals) : -1;
  const overallMin = overallVals.length ? Math.min(...overallVals) : -1;

  const skillMins: Record<string, number> = {};
  const skillMaxs: Record<string, number> = {};
  for (const skill of SKILLS) {
    const vals = skillRatings.map((r) => r[skill]).filter((v) => v > 0);
    skillMins[skill] = vals.length ? Math.min(...vals) : -1;
    skillMaxs[skill] = vals.length ? Math.max(...vals) : -1;
  }

  const columns: ColumnDef<SkillRatingsRow>[] = [
    {
      key: 'overall',
      header: 'Overall',
      getValue: (row) => overallScore(row),
      render: (row) => {
        const v = overallScore(row);
        return colorPill(v, v === overallMax && overallMax > 0, v === overallMin && overallMin > 0);
      },
    },
    ...SKILLS.map((skill) => ({
      key: skill,
      header: skill.charAt(0).toUpperCase() + skill.slice(1),
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
    <SectionCard title="Skill Ratings Breakdown">
      <SortableTable
        rows={skillRatings}
        columns={columns}
        players={players}
        defaultSortKey="overall"
      />
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

type SortCol = 'time' | 'overall' | typeof SKILLS[number];
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
  for (const skill of SKILLS) avg[skill] = weightedAvg(rows, skill);
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
      av = overallScore(a as unknown as SkillRatingsRow);
      bv = overallScore(b as unknown as SkillRatingsRow);
    } else {
      av = a[sortCol as keyof SkillRatingsByGameRow] as number;
      bv = b[sortCol as keyof SkillRatingsByGameRow] as number;
    }
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  const avgRow = buildAvgRow(rows);
  const avgOverall = overallScore(avgRow as unknown as SkillRatingsRow);

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
              {SKILLS.map((s) => (
                <SortableHeader key={s} label={s.charAt(0).toUpperCase() + s.slice(1)} col={s} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sorted.map((row) => {
              const label = multiNight ? `${row.nightLabel} · ${row.sessionName}` : row.sessionName;
              const ov = overallScore(row as unknown as SkillRatingsRow);
              return (
                <tr key={row.sessionKey} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 md:px-5 py-2 text-gray-500 whitespace-nowrap">{label}</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-semibold ${skillColor(ov)}`}>
                    {ov > 0 ? ov.toFixed(2) : '—'}
                  </td>
                  {SKILLS.map((skill) => {
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
                {SKILLS.map((skill) => (
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

// ─── Partner quality table ────────────────────────────────────────────────────

function PartnerQualityTable({ data, sessionTeams }: {
  data: DashboardData;
  sessionTeams: Map<string, Map<string, number>>;
}) {
  const { players, skillRatingsByGame } = data;

  // Build a lookup: sessionKey + pid → overall score
  const gameOverall = new Map<string, number>();
  for (const row of skillRatingsByGame) {
    const ov = overallScore(row as unknown as SkillRatingsRow);
    if (ov > 0) gameOverall.set(`${row.sessionKey}:${row.pid}`, ov);
  }

  // For each player, collect all partner overall scores across all games
  // partnerScores[pid] = { weightedSum, totalWeight } (weighted by partner's shot count)
  const partnerScores: Record<string, { weightedSum: number; totalWeight: number }> = {};

  for (const row of skillRatingsByGame) {
    const teams = sessionTeams.get(row.sessionKey);
    if (!teams) continue;
    const myTeam = teams.get(row.pid);
    if (myTeam === undefined) continue;

    for (const [partnerPid, partnerTeam] of teams.entries()) {
      if (partnerPid === row.pid || partnerTeam !== myTeam) continue;
      const partnerRow = skillRatingsByGame.find((r) => r.pid === partnerPid && r.sessionKey === row.sessionKey);
      if (!partnerRow) continue;
      const partnerOv = gameOverall.get(`${row.sessionKey}:${partnerPid}`);
      if (!partnerOv || partnerRow.shotCount <= 0) continue;

      if (!partnerScores[row.pid]) partnerScores[row.pid] = { weightedSum: 0, totalWeight: 0 };
      partnerScores[row.pid].weightedSum += partnerOv * partnerRow.shotCount;
      partnerScores[row.pid].totalWeight += partnerRow.shotCount;
    }
  }

  const rows = players
    .map((p) => {
      const s = partnerScores[p.pid];
      return { player: p, avg: s && s.totalWeight > 0 ? s.weightedSum / s.totalWeight : 0 };
    })
    .filter((r) => r.avg > 0)
    .sort((a, b) => b.avg - a.avg);

  if (rows.length === 0) return null;

  const vals = rows.map((r) => r.avg);
  const maxVal = Math.max(...vals);
  const minVal = Math.min(...vals);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 md:px-5 py-3 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900">Avg Partner Rating</h3>
        <p className="text-xs text-gray-400 mt-0.5">Average overall rating of each player&apos;s partners</p>
      </div>
      <table className="w-full text-xs md:text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            <th className="text-left px-4 md:px-5 py-2 text-gray-500 font-medium">Player</th>
            <th className="text-right px-4 md:px-5 py-2 text-gray-500 font-medium">Partner Avg</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map(({ player, avg }) => (
            <tr key={player.pid} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 md:px-5 py-2.5">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: player.color.bg, color: player.color.text }}
                  >
                    {player.initials}
                  </span>
                  <span className="text-gray-700 font-medium">{player.name}</span>
                </div>
              </td>
              <td className="px-4 md:px-5 py-2.5 text-right tabular-nums">
                {colorPill(avg, avg === maxVal && maxVal > 0, avg === minVal && minVal > 0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
          const allOverall = overallScore(allAvg as unknown as SkillRatingsRow);
          const withOverall = overallScore(withAvg as unknown as SkillRatingsRow);
          const withoutOverall = withoutAvg ? overallScore(withoutAvg as unknown as SkillRatingsRow) : 0;

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
                      {SKILLS.map((s) => (
                        <th key={s} className="text-right px-3 py-2 text-gray-500 font-medium capitalize">{s}</th>
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
                      {SKILLS.map((skill) => (
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
                        {SKILLS.map((skill) => (
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
                      {SKILLS.map((skill) => (
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

      {/* Partner quality table */}
      <PartnerQualityTable data={data} sessionTeams={sessionTeams} />

      {/* "Playing with X" comparison section */}
      <PartnerEffectSection data={data} sessionTeams={sessionTeams} />
    </div>
  );
}
