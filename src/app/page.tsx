'use client';

import { useRef, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { parseMultipleNights } from '@/lib/parser';
import { setDashboardData } from '@/lib/store';
import { getNights, addNight, removeNight, detectNightLabel, detectPlayerNames } from '@/lib/nightStore';
import { Night } from '@/types/nights';

export default function HomePage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [nights, setNights] = useState<Night[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');

  useEffect(() => {
    const existing = getNights();
    if (existing.length === 0) {
      fetch('/data/night.json')
        .then((r) => r.json())
        .then((raw) => {
          const label = detectNightLabel(raw);
          const playerNames = detectPlayerNames(raw);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const sessionCount = ((raw as any)?.data?.sessions ?? []).length;
          if (sessionCount > 0) {
            const night: Night = { id: 'preloaded', label, raw, sessionCount, playerNames, uploadedAt: 0 };
            addNight(night);
          }
          setNights(getNights());
        })
        .catch(() => setNights(existing));
    } else {
      setNights(existing);
    }
  }, []);

  function handleFile(file: File) {
    setError(null);
    setLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const raw = JSON.parse(e.target?.result as string);
        const label = detectNightLabel(raw);
        const playerNames = detectPlayerNames(raw);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sessionCount = ((raw as any)?.data?.sessions ?? []).length;
        if (sessionCount === 0) {
          setError('No sessions found. Make sure this is a valid pb.vision JSON export.');
          setLoading(false);
          return;
        }
        const night: Night = { id: crypto.randomUUID(), label, raw, sessionCount, playerNames, uploadedAt: Date.now() };
        addNight(night);
        setNights(getNights());
        setLoading(false);
      } catch {
        setError('Failed to parse file. Make sure it is a valid pb.vision JSON export.');
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

  function deleteNight(id: string) {
    removeNight(id);
    setNights(getNights());
  }

  function startEdit(night: Night) {
    setEditingId(night.id);
    setEditLabel(night.label);
  }

  function saveEdit(id: string) {
    const updated = getNights().map((n) => n.id === id ? { ...n, label: editLabel.trim() || n.label } : n);
    import('@/lib/nightStore').then(({ clearNights, addNight: add }) => {
      clearNights();
      updated.forEach(add);
      setNights(getNights());
    });
    setEditingId(null);
  }

  function viewNight(night: Night) {
    const data = parseMultipleNights([night]);
    setDashboardData(data);
    router.push('/dashboard');
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
        {nights.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100">
            {nights.map((night) => (
              <div key={night.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-lg">🌙</span>
                <div className="flex-1 min-w-0">
                  {editingId === night.id ? (
                    <div className="flex items-center gap-2">
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
                      <button onClick={() => startEdit(night)} className="text-xs text-gray-400 hover:text-gray-600">✎</button>
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5">
                    {night.sessionCount} {night.sessionCount === 1 ? 'game' : 'games'} · {night.playerNames.slice(0, 3).join(', ')}{night.playerNames.length > 3 ? ` +${night.playerNames.length - 3}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => viewNight(night)}
                    className="px-3 py-1 rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold transition-colors"
                  >
                    View →
                  </button>
                  {night.id !== 'preloaded' && (
                    <button
                      onClick={() => deleteNight(night.id)}
                      className="text-gray-300 hover:text-red-400 text-lg leading-none"
                      title="Remove"
                    >
                      ×
                    </button>
                  )}
                </div>
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
              <p className="text-gray-500 text-sm">Parsing…</p>
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
