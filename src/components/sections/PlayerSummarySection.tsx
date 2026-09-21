'use client';

import { useEffect, useRef, useState } from 'react';
import { DashboardData, PlayerMeta, HeroStats } from '@/types/dashboard';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { buildStatsContext, statsSignature } from '@/lib/statsContext';
import { factsForPrompt } from '@/lib/playerFacts';

// Small non-crypto hash of the facts string, to fold into the cache signature.
function simpleHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

interface Props { data: DashboardData }

interface PlayerSummary {
  name: string;
  styleTag: string;
  best: string;
  improve: string[];
  vsGroup: string;
  style: string;
  smallSample?: boolean;
}

export function PlayerSummarySection({ data }: Props) {
  const { players } = data;
  const [summaries, setSummaries] = useState<PlayerSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSig = useRef<string>('');

  useEffect(() => {
    if (players.length === 0) return;
    const facts = factsForPrompt(data);
    // Sign the FACTS the summary is actually built from (plus the selection),
    // so any change to what the model is fed — including logic changes to the
    // fact engine — busts the cache. Signing only raw stats let the summary go
    // stale when the facts changed but those raw stats didn't.
    const sig = `${statsSignature(data)}|F:${facts.length}:${simpleHash(facts)}`;
    if (sig === lastSig.current) return; // same view — keep current summaries
    lastSig.current = sig;
    setSummaries(null);   // clear stale cards so the new selection visibly regenerates
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    fetch('/api/summaries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facts, context: buildStatsContext(data), signature: sig, players: players.map((p) => p.name) }),
      signal: controller.signal,
    })
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || 'Failed');
        setSummaries(json.summaries as PlayerSummary[]);
      })
      .catch((e) => { if (e.name !== 'AbortError') setError(e.message); })
      .finally(() => setLoading(false));
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statsSignature(data), players.length]);

  if (players.length === 0) return null;

  const playerMap = new Map<string, PlayerMeta>(players.map((p) => [p.pid, p]));
  const sorted = [...data.hero].filter((h) => h.dupr > 0).sort((a, b) => b.dupr - a.dupr);
  const byName = new Map((summaries ?? []).map((s) => [s.name.toLowerCase(), s]));

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 pb-1.5">
        <h2 className="text-xl font-bold text-gray-800">Player Summaries</h2>
        {loading && <span className="text-xs text-gray-400">Analyzing…</span>}
      </div>
      <p className="text-xs text-gray-400">
        The stats that actually set each player apart from the group — picked and ranked by code (only genuine outliers, trivial gaps filtered out), then written up by Claude. If someone&apos;s middle-of-the-pack, it says so rather than inventing a strength.
      </p>

      {error && (
        <p className="text-sm text-gray-400 bg-gray-50 rounded-xl px-4 py-6 text-center">
          Summaries couldn&apos;t be generated ({error}). They need the Anthropic API key configured on the server.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sorted.map((h: HeroStats) => {
          const player = playerMap.get(h.pid);
          if (!player) return null;
          const s = byName.get(player.name.toLowerCase());
          return (
            <div key={h.pid} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <PlayerAvatar player={player} size="lg" />
                  <div>
                    <p className="font-bold text-gray-900">{player.name}</p>
                    <p className="text-sm text-gray-400">{h.dupr.toFixed(2)} · {h.wins}W–{h.losses}L</p>
                  </div>
                </div>
                {s?.styleTag && (
                  <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-3 py-1 rounded-full whitespace-nowrap">
                    {s.styleTag}
                  </span>
                )}
              </div>

              {!s ? (
                <div className="space-y-2 animate-pulse">
                  <div className="h-3 bg-gray-100 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-full" />
                  <div className="h-3 bg-gray-100 rounded w-2/3" />
                </div>
              ) : (
                <>
                  {s.smallSample && (
                    <p className="text-[11px] text-amber-600 bg-amber-50 rounded-md px-2 py-1">
                      Small sample — read with caution.
                    </p>
                  )}
                  <Field color="text-blue-700" icon="⭐" label="Best at">{s.best}</Field>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-amber-500 uppercase tracking-wide">🎯 Work on</p>
                    {s.improve.length > 0 ? (
                      <ul className="space-y-1">
                        {s.improve.map((it, i) => (
                          <li key={i} className="text-sm text-gray-700 leading-relaxed flex gap-1.5">
                            <span className="text-amber-400">•</span><span>{it}</span>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="text-sm text-gray-500">No glaring weakness — a complete game.</p>}
                  </div>
                  <Field color="text-blue-500" icon="📊" label="vs the group">{s.vsGroup}</Field>
                  <Field color="text-violet-500" icon="🎮" label="Style">{s.style}</Field>
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Field({ color, icon, label, children }: { color: string; icon: string; label: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="space-y-1">
      <p className={`text-xs font-bold uppercase tracking-wide ${color}`}>{icon} {label}</p>
      <p className="text-sm text-gray-700 leading-relaxed">{children}</p>
    </div>
  );
}
