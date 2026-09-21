'use client';

import { useState, ReactNode } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from '@/components/ui/table';
import { PlayerMeta } from '@/types/dashboard';
import { PlayerAvatar } from './PlayerAvatar';

export interface ColumnDef<T> {
  key: string;
  header: ReactNode;
  sortable?: boolean;
  render: (row: T, player: PlayerMeta) => ReactNode;
  getValue?: (row: T) => number;
  // Fixed column width in px. When ANY column sets this, the table switches to a
  // fixed layout so metric columns can share one uniform width.
  width?: number;
  // Draw a full-height vertical divider on this column's LEFT edge (header +
  // every body cell) to separate metric groups.
  dividerBefore?: boolean;
}

interface Props<T extends { pid: string }> {
  rows: T[];
  columns: ColumnDef<T>[];
  players: PlayerMeta[];
  defaultSortKey?: string;
  defaultSortDir?: 'asc' | 'desc';
}

const thBase: React.CSSProperties = {
  color: 'white',
  fontWeight: 600,
  fontSize: '0.875rem',
  padding: '10px 8px',
  textAlign: 'left',
  whiteSpace: 'nowrap',
  backgroundColor: '#334155', // slate-700
};

export function SortableTable<T extends { pid: string }>({
  rows,
  columns,
  players,
  defaultSortKey,
  defaultSortDir = 'desc',
}: Props<T>) {
  const [sortKey, setSortKey] = useState<string | null>(defaultSortKey ?? null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultSortDir);
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  const playerMap = new Map<string, PlayerMeta>(players.map((p) => [p.pid, p]));

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const sortedRows = [...rows].sort((a, b) => {
    if (!sortKey) return 0;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.getValue) return 0;
    const va = col.getValue(a);
    const vb = col.getValue(b);
    return sortDir === 'desc' ? vb - va : va - vb;
  });

  function sortIcon(key: string) {
    if (sortKey !== key) return <span style={{ color: '#94a3b8', marginLeft: 4 }}>↕</span>;
    return <span style={{ color: 'white', marginLeft: 4 }}>{sortDir === 'desc' ? '↓' : '↑'}</span>;
  }

  // When any column requests a fixed width, lay the table out fixed so the metric
  // columns can share one uniform width instead of auto-sizing to content.
  const fixed = columns.some((c) => c.width != null);
  const divider = '2px solid #cbd5e1'; // slate-300, full-height column separator

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <Table style={fixed ? { tableLayout: 'fixed', width: '100%' } : undefined}>
        <thead>
          <tr>
            <th style={{ ...thBase, width: 160 }}>Player</th>
            {columns.map((col) => {
              const sortable = col.sortable !== false;
              const isHovered = hoverKey === col.key;
              return (
                <th
                  key={col.key}
                  style={{
                    ...thBase,
                    backgroundColor: isHovered ? '#475569' : '#334155',
                    cursor: sortable ? 'pointer' : 'default',
                    userSelect: sortable ? 'none' : undefined,
                    width: col.width,
                    borderLeft: col.dividerBefore ? divider : undefined,
                  }}
                  onClick={() => sortable && handleSort(col.key)}
                  onMouseEnter={() => sortable && setHoverKey(col.key)}
                  onMouseLeave={() => setHoverKey(null)}
                >
                  <span style={{ display: 'flex', alignItems: 'center' }}>
                    {col.header}
                    {sortable && sortIcon(col.key)}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <TableBody>
          {sortedRows.map((row) => {
            const player = playerMap.get(row.pid);
            if (!player) return null;
            return (
              <TableRow key={row.pid} className="group hover:bg-gray-50">
                <TableCell>
                  <div className="flex items-center gap-2">
                    <PlayerAvatar player={player} size="sm" />
                    <span className="text-sm font-medium text-gray-800">{player.name}</span>
                  </div>
                </TableCell>
                {columns.map((col) => (
                  <TableCell key={col.key} style={col.dividerBefore ? { borderLeft: divider } : undefined}>
                    {col.render(row, player)}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
