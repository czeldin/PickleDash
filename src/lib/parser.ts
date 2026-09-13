import { SERVE_SPEED_BUCKETS } from '@/types/pbvision';
import {
  DashboardData, PlayerMeta, PLAYER_COLORS,
  HeroStats, SkillRatingsRow, SkillRatingsByGameRow, ShotAccuracyRow, SpeedRow,
  KitchenArrivalRow, ShotBreakdownRow, ShotQualityRow, DepthRow, ErrorRow, SessionInfo, HighlightRally,
  AttackRow, DinkRow, KitchenByGameRow, ServingRallyRow, RallySideRow,
  CoachingRow, RallyImpactRow, TargetingRow, KitchenSRRow, DriveDropRow, NightTrendRow,
} from '@/types/dashboard';

interface RawShot {
  pid: number; t: number[]; ss: number; st: number; sht?: number; vol?: number;
  win?: string; fin?: number;
  q?: { ex?: number };
  err?: { f?: { n?: number; out?: number; sh?: number; k?: number }; pop?: number; uf?: number };
}
type RoleSide = { total?: number; kitchen_arrival?: number };
interface RawPd {
  name: string; team: number; shot_count: number;
  role_data?: { serving?: { oneself?: RoleSide }; receiving?: { oneself?: RoleSide } };
  trends: {
    ratings?: { serve?: number; return?: number; offense?: number; defense?: number; agility?: number; consistency?: number; overall?: number; court_iq?: number; kitchen_game?: number; ball_control?: number; targeting?: number };
    shot_accuracy?: { in?: number; net?: number; out?: number };
    serve_depth?: { deep?: number; medium?: number; shallow?: number };
    return_depth?: { deep?: number; medium?: number; shallow?: number };
    serve_speed?: number[];
    shot_quality?: { excellent?: number; poor?: number };
    flags?: { won_game?: boolean };
  };
}
interface RawSession {
  ses: { vid: string; si: number; name?: string; ge?: number };
  ral: { sh: RawShot[]; wt: number; pls?: { left?: number }[] }[];
  pd: RawPd[];
  gd?: { game_outcome?: number[] };
  ca?: Record<string, { advice?: { kind: string; value: number; relevance: number }[] }>;
}

/** Returns a human-readable session label.
 *  If the raw name contains at least one player's first name, keep it.
 *  Otherwise, fall back to HH:MM from the session's Unix timestamp (ge),
 *  or "Game N" if no timestamp is available. */
function getSessionName(s: RawSession, index: number): string {
  const rawName = s.ses?.name ?? '';
  const playerFirstNames = (s.pd ?? [])
    .map((p) => p.name?.trim().split(/\s+/)[0])
    .filter((n): n is string => Boolean(n));
  const hasPlayerName = playerFirstNames.some((n) =>
    rawName.toLowerCase().includes(n.toLowerCase())
  );
  if (rawName && hasPlayerName) return rawName;
  const ge = s.ses?.ge;
  if (ge && typeof ge === 'number') {
    const d = new Date(ge * 1000);
    const h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'pm' : 'am';
    const h12 = h % 12 || 12;
    return `${h12}:${m} ${ampm}`;
  }
  return rawName || `Game ${index + 1}`;
}

function getInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase()).slice(0, 2).join('');
}
function toFirstName(name: string) {
  return name.trim().split(/\s+/)[0];
}
function serveSpeedAvg(f: number[]) {
  let ws = 0, vs = 0;
  for (let i = 0; i < f.length; i++) { ws += f[i]; vs += f[i] * SERVE_SPEED_BUCKETS[i].mid; }
  return ws > 0 ? vs / ws : 0;
}
function serveSpeedTop(f: number[]) {
  for (let i = f.length - 1; i >= 0; i--) if (f[i] > 0) return SERVE_SPEED_BUCKETS[i].mid;
  return 0;
}
function driveSpeedMph(t0: number, t1: number): number | null {
  const ms = t1 - t0;
  if (ms <= 0) return null;
  return Math.max(10, Math.min(90, 55 - ((ms - 200) / 800) * 35));
}
// A shot that indicates the hitter was up at the kitchen: a dink (sht=1), a
// volley shot type (sht=5), or any shot hit as a volley (vol=1 — a block,
// counter, or volley-drop taken at the net before the ball bounced).
function isKitchenShot(sh: RawShot): boolean {
  return sh.sht === 1 || sh.sht === 5 || sh.vol === 1;
}

// Did `team` (a roster team, 0 or 1) reach the kitchen within their next 5 shots
// after `afterIdx`? The hitting team is pd[pid].team — shot.st is the court side,
// not the team.
function reachedKitchen(shots: RawShot[], pd: RawPd[], team: number, afterIdx: number) {
  let checked = 0;
  for (let i = afterIdx + 1; i < shots.length && checked < 5; i++) {
    if (pd[shots[i].pid]?.team === team) { if (isKitchenShot(shots[i])) return true; checked++; }
  }
  return false;
}

interface PlayerAccum {
  name: string; sessionCount: number; totalShots: number;
  overallSum: number; overallW: number;
  skillSums: { serve: number; return: number; offense: number; defense: number; agility: number; consistency: number; courtIq: number; kitchenGame: number; ballControl: number; targeting: number };
  // Per-skill shot-count weight — only counts sessions where that skill is present,
  // so skills missing from older exports aren't diluted by zeros.
  skillWeights: { serve: number; return: number; offense: number; defense: number; agility: number; consistency: number; courtIq: number; kitchenGame: number; ballControl: number; targeting: number };
  accInSum: number; accNetSum: number; accOutSum: number; accW: number;
  ssFreacs: number[]; ssW: number;
  driveSpeeds: number[];
  k3Drop: [number, number]; k3Drive: [number, number]; k5Drop: [number, number]; k5Drive: [number, number];
  t3Drop: number; t3Drive: number; t5Drop: number; t5Drive: number;
  sqExSum: number; sqPoSum: number; sqW: number;
  dropExSum: number; dropExW: number;
  winnerTotal: number; winnerExSum: number; winnerExW: number;
  attackTotal: number; attackWins: number; attackExSum: number; attackExW: number;
  dinkTotal: number; dinkExSum: number; dinkExW: number;
  sdDeep: number; sdMed: number; sdShallow: number; sdW: number;
  rdDeep: number; rdMed: number; rdShallow: number; rdW: number;
  errNet: number; errOut: number; errShort: number; errPop: number; errUf: number; errForced: number;
  wins: number; losses: number;
}
function makeAccum(name: string): PlayerAccum {
  return {
    name, sessionCount: 0, totalShots: 0, overallSum: 0, overallW: 0,
    skillSums: { serve: 0, return: 0, offense: 0, defense: 0, agility: 0, consistency: 0, courtIq: 0, kitchenGame: 0, ballControl: 0, targeting: 0 },
    skillWeights: { serve: 0, return: 0, offense: 0, defense: 0, agility: 0, consistency: 0, courtIq: 0, kitchenGame: 0, ballControl: 0, targeting: 0 },
    accInSum: 0, accNetSum: 0, accOutSum: 0, accW: 0,
    ssFreacs: new Array(17).fill(0), ssW: 0, driveSpeeds: [],
    k3Drop: [0, 0], k3Drive: [0, 0], k5Drop: [0, 0], k5Drive: [0, 0],
    t3Drop: 0, t3Drive: 0, t5Drop: 0, t5Drive: 0,
    sqExSum: 0, sqPoSum: 0, sqW: 0,
    dropExSum: 0, dropExW: 0,
    winnerTotal: 0, winnerExSum: 0, winnerExW: 0,
    attackTotal: 0, attackWins: 0, attackExSum: 0, attackExW: 0,
    dinkTotal: 0, dinkExSum: 0, dinkExW: 0,
    sdDeep: 0, sdMed: 0, sdShallow: 0, sdW: 0,
    rdDeep: 0, rdMed: 0, rdShallow: 0, rdW: 0,
    errNet: 0, errOut: 0, errShort: 0, errPop: 0, errUf: 0, errForced: 0,
    wins: 0, losses: 0,
  };
}

function getSessionKitchenByPlayer(session: RawSession): Map<string, { team: number; k3dHits: number; k3dTotal: number; k5dHits: number; k5dTotal: number; teamRalliesTotal: number; teamRalliesKitchen: number }> {
  const result = new Map<string, { team: number; k3dHits: number; k3dTotal: number; k5dHits: number; k5dTotal: number; teamRalliesTotal: number; teamRalliesKitchen: number }>();
  const { pd, ral } = session;
  if (!Array.isArray(pd) || !Array.isArray(ral)) return result;
  for (const player of pd) {
    const nm = player.name?.trim()?.toLowerCase();
    if (nm) result.set(nm, { team: player.team ?? 0, k3dHits: 0, k3dTotal: 0, k5dHits: 0, k5dTotal: 0, teamRalliesTotal: 0, teamRalliesKitchen: 0 });
  }
  // Per-team rally kitchen arrival
  const teamRally = new Map<number, { total: number; kitchen: number }>();
  for (const rally of ral) {
    const shots = rally.sh ?? [];
    // Drop shot tracking per player
    for (let idx = 0; idx < shots.length; idx++) {
      const shot = shots[idx];
      if (shot.sht !== 2) continue;
      const player = pd[shot.pid];
      if (!player) continue;
      const nm = player.name?.trim()?.toLowerCase();
      if (!nm) continue;
      const r = result.get(nm);
      if (!r) continue;
      if (idx === 2) { r.k3dTotal++; if (reachedKitchen(shots, pd, player.team, idx)) r.k3dHits++; }
      else if (idx === 4) { r.k5dTotal++; if (reachedKitchen(shots, pd, player.team, idx)) r.k5dHits++; }
    }
    // Team-level kitchen arrival: only count rallies where this team is serving
    if (shots.length > 0) {
      const servingTeam = pd[shots[0].pid]?.team;
      if (servingTeam != null) {
        if (!teamRally.has(servingTeam)) teamRally.set(servingTeam, { total: 0, kitchen: 0 });
        const tr = teamRally.get(servingTeam)!;
        tr.total++;
        if (shots.some((s) => pd[s.pid]?.team === servingTeam && isKitchenShot(s))) tr.kitchen++;
      }
    }
  }
  // Assign team rally stats to each player on that team
  for (const stats of result.values()) {
    const tr = teamRally.get(stats.team) ?? { total: 0, kitchen: 0 };
    stats.teamRalliesTotal = tr.total;
    stats.teamRalliesKitchen = tr.kitchen;
  }
  return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRawSessions(raw: unknown): RawSession[] { return (raw as any)?.data?.sessions ?? []; }

export function getSessionInfos(raw: unknown, nightId: string, nightLabel: string): SessionInfo[] {
  return getRawSessions(raw).map((s, i) => ({
    key: `${nightId}_${i}`,
    index: i,
    nightId,
    nightLabel,
    name: getSessionName(s, i),
  }));
}

function processSession(session: RawSession, accumMap: Map<string, PlayerAccum>) {
  const { ral, pd, gd } = session;

  // Determine winning team from game_outcome
  const outcome = gd?.game_outcome;
  let winningTeam: number | null = null;
  if (Array.isArray(outcome) && outcome.length >= 2) {
    if (outcome[0] > outcome[1]) winningTeam = 0;
    else if (outcome[1] > outcome[0]) winningTeam = 1;
  }
  if (!Array.isArray(pd) || pd.length === 0) return;
  function getOrCreate(name: string) {
    const key = name.trim().toLowerCase();
    if (!accumMap.has(key)) accumMap.set(key, makeAccum(name.trim()));
    return accumMap.get(key)!;
  }
  for (const player of pd) {
    const nm = player.name?.trim(); if (!nm) continue;
    const acc = getOrCreate(nm);
    acc.sessionCount += 1;
    if (winningTeam !== null) {
      if (player.team === winningTeam) acc.wins += 1; else acc.losses += 1;
    }
    const sc = player.shot_count ?? 0; acc.totalShots += sc;
    const t = player.trends ?? {};
    if (t.ratings?.overall != null) { acc.overallSum += t.ratings.overall * sc; acc.overallW += sc; }
    if (t.ratings && sc > 0) {
      const r = t.ratings;
      // Accumulate each skill only for sessions that actually have it, so a skill
      // absent from older exports isn't averaged against zeros.
      const addSkill = (key: keyof PlayerAccum['skillSums'], val: number | undefined) => {
        if (val != null) { acc.skillSums[key] += val * sc; acc.skillWeights[key] += sc; }
      };
      addSkill('serve', r.serve); addSkill('return', r.return);
      addSkill('agility', r.agility); addSkill('consistency', r.consistency);
      addSkill('offense', r.offense); addSkill('defense', r.defense);
      addSkill('courtIq', r.court_iq); addSkill('kitchenGame', r.kitchen_game);
      addSkill('ballControl', r.ball_control); addSkill('targeting', r.targeting);
    }
    if (t.shot_accuracy && sc > 0) {
      const sa = t.shot_accuracy;
      acc.accInSum += (sa.in ?? 0) * sc; acc.accNetSum += (sa.net ?? 0) * sc; acc.accOutSum += (sa.out ?? 0) * sc; acc.accW += sc;
    }
    if (Array.isArray(t.serve_speed) && sc > 0) {
      for (let i = 0; i < 17; i++) acc.ssFreacs[i] += (t.serve_speed[i] ?? 0) * sc; acc.ssW += sc;
    }
    if (t.shot_quality && sc > 0) { acc.sqExSum += (t.shot_quality.excellent ?? 0) * sc; acc.sqPoSum += (t.shot_quality.poor ?? 0) * sc; acc.sqW += sc; }
    if (t.serve_depth && sc > 0) { const sd = t.serve_depth; acc.sdDeep += (sd.deep ?? 0) * sc; acc.sdMed += (sd.medium ?? 0) * sc; acc.sdShallow += (sd.shallow ?? 0) * sc; acc.sdW += sc; }
    if (t.return_depth && sc > 0) { const rd = t.return_depth; acc.rdDeep += (rd.deep ?? 0) * sc; acc.rdMed += (rd.medium ?? 0) * sc; acc.rdShallow += (rd.shallow ?? 0) * sc; acc.rdW += sc; }
  }
  if (!Array.isArray(ral)) return;
  for (const rally of ral) {
    const shots = rally.sh ?? [];
    const wt = (rally as { sh: RawShot[]; wt?: number }).wt;
    for (let idx = 0; idx < shots.length; idx++) {
      const shot = shots[idx]; const player = pd[shot.pid]; if (!player) continue;
      const acc = getOrCreate(player.name?.trim() ?? '');
      if (idx >= 2 && shot.sht === 0 && shot.t?.length >= 2) { const spd = driveSpeedMph(shot.t[0], shot.t[1]); if (spd !== null) acc.driveSpeeds.push(spd); }
      if (shot.err) { const f = shot.err.f ?? {}; if (f.n) acc.errNet++; if (f.out) acc.errOut++; if (f.sh) acc.errShort++; if (shot.err.pop) acc.errPop++; if (shot.err.uf) acc.errUf++; if ((f.n || f.out || f.sh) && !shot.err.uf) acc.errForced++; }
      // Drop quality
      if (shot.sht === 2 && shot.q?.ex != null) { acc.dropExSum += shot.q.ex; acc.dropExW++; }
      // Attack (speed-up / overhead): sht=4
      if (shot.sht === 4) {
        acc.attackTotal++;
        if (wt != null && player.team === wt) acc.attackWins++;
        if (shot.q?.ex != null) { acc.attackExSum += shot.q.ex; acc.attackExW++; }
      }
      // Dink quality: sht=1
      if (shot.sht === 1) {
        acc.dinkTotal++;
        if (shot.q?.ex != null) { acc.dinkExSum += shot.q.ex; acc.dinkExW++; }
      }
      if (idx === 2) {
        if (shot.sht === 2) { acc.t3Drop++; acc.k3Drop[1]++; if (reachedKitchen(shots, pd, player.team, idx)) acc.k3Drop[0]++; }
        else if (shot.sht === 0) { acc.t3Drive++; acc.k3Drive[1]++; if (reachedKitchen(shots, pd, player.team, idx)) acc.k3Drive[0]++; }
      }
      if (idx === 4) {
        if (shot.sht === 2) { acc.t5Drop++; acc.k5Drop[1]++; if (reachedKitchen(shots, pd, player.team, idx)) acc.k5Drop[0]++; }
        else if (shot.sht === 0) { acc.t5Drive++; acc.k5Drive[1]++; if (reachedKitchen(shots, pd, player.team, idx)) acc.k5Drive[0]++; }
      }
    }
    // Clean winner: last shot, no error, hitter's team won
    if (shots.length > 0 && wt != null) {
      const last = shots[shots.length - 1];
      const wp = pd[last.pid];
      if (!last.err && wp && wp.team === wt) {
        const wacc = getOrCreate(wp.name?.trim() ?? '');
        wacc.winnerTotal++;
        if (last.q?.ex != null) { wacc.winnerExSum += last.q.ex; wacc.winnerExW++; }
      }
    }
  }
}

function accumsToData(accums: PlayerAccum[], allSessions: SessionInfo[]): DashboardData {
  accums.sort((a, b) => (b.overallW > 0 ? b.overallSum / b.overallW : 0) - (a.overallW > 0 ? a.overallSum / a.overallW : 0));
  const players: PlayerMeta[] = accums.map((acc, i) => ({
    pid: acc.name.trim().toLowerCase(), name: toFirstName(acc.name), initials: getInitials(acc.name), color: PLAYER_COLORS[i % PLAYER_COLORS.length],
  }));
  function pct(h: number, t: number) { return t > 0 ? (h / t) * 100 : 0; }
  const hero: HeroStats[] = accums.map((acc, i) => ({ pid: players[i].pid, dupr: acc.overallW > 0 ? acc.overallSum / acc.overallW : 0, duprDelta: 0, gamesPlayed: acc.sessionCount, totalShots: acc.totalShots, wins: acc.wins, losses: acc.losses }));
  const skillRatings: SkillRatingsRow[] = accums.map((acc, i) => {
    const avg = (key: keyof PlayerAccum['skillSums']) => { const w = acc.skillWeights[key]; return w > 0 ? acc.skillSums[key] / w : 0; };
    return {
      pid: players[i].pid,
      overall: acc.overallW > 0 ? acc.overallSum / acc.overallW : 0,
      serve: avg('serve'), return: avg('return'), offense: avg('offense'), defense: avg('defense'),
      agility: avg('agility'), consistency: avg('consistency'), courtIq: avg('courtIq'),
      kitchenGame: avg('kitchenGame'), ballControl: avg('ballControl'), targeting: avg('targeting'),
    };
  });
  const shotAccuracy: ShotAccuracyRow[] = accums.map((acc, i) => { const w = acc.accW || 1; const inF = acc.accInSum / w, netF = acc.accNetSum / w, outF = acc.accOutSum / w; return { pid: players[i].pid, inShots: Math.round(inF * acc.totalShots), netShots: Math.round(netF * acc.totalShots), outShots: Math.round(outF * acc.totalShots), totalShots: acc.totalShots, inPct: inF, netPct: netF, outPct: outF }; });
  const serveSpeed: SpeedRow[] = accums.map((acc, i) => { const w = acc.ssW; const norm = acc.ssFreacs.map((v) => (w > 0 ? v / w : 0)); return { pid: players[i].pid, avgMph: serveSpeedAvg(norm), topMph: serveSpeedTop(norm) }; });
  const driveSpeed: SpeedRow[] = accums.map((acc, i) => { const sp = acc.driveSpeeds; return { pid: players[i].pid, avgMph: sp.length > 0 ? sp.reduce((a, b) => a + b, 0) / sp.length : 0, topMph: sp.length > 0 ? Math.max(...sp) : 0 }; });
  const kitchenArrival: KitchenArrivalRow[] = accums.map((acc, i) => ({ pid: players[i].pid, third_drop_kitchen_pct: pct(acc.k3Drop[0], acc.k3Drop[1]), third_drive_kitchen_pct: pct(acc.k3Drive[0], acc.k3Drive[1]), fifth_drop_kitchen_pct: pct(acc.k5Drop[0], acc.k5Drop[1]), fifth_drive_kitchen_pct: pct(acc.k5Drive[0], acc.k5Drive[1]), third_drop_total: acc.k3Drop[1], third_drive_total: acc.k3Drive[1], fifth_drop_total: acc.k5Drop[1], fifth_drive_total: acc.k5Drive[1], third_kitchen_pct: pct(acc.k3Drop[0] + acc.k3Drive[0], acc.k3Drop[1] + acc.k3Drive[1]), third_total: acc.k3Drop[1] + acc.k3Drive[1], fifth_kitchen_pct: pct(acc.k5Drop[0] + acc.k5Drive[0], acc.k5Drop[1] + acc.k5Drive[1]), fifth_total: acc.k5Drop[1] + acc.k5Drive[1] }));
  const thirdShot: ShotBreakdownRow[] = accums.map((acc, i) => { const t = acc.t3Drop + acc.t3Drive; return { pid: players[i].pid, dropCount: acc.t3Drop, driveCount: acc.t3Drive, dropPct: pct(acc.t3Drop, t), drivePct: pct(acc.t3Drive, t) }; });
  const fifthShot: ShotBreakdownRow[] = accums.map((acc, i) => { const t = acc.t5Drop + acc.t5Drive; return { pid: players[i].pid, dropCount: acc.t5Drop, driveCount: acc.t5Drive, dropPct: pct(acc.t5Drop, t), drivePct: pct(acc.t5Drive, t) }; });
  const shotQuality: ShotQualityRow[] = accums.map((acc, i) => {
    const w = acc.sqW; const exF = w > 0 ? acc.sqExSum / w : 0, poF = w > 0 ? acc.sqPoSum / w : 0;
    const dropExcellentPct = acc.dropExW > 0 ? (acc.dropExSum / acc.dropExW) * 100 : 0;
    const winnerExcellentPct = acc.winnerExW > 0 ? (acc.winnerExSum / acc.winnerExW) * 100 : 0;
    const excellentPct = exF * 100, poorPct = poF * 100;
    return { pid: players[i].pid, excellentCount: Math.round(exF * acc.totalShots), excellentPct, poorCount: Math.round(poF * acc.totalShots), poorPct, qualityScore: excellentPct - poorPct, dropExcellentPct, dropTotal: acc.dropExW, winnerTotal: acc.winnerTotal, winnerExcellentPct };
  });
  const serveDepth: DepthRow[] = accums.map((acc, i) => { const w = acc.sdW || 1; return { pid: players[i].pid, deepPct: (acc.sdDeep / w) * 100, medPct: (acc.sdMed / w) * 100, shallowPct: (acc.sdShallow / w) * 100 }; });
  const returnDepth: DepthRow[] = accums.map((acc, i) => { const w = acc.rdW || 1; return { pid: players[i].pid, deepPct: (acc.rdDeep / w) * 100, medPct: (acc.rdMed / w) * 100, shallowPct: (acc.rdShallow / w) * 100 }; });
  const errors: ErrorRow[] = accums.map((acc, i) => { const g = acc.sessionCount || 1; return { pid: players[i].pid, gamesPlayed: acc.sessionCount, total: acc.errNet + acc.errOut + acc.errShort + acc.errPop, totalPerGame: (acc.errNet + acc.errOut + acc.errShort + acc.errPop) / g, net: acc.errNet / g, out: acc.errOut / g, kitchen: acc.errShort / g, popups: acc.errPop / g, unforced: acc.errUf / g, forced: acc.errForced / g }; });
  const attacks: AttackRow[] = accums.map((acc, i) => {
    const t = acc.attackTotal;
    return { pid: players[i].pid, attackTotal: t, attackWins: acc.attackWins, attackWinPct: t > 0 ? (acc.attackWins / t) * 100 : 0, attackExcellentPct: acc.attackExW > 0 ? (acc.attackExSum / acc.attackExW) * 100 : 0 };
  });
  const dinks: DinkRow[] = accums.map((acc, i) => {
    const g = acc.sessionCount || 1;
    return { pid: players[i].pid, dinkTotal: acc.dinkTotal, dinkPerGame: acc.dinkTotal / g, dinkExcellentPct: acc.dinkExW > 0 ? (acc.dinkExSum / acc.dinkExW) * 100 : 0 };
  });
  return { sessions: allSessions, highlights: [], players, hero, skillRatings, skillRatingsByGame: [], shotAccuracy, serveSpeed, driveSpeed, kitchenArrival, thirdShot, fifthShot, shotQuality, serveDepth, returnDepth, errors, attacks, dinks, kitchenByGame: [], servingRallies: [], rallySides: [], coaching: [], rallyImpact: [], targeting: [], kitchenSR: [], driveDrop: [], nightTrends: [] };
}

// Parse multiple nights, filtering to selectedSessionKeys (undefined = all)
export function parseMultipleNights(
  nights: { id: string; label: string; raw: unknown }[],
  selectedSessionKeys?: Set<string>
): DashboardData {
  const accumMap = new Map<string, PlayerAccum>();
  const allSessions: SessionInfo[] = [];
  const rawHighlights: HighlightRally[] = [];
  const skillRatingsByGame: SkillRatingsByGameRow[] = [];
  const kitchenByGame: KitchenByGameRow[] = [];
  const servingRallies: ServingRallyRow[] = [];
  const rallySides: RallySideRow[] = [];

  // New per-player aggregates (keyed by lowercased name)
  const riMap = new Map<string, { games: number; won: number; lostDirect: number; setup: number }>();
  const tgtMap = new Map<string, { games: number; attacks: number; fin: number; clean: number; pop: number; gotAttacked: number }>();
  const ksMap = new Map<string, { serveNum: number; serveDen: number; recvNum: number; recvDen: number }>();
  const coachMap = new Map<string, Map<string, { vs: number; rs: number; n: number }>>();
  const ddMap = new Map<string, { dropN: number; dropWon: number; dropReached: number; driveN: number; driveWon: number; dndN: number; dndWon: number; dndPop: number; offN: number; offWon: number }>();
  const dd = (f: string) => { let v = ddMap.get(f); if (!v) { v = { dropN: 0, dropWon: 0, dropReached: 0, driveN: 0, driveWon: 0, dndN: 0, dndWon: 0, dndPop: 0, offN: 0, offWon: 0 }; ddMap.set(f, v); } return v; };
  type NT = { pid: string; night: string; ts: number; gp: number; gw: number; rS: number; rW: number; ksN: number; ksD: number; krN: number; krD: number; dropN: number; driveN: number; dropK: number; dropW: number; dndN: number; dndW: number; dndP: number; offN: number; offW: number; finA: number; finC: number; atk: number; pop: number; got: number; riW: number; riL: number; riS: number };
  const ntMap = new Map<string, NT>();
  const nt = (pid: string, night: string, ts: number) => { const k = pid + '|' + night; let v = ntMap.get(k); if (!v) { v = { pid, night, ts, gp: 0, gw: 0, rS: 0, rW: 0, ksN: 0, ksD: 0, krN: 0, krD: 0, dropN: 0, driveN: 0, dropK: 0, dropW: 0, dndN: 0, dndW: 0, dndP: 0, offN: 0, offW: 0, finA: 0, finC: 0, atk: 0, pop: 0, got: 0, riW: 0, riL: 0, riS: 0 }; ntMap.set(k, v); } return v; };
  const ri = (f: string) => { let v = riMap.get(f); if (!v) { v = { games: 0, won: 0, lostDirect: 0, setup: 0 }; riMap.set(f, v); } return v; };
  const tgt = (f: string) => { let v = tgtMap.get(f); if (!v) { v = { games: 0, attacks: 0, fin: 0, clean: 0, pop: 0, gotAttacked: 0 }; tgtMap.set(f, v); } return v; };
  const ks = (f: string) => { let v = ksMap.get(f); if (!v) { v = { serveNum: 0, serveDen: 0, recvNum: 0, recvDen: 0 }; ksMap.set(f, v); } return v; };

  for (const night of nights) {
    const rawSessions = getRawSessions(night.raw);
    for (let i = 0; i < rawSessions.length; i++) {
      const key = `${night.id}_${i}`;
      const s = rawSessions[i];
      const sessionName = getSessionName(s, i);
      const sessionInfo: SessionInfo = { key, index: i, nightId: night.id, nightLabel: night.label, name: sessionName };
      allSessions.push(sessionInfo);
      if (!selectedSessionKeys || selectedSessionKeys.has(key)) {
        processSession(s, accumMap);
        // Per-game kitchen arrival for pairing analysis
        for (const [pid, stats] of getSessionKitchenByPlayer(s).entries()) {
          kitchenByGame.push({ pid, sessionKey: key, ...stats });
        }
        // Per-rally serving data for left/right side pairing analysis.
        // Court side comes from rally.pls (per-player position: left=1 means the
        // player is on the left half), NOT the serve shot's ss field — ss only
        // encodes which end the serving *team* is on, so it's constant per game.
        if (Array.isArray(s.ral)) {
          const pd = s.pd ?? [];
          for (const rally of s.ral) {
            const shots = rally.sh ?? [];
            if (shots.length === 0) continue;
            const serve = shots[0];
            const servingPlayer = pd[serve.pid];
            if (!servingPlayer) continue;
            const servedByPid = servingPlayer.name?.trim()?.toLowerCase();
            if (!servedByPid) continue;
            // Physical side per serving-team player: 0 = Left, 1 = Right.
            const pls = rally.pls;
            const sides: Record<string, number> = {};
            if (Array.isArray(pls)) {
              for (let pi = 0; pi < pd.length; pi++) {
                const pl = pd[pi];
                if (!pl || pl.team !== serve.st) continue;
                const nm = pl.name?.trim()?.toLowerCase();
                if (!nm) continue;
                sides[nm] = pls[pi]?.left ? 0 : 1;
              }
            }
            // Track kitchen arrival and the point outcome separately so the UI
            // can show both. Reached = the serving team hit a dink/volley.
            const reached = shots.some((s2) => s2.st === serve.st && isKitchenShot(s2));
            const won = rally.wt === serve.st;
            servingRallies.push({
              sessionKey: key,
              servingTeam: serve.st,
              servedByPid,
              sides,
              reached,
              won,
            });

            // Per-team side rows (both teams) for the win-by-side section, so we
            // can split serving vs receiving. Skip rallies with no clear winner.
            // IMPORTANT: the hitting team is the player's roster team
            // (pd[pid].team), NOT shot.st — st is the court side, which is
            // constant-ish per rally and does not identify the team. wt is a
            // roster team, so `won` compares correctly.
            if (Array.isArray(pls) && (rally.wt === 0 || rally.wt === 1)) {
              const servingTeamRoster = pd[serve.pid]?.team;
              const teamSides = new Map<number, Record<string, number>>();
              for (let pi = 0; pi < pd.length; pi++) {
                const pl = pd[pi];
                if (!pl || !pls[pi]) continue;
                const nm = pl.name?.trim()?.toLowerCase();
                if (!nm) continue;
                if (!teamSides.has(pl.team)) teamSides.set(pl.team, {});
                teamSides.get(pl.team)![nm] = pls[pi]?.left ? 0 : 1;
              }
              for (const [team, teamSide] of teamSides) {
                rallySides.push({
                  sessionKey: key,
                  team,
                  serving: team === servingTeamRoster,
                  won: rally.wt === team,
                  reached: shots.some((s2) => pd[s2.pid]?.team === team && isKitchenShot(s2)),
                  sides: teamSide,
                });
              }
            }
          }
        }
        // ── Rally impact, targeting, kitchen serve/receive, coaching ──
        {
          const pdx = s.pd ?? [];
          for (let pi = 0; pi < pdx.length; pi++) {
            const p = pdx[pi]; const f = p?.name?.trim()?.toLowerCase(); if (!f) continue;
            ri(f).games++; tgt(f).games++;
            const rs = p.role_data?.serving?.oneself; const rr = p.role_data?.receiving?.oneself;
            if (rs) { const kk = ks(f); kk.serveDen += rs.total ?? 0; kk.serveNum += rs.kitchen_arrival ?? 0; }
            if (rr) { const kk = ks(f); kk.recvDen += rr.total ?? 0; kk.recvNum += rr.kitchen_arrival ?? 0; }
            const adv = s.ca?.[String(pi)]?.advice;
            if (Array.isArray(adv)) {
              let m = coachMap.get(f); if (!m) { m = new Map(); coachMap.set(f, m); }
              for (const a of adv) { let e = m.get(a.kind); if (!e) { e = { vs: 0, rs: 0, n: 0 }; m.set(a.kind, e); } e.vs += a.value; e.rs += a.relevance; e.n++; }
            }
          }
          if (Array.isArray(s.ral)) {
            for (const rally of s.ral) {
              const shots = rally.sh ?? []; if (!shots.length) continue;
              if (rally.wt !== 0 && rally.wt !== 1) continue;
              const last = shots[shots.length - 1];
              const lf = pdx[last.pid]?.name?.trim()?.toLowerCase();
              if (lf) { if (last.err?.f) ri(lf).lostDirect++; else ri(lf).won++; }
              shots.forEach((sh, i) => {
                const f = pdx[sh.pid]?.name?.trim()?.toLowerCase(); if (!f) return;
                const tt = tgt(f);
                if (sh.sht === 4) tt.attacks++;
                if (sh.fin) tt.fin++;
                if (sh.win === 'clean') tt.clean++;
                if (sh.err?.pop) tt.pop++;
                const nxt = shots[i + 1];
                if (nxt && pdx[nxt.pid]?.team !== pdx[sh.pid]?.team && (nxt.fin || nxt.win === 'clean')) {
                  tt.gotAttacked++;
                  if (sh.err?.pop) ri(f).setup++;
                }
              });

              // Drive-and-drop: attribute the serving team's 3rd shot to its hitter.
              const st = pdx[shots[0].pid]?.team;
              if (st !== undefined) {
                const team = shots.filter((x) => pdx[x.pid]?.team === st);
                const t3 = team[1];
                const f3 = t3 && pdx[t3.pid]?.name?.trim()?.toLowerCase();
                if (t3 && f3) {
                  const won = rally.wt === st;
                  const d = dd(f3);
                  if (t3.sht === 2) {
                    d.dropN++; if (won) d.dropWon++;
                    if (reachedKitchen(shots, pdx, st, shots.indexOf(t3))) d.dropReached++;
                  } else if (t3.sht === 0) {
                    d.driveN++; if (won) d.driveWon++;
                    const t5 = team[2];
                    if (t5 && t5.sht === 2) { d.dndN++; if (won) d.dndWon++; if (t5.err?.pop) d.dndPop++; }
                    else if (t5 && (t5.sht === 0 || t5.sht === 4)) { d.offN++; if (won) d.offWon++; }
                  }
                }
              }
            }
          }
        }

        // ── Per-night trend rollup (mirrors the all-time metrics, keyed by night) ──
        {
          const nl = night.label; const ts = s.ses?.ge ?? 0; const pdn = s.pd ?? [];
          for (const p of pdn) {
            const f = p?.name?.trim()?.toLowerCase(); if (!f) continue;
            const v = nt(f, nl, ts);
            v.gp++; if (p.trends?.flags?.won_game) v.gw++;
            const sc = p.shot_count ?? 0; const ov = p.trends?.ratings?.overall;
            if (ov != null && sc > 0) { v.rS += ov * sc; v.rW += sc; }
            const rs = p.role_data?.serving?.oneself; if (rs) { v.ksD += rs.total ?? 0; v.ksN += rs.kitchen_arrival ?? 0; }
            const rr = p.role_data?.receiving?.oneself; if (rr) { v.krD += rr.total ?? 0; v.krN += rr.kitchen_arrival ?? 0; }
          }
          if (Array.isArray(s.ral)) {
            for (const rally of s.ral) {
              const shots = rally.sh ?? []; if (!shots.length) continue;
              // per-shot: finishing + targeting
              shots.forEach((sh, i) => {
                const f = pdn[sh.pid]?.name?.trim()?.toLowerCase(); if (!f) return; const v = nt(f, nl, ts);
                if (sh.fin) v.finA++; if (sh.win === 'clean') v.finC++;
                if (sh.sht === 4) v.atk++; if (sh.err?.pop) v.pop++;
                const nx = shots[i + 1];
                if (nx && pdn[nx.pid]?.team !== pdn[sh.pid]?.team && (nx.fin || nx.win === 'clean')) v.got++;
              });
              if (rally.wt !== 0 && rally.wt !== 1) continue;
              // rally impact: last-shot attribution
              const last = shots[shots.length - 1]; const lf = pdn[last.pid]?.name?.trim()?.toLowerCase();
              if (lf) { const v = nt(lf, nl, ts); if (last.err?.f) v.riL++; else v.riW++; }
              // setup: pop-up put away by opponent
              shots.forEach((sh, i) => { const nx = shots[i + 1]; if (sh.err?.pop && nx && pdn[nx.pid]?.team !== pdn[sh.pid]?.team && (nx.fin || nx.win === 'clean')) { const f = pdn[sh.pid]?.name?.trim()?.toLowerCase(); if (f) nt(f, nl, ts).riS++; } });
              // 3rd shot + drive-and-drop
              const st2 = pdn[shots[0].pid]?.team; if (st2 === undefined) continue;
              const team = shots.filter((x) => pdn[x.pid]?.team === st2);
              const t3 = team[1]; const f3 = t3 && pdn[t3.pid]?.name?.trim()?.toLowerCase();
              if (t3 && f3) {
                const v = nt(f3, nl, ts); const won = rally.wt === st2;
                if (t3.sht === 2) { v.dropN++; if (won) v.dropW++; if (reachedKitchen(shots, pdn, st2, shots.indexOf(t3))) v.dropK++; }
                else if (t3.sht === 0) {
                  v.driveN++; const t5 = team[2];
                  if (t5 && t5.sht === 2) { v.dndN++; if (won) v.dndW++; if (t5.err?.pop) v.dndP++; }
                  else if (t5 && (t5.sht === 0 || t5.sht === 4)) { v.offN++; if (won) v.offW++; }
                }
              }
            }
          }
        }
        // Collect per-game skill ratings for the By Game breakdown tab
        if (Array.isArray(s.pd)) {
          for (const player of s.pd) {
            const nm = player.name?.trim(); if (!nm) continue;
            const sc = player.shot_count ?? 0;
            const r = player.trends?.ratings;
            if (r && sc > 0) {
              skillRatingsByGame.push({
                pid: nm.toLowerCase(),
                sessionKey: key,
                sessionName,
                nightLabel: night.label,
                timestamp: s.ses?.ge ?? 0,
                team: player.team ?? 0,
                overall: r.overall ?? 0,
                courtIq: r.court_iq ?? 0,
                kitchenGame: r.kitchen_game ?? 0,
                ballControl: r.ball_control ?? 0,
                targeting: r.targeting ?? 0,
                offense: r.offense ?? 0,
                defense: r.defense ?? 0,
                serve: r.serve ?? 0,
                return: r.return ?? 0,
                agility: r.agility ?? 0,
                consistency: r.consistency ?? 0,
                shotCount: sc,
              });
            }
          }
        }
        // Collect rally highlights for this session
        const vid = s.ses?.vid;
        const si = s.ses?.si ?? i;
        if (vid && Array.isArray(s.ral)) {
          for (let r = 0; r < s.ral.length; r++) {
            const rally = s.ral[r];
            const shots = rally.sh ?? [];
            if (shots.length < 6) continue; // skip short rallies
            const qualities = shots.map((sh) => sh.q?.ex ?? 0).filter((q) => q > 0);
            const avgQuality = qualities.length > 0 ? qualities.reduce((a, b) => a + b, 0) / qualities.length : 0;
            rawHighlights.push({
              url: `https://pb.vision/video/${vid}/${si}/explore?shots=${r + 1}.1&numBefore=0&numAfter=999`,
              thumbnailUrl: `https://storage.googleapis.com/pbv-pro/${vid}/poster.jpg`,
              rallyNum: r + 1,
              shotCount: shots.length,
              avgQuality,
              sessionName,
              nightLabel: night.label,
            });
          }
        }
      }
    }
  }

  // Score = avgQuality * sqrt(shotCount) so longer rallies beat short perfect ones
  const highlights = rawHighlights
    .sort((a, b) => (b.avgQuality * Math.sqrt(b.shotCount)) - (a.avgQuality * Math.sqrt(a.shotCount)))
    .slice(0, 12);

  const data = accumsToData(Array.from(accumMap.values()), allSessions);

  const coaching: CoachingRow[] = data.players.map((p) => {
    const m = coachMap.get(p.pid);
    const items = m
      ? [...m.entries()].map(([kind, e]) => ({ kind, value: e.vs / e.n, relevance: e.rs / e.n })).sort((a, b) => a.value - b.value)
      : [];
    return { pid: p.pid, items };
  });
  const rallyImpact: RallyImpactRow[] = data.players.map((p) => {
    const v = riMap.get(p.pid) ?? { games: 0, won: 0, lostDirect: 0, setup: 0 };
    return { pid: p.pid, ...v };
  });
  const targeting: TargetingRow[] = data.players.map((p) => {
    const v = tgtMap.get(p.pid) ?? { games: 0, attacks: 0, fin: 0, clean: 0, pop: 0, gotAttacked: 0 };
    return { pid: p.pid, ...v };
  });
  const kitchenSR: KitchenSRRow[] = data.players.map((p) => {
    const v = ksMap.get(p.pid) ?? { serveNum: 0, serveDen: 0, recvNum: 0, recvDen: 0 };
    return { pid: p.pid, ...v };
  });
  const driveDrop: DriveDropRow[] = data.players.map((p) => {
    const v = ddMap.get(p.pid) ?? { dropN: 0, dropWon: 0, dropReached: 0, driveN: 0, driveWon: 0, dndN: 0, dndWon: 0, dndPop: 0, offN: 0, offWon: 0 };
    return { pid: p.pid, ...v };
  });
  const knownPids = new Set(data.players.map((p) => p.pid));
  const nightTrends: NightTrendRow[] = [...ntMap.values()]
    .filter((v) => knownPids.has(v.pid))
    .map((v) => ({
      pid: v.pid, night: v.night, ts: v.ts, gamesPlayed: v.gp, gamesWon: v.gw, ratingSum: v.rS, ratingW: v.rW,
      kServeNum: v.ksN, kServeDen: v.ksD, kRecvNum: v.krN, kRecvDen: v.krD,
      dropN: v.dropN, driveN: v.driveN, dropKitchen: v.dropK, dropWon: v.dropW,
      dndN: v.dndN, dndWon: v.dndW, dndPop: v.dndP, offN: v.offN, offWon: v.offW,
      finAtt: v.finA, finClean: v.finC, attacks: v.atk, pop: v.pop, gotAttacked: v.got,
      riWon: v.riW, riLost: v.riL, riSetup: v.riS,
    }));

  return { ...data, highlights, skillRatingsByGame, kitchenByGame, servingRallies, rallySides, coaching, rallyImpact, targeting, kitchenSR, driveDrop, nightTrends };
}

// Convenience wrapper for a single file
export function parseFile(raw: unknown, nightId = 'default', nightLabel = ''): DashboardData {
  return parseMultipleNights([{ id: nightId, label: nightLabel, raw }]);
}
