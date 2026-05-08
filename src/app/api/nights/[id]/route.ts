import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getManifest, saveManifest, getRawData, deleteNightFromBlob } from '@/lib/blobStore';
import { PaddleTag } from '@/types/nights';

// GET /api/nights/[id] — full night with raw data
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  if (id === 'preloaded') {
    try {
      const raw = JSON.parse(readFileSync(join(process.cwd(), 'public/data/night.json'), 'utf-8'));
      // Return with preloaded meta baked in — client builds Night object
      return NextResponse.json({ id: 'preloaded', raw });
    } catch {
      return NextResponse.json({ error: 'Preloaded night not found' }, { status: 404 });
    }
  }

  const [manifest, raw] = await Promise.all([getManifest(), getRawData(id)]);
  const meta = manifest.find((n) => n.id === id);

  if (!meta || !raw) {
    return NextResponse.json({ error: 'Night not found' }, { status: 404 });
  }

  return NextResponse.json({ ...meta, raw });
}

// PATCH /api/nights/[id] — update meta fields (label, paddleTags)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  if (id === 'preloaded') {
    // Paddle tags for preloaded are hardcoded server-side; ignore
    return NextResponse.json({ ok: true });
  }

  try {
    const updates = await req.json() as { label?: string; paddleTags?: PaddleTag[] };
    const manifest = await getManifest();
    const updated = manifest.map((n) =>
      n.id === id ? { ...n, ...updates } : n
    );
    await saveManifest(updated);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('PATCH /api/nights/[id] error:', e);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}

// DELETE /api/nights/[id] — remove a night
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  if (id === 'preloaded') {
    return NextResponse.json({ ok: true }); // cannot delete preloaded
  }

  try {
    const manifest = await getManifest();
    await saveManifest(manifest.filter((n) => n.id !== id));
    await deleteNightFromBlob(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/nights/[id] error:', e);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}
