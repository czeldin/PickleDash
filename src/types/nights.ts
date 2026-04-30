export interface PaddleTag {
  sessionIdx: number;   // index within this night's sessions array
  playerName: string;   // exact name as it appears in pb.vision
  paddle: string;       // e.g. "RPM", "Luzz"
}

export interface Night {
  id: string;         // stable unique ID
  label: string;      // e.g. "4/22/26"
  raw: unknown;       // original parsed JSON
  sessionCount: number;
  playerNames: string[];
  uploadedAt: number;
  paddleTags?: PaddleTag[];
}

// A session reference that is unique across all nights
export interface GlobalSession {
  key: string;        // `${nightId}_${sessionIndex}`
  nightId: string;
  sessionIndex: number;
  name: string;
  nightLabel: string;
}
