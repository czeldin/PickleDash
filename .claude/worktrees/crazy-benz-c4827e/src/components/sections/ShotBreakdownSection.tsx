'use client';

import { DashboardData, ShotBreakdownRow } from '@/types/dashboard';
import { SortableTable, ColumnDef } from '@/components/SortableTable';
import { SectionCard } from '@/components/SectionCard';

interface Props {
  data: DashboardData;
}

function DropDriveBar({ row }: { row: ShotBreakdownRow }) {
  const total = row.dropCount + row.driveCount;
  if (total === 0) return <span className="text-gray-400 text-xs">—</span>;
  return (
    <div className="flex items-center gap-1.5 min-w-[100px]">
      <div className="flex-1 flex rounded-full overflow-hidden h-3">
        <div
          className="bg-blue-400"
          style={{ width: `${row.dropPct}%` }}
          title={`Drop: ${row.dropCount}`}
        />
        <div
          className="bg-amber-400"
          style={{ width: `${row.drivePct}%` }}
          title={`Drive: ${row.driveCount}`}
        />
      </div>
    </div>
  );
}

function breakdownCols(): ColumnDef<ShotBreakdownRow>[] {
  return [
    {
      key: 'bar',
      header: 'Drop / Drive',
      sortable: false,
      render: (row) => <DropDriveBar row={row} />,
    },
    {
      key: 'dropPct',
      header: 'Drop %',
      getValue: (row) => row.dropPct,
      render: (row) => (
        <span className="text-sm text-blue-700">
          {row.dropCount + row.driveCount > 0 ? `${row.dropPct.toFixed(0)}%` : '—'}
          <span className="text-gray-400 text-xs ml-1">({row.dropCount})</span>
        </span>
      ),
    },
    {
      key: 'drivePct',
      header: 'Drive %',
      getValue: (row) => row.drivePct,
      render: (row) => (
        <span className="text-sm text-amber-700">
          {row.dropCount + row.driveCount > 0 ? `${row.drivePct.toFixed(0)}%` : '—'}
          <span className="text-gray-400 text-xs ml-1">({row.driveCount})</span>
        </span>
      ),
    },
  ];
}

export function ShotBreakdownSection({ data }: Props) {
  const { thirdShot, fifthShot, players } = data;

  return (
    <SectionCard title="3rd Shot &amp; 5th Shot Breakdown">
      <div className="flex gap-3 text-xs mb-2">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-400 inline-block" />Drop</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />Drive</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">3rd Shot</h3>
          <SortableTable
            rows={thirdShot}
            columns={breakdownCols()}
            players={players}
            defaultSortKey="dropPct"
          />
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">5th Shot</h3>
          <SortableTable
            rows={fifthShot}
            columns={breakdownCols()}
            players={players}
            defaultSortKey="dropPct"
          />
        </div>
      </div>
    </SectionCard>
  );
}
