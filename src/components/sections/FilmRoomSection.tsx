'use client';

import { useMemo, useState } from 'react';
import { DashboardData } from '@/types/dashboard';
import { SectionCard } from '@/components/SectionCard';
import { FocusPlayerSelect } from '@/components/FocusPlayerSelect';
import { CATEGORIES, posterUrl, clipsFor, ClipModalController } from '@/components/filmClips';

interface Props {
  data: DashboardData;
  focusPid: string | null;
  onFocusChange: (pid: string | null) => void;
}

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
  const clips = useMemo(() => clipsFor(courtShots, focusPid, cat), [courtShots, focusPid, cat]);

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
    <SectionCard title="Film Room">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <FocusPlayerSelect players={data.players} focusPid={focusPid} onChange={onFocusChange} />
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

      {activeIdx != null && (
        <ClipModalController
          clips={clips}
          topic={`${focusName}: ${cat.label}`}
          gameNum={gameNum}
          startIndex={activeIdx}
          onClose={() => setActiveIdx(null)}
        />
      )}
    </SectionCard>
  );
}
