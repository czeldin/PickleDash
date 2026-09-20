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

// Deep-link that seeks pb.vision to THIS specific shot. The `?shots=RALLY.SHOT`
// form seeks the player to that exact shot (verified: shots=46.17 lands the
// video at the shot's hit time); numBefore/After give a 1-shot lead-in/out.
// (The old form used `.1` — shot 1 — with numAfter=999, which played the whole
// rally instead of the shot. A `?q=` URL does not seek on direct load — pb.vision
// strips it — so it is NOT usable here.)
const deepLink = (s: CourtShotRow) =>
  `https://pb.vision/video/${s.vid}/${s.si}/explore?shots=${s.rallyNum}.${s.shotNum}&numBefore=1&numAfter=1`;

// Modal that embeds the pb.vision rally in an iframe. pb.vision's explore route
// sends no X-Frame-Options / frame-ancestors block, so the embed loads — but it
// IS their full interactive app (and may want a pb.vision login), so we always
// offer an "open in a new tab" escape hatch and a graceful fallback if the frame
// hasn't shown anything after a beat.
function ClipModal({ shot, topic, detail, position, hasPrev, hasNext, onPrev, onNext, onClose }: {
  shot: CourtShotRow; topic: string; detail: string; position: string;
  hasPrev: boolean; hasNext: boolean; onPrev: () => void; onNext: () => void; onClose: () => void;
}) {
  const url = deepLink(shot);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' && hasNext) onNext();
      else if (e.key === 'ArrowLeft' && hasPrev) onPrev();
    };
    document.addEventListener('keydown', onKey);
    // If the iframe hasn't fired onLoad in a few seconds (blocked embed / login
    // wall), surface the "open in a tab" hint more prominently.
    const t = setTimeout(() => setSlow(true), 4000);
    // Lock background scroll while the modal is open.
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
          {/* Fallback sits behind the iframe; the iframe covers it once it paints. */}
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
    id: 'net-errors', label: 'Into the net / short',
    blurb: 'Rally-ending shots of yours that didn’t make it over — the net stopped it, or it fell short of the net on your own side. pb.vision can’t reliably tell these two apart near the net, so they’re combined. The group’s biggest loss cause.',
    match: (s) => !!s.isFinal && !!(s.faultNet || s.endZone === 'net' || s.faultShort) && !s.won,
  },
  {
    id: 'out-errors', label: 'Balls hit out',
    blurb: 'Rally-ending shots of yours that landed out (excludes balls headed out that an opponent played anyway).',
    match: (s) => !!s.isFinal && (s.faultOut || s.endZone === 'out') && !s.won,
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
  // Index of the open clip within the current `clips` queue (null = closed).
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

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
              onClick={() => { setCatId(c.id); setActiveIdx(null); }}
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
              onClick={() => setActiveIdx(i)}
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

      {activeIdx != null && clips[activeIdx] && (() => {
        const s = clips[activeIdx];
        return (
          <ClipModal
            key={`${s.vid}-${s.si}-${s.rallyNum}-${s.shotNum}`}
            shot={s}
            topic={`${focusName}: ${cat.label}`}
            detail={`G${gameNum.get(s.sessionKey) ?? '?'} · Rally ${s.rallyNum} · shot ${s.shotNum} · ${s.type}${s.won ? ' · won' : ' · lost'}`}
            position={`${activeIdx + 1} / ${clips.length}`}
            hasPrev={activeIdx > 0}
            hasNext={activeIdx < clips.length - 1}
            onPrev={() => setActiveIdx((i) => (i != null && i > 0 ? i - 1 : i))}
            onNext={() => setActiveIdx((i) => (i != null && i < clips.length - 1 ? i + 1 : i))}
            onClose={() => setActiveIdx(null)}
          />
        );
      })()}
    </SectionCard>
  );
}
