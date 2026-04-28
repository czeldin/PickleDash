// pb.vision compact JSON schema types

export interface PbVisionFile {
  ses: Session[];
  ral: Rally[];
  pd: PlayerData[];
}

export interface Session {
  id: string;
  vid: string;   // video ID for deep links
  si: number;    // session index for deep links
  dt?: string;   // date
  loc?: string;  // location
}

export interface Rally {
  id: string;
  sid: string;   // session ID
  n: number;     // rally number (1-indexed)
  sh: Shot[];    // shots in the rally
  win?: string;  // winning player ID
  st?: number;   // serving team (0 or 1)
}

export interface Shot {
  pid: string;   // player ID
  sht: number;   // shot type: 0=drive, 1=dink, 2=drop, 3=lob, 4=reset, 5=volley, 6=overhead, 7=atp, 8=erne
  t: number[];   // timestamps [start, end] in ms
  err?: ShotError;
  team?: number; // team index
}

export interface ShotError {
  f?: {
    n?: number;   // net error
    out?: number; // out error
    k?: number;   // kitchen/NVZ error
  };
  pop?: number;   // popup
  uf?: number;    // unforced error
}

export interface PlayerData {
  pid: string;   // player ID
  nm: string;    // player name
  sid: string;   // session ID
  trends: PlayerTrends;
}

export interface PlayerTrends {
  ratings?: SkillRatings;
  shot_accuracy?: ShotAccuracy;
  serve_depth?: DepthDistribution;
  return_depth?: DepthDistribution;
  serve_speed?: number[];   // 17-bucket distribution
  shot_quality?: ShotQuality;
  dupr?: number;            // overall DUPR rating
}

export interface SkillRatings {
  serve?: number;
  return?: number;
  offense?: number;
  defense?: number;
  agility?: number;
  consistency?: number;
}

export interface ShotAccuracy {
  in?: number;
  net?: number;
  out?: number;
  total?: number;
  serve_in?: number;
  return_in?: number;
}

export interface DepthDistribution {
  deep?: number;
  med?: number;
  shallow?: number;
}

export interface ShotQuality {
  excellent?: number;  // 0–1 fraction
  poor?: number;       // 0–1 fraction
}

// 17 serve speed buckets: <17.5, 17.5-20, 20-22.5, ..., >=55 mph
export const SERVE_SPEED_BUCKETS = [
  { label: '<17.5', mid: 16 },
  { label: '17.5–20', mid: 18.75 },
  { label: '20–22.5', mid: 21.25 },
  { label: '22.5–25', mid: 23.75 },
  { label: '25–27.5', mid: 26.25 },
  { label: '27.5–30', mid: 28.75 },
  { label: '30–32.5', mid: 31.25 },
  { label: '32.5–35', mid: 33.75 },
  { label: '35–37.5', mid: 36.25 },
  { label: '37.5–40', mid: 38.75 },
  { label: '40–42.5', mid: 41.25 },
  { label: '42.5–45', mid: 43.75 },
  { label: '45–47.5', mid: 46.25 },
  { label: '47.5–50', mid: 48.75 },
  { label: '50–52.5', mid: 51.25 },
  { label: '52.5–55', mid: 53.75 },
  { label: '≥55', mid: 57 },
];
