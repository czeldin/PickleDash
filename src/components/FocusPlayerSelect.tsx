'use client';

import { useState, useRef, useEffect } from 'react';
import { PlayerMeta } from '@/types/dashboard';
import { PlayerAvatar } from './PlayerAvatar';

interface Props {
  players: PlayerMeta[];
  /** pid of the focus player, or null for the neutral (all-players) view. */
  focusPid: string | null;
  onChange: (pid: string | null) => void;
}

/**
 * Single-select "focus player" picker. Distinct from PlayerFilter (which hides
 * players): the focus player is *whose story* the personal views tell — the
 * Overview callouts and Film Room review queues key off it. Defaults to null,
 * a viewer-neutral comparative dashboard, so no one is assumed to be "me".
 */
export function FocusPlayerSelect({ players, focusPid, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const focus = players.find((p) => p.pid === focusPid) ?? null;

  function pick(pid: string | null) {
    onChange(pid);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm shadow-sm ${
          focus
            ? 'border-blue-300 bg-blue-50 text-blue-800'
            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
        }`}
        title="Choose whose personal story & clips to show"
      >
        <span className="text-gray-400">🎯</span>
        {focus ? (
          <span className="inline-flex items-center gap-1.5">
            <PlayerAvatar player={focus} size="sm" />
            <span className="font-medium">{focus.name}</span>
          </span>
        ) : (
          <span className="font-medium">Focus: everyone</span>
        )}
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute top-full mt-1 right-0 z-50 bg-white border border-gray-200 rounded-xl shadow-lg min-w-[220px] py-1">
          <button
            onClick={() => pick(null)}
            className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left border-b border-gray-100 ${
              focusPid === null ? 'bg-gray-50' : ''
            }`}
          >
            <span className="text-sm font-semibold text-gray-700">Everyone (comparative)</span>
          </button>
          {players.map((p) => (
            <button
              key={p.pid}
              onClick={() => pick(p.pid)}
              className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left ${
                focusPid === p.pid ? 'bg-blue-50' : ''
              }`}
            >
              <PlayerAvatar player={p} size="sm" />
              <span className="text-sm text-gray-700">{p.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
