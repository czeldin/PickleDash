/**
 * Server-only Vercel Blob helpers.
 * Import only from API routes (never from client components).
 */
import { put, del, list } from '@vercel/blob';
import { PaddleTag } from '@/types/nights';

export interface NightMeta {
  id: string;
  label: string;
  sessionCount: number;
  playerNames: string[];
  uploadedAt: number;
  paddleTags?: PaddleTag[];
}

const MANIFEST_PATH = 'nights/manifest.json';

// ─── Manifest helpers ───────────────────────────────────────────────────────

export async function getManifest(): Promise<NightMeta[]> {
  try {
    const { blobs } = await list({ prefix: MANIFEST_PATH });
    const blob = blobs.find((b) => b.pathname === MANIFEST_PATH);
    if (!blob) return [];
    const res = await fetch(blob.url, { cache: 'no-store' });
    if (!res.ok) return [];
    return (await res.json()) as NightMeta[];
  } catch {
    return [];
  }
}

export async function saveManifest(nights: NightMeta[]): Promise<void> {
  await put(MANIFEST_PATH, JSON.stringify(nights), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

// ─── Raw data helpers ────────────────────────────────────────────────────────

export async function saveRawData(id: string, raw: unknown): Promise<void> {
  await put(`nights/${id}/raw.json`, JSON.stringify(raw), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function getRawData(id: string): Promise<unknown | null> {
  try {
    const { blobs } = await list({ prefix: `nights/${id}/raw.json` });
    const blob = blobs.find((b) => b.pathname === `nights/${id}/raw.json`);
    if (!blob) return null;
    const res = await fetch(blob.url, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function deleteNightFromBlob(id: string): Promise<void> {
  try {
    const { blobs } = await list({ prefix: `nights/${id}/` });
    if (blobs.length > 0) {
      await del(blobs.map((b) => b.url));
    }
  } catch {
    // ignore
  }
}
