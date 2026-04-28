import { Night } from '@/types/nights';

let _nights: Night[] = [];

export function getNights(): Night[] { return _nights; }

export function addNight(night: Night) {
  _nights = [..._nights, night];
}

export function removeNight(id: string) {
  _nights = _nights.filter((n) => n.id !== id);
}

export function clearNights() { _nights = []; }

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
