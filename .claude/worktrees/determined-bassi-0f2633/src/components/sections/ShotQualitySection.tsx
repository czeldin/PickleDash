'use client';

import { DashboardData, ShotQualityRow } from '@/types/dashboard';
import { SortableTable, ColumnDef } from '@/components/SortableTable';
import { SectionCard } from '@/components/SectionCard';

interface Props {
  data: DashboardData;
}

function QualityBar({ row }: { row: ShotQualityRow }) {
  const other = Math.max(0, 100 - row.excellentPct - row.poorPct);
  if (row.excellentPct === 0 && row.poorPct === 0) {
    return <span className="text-gray-400 text-xs">—</span>;
  }
  return (
    <div className="flex rounded-full overflow-hidden h-3 min-w-[100px] flex-1">
      <div className="bg-green-400" style={{ width: `${row.excellentPct}%` }} title={`Excellent: ${row.excellentPct.toFixed(1)}%`} />
      <div className="bg-gray-200" style={{ width: `${other}%` }} title={`Other: ${other.toFixed(1)}%`} />
      <div className="bg-red-400" style={{ width: `${row.poorPct}%` }} title={`Poor: ${row.poorPct.toFixed(1)}%`} />
    </div>
  );
}

export function ShotQualitySection({ data }: Props) {
  const { shotQuality, players } = data;

  const columns: ColumnDef<ShotQualityRow>[] = [
    {
      key: 'bar',
      header: 'Excellent / Other / Poor',
      sortable: false,
      render: (row) => <QualityBar row={row} />,
    },
    {
      key: 'excellentPct',
      header: 'Excellent %',
      getValue: (row) => row.excellentPct,
      render: (row) => (
        <span className="text-sm text-green-700 font-semibold">
          {row.excellentPct > 0 ? `${row.excellentPct.toFixed(1)}%` : '—'}
          <span className="text-gray-400 font-normal text-xs ml-1">({row.excellentCount})</span>
        </span>
      ),
    },
    {
      key: 'poorPct',
      header: 'Poor %',
      getValue: (row) => row.poorPct,
      render: (row) => (
        <span className="text-sm text-red-600 font-semibold">
          {row.poorPct > 0 ? `${row.poorPct.toFixed(1)}%` : '—'}
          <span className="text-gray-400 font-normal text-xs ml-1">({row.poorCount})</span>
        </span>
      ),
    },
  ];

  return (
    <SectionCard title="Shot Quality">
      <div className="flex gap-3 text-xs mb-2">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-400 inline-block" />Excellent</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-gray-200 inline-block border border-gray-300" />Other</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-400 inline-block" />Poor</span>
      </div>
      <SortableTable
        rows={shotQuality}
        columns={columns}
        players={players}
        defaultSortKey="excellentPct"
      />
    </SectionCard>
  );
}
