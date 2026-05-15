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
    if (sortCol === 'time') {
      av = a.timestamp; bv = b.timestamp;
    } else if (sortCol === 'overall') {
      av = overallScore(a as unknown as SkillRatingsRow);
      bv = overallScore(b as unknown as SkillRatingsRow);
    } else {
      av = a[sortCol as keyof SkillRatingsByGameRow] as number;
      bv = b[sortCol as keyof SkillRatingsByGameRow] as number;
    }
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  // Weighted avg (by shotCount) to match the Dashboard tab's aggregation
  const avgRow: Record<string, number> = {};
  for (const skill of SKILLS) {
    const active = rows.filter((r) => (r[skill as keyof SkillRatingsByGameRow] as number) > 0);
    const totalW = active.reduce((s, r) => s + r.shotCount, 0);
    avgRow[skill] = totalW > 0
      ? active.reduce((s, r) => s + (r[skill as keyof SkillRatingsByGameRow] as number) * r.shotCount, 0) / totalW
      : 0;
  }
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

export function PlayerSkillsByGame({ data }: Props) {
  const { players, skillRatingsByGame } = data;
  const multiNight = new Set(skillRatingsByGame.map((r) => r.nightLabel)).size > 1;

  return (
    <div className="max-w-7xl mx-auto px-3 md:px-4 py-6 md:py-8 space-y-8">
      {players.map((player) => {
        const rows = skillRatingsByGame.filter((r) => r.pid === player.pid);
        if (rows.length === 0) return null;
        return <PlayerTable key={player.pid} player={player} rows={rows} multiNight={multiNight} />;
      })}
    </div>
  );
}
