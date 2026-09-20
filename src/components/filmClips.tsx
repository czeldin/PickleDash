'use client';

import { useEffect, useState } from 'react';
import { CourtShotRow } from '@/types/dashboard';

export const posterUrl = (vid: string) => `https://storage.googleapis.com/pbv-pro/${vid}/poster.jpg`;

// Deep-link into pb.vision. Two modes, because pb.vision's `?shots=RALLY.SHOT`
// form shows ONLY that one shot as a ~4s clip — numBefore/After do NOT extend it
// on load. So:
//  - wholeRally=false → seek to the exact shot (good for rally-ENDING clips: the
//    shot is the point-ender, so a short clip is fine).
//  - wholeRally=true  → `shots=RALLY.1&numBefore=0&numAfter=999`, which pb.vision
//    plays as the entire rally (verified: it auto-skips to the rally start and
//    runs straight through to the end). Used for mid-rally clips so you see the
//    whole point.
export const deepLink = (s: CourtShotRow, wholeRally = false) =>
  wholeRally
    // A shot RANGE (rally.1 to a large upper bound) selects EVERY shot of the
    // rally, so pb.vision plays the whole point start-to-finish. The bare
    // `shots=RALLY.SHOT` form (even with numAfter) only ever selects/plays that
    // ONE shot — a few seconds — which is why clips kept stopping early. The
    // 99 upper bound clamps to the real rally length.
    ? `https://pb.vision/video/${s.vid}/${s.si}/explore?shots=${s.rallyNum}.1-${s.rallyNum}.99`
    : `https://pb.vision/video/${s.vid}/${s.si}/explore?shots=${s.rallyNum}.${s.shotNum}&numBefore=1&numAfter=1`;

export interface Category {
  id: string;
  label: string;
  blurb: string;
  match: (s: CourtShotRow) => boolean;
  good?: boolean; // highlight-reel (green) vs review (amber)
  wholeRally?: boolean; // play the entire point (for mid-rally clips), not just the shot
}

// Outcome-anchored clip queues, not "verdicts". Error queues are gated on
// isFinal so they show only the rally-ENDING fault (the shot that lost the
// point), matching the Why-We-Lost attribution.
export const CATEGORIES: Category[] = [
  {
    id: 'best-shots', label: 'Best shots', good: true,
    blurb: 'Your highest-quality shots by pb.vision’s shot-quality score — the nastiest dinks, drops, resets and put-aways, whether or not they won the point. Best first.',
    match: (s) => (s.quality ?? 0) >= 0.9,
    wholeRally: true, // show the whole point
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
    id: 'epic-defense', label: 'Epic Defense', good: true,
    blurb: 'Real defensive scrambles that won the rally — a reset, or a dig off a hard-hit ball (you got a bang back) that you actually put back in play. Not shanks or routine low balls.',
    // Genuinely epic: a reset, OR a dig off a hard (>=35 mph) incoming ball, not
    // a serve/return, in a rally you won. AND it must be a GOOD get — exclude
    // faults (a dig shanked into the net isn't defense) and very low quality.
    match: (s) => !!s.won && s.shotNum > 2
      && !s.faultNet && !s.faultOut && !s.faultShort && s.endZone !== 'net' && s.endZone !== 'out'
      && (s.quality ?? 0) >= 0.5
      && !!(s.isReset || (s.isDefense && (s.incomingMph ?? 0) >= 35)),
    wholeRally: true, // show the whole point
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
    blurb: 'Dinks/drops of yours that popped up and got attacked (pb.vision "exploited"). The clip plays through to the end of the rally so you can see the attack and how the point finished.',
    match: (s) => s.popup === 'exploited',
    wholeRally: true, // show the whole point
  },
  {
    id: 'fed-winners', label: 'Feeds they put away',
    blurb: 'Your last shot right before the opponents ended the rally with a winner — the ball you gave them that got attacked. The clip includes the shots leading in and plays through the put-away.',
    match: (s) => !!s.setupForOppWinner,
    wholeRally: true, // show the whole point
  },
  {
    id: 'putaway-tries', label: 'Put-away attempts',
    blurb: 'Every ball you went big on. Review queue, not a verdict — watch which ones came back.',
    match: (s) => s.isPutaway,
    wholeRally: true, // show the whole point
  },
];

export const categoryById = (id: string) => CATEGORIES.find((c) => c.id === id);

// pb.vision's own classifications of a shot, as short pills — so you can see
// exactly how a clip is categorized while watching it. Green = good, red = a
// fault/leak, gray = neutral descriptor.
export function shotTags(s: CourtShotRow): { text: string; tone: 'good' | 'bad' | 'neutral' }[] {
  const t: { text: string; tone: 'good' | 'bad' | 'neutral' }[] = [];
  if (s.type) t.push({ text: s.type, tone: 'neutral' });
  t.push({ text: s.won ? 'won rally' : 'lost rally', tone: s.won ? 'good' : 'bad' });
  if (s.isFinal) t.push({ text: 'rally-ending shot', tone: 'neutral' });
  if (s.isPutaway) t.push({ text: 'put-away', tone: 'good' });
  if (s.isAttack) t.push({ text: 'attack / speed-up', tone: 'neutral' });
  if (s.isReset) t.push({ text: 'reset', tone: 'good' });
  else if (s.isDefense) t.push({ text: 'dig', tone: 'neutral' });
  if (s.isDefense && (s.incomingMph ?? 0) >= 35) t.push({ text: `dug a ${Math.round(s.incomingMph!)} mph ball`, tone: 'good' });
  if (s.popup === 'exploited') {
    t.push({ text: 'popped up → attacked', tone: 'bad' });
    // Did the pop-up cost the point, or did we recover? `won` = the popper's
    // team won the rally despite it.
    t.push(s.won ? { text: 'recovered — won anyway', tone: 'good' } : { text: 'cost the point', tone: 'bad' });
  } else if (s.popup === 'potential') {
    t.push({ text: 'popped up (not attacked)', tone: 'neutral' });
  }
  if (s.setupForOppWinner) t.push({ text: 'feed before their winner', tone: 'bad' });
  if (s.faultNet) t.push({ text: 'into the net', tone: 'bad' });
  if (s.faultOut) t.push({ text: 'landed out', tone: 'bad' });
  if (s.faultShort) t.push({ text: 'short of the net', tone: 'bad' });
  if (s.endZone && !['net', 'out', 'short'].includes(s.endZone)) t.push({ text: `landed ${s.endZone}`, tone: 'neutral' });
  if (s.quality != null) t.push({ text: `quality ${Math.round(s.quality * 100)}`, tone: s.quality >= 0.75 ? 'good' : s.quality < 0.4 ? 'bad' : 'neutral' });
  return t;
}

// A player's top-N highlights = their winners (put-aways that ended the rally),
// best-quality first. Ranking by raw quality alone was useless — pb.vision caps
// many ordinary clean shots at 1.0, so a random clean dink outranked an actual
// put-away. Winners are the shots that are genuinely special.
export function topHighlights(courtShots: CourtShotRow[] | undefined, pid: string, n = 4): CourtShotRow[] {
  if (!courtShots) return [];
  return courtShots
    .filter((s) => s.pid === pid && s.isPutaway && s.won)
    .sort((a, b) => (b.quality ?? 0) - (a.quality ?? 0))
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
function ClipModal({ shot, topic, detail, position, wholeRally, hasPrev, hasNext, onPrev, onNext, onClose }: {
  shot: CourtShotRow; topic: string; detail: string; position: string;
  wholeRally?: boolean;
  hasPrev: boolean; hasNext: boolean; onPrev: () => void; onNext: () => void; onClose: () => void;
}) {
  const url = deepLink(shot, wholeRally);
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
        <div className="flex items-start justify-between gap-3 px-4 py-2.5 border-b border-gray-200">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <p className="text-sm font-bold text-gray-900 truncate">{topic}</p>
              <span className="text-xs text-gray-400 tabular-nums shrink-0">{position}</span>
            </div>
            <p className="text-xs text-gray-500 truncate">{detail}</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {shotTags(shot).map((tag, i) => (
                <span
                  key={i}
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                    tag.tone === 'good' ? 'bg-emerald-50 text-emerald-700'
                      : tag.tone === 'bad' ? 'bg-red-50 text-red-600'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {tag.text}
                </span>
              ))}
            </div>
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
export function ClipModalController({ clips, topic, gameNum, startIndex, wholeRally, onClose }: {
  clips: CourtShotRow[];
  topic: string;
  gameNum: Map<string, number>;
  startIndex: number;
  wholeRally?: boolean;
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
      wholeRally={wholeRally}
      hasPrev={idx > 0}
      hasNext={idx < clips.length - 1}
      onPrev={() => setIdx((i) => (i > 0 ? i - 1 : i))}
      onNext={() => setIdx((i) => (i < clips.length - 1 ? i + 1 : i))}
      onClose={onClose}
    />
  );
}
