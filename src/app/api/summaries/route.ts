import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { getSummaryCache, saveSummaryCache } from '@/lib/summaryCache';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Bump when the SYSTEM prompt or post-processing changes so old cached summaries
// are regenerated. v2 = no-invented-metrics + sample-size guardrails; v3 = added
// code-level fabrication scrub backstop; v4 = hard reset-ban; v5 = shot-quality
// context 1-decimal + best/worst tags; v6 = FACTS-DRIVEN rewrite — code now picks
// each player's genuine outliers (z-score + min-spread gate) and the LLM only
// phrases them, killing cherry-picking, mis-ranking, and prose that inflates
// trivial gaps; v7 = cache signature now includes the facts block itself, so
// fact-engine/attribution changes regenerate summaries instead of serving stale
// ones (the pop-up/loss-attribution fixes had changed displayed numbers while a
// pre-fix summary stayed cached).
const PROMPT_VERSION = 'v8'; // v8 = facts "net" now = table's Net/g (winners − errors − pop-ups), not the scoreboard margin, so summary & table agree

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

const SYSTEM = `You are the head-coach analyst inside PickleDash, a pickleball stats dashboard built on pb.vision video analysis of a recurring friend group who mostly play each other. Write ONE short synthesis card per player.

HOW THIS WORKS — read carefully:
- You are given a PRE-COMPUTED FACTS block. Our code already did the hard part: it picked, for each player, the few stats where they GENUINELY stand apart from the group (real outliers), computed the exact value, the exact rank, and named the true group best/worst. Trivial differences were already filtered out — anything you're given is a real gap worth mentioning.
- Your ONLY job is to phrase those facts in plain coach language. You are a writer, not an analyst. Do NOT add stats, do NOT compute or guess ranks, do NOT pull numbers from the raw stats block for claims — the facts block is the single source of truth for what's notable.
- A "## Current stats" block may also be given for light background (e.g. to describe playing style qualitatively). You may read it, but you may NOT cite a number or a rank from it that isn't in the facts block.

HARD RULES:
- If a player's facts block says "No clear outlier — middle of the pack", then SAY THAT plainly. Do not manufacture a strength or weakness. "A well-rounded game with no stat that stands out from this group" is a correct, good answer.
- Use each fact's value and rank EXACTLY as given (e.g. "9.7%, 4th of 6"), never rounded into a different story.
- Do NOT dramatize a modest gap. A rank of 2nd or 3rd of 6, or a near-average value, is "a bit better/worse than most" — NOT "elite", "by far the best", "a glaring hole", or "worst in the group". Reserve strong language for rank 1 / rank last with a clear margin. When unsure, understate.
- NEVER say "best/worst/highest/lowest in the group" unless the fact's rank is literally 1 (best) or N (worst). If the group best/worst named in the fact is someone ELSE, do not claim it for this player.
- NEVER invent metrics. pb.vision does NOT track resets, reset rate, rallies-won-on-resets, third-shot speed, spin, or dink success — never mention them.
- Win rates near 50% are EXPECTED (they play each other, near zero-sum) — never frame ~50% as a weakness by itself.

SAMPLE SIZE:
- The facts block tags small-sample players. For those, set smallSample=true, use tentative language ("in this short stretch…"), and do NOT declare a fixed identity.

STYLE:
- Tight and specific. Cite at most ONE number per field, only when it sharpens the point — the fields are takeaways, not a stat dump.
- "best" = their single most notable strength from the facts (or, if none, an honest "no standout — solid across the board"). "improve" = 1-2 items straight from their weaknesses (empty array if none). "vsGroup" = one line on where they sit overall. "style" = one line on how they play (may use qualitative background).

Return ONLY a JSON array, one object per player IN THE SAME ORDER given, each:
{"name": string, "styleTag": string (1-2 words), "best": string (1-2 sentences), "improve": string[] (0 to 2 items, each 1-2 sentences), "vsGroup": string (1-2 sentences), "style": string (1 sentence), "smallSample": boolean}
No prose outside the JSON.`;

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Summaries need the ANTHROPIC_API_KEY server env var.' }, { status: 503 });
  }
  let body: { facts?: string; context?: string; signature?: string; players?: string[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }

  const facts = (body.facts ?? '').slice(0, 20000);
  const context = (body.context ?? '').slice(0, 20000);
  const players = Array.isArray(body.players) ? body.players : [];
  if (!facts || players.length === 0) {
    return NextResponse.json({ error: 'Missing pre-computed facts.' }, { status: 400 });
  }

  // Cache key: prompt version + hash of the exact stats context. Bumping
  // PROMPT_VERSION busts every cached summary from an older prompt, so a fix to
  // the wording (e.g. the no-invented-metrics guardrails) takes effect instead
  // of serving stale pre-fix text. Client may pass its own data signature.
  const basis = body.signature ?? facts;
  const key = `sum_${PROMPT_VERSION}_${createHash('sha256').update(basis).digest('hex').slice(0, 24)}`;

  const cached = await getSummaryCache(key);
  if (cached) return NextResponse.json({ summaries: cached, cached: true });

  // ~600 tokens/player card + headroom, capped so the JSON array doesn't
  // truncate mid-object on an all-nights (11-player) view.
  const maxTokens = Math.min(9000, 1000 + players.length * 600);
  const userMsg = `Players (in order): ${players.join(', ')}\n\n${facts}\n\n## Current stats (background only — do NOT cite numbers/ranks from here)\n\n${context}\n\nWrite the JSON array now, phrasing ONLY the pre-computed facts above.`;

  try {
    const client = new Anthropic();
    // Try up to twice — model output length is non-deterministic, so a rare
    // truncation usually succeeds on a retry.
    let summaries: PlayerSummary[] | null = null;
    for (let attempt = 0; attempt < 2 && !summaries; attempt++) {
      const resp = await client.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: maxTokens,
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userMsg }],
      });
      const raw = resp.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('').trim();
      const parsed = parseSummaries(raw);
      // Accept a full or partial result; the salvage parser recovers complete
      // objects even from a truncated array. Only retry if we got nothing usable.
      if (parsed && parsed.length > 0) summaries = parsed.map(scrubFabrications);
    }
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

// Belt-and-suspenders backstop to the prompt guardrail: metrics that pb.vision
// does NOT expose and we NEVER put in the context. Any sentence that cites one
// is a fabrication, so we drop that sentence. Narrow denylist (not a blanket
// filter) so legitimate synthesis prose is never mangled.
// pb.vision exposes NO reset data whatsoever, so ANY mention of "reset(s)" in a
// summary is a fabrication (the model keeps inventing "19% of rallies won on
// resets", "weakest reset game", "reset rate", etc.). Ban the word outright,
// plus the other metrics we never provide. Kept narrow to these known-absent
// stats so genuine synthesis prose is untouched.
const NEVER_METRICS = /\b(resets?|spin rate|dink success|third[-\s]?shot speed)\b/i;
function dropFabricated(text: string): string {
  if (!text || !NEVER_METRICS.test(text)) return text;
  const kept = text.split(/(?<=[.!?])\s+/).filter((sent) => !NEVER_METRICS.test(sent));
  return kept.join(' ').trim();
}
function scrubFabrications(s: PlayerSummary): PlayerSummary {
  return {
    ...s,
    best: dropFabricated(s.best),
    vsGroup: dropFabricated(s.vsGroup),
    style: dropFabricated(s.style),
    improve: s.improve.map(dropFabricated).filter((t) => t.length > 0),
  };
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
