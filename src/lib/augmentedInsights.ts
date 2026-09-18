/**
 * Server-only: fetch pb.vision AUGMENTED insights and cache them in B2.
 *
 * Users upload pb.vision's lossy COMPACT export (stored as nights/{id}/raw.json.gz).
 * The compact export lacks court coordinates, ball height, real ball speed,
 * is_putaway, and the exploited/potential distinction on pop-ups. pb.vision
 * exposes a far richer AUGMENTED insights JSON per (video, session) that has all
 * of it, publicly fetchable server-side by video id — no auth.
 *
 *   GET https://api-2o2klzx4pa-uc.a.run.app/video/{vid}/insights.json
 *         ?sessionNum={1-based}&format=augmented
 *
 * We fetch one file per session and cache each under
 *   nights/{id}/augmented/{vid}_{si}.json.gz
 * keyed off the (vid, si) pairs the uploaded compact export already lists.
 */
import {
  S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const AUGMENTED_BASE = 'https://api-2o2klzx4pa-uc.a.run.app';

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

/** A (video, session) pair identifying one augmented insights file. */
export interface SessionRef {
  vid: string;
  si: number; // 0-based session index (compact `ses.si`); the API wants si+1
}

const augKey = (id: string, vid: string, si: number) =>
  `nights/${id}/augmented/${vid}_${si}.json.gz`;

/**
 * Extract the distinct (vid, si) pairs from an uploaded compact export so we
 * know which augmented files to fetch. De-duplicates — a video with one session
 * appears once.
 */
export function sessionRefsFromCompact(raw: unknown): SessionRef[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessions = (raw as any)?.data?.sessions ?? [];
  const seen = new Set<string>();
  const refs: SessionRef[] = [];
  for (const s of sessions) {
    const vid = s?.ses?.vid;
    const si = s?.ses?.si ?? 0;
    if (typeof vid !== 'string') continue;
    const k = `${vid}_${si}`;
    if (seen.has(k)) continue;
    seen.add(k);
    refs.push({ vid, si });
  }
  return refs;
}

/** Fetch one augmented insights file from pb.vision. Returns parsed JSON or null. */
export async function fetchAugmented(vid: string, si: number): Promise<unknown | null> {
  const url = `${AUGMENTED_BASE}/video/${vid}/insights.json?sessionNum=${si + 1}&format=augmented`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function putGz(key: string, value: unknown): Promise<void> {
  const compressed = await gzipAsync(Buffer.from(JSON.stringify(value), 'utf-8'));
  await b2Client().send(new PutObjectCommand({
    Bucket: BUCKET(), Key: key, Body: compressed, ContentType: 'application/gzip',
  }));
}

async function getGz(key: string): Promise<unknown | null> {
  try {
    const res = await b2Client().send(new GetObjectCommand({ Bucket: BUCKET(), Key: key }));
    if (!res.Body) return null;
    const bytes = await res.Body.transformToByteArray();
    const decompressed = await gunzipAsync(Buffer.from(bytes));
    return JSON.parse(decompressed.toString('utf-8'));
  } catch {
    return null;
  }
}

/** Save one augmented session file for a night. */
export async function saveAugmented(id: string, ref: SessionRef, data: unknown): Promise<void> {
  await putGz(augKey(id, ref.vid, ref.si), data);
}

/** Read one cached augmented session file. Null if not fetched yet. */
export async function getAugmented(id: string, ref: SessionRef): Promise<unknown | null> {
  return getGz(augKey(id, ref.vid, ref.si));
}

/** List the augmented session filenames already cached for a night. */
export async function listAugmentedKeys(id: string): Promise<string[]> {
  try {
    const listed = await b2Client().send(new ListObjectsV2Command({
      Bucket: BUCKET(), Prefix: `nights/${id}/augmented/`,
    }));
    return (listed.Contents ?? []).map((o) => o.Key!).filter(Boolean);
  } catch {
    return [];
  }
}

export interface EnsureResult {
  id: string;
  total: number;    // session refs found in the compact export
  fetched: number;  // newly fetched this call
  cached: number;   // already present, skipped
  failed: SessionRef[]; // refs the augmented endpoint didn't return (e.g. 404)
}

/**
 * Ensure every session in a night's compact export has its augmented file cached
 * in B2. Skips ones already present unless `force`. Returns a summary; `failed`
 * lists sessions the endpoint couldn't provide (old/unprocessed videos).
 */
export async function ensureAugmentedForNight(
  id: string,
  compactRaw: unknown,
  opts: { force?: boolean } = {},
): Promise<EnsureResult> {
  const refs = sessionRefsFromCompact(compactRaw);
  const existing = new Set(await listAugmentedKeys(id));
  const result: EnsureResult = { id, total: refs.length, fetched: 0, cached: 0, failed: [] };

  for (const ref of refs) {
    const key = augKey(id, ref.vid, ref.si);
    if (!opts.force && existing.has(key)) { result.cached++; continue; }
    const data = await fetchAugmented(ref.vid, ref.si);
    if (data == null) { result.failed.push(ref); continue; }
    await saveAugmented(id, ref, data);
    result.fetched++;
  }
  return result;
}

/**
 * Load all cached augmented sessions for a night, in the (vid, si) order the
 * compact export lists them. Entries with no cached augmented file are omitted;
 * the caller can fall back to the compact parser for those.
 */
export async function getAllAugmentedForNight(
  id: string,
  compactRaw: unknown,
): Promise<{ ref: SessionRef; data: unknown }[]> {
  const refs = sessionRefsFromCompact(compactRaw);
  const out: { ref: SessionRef; data: unknown }[] = [];
  for (const ref of refs) {
    const data = await getAugmented(id, ref);
    if (data != null) out.push({ ref, data });
  }
  return out;
}
