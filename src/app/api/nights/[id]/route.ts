import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getNightMeta, saveNightMeta, getRawData, deleteNightFromBlob } from '@/lib/blobStore';
import { PaddleTag } from '@/types/nights';

// GET /api/nights/[id] — full night with raw data
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  if (id === 'preloaded') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = JSON.parse(readFileSync(join(process.cwd(), 'public/data/night.json'), 'utf-8')) as any;
      const sessions = raw?.data?.sessions ?? [];
      const ge = sessions[0]?.ses?.ge;
      let label = '4/30/26';
      if (ge && typeof ge === 'number') {
        const d = new Date(ge * 1000);
        label = `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
      }
      return NextResponse.json({ id: 'preloaded', label, sessionCount: sessions.length, raw });
    } catch {
      return NextResponse.json({ error: 'Preloaded night not found' }, { status: 404 });
    }
  }

  const [meta, raw] = await Promise.all([getNightMeta(id), getRawData(id)]);

  if (!raw) {
    return NextResponse.json({ error: 'Night not found' }, { status: 404 });
  }

  return NextResponse.json({ ...(meta ?? { id }), raw });
}

// PATCH /api/nights/[id] — update meta fields (label, paddleTags)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  if (id === 'preloaded') {
    return NextResponse.json({ ok: true });
  }

  try {
    const updates = await req.json() as { label?: string; paddleTags?: PaddleTag[] };
    const existing = await getNightMeta(id);
    if (!existing) return NextResponse.json({ error: 'Night not found' }, { status: 404 });
    await saveNightMeta(id, { ...existing, ...updates });
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
  if (id === 'preloaded') return NextResponse.json({ ok: true });

  try {
    await deleteNightFromBlob(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/nights/[id] error:', e);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}
