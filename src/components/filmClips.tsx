'use client';

import { useEffect, useState } from 'react';
import { CourtShotRow } from '@/types/dashboard';

export const posterUrl = (vid: string) => `https://storage.googleapis.com/pbv-pro/${vid}/poster.jpg`;

// Deep-link that seeks pb.vision to THIS specific shot. The `?shots=RALLY.SHOT`
// form seeks the player to that exact shot (verified: shots=46.17 lands the
// video at the shot's hit time); numBefore/After add that many shots of lead-in
// and lead-out so you can see the buildup. (The old form used `.1` — shot 1 —
// with numAfter=999, which played the whole rally instead of the shot. A `?q=`
// URL does not seek on direct load — pb.vision strips it — so it is NOT usable.)
export const deepLink = (s: CourtShotRow, before = 2, after = 1) =>
  `https://pb.vision/video/${s.vid}/${s.si}/explore?shots=${s.rallyNum}.${s.shotNum}&numBefore=${before}&numAfter=${after}`;

export interface Category {
  id: string;
  label: string;
  blurb: string;
  match: (s: CourtShotRow) => boolean;
  good?: boolean; // highlight-reel (green) vs review (amber)
  before?: number; // shots of lead-in in the clip (default 2)
  after?: number;  // shots of lead-out in the clip (default 1)
}

// Outcome-anchored clip queues, not "verdicts". Error queues are gated on
// isFinal so they show only the rally-ENDING fault (the shot that lost the
// point), matching the Why-We-Lost attribution.
export const CATEGORIES: Category[] = [
  {
    id: 'best-shots', label: 'Best shots', good: true,
    blurb: 'Your highest-quality shots by pb.vision’s shot-quality score — the nastiest dinks, drops, resets and put-aways, whether or not they won the point. Best first.',
    match: (s) => (s.quality ?? 0) >= 0.9,
  },
  {
    id: 'clean-winners', label: 'Clean winners', good: true,
    blurb: 'Put-aways that ended the rally cleanly — your highlight reel. Best first.',
    match: (s) => s.isPutaway && s.won,
  },
  {
    id: 'attacks-won', label: 'Attacks won', good: true,
    blurb: 'Your speed-ups and overheads that won the rally — the aggressive highlights. Best first.',
    match: (s) => !!s.isAttack && s.won,
  },
  {
    id: 'net-errors', label: 'Into the net / short',
    blurb: 'Rally-ending shots of yours that didn’t make it over — the net stopped it, or it fell short of the net on your own side. pb.vision can’t reliably tell these two apart near the net, so they’re combined. The group’s biggest loss cause.',
    match: (s) => !!s.isFinal && !!(s.faultNet || s.endZone === 'net' || s.faultShort) && !s.won,
  },
  {
    id: 'out-errors', label: 'Balls hit out',
    blurb: 'Rally-ending shots of yours that landed out (excludes balls headed out that an opponent played anyway).',
    match: (s) => !!s.isFinal && !!(s.faultOut || s.endZone === 'out') && !s.won,
  },
  {
    id: 'popped-up', label: 'Pop-ups you gave up',
    blurb: 'Dinks/drops of yours that popped up and got attacked (pb.vision "exploited"). Where you leaked initiative.',
    match: (s) => s.popup === 'exploited',
  },
  {
    id: 'fed-winners', label: 'Feeds they put away',
    blurb: 'Your last shot right before the opponents ended the rally with a winner — the ball you gave them that got attacked. The clip includes the shots leading in so you can see how the point got set up, through the put-away.',
    match: (s) => !!s.setupForOppWinner,
    before: 4, after: 2, // show the buildup and the finish
  },
  {
    id: 'putaway-tries', label: 'Put-away attempts',
    blurb: 'Every ball you went big on. Review queue, not a verdict — watch which ones came back.',
    match: (s) => s.isPutaway,
  },
];

export const categoryById = (id: string) => CATEGORIES.find((c) => c.id === id);

// A player's top-N best shots by quality (winners break ties). For the quick
// Highlights reel — ranking matters more than a fixed threshold, so this always
// returns the player's genuine best few even on a light night.
export function topHighlights(courtShots: CourtShotRow[] | undefined, pid: string, n = 4): CourtShotRow[] {
  if (!courtShots) return [];
  return courtShots
    .filter((s) => s.pid === pid && s.quality != null)
    .sort((a, b) => (b.quality ?? 0) - (a.quality ?? 0) || Number(b.won) - Number(a.won))
    .slice(0, n);
}

// Build a player's clip queue for one category. Highlight categories (`good`)
// sort BEST-first (top quality leads the reel); review categories sort
// WEAKEST-first (the shots to fix lead).
export function clipsFor(courtShots: CourtShotRow[] | undefined, pid: string | null, cat: Category): CourtShotRow[] {
  if (!courtShots || !pid) return [];
  const dir = cat.good ? -1 : 1; // good → descending (best first)
  return courtShots
    .filter((s) => s.pid === pid && cat.match(s))
    .sort((a, b) => dir * ((a.quality ?? 0) - (b.quality ?? 0)));
}

// Modal that embeds the pb.vision rally in an iframe. pb.vision's explore route
// sends no X-Frame-Options / frame-ancestors block, so the embed loads — but it
// IS their full interactive app (and may want a pb.vision login), so we always
// offer an "open in a new tab" escape hatch and a graceful fallback if the frame
// hasn't shown anything after a beat.
function ClipModal({ shot, topic, detail, position, before, after, hasPrev, hasNext, onPrev, onNext, onClose }: {
  shot: CourtShotRow; topic: string; detail: string; position: string;
  before?: number; after?: number;
  hasPrev: boolean; hasNext: boolean; onPrev: () => void; onNext: () => void; onClose: () => void;
}) {
  const url = deepLink(shot, before, after);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' && hasNext) onNext();
      else if (e.key === 'ArrowLeft' && hasPrev) onPrev();
    };
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => setSlow(true), 4000);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); clearTimeout(t); document.body.style.overflow = prevOverflow; };
  }, [onClose, onNext, onPrev, hasNext, hasPrev]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full h-full max-w-[1600px] max-h-[96vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <p className="text-sm font-bold text-gray-900 truncate">{topic}</p>
              <span className="text-xs text-gray-400 tabular-nums shrink-0">{position}</span>
            </div>
            <p className="text-xs text-gray-500 truncate">{detail}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onPrev}
              disabled={!hasPrev}
              className="px-2.5 py-1 text-xs font-medium rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Previous clip"
            >
              ← Prev
            </button>
            <button
              onClick={onNext}
              disabled={!hasNext}
              className="px-2.5 py-1 text-xs font-medium rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Next clip"
            >
              Next →
            </button>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-blue-600 hover:underline whitespace-nowrap ml-1"
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
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
            <p className="text-sm text-gray-300 max-w-md">
              {slow
                ? <>Still loading. If it doesn&apos;t appear, <a href={url} target="_blank" rel="noreferrer" className="text-blue-400 underline">open it on pb.vision ↗</a>.</>
                : 'Loading the rally…'}
            </p>
          </div>
          <iframe
            src={url}
            title={`${topic} — ${detail}`}
            className="absolute inset-0 w-full h-full border-0"
            allow="fullscreen; autoplay"
          />
        </div>
      </div>
    </div>
  );
}

// Self-contained controller: give it a clip queue, a topic, a game-number lookup
// and a starting index; it owns prev/next paging and renders the modal. Used by
// both Film Room and the Why-We-Lost bars.
export function ClipModalController({ clips, topic, gameNum, startIndex, before, after, onClose }: {
  clips: CourtShotRow[];
  topic: string;
  gameNum: Map<string, number>;
  startIndex: number;
  before?: number;
  after?: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(startIndex);
  const s = clips[idx];
  useEffect(() => { setIdx(startIndex); }, [startIndex]);
  if (!s) return null;
  return (
    <ClipModal
      key={`${s.vid}-${s.si}-${s.rallyNum}-${s.shotNum}`}
      shot={s}
      topic={topic}
      detail={`G${gameNum.get(s.sessionKey) ?? '?'} · Rally ${s.rallyNum} · shot ${s.shotNum} · ${s.type}${s.won ? ' · won' : ' · lost'}`}
      position={`${idx + 1} / ${clips.length}`}
      before={before}
      after={after}
      hasPrev={idx > 0}
      hasNext={idx < clips.length - 1}
      onPrev={() => setIdx((i) => (i > 0 ? i - 1 : i))}
      onNext={() => setIdx((i) => (i < clips.length - 1 ? i + 1 : i))}
      onClose={onClose}
    />
  );
}
