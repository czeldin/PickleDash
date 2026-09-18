import { OutcomeStatsRow } from '@/types/dashboard';

/**
 * Minimum games a player must have played to appear on leaderboards / "best
 * player" rankings, so small samples don't top a category (a 2-0 player
 * shouldn't lead win%). Adapted from georgemurphy.net's Session Box Score:
 *   - ≤20 total games: the LOWER of 40% of the max games by any player, or
 *     33% of total games.
 *   - >20 total games: the GREATER of 4, or 15% of the max (ceil).
 * Returns the threshold (games played). Players at or above it are "qualified".
 */
export function qualifyThreshold(gamesByPlayer: number[], totalGames: number): number {
  const maxGames = gamesByPlayer.length ? Math.max(...gamesByPlayer) : 0;
  if (totalGames <= 20) {
    return Math.min(Math.ceil(0.4 * maxGames), Math.ceil(0.33 * totalGames));
  }
  return Math.max(4, Math.ceil(0.15 * maxGames));
}

/** Set of pids that meet the participation threshold. */
export function qualifiedPids(outcomes: OutcomeStatsRow[] | undefined): { threshold: number; pids: Set<string> } {
  if (!outcomes || outcomes.length === 0) return { threshold: 0, pids: new Set() };
  const games = outcomes.map((o) => o.gamesPlayed);
  // Total distinct games ≈ the max any single player played is a floor; use the
  // sum of games / (players per game ~4) as an estimate of the session's game
  // count when a global count isn't otherwise available.
  const totalGames = Math.max(...games, Math.round(games.reduce((a, b) => a + b, 0) / 4));
  const threshold = qualifyThreshold(games, totalGames);
  const pids = new Set(outcomes.filter((o) => o.gamesPlayed >= threshold).map((o) => o.pid));
  return { threshold, pids };
}
