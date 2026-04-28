'use client';

import { DashboardData, SkillRatingsRow } from '@/types/dashboard';
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

export function SkillRatingsSection({ data }: Props) {
  const { skillRatings, players } = data;

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
      <SortableTable
        rows={skillRatings}
        columns={columns}
        players={players}
        defaultSortKey="offense"
      />
    </SectionCard>
  );
}
