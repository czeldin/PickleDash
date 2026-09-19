import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 45;

interface ChatMsg { role: 'user' | 'assistant'; content: string }

const SYSTEM_INTRO = `You are the analyst assistant inside PickleDash, a pickleball stats dashboard built on pb.vision video analysis.

Answer the user's questions using ONLY the stats provided below, which describe the games and players the user currently has selected. Rules:
- NEVER invent or cite a metric that is not in the stats block. Do NOT produce a specific-looking statistic you cannot point to a provided row for. When unsure whether a number is really in the data, do not state it.
- pb.vision does NOT track resets, third-shot speed, spin, or dink success. NEVER give a number or claim about resets ("reset rate", "rallies won on resets", "weak reset game", etc.) or those other metrics — there is no data for them, so any such statistic is fabricated. Say the data doesn't track it instead.
- Be concise and specific, but only cite numbers that literally appear below.
- Always respect sample size: call out when a number is based on few games/rallies, and don't over-claim from tiny samples.
- Ratings are on pb.vision's ~1–5 scale (higher is better). "Overall" is pb.vision's own rating. Court IQ = decision-making. Kitchen = net play. Some skills only exist for recent nights (fewer games behind them) — say so if relevant.
- Win rates near 50% are expected because these players mostly play each other (near zero-sum).
- If the data doesn't contain what's asked, say so plainly rather than guessing.
- Use short markdown (bold, bullets, small tables) when it helps. No preamble like "Great question".`;

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'Chat isn\'t configured yet — the ANTHROPIC_API_KEY environment variable is missing on the server.' },
      { status: 503 },
    );
  }

  let body: { context?: string; messages?: ChatMsg[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const { context, messages } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'No question provided.' }, { status: 400 });
  }
  // Keep the conversation bounded.
  const trimmed = messages.slice(-16).map((m) => ({
    role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
    content: String(m.content ?? '').slice(0, 4000),
  }));

  try {
    const client = new Anthropic();
    const resp = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1500,
      system: [
        {
          type: 'text',
          text: `${SYSTEM_INTRO}\n\n## Selected games — current stats\n\n${(context ?? '').slice(0, 40000) || '(no stats available)'}`,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: trimmed,
    });
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return NextResponse.json({ text: text || '(no answer)' });
  } catch (e) {
    const msg = e instanceof Anthropic.APIError ? `${e.status ?? ''} ${e.message}`.trim() : (e as Error)?.message;
    console.error('POST /api/ask error:', msg);
    const status = e instanceof Anthropic.APIError && e.status === 401 ? 401 : 500;
    return NextResponse.json(
      { error: status === 401 ? 'The Anthropic API key is invalid.' : 'Sorry — that request failed. Try again.' },
      { status },
    );
  }
}
