'use client';

import { useState, useRef, useEffect } from 'react';
import { PlayerMeta } from '@/types/dashboard';
import { PlayerAvatar } from './PlayerAvatar';

interface Props {
  players: PlayerMeta[];
  selectedPids: Set<string>;
  onChange: (pids: Set<string>) => void;
}

export function PlayerFilter({ players, selectedPids, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const allSelected = selectedPids.size === players.length;

  function toggleAll() {
    onChange(allSelected ? new Set() : new Set(players.map((p) => p.pid)));
  }
  function toggle(pid: string) {
    const next = new Set(selectedPids);
    if (next.has(pid)) { next.delete(pid); } else { next.add(pid); }
    onChange(next);
  }

  const hiddenCount = players.length - selectedPids.size;
  const label = hiddenCount === 0 ? 'All players' : hiddenCount === players.length ? 'No players' : `${hiddenCount} hidden`;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50 shadow-sm"
      >
        <span className="text-gray-400">👤</span>
        <span className="font-medium">{label}</span>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-gray-200 rounded-xl shadow-lg min-w-[200px] py-1">
          <label className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            <span className="text-sm font-semibold text-gray-700">All players</span>
          </label>
          {players.map((p) => (
            <label key={p.pid} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" checked={selectedPids.has(p.pid)} onChange={() => toggle(p.pid)} />
              <PlayerAvatar player={p} size="sm" />
              <span className="text-sm text-gray-700">{p.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
