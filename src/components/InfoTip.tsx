'use client';

import { useState, useRef, useEffect } from 'react';

/**
 * A small, clearly-visible info icon that shows a styled tooltip on hover or
 * tap. Unlike the native `title` attribute, the popover is readable, appears
 * instantly, and works on touch (tap to toggle).
 */
export function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <span
      ref={ref}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        aria-label="More info"
        className="inline-flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors align-middle"
      >
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden>
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="8" cy="4.7" r="0.95" fill="currentColor" />
          <rect x="7.2" y="6.8" width="1.6" height="5" rx="0.8" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 bottom-full mb-1.5 -translate-x-1/2 z-50 w-56 rounded-lg bg-gray-900 text-white text-xs leading-snug px-3 py-2 shadow-lg pointer-events-none"
        >
          {text}
          <span className="absolute left-1/2 top-full -translate-x-1/2 -mt-px border-4 border-transparent border-t-gray-900" />
        </span>
      )}
    </span>
  );
}
