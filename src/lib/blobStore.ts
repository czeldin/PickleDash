/**
 * Server-only Vercel Blob helpers.
 * Import only from API routes (never from client components).
 *
 * Architecture: each night has two blobs:
 *   nights/{id}/meta.json  — NightMeta (small, no raw data)
 *   nights/{id}/raw.json   — full pb.vision JSON
 *
 * No shared manifest file → no race conditions on concurrent uploads.
 */
import { put, del, list } from '@vercel/blob';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';
import { PaddleTag } from '@/types/nights';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export interface NightMeta {
  id: string;
  label: string;
  sessionCount: number;
  playerNames: string[];
  uploadedAt: number;
  paddleTags?: PaddleTag[];
}

// ─── Meta helpers ─────────────────────────────────────────────────────────────

export async function saveNightMeta(id: string, meta: NightMeta): Promise<void> {
  await put(`nights/${id}/meta.json`, JSON.stringify(meta), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function getNightMeta(id: string): Promise<NightMeta | null> {
  try {
    const { blobs } = await list({ prefix: `nights/${id}/meta.json` });
    const blob = blobs.find((b) => b.pathname === `nights/${id}/meta.json`);
    if (!blob) return null;
    const res = await fetch(blob.url, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as NightMeta;
  } catch { return null; }
}

/** List all uploaded nights by scanning meta.json files in parallel. */
export async function getAllNightMetas(): Promise<NightMeta[]> {
  try {
    const { blobs } = await list({ prefix: 'nights/' });
    const metaBlobs = blobs.filter((b) => b.pathname.endsWith('/meta.json'));
    if (metaBlobs.length === 0) return [];
    const results = await Promise.all(
      metaBlobs.map(async (b) => {
        try {
          const res = await fetch(b.url, { cache: 'no-store' });
          if (!res.ok) return null;
          return (await res.json()) as NightMeta;
        } catch { return null; }
      })
    );
    return results.filter((m): m is NightMeta => m !== null);
  } catch { return []; }
}

/**
 * Find nights that have raw.json but no meta.json (caused by old race-condition
 * manifest approach). Returns their IDs so callers can repair them.
 */
export async function getOrphanedRawIds(): Promise<string[]> {
  try {
    const { blobs } = await list({ prefix: 'nights/' });
    const rawIds = new Set(
      blobs
        .filter((b) => b.pathname.endsWith('/raw.json') || b.pathname.endsWith('/raw.json.gz'))
        .map((b) => b.pathname.split('/')[1])
    );
    const metaIds = new Set(
      blobs
        .filter((b) => b.pathname.endsWith('/meta.json'))
        .map((b) => b.pathname.split('/')[1])
    );
    return [...rawIds].filter((id) => !metaIds.has(id));
  } catch { return []; }
}

// ─── Raw data helpers ─────────────────────────────────────────────────────────

export async function saveRawData(id: string, raw: unknown): Promise<void> {
  const compressed = await gzipAsync(Buffer.from(JSON.stringify(raw), 'utf-8'));
  await put(`nights/${id}/raw.json.gz`, compressed, {
    access: 'public',
    contentType: 'application/gzip',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function getRawData(id: string): Promise<unknown | null> {
  try {
    // Try compressed first
    const { blobs: gzBlobs } = await list({ prefix: `nights/${id}/raw.json.gz` });
    const gzBlob = gzBlobs.find((b) => b.pathname === `nights/${id}/raw.json.gz`);
    if (gzBlob) {
      const res = await fetch(gzBlob.url, { cache: 'no-store' });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      const decompressed = await gunzipAsync(buf);
      return JSON.parse(decompressed.toString('utf-8'));
    }
    // Fall back to legacy uncompressed
    const { blobs } = await list({ prefix: `nights/${id}/raw.json` });
    const blob = blobs.find((b) => b.pathname === `nights/${id}/raw.json`);
    if (!blob) return null;
    const res = await fetch(blob.url, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export async function deleteNightFromBlob(id: string): Promise<void> {
  try {
    const { blobs } = await list({ prefix: `nights/${id}/` });
    if (blobs.length > 0) await del(blobs.map((b) => b.url));
  } catch { /* ignore */ }
}

// ─── Legacy manifest (kept for backward compat — not used for writes) ─────────

export async function getManifest(): Promise<NightMeta[]> {
  try {
    const { blobs } = await list({ prefix: 'nights/manifest.json' });
    const blob = blobs.find((b) => b.pathname === 'nights/manifest.json');
    if (!blob) return [];
    const res = await fetch(blob.url, { cache: 'no-store' });
    if (!res.ok) return [];
    return (await res.json()) as NightMeta[];
  } catch { return []; }
}
