import { DashboardData } from '@/types/dashboard';

// Assigned in alphabetical pid order so the same player always gets the same name
const STAR_WARS_NAMES = ['Anakin', 'Finn', 'Han', 'Leia', 'Luke', 'Obi', 'Poe', 'Rey', 'Yoda', 'Mace'];

export function anonymizeData(data: DashboardData): DashboardData {
  // Sort players by pid so assignment is stable across sessions
  const sorted = [...data.players].sort((a, b) => a.pid.localeCompare(b.pid));
  const nameMap = new Map<string, string>(
    sorted.map((p, i) => [p.pid, STAR_WARS_NAMES[i % STAR_WARS_NAMES.length]])
  );

  // Replace any name-like token in a string.
  // Uses a 4-char prefix match so "Chris" catches "Christian", "Xavi" catches "Xavier", etc.
  function replaceNames(text: string): string {
    let result = text;
    for (const player of sorted) {
      const starWars = nameMap.get(player.pid)!;
      const firstName = player.name; // already first-name-only
      const prefix = firstName.slice(0, Math.min(4, firstName.length));
      // Match word starting with the prefix (case-insensitive)
      result = result.replace(
        new RegExp(`\\b${prefix}\\w*`, 'gi'),
        starWars
      );
    }
    return result;
  }

  return {
    ...data,
    players: data.players.map((p) => {
      const name = nameMap.get(p.pid) ?? p.name;
      return { ...p, name, initials: name.slice(0, 2).toUpperCase() };
    }),
    highlights: data.highlights.map((h) => ({
      ...h,
      sessionName: replaceNames(h.sessionName),
    })),
  };
}
