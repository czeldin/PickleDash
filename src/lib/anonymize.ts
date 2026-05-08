import { DashboardData } from '@/types/dashboard';

// Assigned in alphabetical pid order so the same player always gets the same name
const STAR_WARS_NAMES = ['Anakin', 'Finn', 'Han', 'Leia', 'Luke', 'Obi', 'Poe', 'Rey', 'Yoda', 'Mace'];

export function anonymizeData(data: DashboardData): DashboardData {
  // Sort players by pid so assignment is stable across sessions
  const sorted = [...data.players].sort((a, b) => a.pid.localeCompare(b.pid));
  const nameMap = new Map<string, string>(
    sorted.map((p, i) => [p.pid, STAR_WARS_NAMES[i % STAR_WARS_NAMES.length]])
  );

  return {
    ...data,
    players: data.players.map((p) => {
      const name = nameMap.get(p.pid) ?? p.name;
      return { ...p, name, initials: name.slice(0, 2).toUpperCase() };
    }),
  };
}
