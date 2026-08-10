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
 *   B2_PUBLIC_URL        e.g. https://pickledash.s3.us-west-004.backblazeb2.com
 */
import {
  S3Client,
  PutObjectCommand,
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
const publicUrl = (key: string) => `${process.env.B2_PUBLIC_URL}/${key}`;

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
  try {
    const res = await fetch(publicUrl(`nights/${id}/meta.json`), { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as NightMeta;
  } catch { return null; }
}

/** List all uploaded nights by scanning meta.json files. */
export async function getAllNightMetas(): Promise<NightMeta[]> {
  try {
    const client = b2Client();
    const listed = await client.send(new ListObjectsV2Command({
      Bucket: BUCKET(),
      Prefix: 'nights/',
    }));
    const metaKeys = (listed.Contents ?? [])
      .map((o) => o.Key!)
      .filter((k) => k.endsWith('/meta.json'));
    if (metaKeys.length === 0) return [];
    const results = await Promise.all(
      metaKeys.map(async (key) => {
        try {
          const res = await fetch(publicUrl(key), { cache: 'no-store' });
          if (!res.ok) return null;
          return (await res.json()) as NightMeta;
        } catch { return null; }
      })
    );
    return results.filter((m): m is NightMeta => m !== null);
  } catch { return []; }
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

export async function getRawData(id: string): Promise<unknown | null> {
  try {
    // Try compressed first
    const gzRes = await fetch(publicUrl(`nights/${id}/raw.json.gz`), { cache: 'no-store' });
    if (gzRes.ok) {
      const buf = Buffer.from(await gzRes.arrayBuffer());
      const decompressed = await gunzipAsync(buf);
      return JSON.parse(decompressed.toString('utf-8'));
    }
    // Fall back to legacy uncompressed
    const res = await fetch(publicUrl(`nights/${id}/raw.json`), { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export async function deleteNightFromBlob(id: string): Promise<void> {
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
