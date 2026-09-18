// pb.vision AUGMENTED insights JSON schema types.
//
// This is the rich, loss-free "insights" export (format=augmented) — as opposed
// to the compact export the legacy `pbvision.ts` / `parser.ts` read. It carries
// real per-shot ball tracking (speed, trajectory, quality), authoritative
// per-player kitchen-arrival counts, and explicit putaway/popup flags, so the
// augmented parser can use measured values instead of the compact proxies.
//
// Every field is optional/nullable where the source may omit it (singles games
// leave `player_data` slots null; rallies without a clear winner leave
// `winning_team` null; some shots lack ball tracking).

export interface AugRoleSide {
  total?: number;
  kitchen_arrival?: number;
}

export interface AugRatings {
  // Current augmented schema.
  kitchen_game?: number;
  ball_control?: number;
  defense?: number;
  offense?: number;
  court_iq?: number;
  targeting?: number;
  overall?: number;
  // Legacy skills — NOT present in the augmented export; the dashboard row-type
  // still has slots for them, so the parser defaults these to 0.
  serve?: number;
  return?: number;
  agility?: number;
  consistency?: number;
}

export interface AugDepth {
  out?: number;
  net?: number;
  shallow?: number;
  medium?: number;
  deep?: number;
}

export interface AugPlayerTrends {
  ratings?: AugRatings;
  serve_depth?: AugDepth;
  return_depth?: AugDepth;
  serve_speed?: number[]; // 17 buckets, 0-1 fractions
  kitchen_arrivals?: { serving_side?: number; receiving_side?: number };
  shot_quality?: { excellent?: number; good?: number; average?: number; fair?: number; poor?: number };
  shot_selection?: { drive?: number; dink?: number; reset?: number; drop?: number };
  shot_accuracy?: { in?: number; net?: number; out?: number };
  flags?: { won_game?: boolean };
  num_rallies?: number;
  num_rallies_won?: number;
}

export interface AugPlayerData {
  team?: number;
  name?: string;
  avatar_id?: number;
  shot_count?: number;
  total_team_shot_percentage?: number;
  left_side_percentage?: number;
  court_coverage?: { total_distance_covered?: number; average_x_coverage_percentage?: number };
  role_data?: {
    serving?: { oneself?: AugRoleSide; partner?: AugRoleSide };
    receiving?: { oneself?: AugRoleSide; partner?: AugRoleSide };
  };
  kitchen_arrival_percentage?: unknown;
  team_kitchen_arrival?: {
    serving?: { numerator?: number; denominator?: number };
    returning?: { numerator?: number; denominator?: number };
  };
  positional_performance?: { forward_pressure?: number; finishing_ability?: number };
  trends?: AugPlayerTrends;
}

export type AugShotType = 'smash' | 'lob' | 'dink' | 'drop' | 'drive' | 'atp' | 'erne' | null;

export interface AugBallMovement {
  speed?: number;        // real mph
  distance?: number;
  distance_from_baseline?: number;
  height_over_net?: number; // feet
  crossed_net?: boolean;
  is_volleyed?: boolean;
  angles?: { yaw?: number; pitch?: number; direction?: string };
  trajectory?: {
    confidence?: number;
    start?: { location?: { x?: number; y?: number; z?: number }; zone?: string };
    peak?: { x?: number; y?: number; z?: number };
    end?: { location?: { x?: number; y?: number; z?: number }; zone?: string };
  };
}

export interface AugFaultOut {
  outcome?: string;
  direction?: string;
  side?: string;
}

export interface AugShotErrors {
  faults?: { net?: boolean; short?: boolean; out?: AugFaultOut };
  unforced?: boolean;
  popup?: 'exploited' | 'potential';
}

export interface AugPosition {
  x?: number;
  y?: number;
}

export interface AugShot {
  player_id?: number; // 0-3, index into player_data
  is_final?: boolean;
  is_volley?: boolean;
  is_speedup?: boolean;
  is_reset?: boolean;
  is_passing?: boolean;
  is_poach?: boolean;
  is_putaway?: boolean;
  shot_type?: AugShotType;
  vertical_type?: string; // "dig" | "neutral" | "overhead"
  stroke_side?: string;
  stroke_type?: string;
  quality?: { overall?: number; execution?: number; pressure?: number };
  player_positions?: (AugPosition | null)[];
  advantage_scale?: (number | null)[];
  shooter_positioning_score?: number;
  partner_positioning_score?: number;
  start_ms?: number;
  end_ms?: number;
  resulting_ball_movement?: AugBallMovement;
  errors?: AugShotErrors;
  winner_type?: 'clean' | 'forced_fault';
  tags?: Record<string, unknown>;
}

export interface AugRallyPlayer {
  started_on_left_side?: boolean;
  had_arrival_opportunity?: boolean;
  kitchen_arrivals?: { since_ms?: number; until_ms?: number; ft_moved?: { x?: number; y?: number } }[];
}

export interface AugRally {
  start_ms?: number;
  end_ms?: number;
  winning_team?: number | null; // 0 | 1 | null (no clear winner)
  scoring_info?: { running_score?: number[]; likely_bad?: boolean; server_number?: number };
  players?: (AugRallyPlayer | null)[];
  shots?: AugShot[];
  team_stats?: unknown;
}

export interface AugCoachAdvice {
  advice?: { kind: string; value: number; ci?: [number, number]; method?: string; relevance: number }[];
}

export interface AugHighlight {
  rally_idx?: number;
  shot_start_idx?: number;
  shot_end_idx?: number;
  rally_ending?: boolean;
  s?: number;
  e?: number;
  kind?: string;
  events?: { kind: string; shot_idx?: number; score?: number; ms?: number; end_shot_idx?: number }[];
  score?: number;
  short_description?: string;
}

export interface AugSession {
  session_type?: string;
  num_players?: number;
  vid?: string;
  session_index?: number; // 0-based
  sessionIdx?: number;
  name?: string;
  gameEpoch?: number; // unix seconds
  videoDurationMs?: number;
}

export interface AugGameData {
  avg_shots?: number;
  game_outcome?: number[]; // [team0Score, team1Score]
  scoring?: string;
  kitchen_rallies?: number;
  team_percentage_to_kitchen?: number[];
  longest_rally?: { rally_idx?: number; num_shots?: number };
}

// The top-level augmented insights document — one per game.
export interface AugInsights {
  version?: string;
  session?: AugSession;
  rallies?: AugRally[];
  game_data?: AugGameData;
  player_data?: (AugPlayerData | null)[];
  highlights?: AugHighlight[];
  coach_advice?: (AugCoachAdvice | null)[];
  stats?: unknown;
  serverMetadata?: unknown;
}
