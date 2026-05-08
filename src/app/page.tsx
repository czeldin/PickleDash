'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getNightSessionDetails } from '@/lib/nightStore';
import { Night, PaddleTag } from '@/types/nights';
import { NightMeta } from '@/lib/blobStore';

// ─── API helpers ─────────────────────────────────────────────────────────────

async function apiFetchNights(): Promise<NightMeta[]> {
  const res = await fetch('/api/nights', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load nights');
  return res.json();
}

async function apiUploadNight(meta: NightMeta, raw: unknown): Promise<void> {
  const res = await fetch('/api/nights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ meta, raw }),
  });
  if (!res.ok) throw new Error('Upload failed');
}

async function apiPatchNight(id: string, updates: Partial<NightMeta>): Promise<void> {
  await fetch(`/api/nights/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
}

async function apiFetchNightWithRaw(id: string): Promise<Night | null> {
  const res = await fetch(`/api/nights/${id}`, { cache: 'no-store' });
  if (!res.ok) return null;
  const data = await res.json();
  return data as Night;
}

// ─── PaddleEditor ─────────────────────────────────────────────────────────────

function PaddleEditor({ night, onClose }: { night: Night; onClose: () => void }) {
  const sessions = getNightSessionDetails(night);
  const allPaddles = Array.from(new Set((night.paddleTags ?? []).map(t => t.paddle))).filter(Boolean);
  const defaultPaddles = allPaddles.length >= 2 ? allPaddles : ['RPM', 'Luzz'];

  const [tags, setTags] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const t of night.paddleTags ?? []) {
      map[`${t.sessionIdx}:${t.playerName}`] = t.paddle;
    }
    return map;
  });
  const [paddleOptions] = useState<string[]>(defaultPaddles);
  const [newPaddle, setNewPaddle] = useState('');
  const [saving, setSaving] = useState(false);

  const taggedPlayers = Array.from(new Set((night.paddleTags ?? []).map(t => t.playerName)));
  const allPlayers = Array.from(new Set(sessions.flatMap(s => s.players)));
  const players = taggedPlayers.length > 0 ? taggedPlayers : allPlayers;

  function setTag(sessionIdx: number, playerName: string, paddle: string) {
    const key = `${sessionIdx}:${playerName}`;
    setTags(prev => paddle ? { ...prev, [key]: paddle } : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key)));
  }

  async function save() {
    setSaving(true);
    const newTags: PaddleTag[] = Object.entries(tags)
      .filter(([, v]) => v)
      .map(([k, paddle]) => {
        const [idx, ...rest] = k.split(':');
        return { sessionIdx: Number(idx), playerName: rest.join(':'), paddle };
      });
    await apiPatchNight(night.id, { paddleTags: newTags });
    setSaving(false);
    onClose();
  }

  const allOptions = newPaddle && !paddleOptions.includes(newPaddle) ? [...paddleOptions, newPaddle] : paddleOptions;

  return (
    <div className="px-4 pb-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">🏓 Paddle Tags</p>
        <div className="flex items-center gap-2">
          <input
            className="border border-gray-200 rounded px-2 py-0.5 text-xs w-24 focus:outline-none focus:ring-1 focus:ring-blue-400"
            placeholder="Add paddle…"
            value={newPaddle}
            onChange={e => setNewPaddle(e.target.value)}
          />
          <button onClick={save} disabled={saving} className="text-xs bg-slate-700 text-white px-2 py-0.5 rounded hover:bg-slate-800 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="text-xs w-full border-collapse">
          <thead>
            <tr>
              <th className="text-left text-gray-400 font-medium pb-1 pr-3">Game</th>
              {players.map(p => (
                <th key={p} className="text-left text-gray-400 font-medium pb-1 px-2">{p.split(' ')[0]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sessions.map(s => (
              <tr key={s.idx} className="border-t border-gray-50">
                <td className="py-1 pr-3 text-gray-500 whitespace-nowrap">{s.name.startsWith('2026') ? `Game ${s.idx + 1}` : s.name}</td>
                {players.map(playerName => {
                  const inSession = s.players.includes(playerName);
                  const key = `${s.idx}:${playerName}`;
                  return (
                    <td key={playerName} className="py-1 px-2">
                      {inSession ? (
                        <select
                          className="border border-gray-200 rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                          value={tags[key] ?? ''}
                          onChange={e => setTag(s.idx, playerName, e.target.value)}
                        >
                          <option value="">—</option>
                          {allOptions.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── HomePage ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [nights, setNights] = useState<NightMeta[]>([]);
  const [nightsWithRaw, setNightsWithRaw] = useState<Record<string, Night>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [nightsLoading, setNightsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [paddleEditId, setPaddleEditId] = useState<string | null>(null);

  const loadNights = useCallback(async () => {
    try {
      const list = await apiFetchNights();
      setNights(list);
    } catch {
      setError('Could not load nights from server.');
    } finally {
      setNightsLoading(false);
    }
  }, []);

  useEffect(() => { loadNights(); }, [loadNights]);

  function handleFile(file: File) {
    setError(null);
    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const raw = JSON.parse(e.target?.result as string);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sessions = (raw as any)?.data?.sessions ?? [];
        if (sessions.length === 0) {
          setError('No sessions found. Make sure this is a valid pb.vision JSON export.');
          setLoading(false);
          return;
        }
        // Build meta
        const ge = sessions[0]?.ses?.ge;
        let label = 'Unknown';
        if (ge && typeof ge === 'number') {
          const d = new Date(ge * 1000);
          label = `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
        }
        const names = new Set<string>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const s of sessions) { for (const pd of s?.pd ?? []) { if (pd?.name) names.add(pd.name.trim().split(/\s+/)[0]); } }

        const meta: NightMeta = {
          id: crypto.randomUUID(),
          label,
          sessionCount: sessions.length,
          playerNames: Array.from(names),
          uploadedAt: Date.now(),
        };

        await apiUploadNight(meta, raw);
        await loadNights();
        setLoading(false);
      } catch (err) {
        console.error(err);
        setError('Failed to upload. Make sure it is a valid pb.vision JSON export.');
        setLoading(false);
      }
    };
    reader.readAsText(file);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function startEdit(night: NightMeta) {
    setEditingId(night.id);
    setEditLabel(night.label);
  }

  async function saveEdit(id: string) {
    const trimmed = editLabel.trim();
    if (trimmed) {
      await apiPatchNight(id, { label: trimmed });
      setNights(prev => prev.map(n => n.id === id ? { ...n, label: trimmed } : n));
    }
    setEditingId(null);
  }

  async function viewNight(meta: NightMeta) {
    router.push(`/dashboard?night=${meta.id}`);
  }

  async function openPaddleEditor(meta: NightMeta) {
    if (paddleEditId === meta.id) { setPaddleEditId(null); return; }
    // Need full Night (with raw) for session details
    if (!nightsWithRaw[meta.id]) {
      const full = await apiFetchNightWithRaw(meta.id);
      if (full) setNightsWithRaw(prev => ({ ...prev, [meta.id]: full }));
    }
    setPaddleEditId(meta.id);
  }

  function closePaddleEditor() {
    loadNights();
    setPaddleEditId(null);
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="max-w-xl w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-3 text-4xl font-bold text-gray-900">
            <img src="/icon.png" alt="PickleDash" className="w-12 h-12 rounded-2xl" />
            <span>PickleDash</span>
          </div>
          <p className="text-gray-500 text-base">
            Upload a{' '}
            <a href="https://pb.vision" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              pb.vision
            </a>{' '}
            session export to view your stats.
          </p>
        </div>

        {/* Nights list */}
        {nightsLoading ? (
          <div className="text-center text-gray-400 text-sm py-4">Loading nights…</div>
        ) : nights.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100">
            {nights.map((night) => (
              <div key={night.id}>
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={(e) => {
                    // Don't navigate if clicking a button inside the row
                    if ((e.target as HTMLElement).closest('button, input')) return;
                    viewNight(night);
                  }}
                >
                  <span className="text-lg">🌙</span>
                  <div className="flex-1 min-w-0">
                    {editingId === night.id ? (
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          className="border border-gray-300 rounded px-2 py-0.5 text-sm w-28 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(night.id); if (e.key === 'Escape') setEditingId(null); }}
                          autoFocus
                        />
                        <button onClick={() => saveEdit(night.id)} className="text-xs text-blue-600 hover:underline">Save</button>
                        <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:underline">Cancel</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-800">{night.label}</span>
                        <button onClick={(e) => { e.stopPropagation(); startEdit(night); }} className="text-xs text-gray-400 hover:text-gray-600">✎</button>
                      </div>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">
                      {night.sessionCount} {night.sessionCount === 1 ? 'game' : 'games'} · {night.playerNames.join(', ')}
                      {night.paddleTags && night.paddleTags.length > 0 && (
                        <span className="ml-1 text-violet-400">· 🏓 paddle data</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); openPaddleEditor(night); }}
                      className="text-xs text-gray-400 hover:text-violet-500 px-1"
                      title="Tag paddles"
                    >
                      🏓
                    </button>
                  </div>
                </div>
                {paddleEditId === night.id && nightsWithRaw[night.id] && (
                  <PaddleEditor night={nightsWithRaw[night.id]} onClose={closePaddleEditor} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Upload zone */}
        <div
          className="border-2 border-dashed border-gray-300 rounded-2xl p-10 cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors text-center"
          onClick={() => inputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          {loading ? (
            <div className="space-y-2">
              <div className="text-3xl animate-spin inline-block">⚙️</div>
              <p className="text-gray-500 text-sm">Uploading…</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-4xl">📂</div>
              <p className="text-gray-700 font-medium">Upload another night</p>
              <p className="text-gray-400 text-xs">pb.vision → Sessions → Export sessions → Download File</p>
            </div>
          )}
        </div>

        <input ref={inputRef} type="file" accept=".json,application/json" className="hidden" onChange={onInputChange} />

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm text-center">{error}</div>
        )}
      </div>
    </main>
  );
}
