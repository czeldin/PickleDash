import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getAllNightMetas, getRawData } from '@/lib/blobStore';
import { ensureAugmentedForNight, EnsureResult } from '@/lib/augmentedInsights';

export const maxDuration = 300; // allow time to fetch many sessions

/**
 * POST /api/augmented/backfill — fetch & cache augmented insights for every
 * uploaded night that doesn't have them yet. Idempotent: already-cached sessions
 * are skipped. Pass { force: true } to re-fetch everything.
 *
 * Also handles the built-in "preloaded" night (from public/data/night.json).
 */
export async function POST(req: Request) {
  let force = false;
  try {
    const body = await req.json().catch(() => ({}));
    force = !!body?.force;
  } catch { /* no body */ }

  const results: EnsureResult[] = [];

  // Preloaded night
  try {
    const raw = JSON.parse(
      readFileSync(join(process.cwd(), 'public/data/night.json'), 'utf-8'),
    );
    results.push(await ensureAugmentedForNight('preloaded', raw, { force }));
  } catch { /* no preloaded file */ }

  // Uploaded nights
  const metas = await getAllNightMetas();
  for (const meta of metas.filter((m) => m.id !== 'preloaded')) {
    const raw = await getRawData(meta.id);
    if (!raw) continue;
    results.push(await ensureAugmentedForNight(meta.id, raw, { force }));
  }

  const totals = results.reduce(
    (a, r) => ({
      total: a.total + r.total,
      fetched: a.fetched + r.fetched,
      cached: a.cached + r.cached,
      failed: a.failed + r.failed.length,
    }),
    { total: 0, fetched: 0, cached: 0, failed: 0 },
  );

  return NextResponse.json({ ok: true, totals, results });
}
