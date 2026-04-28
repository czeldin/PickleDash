export interface Night {
  id: string;         // stable unique ID
  label: string;      // e.g. "4/22/26"
  raw: unknown;       // original parsed JSON
  sessionCount: number;
  playerNames: string[];
  uploadedAt: number;
}

// A session reference that is unique across all nights
export interface GlobalSession {
  key: string;        // `${nightId}_${sessionIndex}`
  nightId: string;
  sessionIndex: number;
  name: string;
  nightLabel: string;
}
