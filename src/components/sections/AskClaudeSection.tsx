'use client';

import { useRef, useState } from 'react';
import { DashboardData } from '@/types/dashboard';
import { buildStatsContext } from '@/lib/statsContext';

interface Props { data: DashboardData; }
interface Msg { role: 'user' | 'assistant'; content: string }

// Build a compact, labelled stats summary for the model from the CURRENT (filtered) data.
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

/** Floating "Ask Claude" chat widget — a launcher button in the corner that
 *  opens a chat panel, like a typical help/chat feature. */
export function AskClaudeSection({ data }: Props) {
  const [open, setOpen] = useState(false);
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
    <>
      {/* Launcher button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 rounded-full bg-gray-900 text-white pl-3 pr-4 py-3 shadow-lg hover:bg-gray-800 transition-colors"
          title="Ask Claude about these games"
        >
          <ClaudeMark />
          <span className="text-sm font-medium">Ask Claude</span>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-5 right-5 z-50 w-[min(92vw,400px)] h-[min(80vh,560px)] bg-white rounded-2xl border border-gray-200 shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 bg-gray-900 text-white">
            <div className="flex items-center gap-2 min-w-0">
              <ClaudeMark />
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight">Ask Claude</p>
                <p className="text-[11px] text-gray-300 leading-tight truncate">{data.sessions.length} game{data.sessions.length !== 1 ? 's' : ''} · {data.players.length} players</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-gray-300 hover:text-white text-xl leading-none px-1" title="Close">×</button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-sm text-gray-500">
                <p className="mb-3">Ask anything about the currently-selected games and players — it uses your filtered stats.</p>
                <div className="flex flex-col gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)}
                      className="text-left text-xs px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 hover:border-gray-300 transition-colors">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[88%] rounded-2xl px-3.5 py-2 text-sm ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
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

          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="border-t border-gray-100 p-3 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about pairings, matchups…"
              className="flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:border-blue-400"
            />
            <button type="submit" disabled={loading || !input.trim()}
              className="rounded-full bg-blue-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-40 hover:bg-blue-700 transition-colors">
              Ask
            </button>
          </form>
          <p className="text-[10px] text-gray-400 px-4 pb-2 -mt-1">Uses your selected stats. Double-check anything important — mind small samples.</p>
        </div>
      )}
    </>
  );
}

/** Small Claude/AI sparkle mark. */
function ClaudeMark() {
  return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#D97757] text-white shrink-0" aria-hidden>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
        <path d="M12 2l1.9 5.6L19.5 9l-5.6 1.9L12 16.5l-1.9-5.6L4.5 9l5.6-1.4L12 2z" />
        <circle cx="18.5" cy="17.5" r="1.6" />
        <circle cx="6" cy="16" r="1.1" />
      </svg>
    </span>
  );
}
