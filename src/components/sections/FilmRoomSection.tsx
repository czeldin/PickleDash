'use client';

import { useEffect, useMemo, useState } from 'react';
import { DashboardData, CourtShotRow } from '@/types/dashboard';
import { SectionCard } from '@/components/SectionCard';
import { FocusPlayerSelect } from '@/components/FocusPlayerSelect';

const posterUrl = (vid: string) => `https://storage.googleapis.com/pbv-pro/${vid}/poster.jpg`;

interface Props {
  data: DashboardData;
  focusPid: string | null;
  onFocusChange: (pid: string | null) => void;
}

const deepLink = (s: CourtShotRow) =>
  `https://pb.vision/video/${s.vid}/${s.si}/explore?shots=${s.rallyNum}.1&numBefore=0&numAfter=999`;

// Modal that embeds the pb.vision rally in an iframe. pb.vision's explore route
// sends no X-Frame-Options / frame-ancestors block, so the embed loads — but it
// IS their full interactive app (and may want a pb.vision login), so we always
// offer an "open in a new tab" escape hatch and a graceful fallback if the frame
// hasn't shown anything after a beat.
function ClipModal({ shot, label, onClose }: { shot: CourtShotRow; label: string; onClose: () => void }) {
  const url = deepLink(shot);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    // If the iframe hasn't fired onLoad in a few seconds (blocked embed / login
    // wall), surface the "open in a tab" hint more prominently.
    const t = setTimeout(() => setSlow(true), 4000);
    // Lock background scroll while the modal is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); clearTimeout(t); document.body.style.overflow = prevOverflow; };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200">
          <p className="text-sm font-semibold text-gray-800 truncate">{label}</p>
          <div className="flex items-center gap-3 shrink-0">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-blue-600 hover:underline whitespace-nowrap"
            >
              Open on pb.vision ↗
            </a>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-gray-400 hover:text-gray-700 text-xl leading-none px-1"
            >
              ×
            </button>
          </div>
        </div>
        <div className="relative flex-1 bg-black min-h-[50vh]">
          {/* Fallback sits behind the iframe; the iframe covers it once it paints. */}
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
            <p className="text-sm text-gray-300">
              {slow
                ? <>Taking a while to load. If nothing appears, <a href={url} target="_blank" rel="noreferrer" className="text-blue-400 underline">open it on pb.vision ↗</a> — it may need you to be signed in there.</>
                : 'Loading the rally…'}
            </p>
          </div>
          <iframe
            src={url}
            title={label}
            className="absolute inset-0 w-full h-full border-0"
            allow="fullscreen; autoplay"
          />
        </div>
      </div>
    </div>
  );
}

interface Category {
  id: string;
  label: string;
  blurb: string;
  match: (s: CourtShotRow) => boolean;
  good?: boolean; // highlight-reel (green) vs review (amber)
}

// Categories tie to the analysis: outcome-anchored clip queues, not "verdicts".
const CATEGORIES: Category[] = [
  {
    id: 'clean-winners', label: 'Clean winners', good: true,
    blurb: 'Put-aways that ended the rally cleanly — your highlight reel.',
    match: (s) => s.isPutaway && s.won,
  },
  {
    id: 'net-errors', label: 'Balls into the net',
    blurb: 'Your shots that ended in the net — the group’s biggest loss cause. Worth a look for pattern.',
    match: (s) => s.endZone === 'net' && !s.won,
  },
  {
    id: 'out-errors', label: 'Balls hit out',
    blurb: 'Your shots that sailed out.',
    match: (s) => s.endZone === 'out' && !s.won,
  },
  {
    id: 'popped-up', label: 'Pop-ups you gave up',
    blurb: 'Dinks/drops of yours that popped up and got attacked (pb.vision "exploited"). Where you leaked initiative.',
    match: (s) => s.popup === 'exploited',
  },
  {
    id: 'putaway-tries', label: 'Put-away attempts',
    blurb: 'Every ball you went big on. Review queue, not a verdict — watch which ones came back.',
    match: (s) => s.isPutaway,
  },
];

export function FilmRoomSection({ data, focusPid, onFocusChange }: Props) {
  const courtShots = data.courtShots;
  const [catId, setCatId] = useState<string>('clean-winners');
  const [activeClip, setActiveClip] = useState<CourtShotRow | null>(null);

  // Game number per session (G1 = first game listed), for labeling each clip.
  const gameNum = useMemo(() => {
    const m = new Map<string, number>();
    data.sessions.forEach((s, i) => m.set(s.key, i + 1));
    return m;
  }, [data.sessions]);

  const cat = CATEGORIES.find((c) => c.id === catId)!;
  const clips = useMemo(() => {
    if (!courtShots || !focusPid) return [];
    return courtShots
      .filter((s) => s.pid === focusPid && cat.match(s))
      .sort((a, b) => (a.quality ?? 0) - (b.quality ?? 0)); // weakest first for review queues
  }, [courtShots, focusPid, cat]);

  if (!courtShots || courtShots.length === 0) {
    return (
      <SectionCard title="Film Room">
        <p className="text-sm text-gray-400 py-6 text-center">
          Film Room needs pb.vision augmented insights (shot outcomes + video links). Available on newer nights.
        </p>
      </SectionCard>
    );
  }

  if (!focusPid) {
    return (
      <SectionCard title="Film Room" action={<FocusPlayerSelect players={data.players} focusPid={focusPid} onChange={onFocusChange} />}>
        <p className="text-sm text-gray-500 py-6 text-center">
          Pick a <strong>focus player</strong> to build their personal clip queues — winners, errors, and pop-ups,
          each linked straight to the rally on pb.vision.
        </p>
      </SectionCard>
    );
  }

  const focusName = data.players.find((p) => p.pid === focusPid)?.name ?? 'Player';

  return (
    <SectionCard title="Film Room" action={<FocusPlayerSelect players={data.players} focusPid={focusPid} onChange={onFocusChange} />}>
      <p className="text-xs text-gray-400 -mt-1.5 mb-3">
        Clip queues for <strong>{focusName}</strong>. Click a clip to watch the rally in a pop-up (or open it on pb.vision). Review queues are sorted
        weakest-first; these are shots to <em>watch</em>, not a scorecard.
      </p>
      <div className="flex flex-wrap gap-2 mb-4">
        {CATEGORIES.map((c) => {
          const n = courtShots.filter((s) => s.pid === focusPid && c.match(s)).length;
          return (
            <button
              key={c.id}
              onClick={() => setCatId(c.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border ${
                catId === c.id
                  ? c.good ? 'bg-green-600 text-white border-green-600' : 'bg-gray-800 text-white border-gray-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {c.label} <span className={catId === c.id ? 'opacity-80' : 'text-gray-400'}>{n}</span>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-gray-500 mb-3">{cat.blurb}</p>

      {clips.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">No clips in this category for {focusName}.</p>
      ) : (
        <div className="space-y-1.5">
          {clips.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActiveClip(s)}
              className="w-full text-left flex items-center justify-between gap-3 px-2 py-2 rounded-lg bg-gray-50 hover:bg-blue-50 border border-gray-100 hover:border-blue-200 transition-colors group"
            >
              <span className="flex items-center gap-3 text-sm text-gray-700 min-w-0">
                <img
                  src={posterUrl(s.vid)}
                  alt=""
                  loading="lazy"
                  className="w-16 h-10 rounded object-cover bg-gray-200 shrink-0"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
                />
                <span className="min-w-0">
                  <span className="text-gray-400 font-medium mr-1.5">G{gameNum.get(s.sessionKey) ?? '?'}</span>
                  Rally {s.rallyNum} · shot {s.shotNum}
                  <span className="text-gray-400 ml-2">{s.type}</span>
                  {s.endZone && s.endZone !== 'kitchen' && s.endZone !== 'deep' && s.endZone !== 'mid' && s.endZone !== 'short' && (
                    <span className="text-red-500 ml-2">{s.endZone}</span>
                  )}
                </span>
              </span>
              <span className="inline-flex items-center gap-2">
                {s.quality != null && (
                  <span className="text-xs text-gray-400 tabular-nums">q {Math.round(s.quality * 100)}</span>
                )}
                <span className={`text-xs font-medium ${s.won ? 'text-green-600' : 'text-red-500'}`}>{s.won ? 'won' : 'lost'}</span>
                <span className="text-blue-600 text-sm group-hover:underline">watch →</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {activeClip && (
        <ClipModal
          shot={activeClip}
          label={`${focusName} · G${gameNum.get(activeClip.sessionKey) ?? '?'} · Rally ${activeClip.rallyNum} · ${activeClip.type}${activeClip.won ? ' · won' : ' · lost'}`}
          onClose={() => setActiveClip(null)}
        />
      )}
    </SectionCard>
  );
}
