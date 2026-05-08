/**
 * One-off script: remove Brad from the 1/23/26 night's playerNames in Blob.
 * Run with: node --env-file=.env.local scripts/patch-night.mjs
 */
import { put, list } from '@vercel/blob';

const { blobs } = await list({ prefix: 'nights/' });
const metaBlobs = blobs.filter(b => b.pathname.endsWith('/meta.json'));

for (const blob of metaBlobs) {
  const res = await fetch(blob.url, { cache: 'no-store' });
  const meta = await res.json();
  if (meta.label === '1/23/26') {
    const before = meta.playerNames;
    meta.playerNames = meta.playerNames.filter(n => n !== 'Brad');
    console.log(`Patching ${meta.id} (${meta.label}): ${before.join(', ')} → ${meta.playerNames.join(', ')}`);
    await put(blob.pathname, JSON.stringify(meta), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    console.log('Done.');
  }
}
console.log('All done.');
