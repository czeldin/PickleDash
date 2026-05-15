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

function skillColor(value: number): string {
  if (value <= 0) return 'text-gray-400';
  if (value >= 0.7) return 'text-green-700 font-semibold';
  if (value >= 0.5) return 'text-gray-700';
  return 'text-red-600';
}

function ByGameTab({ data }: { data: DashboardData }) {
  const { players, skillRatingsByGame } = data;
  const multiNight = new Set(skillRatingsByGame.map((r) => r.nightLabel)).size > 1;

  return (
    <div className="space-y-6">
      {players.map((player) => {
        const rows = skillRatingsByGame.filter((r) => r.pid === player.pid);
        if (rows.length === 0) return null;

        return (
          <div key={player.pid}>
            <div className="flex items-center gap-2 mb-2">
              <span
                className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold flex-shrink-0"
                style={{ backgroundColor: player.color.bg, color: player.color.text }}
              >
                {player.initials}
              </span>
              <span className="font-semibold text-gray-800 text-sm">{player.name}</span>
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-100">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-3 py-2 text-gray-500 font-medium w-32">Game</th>
                    {SKILLS.map((s) => (
                      <th key={s} className="text-right px-3 py-2 text-gray-500 font-medium capitalize">{s}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((row) => {
                    const label = multiNight
                      ? `${row.nightLabel} · ${row.sessionName}`
                      : row.sessionName;
                    return (
                      <tr key={row.sessionKey} className="hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{label}</td>
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
                  {/* Average row */}
                  {rows.length > 1 && (
                    <tr className="bg-gray-50 border-t border-gray-200">
                      <td className="px-3 py-2 text-gray-500 font-semibold">Avg</td>
                      {SKILLS.map((skill) => {
                        const vals = rows.map((r) => r[skill as keyof SkillRatingsByGameRow] as number).filter((v) => v > 0);
                        const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
                        return (
                          <td key={skill} className={`px-3 py-2 text-right tabular-nums font-semibold ${skillColor(avg)}`}>
                            {avg > 0 ? avg.toFixed(2) : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SkillRatingsSection({ data }: Props) {
  const { skillRatings, players } = data;
  const [tab, setTab] = useState<'overall' | 'by-game'>('overall');

  const skillMins: Record<string, number> = {};
  const skillMaxs: Record<string, number> = {};
  for (const skill of SKILLS) {
    const vals = skillRatings.map((r) => r[skill]).filter((v) => v > 0);
    skillMins[skill] = vals.length ? Math.min(...vals) : -1;
    skillMaxs[skill] = vals.length ? Math.max(...vals) : -1;
  }

  const columns: ColumnDef<SkillRatingsRow>[] = SKILLS.map((skill) => ({
    key: skill,
    header: skill.charAt(0).toUpperCase() + skill.slice(1),
    getValue: (row) => row[skill],
    render: (row) =>
      colorPill(
        row[skill],
        row[skill] === skillMaxs[skill] && skillMaxs[skill] > 0,
        row[skill] === skillMins[skill] && skillMins[skill] > 0
      ),
  }));

  return (
    <SectionCard title="Skill Ratings Breakdown">
      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-100">
        <button
          onClick={() => setTab('overall')}
          className={`px-3 py-1.5 text-sm font-medium rounded-t transition-colors ${
            tab === 'overall'
              ? 'text-blue-600 border-b-2 border-blue-500 -mb-px'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Overall
        </button>
        <button
          onClick={() => setTab('by-game')}
          className={`px-3 py-1.5 text-sm font-medium rounded-t transition-colors ${
            tab === 'by-game'
              ? 'text-blue-600 border-b-2 border-blue-500 -mb-px'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          By Game
        </button>
      </div>

      {tab === 'overall' ? (
        <SortableTable
          rows={skillRatings}
          columns={columns}
          players={players}
          defaultSortKey="offense"
        />
      ) : (
        <ByGameTab data={data} />
      )}
    </SectionCard>
  );
}
