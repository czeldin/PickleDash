'use client';

import { useMemo, useState } from 'react';
import { DashboardData, CourtShotRow } from '@/types/dashboard';
import { SectionCard } from '@/components/SectionCard';
import { FocusPlayerSelect } from '@/components/FocusPlayerSelect';
import { ShotThumbnail } from '@/components/ShotThumbnail';

interface Props {
  data: DashboardData;
  focusPid: string | null;
  onFocusChange: (pid: string | null) => void;
}

const deepLink = (s: CourtShotRow) =>
  `https://pb.vision/video/${s.vid}/${s.si}/explore?shots=${s.rallyNum}.1&numBefore=0&numAfter=999`;

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
        Clip queues for <strong>{focusName}</strong>. Each link opens the rally on pb.vision. Review queues are sorted
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
            <a
              key={i}
              href={deepLink(s)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-gray-50 hover:bg-blue-50 border border-gray-100 hover:border-blue-200 transition-colors group"
            >
              <span className="flex items-center gap-2.5 text-sm text-gray-700">
                <ShotThumbnail shot={s} />
                <span>
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
            </a>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
