'use client';

import { useState, useRef, useEffect } from 'react';
import { Night } from '@/types/nights';

interface Props {
  nights: Night[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function NightFilter({ nights, selectedIds, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const allSelected = selectedIds.length === nights.length;

  function toggleAll() { onChange(allSelected ? [] : nights.map((n) => n.id)); }
  function toggle(id: string) { onChange(selectedIds.includes(id) ? selectedIds.filter((i) => i !== id) : [...selectedIds, id]); }

  const label = allSelected
    ? 'All nights'
    : selectedIds.length === 0
    ? 'No nights'
    : selectedIds.length === 1
    ? nights.find((n) => n.id === selectedIds[0])?.label ?? '1 night'
    : `${selectedIds.length} nights`;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50 shadow-sm"
      >
        <span className="text-gray-400">🌙</span>
        <span className="font-medium">{label}</span>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-gray-200 rounded-xl shadow-lg min-w-[200px] py-1">
          <label className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            <span className="text-sm font-semibold text-gray-700">All nights</span>
          </label>
          {nights.map((n) => (
            <label key={n.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" checked={selectedIds.includes(n.id)} onChange={() => toggle(n.id)} />
              <div>
                <span className="text-sm text-gray-700 font-medium">{n.label}</span>
                <span className="text-xs text-gray-400 ml-1.5">{n.sessionCount} games</span>
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
