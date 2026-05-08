import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  getAllNightMetas, saveNightMeta, saveRawData, getRawData,
  getOrphanedRawIds, getManifest, NightMeta,
} from '@/lib/blobStore';
import { PaddleTag } from '@/types/nights';

// Paddle tags for the preloaded Apr 30 night
const PRELOADED_PADDLE_TAGS: PaddleTag[] = [
  { sessionIdx: 0, playerName: 'Craig Zeldin', paddle: 'Luzz' },
  { sessionIdx: 0, playerName: 'Christian', paddle: 'RPM' },
  { sessionIdx: 1, playerName: 'Craig Zeldin', paddle: 'RPM' },
  { sessionIdx: 1, playerName: 'Christian', paddle: 'Luzz' },
  { sessionIdx: 2, playerName: 'Craig Zeldin', paddle: 'Luzz' },
  { sessionIdx: 2, playerName: 'Christian', paddle: 'RPM' },
  { sessionIdx: 3, playerName: 'Craig Zeldin', paddle: 'Luzz' },
  { sessionIdx: 3, playerName: 'Christian', paddle: 'RPM' },
  { sessionIdx: 4, playerName: 'Craig Zeldin', paddle: 'RPM' },
  { sessionIdx: 5, playerName: 'Christian', paddle: 'RPM' },
  { sessionIdx: 6, playerName: 'Craig Zeldin', paddle: 'RPM' },
  { sessionIdx: 6, playerName: 'Christian', paddle: 'Luzz' },
  { sessionIdx: 7, playerName: 'Craig Zeldin', paddle: 'Luzz' },
  { sessionIdx: 7, playerName: 'Christian', paddle: 'RPM' },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function metaFromRaw(id: string, raw: any): NightMeta {
  const sessions = raw?.data?.sessions ?? [];
  const ge = sessions[0]?.ses?.ge;
  let label = 'Unknown';
  if (ge && typeof ge === 'number') {
    const d = new Date(ge * 1000);
    label = `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
  }
  const names = new Set<string>();
  for (const s of sessions) {
    for (const pd of s?.pd ?? []) {
      if (pd?.name) names.add(pd.name.trim().split(/\s+/)[0]);
    }
  }
  return {
    id,
    label,
    sessionCount: sessions.length,
    playerNames: Array.from(names),
    uploadedAt: Date.now(),
  };
}

function getPreloadedMeta(): NightMeta {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = JSON.parse(readFileSync(join(process.cwd(), 'public/data/night.json'), 'utf-8')) as any;
    return { ...metaFromRaw('preloaded', raw), id: 'preloaded', uploadedAt: 0, paddleTags: PRELOADED_PADDLE_TAGS };
  } catch {
    return { id: 'preloaded', label: 'Apr 30', sessionCount: 8, playerNames: [], uploadedAt: 0, paddleTags: PRELOADED_PADDLE_TAGS };
  }
}

// GET /api/nights — list all nights (meta only, no raw)
export async function GET() {
  // 1. Fetch all per-night meta.json files
  let nights = await getAllNightMetas();

  // 2. Migrate legacy manifest entries that don't have meta.json yet
  if (nights.length === 0) {
    const legacy = await getManifest();
    if (legacy.length > 0) {
      await Promise.all(legacy.map((m) => saveNightMeta(m.id, m)));
      nights = legacy;
    }
  }

  // 3. Recover orphaned nights (raw.json exists but no meta.json — caused by
  //    old race-condition manifest approach)
  const orphanIds = await getOrphanedRawIds();
  if (orphanIds.length > 0) {
    const recovered = await Promise.all(
      orphanIds.map(async (id) => {
        try {
          const raw = await getRawData(id);
          if (!raw) return null;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const meta = metaFromRaw(id, raw as any);
          await saveNightMeta(id, meta); // persist so we don't re-fetch next time
          return meta;
        } catch { return null; }
      })
    );
    nights = [...nights, ...recovered.filter((m): m is NightMeta => m !== null)];
  }

  const preloaded = getPreloadedMeta();

  // Parse "M/D/YY" label into a sortable timestamp
  function labelToDate(label: string): number {
    const m = label.match(/^(\d+)\/(\d+)\/(\d+)$/);
    if (!m) return 0;
    return new Date(2000 + parseInt(m[3]), parseInt(m[1]) - 1, parseInt(m[2])).getTime();
  }

  // Sort all nights (including preloaded) by game date, newest first
  const all = [preloaded, ...nights.filter((n) => n.id !== 'preloaded')]
    .sort((a, b) => labelToDate(b.label) - labelToDate(a.label));

  return NextResponse.json(all);
}

// POST /api/nights — upload a new night
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { meta: NightMeta; raw: unknown };
    const { meta, raw } = body;
    // Save raw and meta independently — no shared manifest = no race condition
    await Promise.all([
      saveRawData(meta.id, raw),
      saveNightMeta(meta.id, meta),
    ]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('POST /api/nights error:', e);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
