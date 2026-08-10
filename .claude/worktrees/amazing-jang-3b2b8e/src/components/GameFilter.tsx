'use client';

import { useState, useRef, useEffect } from 'react';
import { SessionInfo } from '@/types/dashboard';

interface Props {
  sessions: SessionInfo[];        // all sessions from selected nights
  selectedKeys: Set<string>;
  onChange: (keys: Set<string>) => void;
}

export function GameFilter({ sessions, selectedKeys, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const allSelected = selectedKeys.size === sessions.length;

  function toggleAll() {
    onChange(allSelected ? new Set() : new Set(sessions.map((s) => s.key)));
  }
  function toggle(key: string) {
    const next = new Set(selectedKeys);
    if (next.has(key)) { next.delete(key); } else { next.add(key); }
    onChange(next);
  }

  // Group sessions by night
  const byNight = new Map<string, { label: string; sessions: SessionInfo[] }>();
  for (const s of sessions) {
    if (!byNight.has(s.nightId)) byNight.set(s.nightId, { label: s.nightLabel, sessions: [] });
    byNight.get(s.nightId)!.sessions.push(s);
  }

  const label = allSelected
    ? 'All games'
    : selectedKeys.size === 0
    ? 'No games'
    : `${selectedKeys.size} game${selectedKeys.size !== 1 ? 's' : ''}`;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50 shadow-sm"
      >
        <span className="text-gray-400">🎮</span>
        <span className="font-medium">{label}</span>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-gray-200 rounded-xl shadow-lg min-w-[260px] py-1 max-h-96 overflow-y-auto">
          <label className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            <span className="text-sm font-semibold text-gray-700">All games</span>
          </label>
          {Array.from(byNight.entries()).map(([nightId, group]) => (
            <div key={nightId}>
              <div className="px-3 pt-2 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                {group.label}
              </div>
              {group.sessions.map((s) => (
                <label key={s.key} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer pl-5">
                  <input type="checkbox" checked={selectedKeys.has(s.key)} onChange={() => toggle(s.key)} />
                  <span className="text-sm text-gray-600">{s.name}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
