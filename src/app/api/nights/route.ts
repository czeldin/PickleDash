import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  getAllNightMetas, getCachedNightMetas, invalidateNightsCache,
  saveNightMeta, saveRawData, getRawData,
  getOrphanedRawIds, getManifest, NightMeta,
} from '@/lib/blobStore';
import { ensureAugmentedForNight } from '@/lib/augmentedInsights';
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
  const preloaded = getPreloadedMeta();

  // 1. Fetch all per-night meta.json files. If B2 is unreachable (e.g. the daily
  //    Class B cap / a 429), DON'T silently drop the user's nights — fall back to
  //    the last cached list, or signal an error so the client can retry, rather
  //    than showing only the preloaded night as if everything else vanished.
  let nights: NightMeta[];
  try {
    nights = await getAllNightMetas();
  } catch (e) {
    console.error('GET /api/nights: B2 list failed:', e);
    const cached = getCachedNightMetas();
    if (cached) {
      nights = cached; // serve stale rather than "lose" nights
    } else {
      // No cache yet and B2 is down — tell the client it's a transient storage
      // error (with the one night we can always serve) instead of pretending
      // the rest don't exist.
      return NextResponse.json(
        { error: 'storage_unavailable', nights: [preloaded] },
        { status: 503 },
      );
    }
  }

  // 2. Migrate legacy manifest entries that don't have meta.json yet. Only when
  //    we truly have no nights — and this reads B2 too, so gate it.
  if (nights.length === 0) {
    try {
      const legacy = await getManifest();
      if (legacy.length > 0) {
        await Promise.all(legacy.map((m) => saveNightMeta(m.id, m)));
        invalidateNightsCache();
        nights = legacy;
      }
    } catch { /* transient — leave nights as-is */ }
  }

  // 3. Recover orphaned nights (raw.json exists but no meta.json — from the old
  //    race-condition manifest approach). This is an extra B2 list + raw reads,
  //    so only run it when we found NO meta-backed nights (i.e. a genuine repair
  //    case), not on every normal load.
  if (nights.length === 0) {
    try {
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
        const found = recovered.filter((m): m is NightMeta => m !== null);
        if (found.length) { invalidateNightsCache(); nights = found; }
      }
    } catch { /* transient */ }
  }

  // Parse "M/D/YY" label into a sortable timestamp
  function labelToDate(label: string): number {
    const m = label.match(/^(\d+)\/(\d+)\/(\d+)$/);
    if (!m) return 0;
    return new Date(2000 + parseInt(m[3]), parseInt(m[1]) - 1, parseInt(m[2])).getTime();
  }

  // Normalize player names to first name only (handles legacy full-name entries)
  function normalizeNames(meta: NightMeta): NightMeta {
    return { ...meta, playerNames: meta.playerNames.map((n) => n.trim().split(/\s+/)[0]) };
  }

  // Sort all nights (including preloaded) by game date, newest first
  const all = [preloaded, ...nights.filter((n) => n.id !== 'preloaded')]
    .sort((a, b) => labelToDate(b.label) - labelToDate(a.label))
    .map(normalizeNames);

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
    invalidateNightsCache(); // so the new night shows up on the next list
    // Best-effort: fetch & cache pb.vision augmented insights for this night's
    // sessions so the richer parser has real coordinates/putaways. Never blocks
    // or fails the upload — backfill can fill any gaps later.
    let augmented: Awaited<ReturnType<typeof ensureAugmentedForNight>> | null = null;
    try {
      augmented = await ensureAugmentedForNight(meta.id, raw);
    } catch (e) {
      console.error('augmented fetch on upload failed (non-fatal):', e);
    }
    return NextResponse.json({ ok: true, augmented });
  } catch (e) {
    console.error('POST /api/nights error:', e);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
