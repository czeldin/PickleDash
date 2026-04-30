import { Night, PaddleTag } from '@/types/nights';

const STORAGE_KEY = 'pickledash_nights';

function load(): Night[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Night[]) : [];
  } catch { return []; }
}

function save(nights: Night[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nights));
  } catch (e) {
    // Likely exceeded storage quota (~5MB)
    console.warn('Could not save nights to localStorage — file may be too large.', e);
  }
}

export function getNights(): Night[] {
  return load();
}

export function addNight(night: Night) {
  const nights = load();
  save([...nights, night]);
}

export function removeNight(id: string) {
  save(load().filter((n) => n.id !== id));
}

export function clearNights() {
  save([]);
}

export function updateNightPaddleTags(id: string, tags: PaddleTag[]) {
  save(load().map((n) => n.id === id ? { ...n, paddleTags: tags } : n));
}

// Returns per-session player lists from raw pb.vision data
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getNightSessionDetails(night: Night): { idx: number; name: string; players: string[] }[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessions = (night.raw as any)?.data?.sessions ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return sessions.map((s: any, idx: number) => ({
    idx,
    name: s.ses?.name ?? `Game ${idx + 1}`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    players: (s.pd ?? []).map((p: any) => p.name?.trim()).filter(Boolean) as string[],
  }));
}

// Auto-detect date label from raw pb.vision JSON
export function detectNightLabel(raw: unknown): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessions = (raw as any)?.data?.sessions;
    if (!Array.isArray(sessions) || sessions.length === 0) return 'Unknown';
    const ge = sessions[0]?.ses?.ge;
    if (ge && typeof ge === 'number') {
      const d = new Date(ge * 1000);
      return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
    }
  } catch { /* ignore */ }
  return 'Unknown';
}

// Collect all unique player names from a raw file
export function detectPlayerNames(raw: unknown): string[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessions = (raw as any)?.data?.sessions ?? [];
    const names = new Set<string>();
    for (const s of sessions) {
      for (const pd of s?.pd ?? []) {
        if (pd?.name) names.add(pd.name.trim());
      }
    }
    return Array.from(names);
  } catch { return []; }
}
