'use client';

import { DashboardData, DepthRow } from '@/types/dashboard';
import { SortableTable, ColumnDef } from '@/components/SortableTable';
import { SectionCard } from '@/components/SectionCard';

interface Props {
  data: DashboardData;
}

function DepthBar({ row }: { row: DepthRow }) {
  const total = row.deepPct + row.medPct + row.shallowPct;
  if (total === 0) return <span className="text-gray-400 text-xs">—</span>;
  return (
    <div className="flex-1 flex rounded-full overflow-hidden h-3 min-w-[80px]">
      <div className="bg-blue-500" style={{ width: `${row.deepPct}%` }} title={`Deep: ${row.deepPct.toFixed(0)}%`} />
      <div className="bg-blue-300" style={{ width: `${row.medPct}%` }} title={`Med: ${row.medPct.toFixed(0)}%`} />
      <div className="bg-blue-100" style={{ width: `${row.shallowPct}%` }} title={`Shallow: ${row.shallowPct.toFixed(0)}%`} />
    </div>
  );
}

function depthCols(): ColumnDef<DepthRow>[] {
  return [
    {
      key: 'bar',
      header: 'Deep / Med / Shallow',
      sortable: false,
      render: (row) => <DepthBar row={row} />,
    },
    {
      key: 'deepPct',
      header: 'Deep %',
      getValue: (row) => row.deepPct,
      render: (row) => (
        <span className="text-sm text-blue-700">
          {row.deepPct > 0 ? `${row.deepPct.toFixed(0)}%` : '—'}
        </span>
      ),
    },
    {
      key: 'medPct',
      header: 'Med %',
      getValue: (row) => row.medPct,
      render: (row) => (
        <span className="text-sm text-blue-500">
          {row.medPct > 0 ? `${row.medPct.toFixed(0)}%` : '—'}
        </span>
      ),
    },
    {
      key: 'shallowPct',
      header: 'Shallow %',
      getValue: (row) => row.shallowPct,
      render: (row) => (
        <span className="text-sm text-gray-500">
          {row.shallowPct > 0 ? `${row.shallowPct.toFixed(0)}%` : '—'}
        </span>
      ),
    },
  ];
}

export function DepthSection({ data }: Props) {
  const { serveDepth, returnDepth, players } = data;

  return (
    <SectionCard title="Serve Depth &amp; Return Depth">
      <div className="flex gap-4 text-xs mb-2">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />Deep</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-300 inline-block" />Med</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-100 border border-blue-200 inline-block" />Shallow</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Serve Depth</h3>
          <SortableTable
            rows={serveDepth}
            columns={depthCols()}
            players={players}
            defaultSortKey="deepPct"
          />
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Return Depth</h3>
          <SortableTable
            rows={returnDepth}
            columns={depthCols()}
            players={players}
            defaultSortKey="deepPct"
          />
        </div>
      </div>
    </SectionCard>
  );
}
