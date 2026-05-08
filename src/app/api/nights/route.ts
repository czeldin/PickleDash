import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getManifest, saveManifest, saveRawData, NightMeta } from '@/lib/blobStore';
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

function getPreloadedMeta(): NightMeta {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = JSON.parse(readFileSync(join(process.cwd(), 'public/data/night.json'), 'utf-8')) as any;
    const sessions = raw?.data?.sessions ?? [];
    const ge = sessions[0]?.ses?.ge;
    let label = 'Preloaded';
    if (ge && typeof ge === 'number') {
      const d = new Date(ge * 1000);
      label = `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
    }
    const names = new Set<string>();
    for (const s of sessions) {
      for (const pd of s?.pd ?? []) {
        if (pd?.name) names.add(pd.name.trim());
      }
    }
    return {
      id: 'preloaded',
      label,
      sessionCount: sessions.length,
      playerNames: Array.from(names),
      uploadedAt: 0,
      paddleTags: PRELOADED_PADDLE_TAGS,
    };
  } catch {
    return { id: 'preloaded', label: 'Apr 30', sessionCount: 8, playerNames: [], uploadedAt: 0, paddleTags: PRELOADED_PADDLE_TAGS };
  }
}

// GET /api/nights — list all nights (meta only, no raw)
export async function GET() {
  const manifest = await getManifest();
  const preloaded = getPreloadedMeta();
  // Preloaded always first, then uploaded nights newest-first
  const uploaded = manifest.filter((n) => n.id !== 'preloaded').sort((a, b) => b.uploadedAt - a.uploadedAt);
  return NextResponse.json([preloaded, ...uploaded]);
}

// POST /api/nights — upload a new night
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { meta: NightMeta; raw: unknown };
    const { meta, raw } = body;

    // Save raw data to Blob
    await saveRawData(meta.id, raw);

    // Update manifest
    const manifest = await getManifest();
    const updated = [...manifest.filter((n) => n.id !== meta.id), meta];
    await saveManifest(updated);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('POST /api/nights error:', e);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
