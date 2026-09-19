import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { getSummaryCache, saveSummaryCache } from '@/lib/summaryCache';

export const runtime = 'nodejs';
export const maxDuration = 60;

// One synthesized card per player. Text is HIGH-LEVEL synthesis of the stats —
// coach-style takeaways, NOT a re-listing of numbers already shown in tables.
export interface PlayerSummary {
  name: string;
  styleTag: string;   // 1-2 word badge, e.g. "Technician", "Attacker"
  best: string;       // their standout strength vs the group (1-2 sentences)
  improve: string[];  // 1-2 concrete things to get better at
  vsGroup: string;    // where they stand relative to the group overall
  style: string;      // how they play (tendencies)
  smallSample?: boolean;
}

const SYSTEM = `You are the head-coach analyst inside PickleDash, a pickleball stats dashboard built on pb.vision video analysis of a recurring friend group who mostly play each other.

You will be given a block of already-computed stats for the currently-selected games and players. Write ONE synthesis card per player.

HARD RULES — never break these:
- Use ONLY metrics that appear in the stats block below. NEVER invent, assume, or name a stat that isn't there. If the data doesn't contain something (e.g. "reset rate", "third-shot speed", "dink success"), you may NOT mention it — not even as a guess or inference dressed up as fact. When in doubt, leave it out.
- Do NOT infer a hidden skill from an adjacent number and state it as measured (e.g. do not turn "gives up pop-ups" into "poor reset rate"). Describe only what the provided stat literally measures.
- Every claim must be traceable to a specific row you were given. If you cannot point to the number behind a sentence, delete the sentence.

SAMPLE SIZE — calibrate confidence to how much data there is:
- You are told the number of games in view. FEW games (roughly < 8) = a SNAPSHOT of a short stretch, NOT the player's fixed identity. Use tentative language ("over these games…", "in this stretch he…", "small sample, but…") and set smallSample=true.
- With few games, do NOT declare a permanent strength/weakness or a defining "style" — a hot or cold few nights is mostly noise. Say so.
- With many games (20+), you may speak with more confidence about genuine patterns.
- Never present a small-sample swing in the same authoritative voice as a robust, many-game pattern.

SYNTHESIZE, don't report:
- The dashboard already shows every raw number in tables. Do NOT just restate stats. Connect several provided stats into a higher-level insight a coach would say out loud.
  - BAD (regurgitation): "53% rally win, 40 net errors/game, drops on 71% of 3rd shots."
  - GOOD (synthesis): "A patient technician whose drops set up the point well — but too many rallies end with his own ball in the net, quietly costing him close games."
- Cite at most ONE number per field when it truly sharpens the point; otherwise stay qualitative.
- Everything is COMPARATIVE: frame relative to the group ("best in the group at…", "middle of the pack…", "the group's weakest at…").
- If someone is genuinely well-rounded with no clear hole, say that rather than inventing a weakness.
- Win rates near 50% are EXPECTED (they play each other, near zero-sum) — never frame ~50% as a weakness by itself.
- pb.vision skill ratings sit in a narrow band (~4.1–4.5) and are less telling than the outcome stats (win rates, loss causes, finishing, kitchen arrival, drop-vs-drive, pop-ups). Prefer the outcome stats.

Return ONLY a JSON array, one object per player IN THE SAME ORDER given, each:
{"name": string, "styleTag": string (1-2 words), "best": string (1-2 sentences), "improve": string[] (1 or 2 items, each 1-2 sentences), "vsGroup": string (1-2 sentences), "style": string (1 sentence), "smallSample": boolean}
No prose outside the JSON.`;

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Summaries need the ANTHROPIC_API_KEY server env var.' }, { status: 503 });
  }
  let body: { context?: string; signature?: string; players?: string[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }

  const context = (body.context ?? '').slice(0, 40000);
  const players = Array.isArray(body.players) ? body.players : [];
  if (!context || players.length === 0) {
    return NextResponse.json({ error: 'Missing stats context.' }, { status: 400 });
  }

  // Cache key: hash of the exact stats context (so any filter change → new key,
  // and an unchanged view is served instantly). Client may pass its own signature.
  const key = body.signature
    ? `sum_${createHash('sha256').update(body.signature).digest('hex').slice(0, 24)}`
    : `sum_${createHash('sha256').update(context).digest('hex').slice(0, 24)}`;

  const cached = await getSummaryCache(key);
  if (cached) return NextResponse.json({ summaries: cached, cached: true });

  try {
    const client = new Anthropic();
    const resp = await client.messages.create({
      model: 'claude-sonnet-5',
      // ~450 tokens/player card; scale with player count so an all-nights view
      // (11 players) doesn't truncate the JSON mid-array. Capped at 8k.
      max_tokens: Math.min(8000, 800 + players.length * 500),
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: `Players (in order): ${players.join(', ')}\n\n## Current stats\n\n${context}\n\nWrite the JSON array now.`,
      }],
    });
    const raw = resp.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('').trim();
    const summaries = parseSummaries(raw);
    if (!summaries) return NextResponse.json({ error: 'Could not parse the model output.' }, { status: 502 });
    await saveSummaryCache(key, summaries).catch(() => {});
    return NextResponse.json({ summaries });
  } catch (e) {
    const msg = e instanceof Anthropic.APIError ? `${e.status ?? ''} ${e.message}`.trim() : (e as Error)?.message;
    console.error('POST /api/summaries error:', msg);
    const status = e instanceof Anthropic.APIError && e.status === 401 ? 401 : 500;
    return NextResponse.json({ error: status === 401 ? 'Invalid Anthropic API key.' : 'Summary generation failed.' }, { status });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function coerce(x: any): PlayerSummary {
  return {
    name: String(x.name ?? ''),
    styleTag: String(x.styleTag ?? '').slice(0, 24),
    best: String(x.best ?? ''),
    improve: Array.isArray(x.improve) ? x.improve.slice(0, 2).map((s: unknown) => String(s)) : [],
    vsGroup: String(x.vsGroup ?? ''),
    style: String(x.style ?? ''),
    smallSample: Boolean(x.smallSample),
  };
}

function parseSummaries(raw: string): PlayerSummary[] | null {
  const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = cleaned.indexOf('[');
  if (start < 0) return null;
  const body = cleaned.slice(start);

  // 1) Happy path: the whole array parses.
  const end = body.lastIndexOf(']');
  if (end > 0) {
    try {
      const arr = JSON.parse(body.slice(0, end + 1));
      if (Array.isArray(arr) && arr.length) return arr.map(coerce);
    } catch { /* fall through to salvage */ }
  }

  // 2) Salvage path (e.g. output truncated mid-array): scan for complete
  // top-level {...} objects and parse each individually. Recovers the players
  // that DID come through instead of failing the whole card.
  const objs: PlayerSummary[] = [];
  let depth = 0, objStart = -1, inStr = false, esc = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') { if (depth === 0) objStart = i; depth++; }
    else if (c === '}') {
      depth--;
      if (depth === 0 && objStart >= 0) {
        try { objs.push(coerce(JSON.parse(body.slice(objStart, i + 1)))); } catch { /* skip */ }
        objStart = -1;
      }
    }
  }
  return objs.length ? objs : null;
}
