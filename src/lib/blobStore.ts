/**
 * Server-only storage helpers — backed by Backblaze B2 (S3-compatible).
 * Import only from API routes (never from client components).
 *
 * Architecture: each night has two objects:
 *   nights/{id}/meta.json    — NightMeta (small, no raw data)
 *   nights/{id}/raw.json.gz  — gzip-compressed pb.vision JSON
 *
 * Required env vars:
 *   B2_REGION            e.g. us-west-004
 *   B2_ACCESS_KEY_ID     keyID from Backblaze App Key
 *   B2_SECRET_ACCESS_KEY applicationKey from Backblaze App Key
 *   B2_BUCKET_NAME       e.g. pickledash
 *
 * Reads and writes both go through the authenticated S3 API, so the bucket can
 * stay private and no public URL is required.
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';
import { PaddleTag } from '@/types/nights';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

function b2Client() {
  return new S3Client({
    region: process.env.B2_REGION!,
    endpoint: `https://s3.${process.env.B2_REGION}.backblazeb2.com`,
    credentials: {
      accessKeyId: process.env.B2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.B2_SECRET_ACCESS_KEY!,
    },
  });
}

const BUCKET = () => process.env.B2_BUCKET_NAME!;

/**
 * Read an object via the authenticated S3 API. Returns the raw bytes, or null
 * if the object doesn't exist. Uses the same credentials as writes — no
 * dependence on the bucket being public.
 */
async function getObjectBytes(key: string): Promise<Buffer | null> {
  try {
    const res = await b2Client().send(new GetObjectCommand({
      Bucket: BUCKET(),
      Key: key,
    }));
    if (!res.Body) return null;
    // AWS SDK v3 Node stream helper
    const bytes = await res.Body.transformToByteArray();
    return Buffer.from(bytes);
  } catch {
    return null;
  }
}

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
  await b2Client().send(new PutObjectCommand({
    Bucket: BUCKET(),
    Key: `nights/${id}/meta.json`,
    Body: JSON.stringify(meta),
    ContentType: 'application/json',
  }));
}

export async function getNightMeta(id: string): Promise<NightMeta | null> {
  const buf = await getObjectBytes(`nights/${id}/meta.json`);
  if (!buf) return null;
  try {
    return JSON.parse(buf.toString('utf-8')) as NightMeta;
  } catch { return null; }
}

// In-memory cache of the nights list, to avoid re-hitting B2 (and burning
// Class B transactions / the daily cap) on every page load. Server instances
// are reused across requests on Vercel, so a short TTL meaningfully cuts reads.
// Invalidated on upload (see invalidateNightsCache).
let nightsCache: { at: number; metas: NightMeta[] } | null = null;
const NIGHTS_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function invalidateNightsCache(): void { nightsCache = null; }

/**
 * List all uploaded nights by scanning meta.json files.
 * THROWS on a genuine B2 failure (e.g. the daily cap / a 429) so callers can
 * tell "storage unreachable" apart from "no nights uploaded" — never silently
 * returns [] on error, which would make a user's nights appear to vanish.
 * Served from a short in-memory cache to limit B2 reads.
 */
export async function getAllNightMetas(): Promise<NightMeta[]> {
  if (nightsCache && Date.now() - nightsCache.at < NIGHTS_TTL_MS) {
    return nightsCache.metas;
  }
  // A B2 error here propagates (no catch) — the route decides how to surface it,
  // e.g. serve the last cached list or return an error instead of hiding data.
  const client = b2Client();
  const listed = await client.send(new ListObjectsV2Command({
    Bucket: BUCKET(),
    Prefix: 'nights/',
  }));
  const metaKeys = (listed.Contents ?? [])
    .map((o) => o.Key!)
    .filter((k) => k.endsWith('/meta.json'));
  const results = metaKeys.length === 0 ? [] : await Promise.all(
    metaKeys.map(async (key) => {
      const buf = await getObjectBytes(key);
      if (!buf) return null;
      try {
        return JSON.parse(buf.toString('utf-8')) as NightMeta;
      } catch { return null; }
    })
  );
  const metas = results.filter((m): m is NightMeta => m !== null);
  nightsCache = { at: Date.now(), metas };
  return metas;
}

/** The last successfully-listed nights, if any (used as a fallback on B2 error). */
export function getCachedNightMetas(): NightMeta[] | null {
  return nightsCache?.metas ?? null;
}

/**
 * Find nights that have raw data but no meta.json.
 * Returns their IDs so callers can repair them.
 */
export async function getOrphanedRawIds(): Promise<string[]> {
  try {
    const client = b2Client();
    const listed = await client.send(new ListObjectsV2Command({
      Bucket: BUCKET(),
      Prefix: 'nights/',
    }));
    const keys = (listed.Contents ?? []).map((o) => o.Key!);
    const rawIds = new Set(
      keys
        .filter((k) => k.endsWith('/raw.json') || k.endsWith('/raw.json.gz'))
        .map((k) => k.split('/')[1])
    );
    const metaIds = new Set(
      keys
        .filter((k) => k.endsWith('/meta.json'))
        .map((k) => k.split('/')[1])
    );
    return [...rawIds].filter((id) => !metaIds.has(id));
  } catch { return []; }
}

// ─── Raw data helpers ─────────────────────────────────────────────────────────

export async function saveRawData(id: string, raw: unknown): Promise<void> {
  const compressed = await gzipAsync(Buffer.from(JSON.stringify(raw), 'utf-8'));
  await b2Client().send(new PutObjectCommand({
    Bucket: BUCKET(),
    Key: `nights/${id}/raw.json.gz`,
    Body: compressed,
    ContentType: 'application/gzip',
  }));
}

// Raw night data is immutable once uploaded (keyed by a UUID), so cache it in
// memory to avoid re-downloading from B2 on every dashboard load — the single
// biggest source of Class B reads. Bounded so a long-running instance can't grow
// without limit.
const rawCache = new Map<string, unknown>();
const RAW_CACHE_MAX = 40;

export async function getRawData(id: string): Promise<unknown | null> {
  if (rawCache.has(id)) return rawCache.get(id)!;
  try {
    let parsed: unknown | null = null;
    // Try compressed first
    const gz = await getObjectBytes(`nights/${id}/raw.json.gz`);
    if (gz) {
      const decompressed = await gunzipAsync(gz);
      parsed = JSON.parse(decompressed.toString('utf-8'));
    } else {
      // Fall back to legacy uncompressed
      const raw = await getObjectBytes(`nights/${id}/raw.json`);
      if (raw) parsed = JSON.parse(raw.toString('utf-8'));
    }
    if (parsed != null) {
      if (rawCache.size >= RAW_CACHE_MAX) rawCache.delete(rawCache.keys().next().value!);
      rawCache.set(id, parsed);
    }
    return parsed;
  } catch { return null; }
}

export async function deleteNightFromBlob(id: string): Promise<void> {
  rawCache.delete(id);
  invalidateNightsCache();
  try {
    const client = b2Client();
    const listed = await client.send(new ListObjectsV2Command({
      Bucket: BUCKET(),
      Prefix: `nights/${id}/`,
    }));
    const keys = (listed.Contents ?? []).map((o) => o.Key!).filter(Boolean);
    if (keys.length === 0) return;
    await client.send(new DeleteObjectsCommand({
      Bucket: BUCKET(),
      Delete: { Objects: keys.map((Key) => ({ Key })) },
    }));
  } catch { /* ignore */ }
}

// ─── Legacy manifest (no-op — not used with R2) ───────────────────────────────

export async function getManifest(): Promise<NightMeta[]> {
  return [];
}
