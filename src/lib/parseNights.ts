import { DashboardData } from '@/types/dashboard';
import { Night } from '@/types/nights';
import { parseMultipleNights } from '@/lib/parser';
import { parseAugmentedNights } from '@/lib/parserAugmented';

/**
 * Count the sessions a compact export contains, so we can tell whether a night's
 * cached augmented coverage is COMPLETE (one augmented file per compact session).
 * Session keys are `${nightId}_${index}`, so a partial set would shift indexes
 * and break game filters — hence we only use augmented when coverage is full.
 */
function compactSessionCount(raw: unknown): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessions = (raw as any)?.data?.sessions;
  return Array.isArray(sessions) ? sessions.length : 0;
}

function hasFullAugmented(n: Night): boolean {
  const aug = n.augmentedSessions;
  if (!Array.isArray(aug) || aug.length === 0) return false;
  const compactCount = compactSessionCount(n.raw);
  return compactCount > 0 && aug.length === compactCount;
}

/**
 * Parse nights into DashboardData, preferring pb.vision AUGMENTED insights
 * (real coordinates, ball height, is_putaway, exploited/potential pop-ups,
 * finishing ability) whenever a night has complete augmented coverage, and
 * falling back to the compact export otherwise.
 *
 * Nights are split into two groups and parsed by the matching parser; results
 * are merged. Because both parsers emit the same `${nightId}_${index}` session
 * keys and identical row shapes, the game filter and all downstream sections
 * work uniformly across the two sources.
 */
export function parseNightsAuto(nights: Night[], gameFilter?: Set<string>): DashboardData {
  const augNights = nights.filter(hasFullAugmented);
  const compactNights = nights.filter((n) => !hasFullAugmented(n));

  if (augNights.length === 0) return parseMultipleNights(nights, gameFilter);
  if (compactNights.length === 0) {
    return parseAugmentedNights(
      augNights.map((n) => ({
        id: n.id, label: n.label,
        augmentedSessions: n.augmentedSessions!, paddleTags: n.paddleTags,
      })),
      gameFilter,
    );
  }

  // Mixed: parse each source, then merge the row arrays. Player identity is keyed
  // by lowercased first name in both parsers, so players with the same name merge
  // by pid across sources.
  const a = parseAugmentedNights(
    augNights.map((n) => ({
      id: n.id, label: n.label,
      augmentedSessions: n.augmentedSessions!, paddleTags: n.paddleTags,
    })),
    gameFilter,
  );
  const c = parseMultipleNights(compactNights, gameFilter);
  return mergeDashboards(a, c);
}

/**
 * Merge two DashboardData objects from disjoint night sets. Row arrays are
 * concatenated; per-player rows for the same pid are combined where a simple
 * concat would duplicate a player. For the initial migration we keep this
 * conservative: sessions/highlights/per-game rows concat cleanly (distinct
 * keys), and per-player aggregate rows are re-derived by summing is not trivial,
 * so we prefer the augmented row when a pid exists in both and append the rest.
 */
function mergeDashboards(a: DashboardData, c: DashboardData): DashboardData {
  const byPid = <T extends { pid: string }>(primary: T[], secondary: T[]): T[] => {
    const seen = new Set(primary.map((r) => r.pid));
    return [...primary, ...secondary.filter((r) => !seen.has(r.pid))];
  };
  const players = byPid(a.players, c.players);
  return {
    sessions: [...a.sessions, ...c.sessions],
    highlights: [...a.highlights, ...c.highlights],
    players,
    hero: byPid(a.hero, c.hero),
    skillRatings: byPid(a.skillRatings, c.skillRatings),
    skillRatingsByGame: [...a.skillRatingsByGame, ...c.skillRatingsByGame],
    shotAccuracy: byPid(a.shotAccuracy, c.shotAccuracy),
    serveSpeed: byPid(a.serveSpeed, c.serveSpeed),
    driveSpeed: byPid(a.driveSpeed, c.driveSpeed),
    kitchenArrival: byPid(a.kitchenArrival, c.kitchenArrival),
    thirdShot: byPid(a.thirdShot, c.thirdShot),
    fifthShot: byPid(a.fifthShot, c.fifthShot),
    shotQuality: byPid(a.shotQuality, c.shotQuality),
    serveDepth: byPid(a.serveDepth, c.serveDepth),
    returnDepth: byPid(a.returnDepth, c.returnDepth),
    errors: byPid(a.errors, c.errors),
    attacks: byPid(a.attacks, c.attacks),
    dinks: byPid(a.dinks, c.dinks),
    kitchenByGame: [...a.kitchenByGame, ...c.kitchenByGame],
    servingRallies: [...a.servingRallies, ...c.servingRallies],
    rallySides: [...a.rallySides, ...c.rallySides],
    coaching: byPid(a.coaching, c.coaching),
    rallyImpact: byPid(a.rallyImpact, c.rallyImpact),
    targeting: byPid(a.targeting, c.targeting),
    kitchenSR: byPid(a.kitchenSR, c.kitchenSR),
    driveDrop: byPid(a.driveDrop, c.driveDrop),
    nightTrends: [...a.nightTrends, ...c.nightTrends],
    // Augmented-only rows: only the augmented side produces these.
    courtShots: a.courtShots,
    outcomeStats: a.outcomeStats,
    lossReasons: a.lossReasons,
  };
}
