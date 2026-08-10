'use client';

import Image from 'next/image';
import { DashboardData } from '@/types/dashboard';

interface Props {
  data: DashboardData;
}

export function HighlightsSection({ data }: Props) {
  const { highlights } = data;
  if (!highlights || highlights.length === 0) return null;

  const top5 = highlights.slice(0, 5);

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-gray-800 border-b border-gray-200 pb-2">
        Best Rallies
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {top5.map((h, i) => (
          <a
            key={h.url}
            href={h.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-300 overflow-hidden transition-all flex flex-col"
          >
            {/* Thumbnail */}
            <div className="relative w-full aspect-video bg-gray-100 overflow-hidden">
              <Image
                src={h.thumbnailUrl}
                alt={`Rally #${h.rallyNum}`}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-300"
                unoptimized
              />
              {/* Rank badge */}
              <div className="absolute top-2 left-2 bg-black/60 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                #{i + 1}
              </div>
              {/* Play button overlay */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="bg-black/50 rounded-full w-10 h-10 flex items-center justify-center">
                  <span className="text-white text-lg ml-0.5">▶</span>
                </div>
              </div>
            </div>

            {/* Info */}
            <div className="p-3 flex flex-col gap-1 flex-1">
              <p className="text-xs font-semibold text-gray-800 leading-tight truncate">{h.sessionName}</p>
              <p className="text-xs text-gray-400">{h.nightLabel}</p>
              <div className="flex items-center justify-between mt-auto pt-2">
                <span className="text-xs text-gray-500">
                  Rally <span className="font-semibold text-gray-700">#{h.rallyNum}</span>
                  &nbsp;·&nbsp;{h.shotCount} shots
                </span>
                <span className="text-xs font-bold text-emerald-600">
                  {(h.avgQuality * 100).toFixed(0)} pts
                </span>
              </div>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
