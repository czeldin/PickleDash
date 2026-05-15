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
  serve: number;
  return: number;
  offense: number;
  defense: number;
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
  serve: number;
  return: number;
  offense: number;
  defense: number;
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

export interface DinkRow {
  pid: string;
  dinkTotal: number;          // total dink shots (sht=1)
  dinkPerGame: number;        // dinks per game played
  dinkExcellentPct: number;   // avg q.ex for dinks * 100
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
}
