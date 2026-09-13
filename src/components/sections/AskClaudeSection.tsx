'use client';

import { useRef, useState } from 'react';
import { DashboardData } from '@/types/dashboard';

interface Props { data: DashboardData; }
interface Msg { role: 'user' | 'assistant'; content: string }

const pct = (n: number, d: number) => (d > 0 ? Math.round((100 * n) / d) : null);

// Build a compact, labelled stats summary for the model from the CURRENT (filtered) data.
function buildStatsContext(data: DashboardData): string {
  const pm = new Map(data.players.map((p) => [p.pid, p.name]));
  const name = (pid: string) => pm.get(pid) ?? pid;
  const heroMap = new Map(data.hero.map((h) => [h.pid, h]));
  const out: string[] = [];

  out.push(`Players in view: ${data.players.map((p) => p.name).join(', ')}`);
  out.push(`Games (sessions) in view: ${data.sessions.length}`);
  out.push('');

  // Player table
  out.push('### Per-player ratings & record');
  out.push('name | overall | courtIQ | kitchen | ballCtrl | targeting | offense | defense | games | win%');
  for (const r of data.skillRatings) {
    const h = heroMap.get(r.pid);
    const g = h ? h.wins + h.losses : 0;
    const wr = g > 0 ? Math.round((h!.wins / g) * 100) : '—';
    const f = (v: number) => (v > 0 ? v.toFixed(2) : '—');
    out.push(`${name(r.pid)} | ${f(r.overall)} | ${f(r.courtIq)} | ${f(r.kitchenGame)} | ${f(r.ballControl)} | ${f(r.targeting)} | ${f(r.offense)} | ${f(r.defense)} | ${g} | ${wr}%`);
  }
  out.push('');

  // Kitchen serve/receive
  if (data.kitchenSR.some((r) => r.serveDen + r.recvDen > 0)) {
    out.push('### Kitchen arrival (self) — serving vs receiving');
    out.push('name | serving% | receiving%');
    for (const r of data.kitchenSR) {
      out.push(`${name(r.pid)} | ${pct(r.serveNum, r.serveDen) ?? '—'}% | ${pct(r.recvNum, r.recvDen) ?? '—'}%`);
    }
    out.push('');
  }

  // Rally impact
  if (data.rallyImpact.some((r) => r.games > 0)) {
    out.push('### Rally impact per game (winners hit vs points given away)');
    out.push('name | winners/g | rally-ending-errors/g | popped-up-put-away/g | net/g');
    for (const r of data.rallyImpact) {
      if (r.games === 0) continue;
      const per = (n: number) => (n / r.games).toFixed(1);
      const net = ((r.won - r.lostDirect - r.setup) / r.games).toFixed(1);
      out.push(`${name(r.pid)} | ${per(r.won)} | ${per(r.lostDirect)} | ${per(r.setup)} | ${net}`);
    }
    out.push('');
  }

  // Targeting
  if (data.targeting.some((r) => r.games > 0)) {
    out.push('### Targeting per game');
    out.push('name | attacks/g | finishes/g | popups/g | got-attacked/g');
    for (const r of data.targeting) {
      if (r.games === 0) continue;
      const per = (n: number) => (n / r.games).toFixed(1);
      out.push(`${name(r.pid)} | ${per(r.attacks)} | ${per(r.fin)} | ${per(r.pop)} | ${per(r.gotAttacked)}`);
    }
    out.push('');
  }

  // Pairs win rate (from rallySides)
  const pairMap = new Map<string, { won: number; n: number }>();
  const sessionTeam = new Map<string, Map<string, number>>();
  for (const row of data.rallySides) {
    if (!sessionTeam.has(row.sessionKey)) sessionTeam.set(row.sessionKey, new Map());
    for (const nm of Object.keys(row.sides)) sessionTeam.get(row.sessionKey)!.set(nm, row.team);
  }
  for (const row of data.rallySides) {
    const names = Object.keys(row.sides).sort();
    if (names.length !== 2) continue;
    const key = names.join(' + ');
    if (!pairMap.has(key)) pairMap.set(key, { won: 0, n: 0 });
    const rec = pairMap.get(key)!;
    rec.n++; if (row.won) rec.won++;
  }
  if (pairMap.size > 0) {
    out.push('### Pair rally win% (serving+receiving, this view)');
    out.push('pair | win% | rallies');
    [...pairMap.entries()].sort((a, b) => b[1].won / b[1].n - a[1].won / a[1].n)
      .forEach(([k, v]) => out.push(`${k} | ${Math.round((100 * v.won) / v.n)}% | ${v.n}`));
    out.push('');
  }

  // Coaching flags
  const withCoach = data.coaching.filter((c) => c.items.length > 0);
  if (withCoach.length > 0) {
    out.push('### pb.vision coaching flags (lowest-scoring metrics per player)');
    for (const c of withCoach) {
      const items = c.items.slice(0, 4).map((it) => `${it.kind.replace(/_/g, ' ')} ${Math.round(it.value * 100)}%`).join('; ');
      out.push(`${name(c.pid)}: ${items}`);
    }
    out.push('');
  }

  // 3rd / 5th shot selection (drop vs drive mix)
  const sb = (rows: typeof data.thirdShot, label: string) => {
    if (!rows.length) return;
    out.push(`### ${label} selection (drop vs drive)`);
    out.push('name | drop% | drive% | shots');
    for (const r of rows) {
      const total = r.dropCount + r.driveCount;
      out.push(`${name(r.pid)} | ${Math.round(r.dropPct)}% | ${Math.round(r.drivePct)}% | ${total}`);
    }
    out.push('');
  };
  sb(data.thirdShot, '3rd shot');
  sb(data.fifthShot, '5th shot');

  // Kitchen arrival by shot type (drop vs drive vs either)
  if (data.kitchenArrival.some((r) => r.third_total + r.fifth_total > 0)) {
    out.push('### Kitchen arrival by shot type (reached kitchen after that shot)');
    out.push('name | 3rd drop% (n) | 3rd drive% (n) | 3rd either% (n) | 5th either% (n)');
    for (const r of data.kitchenArrival) {
      const c = (p: number, t: number) => (t > 0 ? `${Math.round(p)}% (${t})` : '—');
      out.push(`${name(r.pid)} | ${c(r.third_drop_kitchen_pct, r.third_drop_total)} | ${c(r.third_drive_kitchen_pct, r.third_drive_total)} | ${c(r.third_kitchen_pct, r.third_total)} | ${c(r.fifth_kitchen_pct, r.fifth_total)}`);
    }
    out.push('');
  }

  return out.join('\n');
}

// Minimal, safe markdown → HTML (escape first, then bold + line breaks + bullets).
function renderMarkdown(text: string): string {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="bg-gray-100 rounded px-1 text-[0.85em]">$1</code>')
    .split('\n')
    .map((line) => {
      const m = line.match(/^\s*[-*]\s+(.*)/);
      if (m) return `<div class="flex gap-1.5"><span class="text-gray-400">•</span><span>${m[1]}</span></div>`;
      return line.trim() === '' ? '<div class="h-2"></div>' : `<div>${line}</div>`;
    })
    .join('');
}

const SUGGESTIONS = [
  'Who are the best two pairs to run in an MLP tournament?',
  'Which player should improve their 3rd-shot drop the most?',
  'Who wins the most points but also gives the most away?',
  'What is our biggest team-wide weakness?',
];

export function AskClaudeSection({ data }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function send(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    setError(null);
    const next = [...messages, { role: 'user' as const, content: q }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: buildStatsContext(data), messages: next }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Request failed.'); }
      else { setMessages((m) => [...m, { role: 'assistant', content: json.text }]); }
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }));
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-2 border-b border-gray-200 pb-2">
        <h2 className="text-xl font-bold text-gray-800">Ask about these games</h2>
        <span className="text-xs text-gray-400">{data.sessions.length} game{data.sessions.length !== 1 ? 's' : ''} · {data.players.length} players selected</span>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col" style={{ maxHeight: 520 }}>
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[120px]">
          {messages.length === 0 && (
            <div className="text-sm text-gray-500">
              <p className="mb-3">Ask anything about the currently-selected games and players — it uses your filtered stats.</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)}
                    className="text-left text-xs px-3 py-1.5 rounded-full border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 hover:border-gray-300 transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
                {m.role === 'assistant'
                  ? <div className="space-y-0.5 leading-relaxed" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
                  : m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 text-gray-400 rounded-2xl px-4 py-2.5 text-sm">Thinking…</div>
            </div>
          )}
          {error && <div className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</div>}
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); send(input); }}
          className="border-t border-gray-100 p-3 flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about pairings, who to improve, matchups…"
            className="flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:border-blue-400"
          />
          <button type="submit" disabled={loading || !input.trim()}
            className="rounded-full bg-blue-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-40 hover:bg-blue-700 transition-colors">
            Ask
          </button>
        </form>
      </div>
      <p className="text-xs text-gray-400">Answers come from Claude using your selected stats. Double-check anything important — and mind small sample sizes.</p>
    </section>
  );
}
