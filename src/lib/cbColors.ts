// Color-blind-safe palette (Craig is red/green color-blind).
// We NEVER use red-vs-green to carry meaning. Instead:
//   - GOOD / positive / lift  → BLUE
//   - BAD  / negative / lower → ORANGE
//   - neutral                 → gray
// and we always pair color with a NON-COLOR cue (a +/- sign, a ▲/▼ arrow, or a
// text label) so the meaning survives without hue discrimination.
//
// Tailwind blue-* and orange-* are distinguishable under red/green color
// blindness (they differ in both hue-axis the eye still has and in lightness).

// Text color for a good/bad/neutral cell (single-value quality, e.g. a rating).
// `good`/`bad` thresholds are decided by the caller; this just maps the verdict.
export function cbText(verdict: 'good' | 'bad' | 'neutral' | 'off'): string {
  switch (verdict) {
    case 'good': return 'text-blue-700 font-semibold';
    case 'bad': return 'text-orange-700';
    case 'neutral': return 'text-gray-700';
    case 'off': return 'text-gray-400';
  }
}

// Text color for a signed delta (>=0 good/blue, <0 bad/orange). Caller prepends
// the sign and, where space allows, an arrow via cbArrow().
export function cbDeltaText(value: number, goodIsPositive = true): string {
  const good = goodIsPositive ? value >= 0 : value <= 0;
  return good ? 'text-blue-700' : 'text-orange-700';
}

// ▲ / ▼ glyph for a signed value — a redundant, hue-independent direction cue.
export function cbArrow(value: number, goodIsPositive = true): string {
  const good = goodIsPositive ? value >= 0 : value <= 0;
  return good ? '▲' : '▼';
}

// Pill classes for "best / worst in the group" highlights (was green/red).
export const cbBestPill = 'bg-blue-100 text-blue-800';
export const cbWorstPill = 'bg-orange-100 text-orange-800';

// Twin-bar "good vs bad" fills (e.g. In vs Net, Excellent vs Poor).
export const cbGoodBar = 'bg-blue-500';
export const cbBadBar = 'bg-orange-500';
export const cbGoodDot = 'bg-blue-500';
export const cbBadDot = 'bg-orange-500';
