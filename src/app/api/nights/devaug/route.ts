import { NextResponse } from 'next/server';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

// DEV-ONLY: serve a night assembled from augmented sample files in
// public/data/_devaug so Court Maps and other augmented views can be previewed
// locally without B2. Returns 404 in production. Load via ?night=devaug.
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  try {
    const dir = join(process.cwd(), 'public/data/_devaug');
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    const augmentedSessions = files.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf-8')));
    return NextResponse.json({
      id: 'devaug',
      label: '9/16/26 (dev)',
      raw: { data: { sessions: augmentedSessions.map(() => ({})) } }, // count-only shim for coverage check
      augmentedSessions,
      sessionCount: augmentedSessions.length,
      playerNames: [],
      uploadedAt: 0,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
