'use client';

import { DashboardData, ShotAccuracyRow } from '@/types/dashboard';
import { SortableTable, ColumnDef } from '@/components/SortableTable';
import { SectionCard } from '@/components/SectionCard';

interface Props {
  data: DashboardData;
}

function InNetOutBar({ row }: { row: ShotAccuracyRow }) {
  const total = row.inShots + row.netShots + row.outShots;
  if (total === 0) return <span className="text-gray-400 text-xs">—</span>;
  const inPct = (row.inShots / total) * 100;
  const netPct = (row.netShots / total) * 100;
  const outPct = (row.outShots / total) * 100;
  return (
    <div className="flex items-center gap-1.5 min-w-[140px]">
      <div className="flex-1 flex rounded-full overflow-hidden h-3">
        <div className="bg-green-400" style={{ width: `${inPct}%` }} title={`In: ${row.inShots}`} />
        <div className="bg-red-400" style={{ width: `${netPct}%` }} title={`Net: ${row.netShots}`} />
        <div className="bg-orange-400" style={{ width: `${outPct}%` }} title={`Out: ${row.outShots}`} />
      </div>
      <span className="text-xs text-gray-500 whitespace-nowrap">
        {row.inShots}/{row.netShots}/{row.outShots}
      </span>
    </div>
  );
}

function pctCell(value: number, color = 'text-gray-700') {
  if (value === 0) return <span className="text-gray-400">—</span>;
  return <span className={`text-sm ${color}`}>{(value * 100).toFixed(1)}%</span>;
}

export function ShotAccuracySection({ data }: Props) {
  const { shotAccuracy, players } = data;

  const columns: ColumnDef<ShotAccuracyRow>[] = [
    {
      key: 'inPct',
      header: 'In %',
      getValue: (row) => row.inPct,
      render: (row) => pctCell(row.inPct, 'text-green-700 font-medium'),
    },
    {
      key: 'netPct',
      header: 'Net %',
      getValue: (row) => row.netPct,
      render: (row) => pctCell(row.netPct, 'text-red-600'),
    },
    {
      key: 'outPct',
      header: 'Out %',
      getValue: (row) => row.outPct,
      render: (row) => pctCell(row.outPct, 'text-orange-600'),
    },
    {
      key: 'accuracy',
      header: 'In / Net / Out',
      sortable: false,
      render: (row) => <InNetOutBar row={row} />,
    },
    {
      key: 'totalShots',
      header: 'Total Shots',
      getValue: (row) => row.totalShots,
      render: (row) => <span className="text-sm text-gray-700">{row.totalShots.toLocaleString()}</span>,
    },
  ];

  return (
    <SectionCard title="Shot Accuracy">
      <div className="flex gap-3 text-xs mb-2">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-400 inline-block" />In</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-400 inline-block" />Net</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-400 inline-block" />Out</span>
      </div>
      <SortableTable
        rows={shotAccuracy}
        columns={columns}
        players={players}
        defaultSortKey="inPct"
      />
    </SectionCard>
  );
}
