'use client';

import { useMemo, useState } from 'react';
import { DashboardData } from '@/types/dashboard';
import { SectionCard } from '@/components/SectionCard';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { topHighlights, posterUrl, ClipModalController } from '@/components/filmClips';

interface Props { data: DashboardData }

// Per-player highlight reel: each player's best few shots (by pb.vision quality),
// best-first, click to watch. Only shows on augmented nights (needs courtShots).
export function HighlightsSection({ data }: Props) {
  const courtShots = data.courtShots;
  const [film, setFilm] = useState<{ pid: string } | null>(null);

  const gameNum = useMemo(() => {
    const m = new Map<string, number>();
    data.sessions.forEach((s, i) => m.set(s.key, i + 1));
    return m;
  }, [data.sessions]);

  // Precompute each player's top shots; only include players who have any.
  const reels = useMemo(() => {
    if (!courtShots) return [];
    return data.players
      .map((p) => ({ p, clips: topHighlights(courtShots, p.pid, 4) }))
      .filter((r) => r.clips.length > 0);
  }, [courtShots, data.players]);

  if (!courtShots || reels.length === 0) return null;

  return (
    <SectionCard title="Highlights">
      <p className="text-xs text-gray-400 -mt-1.5 mb-3">
        Each player&apos;s best shots this selection, by pb.vision&apos;s shot-quality score. Click one to watch.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reels.map(({ p, clips }) => (
          <div key={p.pid} className="bg-white rounded-xl border border-gray-100 p-3">
            <div className="flex items-center gap-2 mb-2">
              <PlayerAvatar player={p} size="sm" />
              <span className="text-sm font-semibold text-gray-800">{p.name}</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {clips.map((s, i) => (
                <button
                  key={`${s.vid}-${s.rallyNum}-${s.shotNum}`}
                  type="button"
                  onClick={() => setFilm({ pid: p.pid })}
                  className="relative aspect-video rounded-md overflow-hidden bg-gray-200 group"
                  aria-label={`Watch ${p.name} highlight ${i + 1}`}
                  title={`G${gameNum.get(s.sessionKey) ?? '?'} · Rally ${s.rallyNum} · ${s.type}${s.won ? ' · won' : ''} · q${Math.round((s.quality ?? 0) * 100)}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={posterUrl(s.vid)}
                    alt=""
                    loading="lazy"
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
                  />
                  <span className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                    <span className="text-white opacity-0 group-hover:opacity-100 text-lg">▶</span>
                  </span>
                  <span className="absolute bottom-0.5 left-1 text-[9px] font-semibold text-white drop-shadow">
                    q{Math.round((s.quality ?? 0) * 100)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {film && (() => {
        const clips = topHighlights(courtShots, film.pid, 4);
        if (clips.length === 0) return null;
        const name = data.players.find((p) => p.pid === film.pid)?.name ?? 'Player';
        return (
          <ClipModalController
            clips={clips}
            topic={`${name}: Highlights`}
            gameNum={gameNum}
            startIndex={0}
            before={2}
            after={2}
            onClose={() => setFilm(null)}
          />
        );
      })()}
    </SectionCard>
  );
}
