export interface PlayerColor {
  text: string;
  bg: string;
}

export const PLAYER_COLORS: PlayerColor[] = [
  { text: '#0077BB', bg: '#D6EAF5' }, // blue
  { text: '#EE7733', bg: '#FDEBD0' }, // orange
  { text: '#009988', bg: '#CCEEEB' }, // teal
  { text: '#CC3377', bg: '#F9D6E8' }, // magenta
  { text: '#AAAA00', bg: '#F5F5CC' }, // olive yellow
  { text: '#882255', bg: '#F0D4E0' }, // wine
];

export interface PlayerMeta {
  pid: string;
  name: string;
  initials: string;
  color: PlayerColor;
}

export interface SessionInfo {
  key: string;        // `${nightId}_${sessionIndex}` — unique across all nights
  index: number;      // session index within its night
  nightId: string;
  nightLabel: string;
  name: string;
}

export interface HeroStats {
  pid: string;
  dupr: number;
  duprDelta: number;
  gamesPlayed: number;
  totalShots: number;
  wins: number;
  losses: number;
}

export interface HighlightRally {
  url: string;
  thumbnailUrl: string;
  rallyNum: number;      // 1-indexed
  shotCount: number;
  avgQuality: number;
  sessionName: string;
  nightLabel: string;
}

export interface SkillRatingsRow {
  pid: string;
  overall: number;      // pb.vision's own overall rating (authoritative)
  // current pb.vision schema
  courtIq: number;
  kitchenGame: number;
  ballControl: number;
  targeting: number;
  offense: number;
  defense: number;
  // legacy schema (older exports) — 0 when absent
  serve: number;
  return: number;
  agility: number;
  consistency: number;
}

export interface SkillRatingsByGameRow {
  pid: string;
  sessionKey: string;
  sessionName: string;
  nightLabel: string;
  timestamp: number; // Unix seconds (ge), 0 if unavailable
  team: number;      // team index (0 or 1) within the session
  overall: number;
  courtIq: number;
  kitchenGame: number;
  ballControl: number;
  targeting: number;
  offense: number;
  defense: number;
  serve: number;
  return: number;
  agility: number;
  consistency: number;
  shotCount: number;
}

export interface ShotAccuracyRow {
  pid: string;
  inShots: number;
  netShots: number;
  outShots: number;
  totalShots: number;
  inPct: number;   // fraction 0-1
  netPct: number;  // fraction 0-1
  outPct: number;  // fraction 0-1
}

export interface SpeedRow {
  pid: string;
  avgMph: number;
  topMph: number;
}

export interface KitchenArrivalRow {
  pid: string;
  third_drop_kitchen_pct: number;
  third_drive_kitchen_pct: number;
  fifth_drop_kitchen_pct: number;
  fifth_drive_kitchen_pct: number;
  third_drop_total: number;
  third_drive_total: number;
  fifth_drop_total: number;
  fifth_drive_total: number;
  // Combined: reached the kitchen on the 3rd/5th shot whether it was a drop OR a drive
  third_kitchen_pct: number;
  third_total: number;
  fifth_kitchen_pct: number;
  fifth_total: number;
}

export interface ShotBreakdownRow {
  pid: string;
  dropCount: number;
  driveCount: number;
  dropPct: number;
  drivePct: number;
}

export interface ShotQualityRow {
  pid: string;
  excellentCount: number;
  excellentPct: number;
  poorCount: number;
  poorPct: number;
  qualityScore: number; // excellentPct - poorPct
  // Per-shot drop quality (from rally-level shot data)
  dropExcellentPct: number;  // avg q.ex for drop shots × 100
  dropTotal: number;          // total drops with quality data
  // Putaway / clean winners
  winnerTotal: number;        // rallies where they hit the final un-errored shot on the winning team
  winnerExcellentPct: number; // avg q.ex for those winners × 100
}

export interface DepthRow {
  pid: string;
  deepPct: number;
  medPct: number;
  shallowPct: number;
}

export interface ErrorRow {
  pid: string;
  gamesPlayed: number;
  total: number;
  totalPerGame: number;
  net: number;
  out: number;
  kitchen: number;
  popups: number;
  unforced: number;
  forced: number;
}

export interface AttackRow {
  pid: string;
  attackTotal: number;        // total sht=4 shots hit
  attackWins: number;         // those shots where team won the rally
  attackWinPct: number;       // attackWins / attackTotal * 100
  attackExcellentPct: number; // avg q.ex for attacks * 100
}

export interface ServingRallyRow {
  sessionKey: string;
  servingTeam: number;
  servedByPid: string;
  // Physical court side per serving-team player this rally, from rally.pls.
  // Keyed by lowercased player name. 0 = Left, 1 = Right.
  sides: Record<string, number>;
  reached: boolean;  // serving team reached the kitchen (hit a dink/volley)
  won: boolean;      // serving team won the point
}

// One row per (rally, team) — covers both teams of every rally, so the
// win-by-side section can measure serving and receiving separately.
export interface RallySideRow {
  sessionKey: string;
  team: number;
  serving: boolean;   // was this team the serving team this rally
  won: boolean;       // did this team win the point
  reached: boolean;   // did this team reach the kitchen (hit a dink/volley)
  // Physical court side per this team's players, from rally.pls.
  // Keyed by lowercased player name. 0 = Left, 1 = Right.
  sides: Record<string, number>;
}

export interface KitchenByGameRow {
  pid: string;
  sessionKey: string;
  team: number;
  k3dHits: number;
  k3dTotal: number;
  k5dHits: number;
  k5dTotal: number;
  teamRalliesTotal: number;    // rallies where this player's team participated
  teamRalliesKitchen: number;  // rallies where this player's team reached the kitchen
}

export interface DinkRow {
  pid: string;
  dinkTotal: number;          // total dink shots (sht=1)
  dinkPerGame: number;        // dinks per game played
  dinkExcellentPct: number;   // avg q.ex for dinks * 100
}

// pb.vision's own per-player coaching flags (the `ca.advice` block)
export interface CoachingRow {
  pid: string;
  items: { kind: string; value: number; relevance: number }[]; // sorted worst→best (low value = weakness)
}

// Winners hit vs points given away, per player
export interface RallyImpactRow {
  pid: string;
  games: number;
  won: number;         // clean rally-ending winners
  lostDirect: number;  // rally-ending errors (net/out/kitchen fault)
  setup: number;       // pop-ups immediately put away by the opponent
}

// Who attacks and who gets picked on
export interface TargetingRow {
  pid: string;
  games: number;
  attacks: number;      // speed-up / attack shots hit (sht=4)
  fin: number;          // finishing attempts
  clean: number;        // clean winners hit (win === 'clean')
  pop: number;          // pop-ups given up
  gotAttacked: number;  // this player's shot immediately followed by an opponent finish
}

// Per-player, per-night rollup for trend charts (raw counts; the UI derives rates)
export interface NightTrendRow {
  pid: string;
  night: string;   // night label (e.g. "9/10/26")
  ts: number;      // unix seconds, for chronological sorting
  gamesPlayed: number; gamesWon: number;
  ratingSum: number; ratingW: number;                          // pb.vision overall
  kServeNum: number; kServeDen: number; kRecvNum: number; kRecvDen: number; // kitchen serve/receive
  dropN: number; driveN: number; dropKitchen: number; driveKitchen: number; dropWon: number;      // 3rd-shot
  dndN: number; dndWon: number; dndPop: number; offN: number; offWon: number; // drive-and-drop
  finAtt: number; finClean: number;                            // finishing
  attacks: number; attackWins: number; pop: number; gotAttacked: number; // targeting / attacks
  riWon: number; riLost: number; riSetup: number;              // rally impact
  accIn: number; accNet: number; accOut: number; accW: number; // shot accuracy (shot-weighted)
  sqEx: number; sqPoor: number; sqW: number;                   // shot quality (excellent / poor, shot-weighted)
  sdDeep: number; sdW: number; rdDeep: number; rdW: number;    // serve/return depth (deep)
  ssSum: number; ssW: number; dvSum: number; dvN: number;      // serve/drive speed
  errTot: number; errNet: number; errOut: number; errUf: number; // errors
  dinkN: number; dinkEx: number;                               // dinks
}

// 3rd-shot drive-and-drop analysis (per the shot's hitter)
export interface DriveDropRow {
  pid: string;
  dropN: number; dropWon: number; dropReached: number;   // 3rd-shot drop
  driveN: number; driveWon: number;                        // 3rd-shot drive (all)
  dndN: number; dndWon: number; dndPop: number;            // drive → 5th drop (drive-and-drop), pop-ups on the 5th
  offN: number; offWon: number;                            // drive → 5th drive/attack (stayed on offense)
}

// Kitchen arrival split by serving vs receiving (from role_data)
export interface KitchenSRRow {
  pid: string;
  serveNum: number; serveDen: number;
  recvNum: number; recvDen: number;
}

// Per-player outcome record across the three lenses: games, points, rallies.
// A player can win games but lose the rally battle (partner-carried) — showing
// all three separates individual contribution from team results.
export interface OutcomeStatsRow {
  pid: string;
  gamesPlayed: number;
  gamesWon: number; gamesLost: number;
  pointsWon: number; pointsLost: number;
  ralliesWon: number; ralliesLost: number;
  netPointsPerGame: number; // (pointsWon - pointsLost) / gamesPlayed
}

// Lightweight partner-adjusted rally performance (approximate — NOT the full
// Bradley-Terry model). "expected" = the rally win% Craig's partners posted
// across ALL their rallies; "actual" = Craig's rally win%. actual − expected > 0
// means the player tended to lift their partners above those partners' own baseline.
export interface PartnerAdjRow {
  pid: string;
  rallies: number;         // rallies with a known partner
  actualWinPct: number;    // this player's rally win% (0-100)
  expectedWinPct: number;  // rally-weighted avg of partners' own overall rally win%
  lift: number;            // actual − expected (percentage points)
}

// Why a player's team lost rallies — attribution by cause. Each lost rally is
// charged to exactly one cause based on its final shot. Outcome-anchored.
export interface LossReasonRow {
  pid: string;
  ralliesLost: number;      // total rallies this player's team lost
  ownNet: number;           // team hit into the net
  ownOut: number;           // team hit out
  ownKitchen: number;       // team kitchen/short fault
  ownUnforced: number;      // team unforced error (not net/out specific)
  popupExploited: number;   // team popped it up, opponent put it away
  oppWinner: number;        // opponent hit a clean winner (not our error)
  other: number;            // uncategorized
}

// One plotted shot for the Court Maps view. Coordinates are in absolute court
// feet (far-left corner origin): x across width 0-20, y along length 0-44 with
// the net at 22. Only produced by the augmented parser (compact lacks coords).
export interface CourtShotRow {
  pid: string;
  sessionKey: string;
  vid: string;                     // pb.vision video id (for deep-links)
  si: number;                      // session index within the video
  rallyNum: number;                // 1-based rally index (for deep-links)
  shotNum: number;                 // 1-based shot index in the rally (serve = 1)
  type: string;                    // "drive" | "drop" | "dink" | "lob" | "atp" | ...
  fromX: number; fromY: number;    // contact point (abs court feet)
  toX: number; toY: number;        // landing point (abs court feet)
  endZone: string;                 // "deep"|"mid"|"short"|"kitchen"|"net"|"out"
  won: boolean;                    // did the hitter's team win the rally
  isPutaway: boolean;
  isAttack?: boolean;              // speed-up / overhead (is_speedup or atp)
  isDefense?: boolean;            // a reset or a dig (defensive get)
  isReset?: boolean;              // pb.vision reset (volley that took pace off a hard ball)
  popup: 'exploited' | 'potential' | null;
  quality: number | null;          // shot.quality.overall (0-1)
  pressure?: number | null;        // shot.quality.pressure (0-1, positional pressure faced)
  // pb.vision fault flags on this shot (from errors.faults). These drive the
  // "Why We Lost" causes, so Film Room's net/out/short queues match them exactly
  // rather than relying on end-zone alone (a shot can be flagged short while its
  // zone reads kitchen/mid).
  faultNet?: boolean;
  faultOut?: boolean;              // landed out (excludes intercepted near-misses)
  faultShort?: boolean;
  isFinal?: boolean;               // was this the rally's last shot (the point-ender)
  // This shot was the hitter's LAST shot before the opponents put the next ball
  // away for a winner — the "feed" that got attacked. Powers the "They hit a
  // winner" film queue (what you gave them, right before they finished it).
  setupForOppWinner?: boolean;
}

export interface DashboardData {
  sessions: SessionInfo[];
  highlights: HighlightRally[];
  players: PlayerMeta[];
  hero: HeroStats[];
  skillRatings: SkillRatingsRow[];
  skillRatingsByGame: SkillRatingsByGameRow[];
  shotAccuracy: ShotAccuracyRow[];
  serveSpeed: SpeedRow[];
  driveSpeed: SpeedRow[];
  kitchenArrival: KitchenArrivalRow[];
  thirdShot: ShotBreakdownRow[];
  fifthShot: ShotBreakdownRow[];
  shotQuality: ShotQualityRow[];
  serveDepth: DepthRow[];
  returnDepth: DepthRow[];
  errors: ErrorRow[];
  attacks: AttackRow[];
  dinks: DinkRow[];
  kitchenByGame: KitchenByGameRow[];
  servingRallies: ServingRallyRow[];
  rallySides: RallySideRow[];
  coaching: CoachingRow[];
  rallyImpact: RallyImpactRow[];
  targeting: TargetingRow[];
  kitchenSR: KitchenSRRow[];
  driveDrop: DriveDropRow[];
  nightTrends: NightTrendRow[];
  courtShots?: CourtShotRow[]; // only present for augmented nights (needs coordinates)
  outcomeStats?: OutcomeStatsRow[];
  lossReasons?: LossReasonRow[];
  partnerAdj?: PartnerAdjRow[];
}
