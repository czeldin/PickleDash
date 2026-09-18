/**
 * Server-only: cache Claude-generated player summaries in B2, keyed by a hash of
 * the exact stats they were generated from. Any filter change (night, game,
 * player selection) produces different stats → a different key → a fresh
 * summary; an unchanged view is served instantly from cache.
 */
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';
import type { PlayerSummary } from '@/app/api/summaries/route';

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
const keyPath = (key: string) => `summaries/${key}.json.gz`;

export async function getSummaryCache(key: string): Promise<PlayerSummary[] | null> {
  try {
    const res = await b2Client().send(new GetObjectCommand({ Bucket: BUCKET(), Key: keyPath(key) }));
    if (!res.Body) return null;
    const bytes = await res.Body.transformToByteArray();
    const json = (await gunzipAsync(Buffer.from(bytes))).toString('utf-8');
    return JSON.parse(json) as PlayerSummary[];
  } catch {
    return null; // miss or no B2 configured
  }
}

export async function saveSummaryCache(key: string, summaries: PlayerSummary[]): Promise<void> {
  const gz = await gzipAsync(Buffer.from(JSON.stringify(summaries), 'utf-8'));
  await b2Client().send(new PutObjectCommand({
    Bucket: BUCKET(), Key: keyPath(key), Body: gz, ContentType: 'application/gzip',
  }));
}
