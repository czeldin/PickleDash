import { SERVE_SPEED_BUCKETS } from '@/types/pbvision';
import {
  AugInsights, AugSession, AugPlayerData, AugRally, AugShot, AugRatings,
} from '@/types/pbvisionAugmented';
import {
  DashboardData, PlayerMeta, PLAYER_COLORS,
  HeroStats, SkillRatingsRow, SkillRatingsByGameRow, ShotAccuracyRow, SpeedRow,
  KitchenArrivalRow, ShotBreakdownRow, ShotQualityRow, DepthRow, ErrorRow, SessionInfo, HighlightRally,
  AttackRow, DinkRow, KitchenByGameRow, ServingRallyRow, RallySideRow,
  CoachingRow, RallyImpactRow, TargetingRow, KitchenSRRow, DriveDropRow, NightTrendRow,
  CourtShotRow, OutcomeStatsRow, LossReasonRow, PartnerAdjRow,
} from '@/types/dashboard';

/**
 * parseAugmentedNights — Phase-1 augmented-data parser.
 *
 * Drop-in replacement for `parseMultipleNights` (compact parser) that reads
 * pb.vision's AUGMENTED insights JSON and produces the exact same
 * `DashboardData` shape, but backed by REAL measured fields instead of the
 * compact export's proxies:
 *
 *   - Kitchen arrival        → authoritative role_data / team_kitchen_arrival
 *                              counts, and rally.players[i].kitchen_arrivals
 *                              presence (not a dink/volley shot-type guess).
 *   - Serve / drive speed    → shot.resulting_ball_movement.speed (real mph),
 *                              not inter-shot timing or bucket midpoints.
 *   - Clean winners          → shot.is_putaway / shot.winner_type==='clean'.
 *   - Exploited pop-ups      → shot.errors.popup==='exploited' directly.
 *   - Highlight quality      → shot.quality.overall.
 *   - Court side             → rally.players[i].started_on_left_side and
 *                              player.left_side_percentage.
 *
 * Each augmented "session" object passed in `augmentedSessions` is ONE game
 * (the top-level augmented insights document). Player identity is keyed by
 * lowercased first name via `toFirstName`, exactly like the compact parser.
 *
 * `gameFilter` mirrors the compact parser's `selectedSessionKeys`: when set,
 * only sessions whose key (`${nightId}_${index}`) is in the set are aggregated
 * (but every session is still listed in `sessions`).
 */

// ── Shot-type / concept helpers (compact codes → augmented fields) ──
// Compact codes the old parser branched on: 0=drive, 1=dink, 2=drop, 3=lob,
// 4=attack (speed-up/overhead), 5=volley.
function isDrive(sh: AugShot): boolean { return sh.shot_type === 'drive'; }
function isDink(sh: AugShot): boolean { return sh.shot_type === 'dink'; }
function isDrop(sh: AugShot): boolean { return sh.shot_type === 'drop'; }
// The old parser's sht===4 "attack" (speed-up / overhead). Augmented models this
// as is_speedup (plus atp as an aggressive shot type).
function isAttack(sh: AugShot): boolean { return sh.is_speedup === true || sh.shot_type === 'atp'; }

// q.ex (compact excellent-quality 0-1) → augmented quality.execution.
function shotEx(sh: AugShot): number | undefined { return sh.quality?.execution; }

// Real ball speed in mph (serve = shots[0], return = shots[1], drives = rally
// shots). Replaces the compact fabricated drive mph & serve-bucket midpoints.
function shotSpeedMph(sh: AugShot): number | null {
  const s = sh.resulting_ball_movement?.speed;
  return typeof s === 'number' && s > 0 ? s : null;
}

// A player reached the kitchen this rally if pb.vision recorded a kitchen
// arrival window for them. `rally.players[playerIndex].kitchen_arrivals` is a
// non-empty array when they got to the NVZ line — authoritative, no shot-type
// guessing. playerIndex is the 0-3 slot into player_data.
function playerReachedKitchen(rally: AugRally, playerIndex: number): boolean {
  const rp = rally.players?.[playerIndex];
  return Array.isArray(rp?.kitchen_arrivals) && rp!.kitchen_arrivals!.length > 0;
}

// Did `team` (roster team 0/1) reach the kitchen this rally? True if either of
// the team's players has a recorded kitchen arrival.
function teamReachedKitchen(rally: AugRally, pd: (AugPlayerData | null)[], team: number): boolean {
  for (let i = 0; i < pd.length; i++) {
    if (pd[i]?.team === team && playerReachedKitchen(rally, i)) return true;
  }
  return false;
}

// ── Session-name / identity helpers (behaviourally identical to compact) ──
function getSessionName(s: AugSession | undefined, pd: (AugPlayerData | null)[], index: number): string {
  const rawName = s?.name ?? '';
  const playerFirstNames = (pd ?? [])
    .map((p) => p?.name?.trim().split(/\s+/)[0])
    .filter((n): n is string => Boolean(n));
  const hasPlayerName = playerFirstNames.some((n) =>
    rawName.toLowerCase().includes(n.toLowerCase())
  );
  if (rawName && hasPlayerName) return rawName;
  const ge = s?.gameEpoch;
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

// ── Accumulator (same shape as compact) ──
interface PlayerAccum {
  name: string; sessionCount: number; totalShots: number;
  overallSum: number; overallW: number;
  skillSums: { serve: number; return: number; offense: number; defense: number; agility: number; consistency: number; courtIq: number; kitchenGame: number; ballControl: number; targeting: number };
  skillWeights: { serve: number; return: number; offense: number; defense: number; agility: number; consistency: number; courtIq: number; kitchenGame: number; ballControl: number; targeting: number };
  accInSum: number; accNetSum: number; accOutSum: number; accW: number;
  ssFreacs: number[]; ssW: number;
  driveSpeeds: number[];
  serveSpeeds: number[]; // real serve mph (from ball movement) for serveSpeed row
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
    ssFreacs: new Array(17).fill(0), ssW: 0, driveSpeeds: [], serveSpeeds: [],
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

// Winning team of a game from game_data.game_outcome (like compact gd.game_outcome).
function gameWinningTeam(ins: AugInsights): number | null {
  const outcome = ins.game_data?.game_outcome;
  if (Array.isArray(outcome) && outcome.length >= 2) {
    if (outcome[0] > outcome[1]) return 0;
    if (outcome[1] > outcome[0]) return 1;
  }
  return null;
}

function getSessionKitchenByPlayer(ins: AugInsights): Map<string, { team: number; k3dHits: number; k3dTotal: number; k5dHits: number; k5dTotal: number; teamRalliesTotal: number; teamRalliesKitchen: number }> {
  const result = new Map<string, { team: number; k3dHits: number; k3dTotal: number; k5dHits: number; k5dTotal: number; teamRalliesTotal: number; teamRalliesKitchen: number }>();
  const pd = ins.player_data ?? [];
  const ral = ins.rallies ?? [];
  if (!Array.isArray(pd) || !Array.isArray(ral)) return result;
  for (const player of pd) {
    if (!player) continue;
    const nm = player.name?.trim()?.toLowerCase();
    if (nm) result.set(nm, { team: player.team ?? 0, k3dHits: 0, k3dTotal: 0, k5dHits: 0, k5dTotal: 0, teamRalliesTotal: 0, teamRalliesKitchen: 0 });
  }
  const teamRally = new Map<number, { total: number; kitchen: number }>();
  for (const rally of ral) {
    const shots = rally.shots ?? [];
    for (let idx = 0; idx < shots.length; idx++) {
      const shot = shots[idx];
      if (!isDrop(shot)) continue;
      const player = shot.player_id != null ? pd[shot.player_id] : undefined;
      if (!player) continue;
      const nm = player.name?.trim()?.toLowerCase();
      if (!nm) continue;
      const r = result.get(nm);
      if (!r) continue;
      const reached = teamReachedKitchen(rally, pd, player.team ?? -1);
      if (idx === 2) { r.k3dTotal++; if (reached) r.k3dHits++; }
      else if (idx === 4) { r.k5dTotal++; if (reached) r.k5dHits++; }
    }
    // Team-level kitchen arrival: only count rallies where this team is serving.
    if (shots.length > 0 && shots[0].player_id != null) {
      const servingTeam = pd[shots[0].player_id]?.team;
      if (servingTeam != null) {
        if (!teamRally.has(servingTeam)) teamRally.set(servingTeam, { total: 0, kitchen: 0 });
        const tr = teamRally.get(servingTeam)!;
        tr.total++;
        if (teamReachedKitchen(rally, pd, servingTeam)) tr.kitchen++;
      }
    }
  }
  for (const stats of result.values()) {
    const tr = teamRally.get(stats.team) ?? { total: 0, kitchen: 0 };
    stats.teamRalliesTotal = tr.total;
    stats.teamRalliesKitchen = tr.kitchen;
  }
  return result;
}

function processSession(ins: AugInsights, accumMap: Map<string, PlayerAccum>) {
  const pd = ins.player_data ?? [];
  const ral = ins.rallies ?? [];
  const winningTeam = gameWinningTeam(ins);
  if (!Array.isArray(pd) || pd.length === 0) return;
  function getOrCreate(name: string) {
    const key = name.trim().toLowerCase();
    if (!accumMap.has(key)) accumMap.set(key, makeAccum(name.trim()));
    return accumMap.get(key)!;
  }
  for (const player of pd) {
    if (!player) continue;
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
      const addSkill = (key: keyof PlayerAccum['skillSums'], val: number | undefined) => {
        if (val != null) { acc.skillSums[key] += val * sc; acc.skillWeights[key] += sc; }
      };
      // Legacy serve/return/agility/consistency are absent from the augmented
      // ratings — they stay at 0 (never added). court_iq/kitchen_game/etc. real.
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
    // shot_quality: augmented splits into excellent/good/average/fair/poor.
    if (t.shot_quality && sc > 0) { acc.sqExSum += (t.shot_quality.excellent ?? 0) * sc; acc.sqPoSum += (t.shot_quality.poor ?? 0) * sc; acc.sqW += sc; }
    if (t.serve_depth && sc > 0) { const sd = t.serve_depth; acc.sdDeep += (sd.deep ?? 0) * sc; acc.sdMed += (sd.medium ?? 0) * sc; acc.sdShallow += (sd.shallow ?? 0) * sc; acc.sdW += sc; }
    if (t.return_depth && sc > 0) { const rd = t.return_depth; acc.rdDeep += (rd.deep ?? 0) * sc; acc.rdMed += (rd.medium ?? 0) * sc; acc.rdShallow += (rd.shallow ?? 0) * sc; acc.rdW += sc; }
  }
  if (!Array.isArray(ral)) return;
  for (const rally of ral) {
    const shots = rally.shots ?? [];
    const wt = rally.winning_team ?? undefined;
    for (let idx = 0; idx < shots.length; idx++) {
      const shot = shots[idx];
      const player = shot.player_id != null ? pd[shot.player_id] : undefined; if (!player) continue;
      const acc = getOrCreate(player.name?.trim() ?? '');
      // Real drive speed (from ball tracking) for drives past the serve/return.
      if (idx >= 2 && isDrive(shot)) { const spd = shotSpeedMph(shot); if (spd !== null) acc.driveSpeeds.push(spd); }
      // Real serve speed: the serve is shots[0].
      if (idx === 0) { const spd = shotSpeedMph(shot); if (spd !== null) acc.serveSpeeds.push(spd); }
      // Errors: faults.net → net, faults.out → out, faults.short → kitchen/NVZ.
      const e = shot.errors;
      if (e) {
        const f = e.faults ?? {};
        if (f.net) acc.errNet++;
        if (f.out) acc.errOut++;
        if (f.short) acc.errShort++;
        if (e.popup) acc.errPop++;
        if (e.unforced) acc.errUf++;
        if ((f.net || f.out || f.short) && !e.unforced) acc.errForced++;
      }
      // Drop quality
      if (isDrop(shot)) { const ex = shotEx(shot); if (ex != null) { acc.dropExSum += ex; acc.dropExW++; } }
      // Attack (speed-up): compact sht=4.
      if (isAttack(shot)) {
        acc.attackTotal++;
        if (wt != null && player.team === wt) acc.attackWins++;
        const ex = shotEx(shot); if (ex != null) { acc.attackExSum += ex; acc.attackExW++; }
      }
      // Dink quality: compact sht=1.
      if (isDink(shot)) {
        acc.dinkTotal++;
        const ex = shotEx(shot); if (ex != null) { acc.dinkExSum += ex; acc.dinkExW++; }
      }
      if (idx === 2) {
        if (isDrop(shot)) { acc.t3Drop++; acc.k3Drop[1]++; if (teamReachedKitchen(rally, pd, player.team ?? -1)) acc.k3Drop[0]++; }
        else if (isDrive(shot)) { acc.t3Drive++; acc.k3Drive[1]++; if (teamReachedKitchen(rally, pd, player.team ?? -1)) acc.k3Drive[0]++; }
      }
      if (idx === 4) {
        if (isDrop(shot)) { acc.t5Drop++; acc.k5Drop[1]++; if (teamReachedKitchen(rally, pd, player.team ?? -1)) acc.k5Drop[0]++; }
        else if (isDrive(shot)) { acc.t5Drive++; acc.k5Drive[1]++; if (teamReachedKitchen(rally, pd, player.team ?? -1)) acc.k5Drive[0]++; }
      }
    }
    // Clean winner: last shot, no fault, hitter's team won. Prefer explicit
    // winner_type/is_putaway; still require the rally-winning team.
    if (shots.length > 0 && wt != null) {
      const last = shots[shots.length - 1];
      const wp = last.player_id != null ? pd[last.player_id] : undefined;
      const lastFaulted = Boolean(last.errors?.faults);
      if (!lastFaulted && wp && wp.team === wt) {
        const wacc = getOrCreate(wp.name?.trim() ?? '');
        wacc.winnerTotal++;
        const ex = shotEx(last); if (ex != null) { wacc.winnerExSum += ex; wacc.winnerExW++; }
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
  // Serve speed: real mph from ball movement (avg + top). Falls back to the
  // bucket distribution only for avg when no per-shot serve speed was tracked.
  const serveSpeed: SpeedRow[] = accums.map((acc, i) => {
    const sp = acc.serveSpeeds;
    if (sp.length > 0) return { pid: players[i].pid, avgMph: sp.reduce((a, b) => a + b, 0) / sp.length, topMph: Math.max(...sp) };
    const w = acc.ssW; const norm = acc.ssFreacs.map((v) => (w > 0 ? v / w : 0));
    return { pid: players[i].pid, avgMph: serveSpeedAvg(norm), topMph: 0 };
  });
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

// Coerce one augmented session object (unknown from the API layer) into AugInsights.
function asInsights(x: unknown): AugInsights { return (x ?? {}) as AugInsights; }

/**
 * parseAugmentedNights — parse many nights of augmented sessions into DashboardData.
 * `nights[].augmentedSessions` is an array of top-level augmented insights objects
 * (one per game). `gameFilter` (a Set of `${nightId}_${index}` keys) restricts the
 * aggregation; undefined = all games.
 */
export function parseAugmentedNights(
  nights: { id: string; label: string; augmentedSessions: unknown[]; paddleTags?: unknown[] }[],
  gameFilter?: Set<string>
): DashboardData {
  const accumMap = new Map<string, PlayerAccum>();
  const allSessions: SessionInfo[] = [];
  const rawHighlights: HighlightRally[] = [];
  const skillRatingsByGame: SkillRatingsByGameRow[] = [];
  const kitchenByGame: KitchenByGameRow[] = [];
  const servingRallies: ServingRallyRow[] = [];
  const rallySides: RallySideRow[] = [];
  const courtShots: CourtShotRow[] = [];

  const riMap = new Map<string, { games: number; won: number; lostDirect: number; setup: number }>();
  const tgtMap = new Map<string, { games: number; attacks: number; fin: number; clean: number; pop: number; gotAttacked: number }>();
  const ksMap = new Map<string, { serveNum: number; serveDen: number; recvNum: number; recvDen: number }>();
  const coachMap = new Map<string, Map<string, { vs: number; rs: number; n: number }>>();
  const ddMap = new Map<string, { dropN: number; dropWon: number; dropReached: number; driveN: number; driveWon: number; dndN: number; dndWon: number; dndPop: number; offN: number; offWon: number }>();
  const dd = (f: string) => { let v = ddMap.get(f); if (!v) { v = { dropN: 0, dropWon: 0, dropReached: 0, driveN: 0, driveWon: 0, dndN: 0, dndWon: 0, dndPop: 0, offN: 0, offWon: 0 }; ddMap.set(f, v); } return v; };
  type NT = { pid: string; night: string; ts: number; gp: number; gw: number; rS: number; rW: number; ksN: number; ksD: number; krN: number; krD: number; dropN: number; driveN: number; dropK: number; driveK: number; dropW: number; dndN: number; dndW: number; dndP: number; offN: number; offW: number; finA: number; finC: number; atk: number; atkW: number; pop: number; got: number; riW: number; riL: number; riS: number; accIn: number; accNet: number; accOut: number; accW: number; sqEx: number; sqW: number; sdDeep: number; sdW: number; rdDeep: number; rdW: number; ssSum: number; ssW2: number; dvSum: number; dvN: number; errTot: number; errNet: number; errOut: number; errUf: number; dinkN: number; dinkEx: number };
  const ntMap = new Map<string, NT>();
  const nt = (pid: string, night: string, ts: number) => { const k = pid + '|' + night; let v = ntMap.get(k); if (!v) { v = { pid, night, ts, gp: 0, gw: 0, rS: 0, rW: 0, ksN: 0, ksD: 0, krN: 0, krD: 0, dropN: 0, driveN: 0, dropK: 0, driveK: 0, dropW: 0, dndN: 0, dndW: 0, dndP: 0, offN: 0, offW: 0, finA: 0, finC: 0, atk: 0, atkW: 0, pop: 0, got: 0, riW: 0, riL: 0, riS: 0, accIn: 0, accNet: 0, accOut: 0, accW: 0, sqEx: 0, sqW: 0, sdDeep: 0, sdW: 0, rdDeep: 0, rdW: 0, ssSum: 0, ssW2: 0, dvSum: 0, dvN: 0, errTot: 0, errNet: 0, errOut: 0, errUf: 0, dinkN: 0, dinkEx: 0 }; ntMap.set(k, v); } return v; };
  const ri = (f: string) => { let v = riMap.get(f); if (!v) { v = { games: 0, won: 0, lostDirect: 0, setup: 0 }; riMap.set(f, v); } return v; };
  const osMap = new Map<string, { gp: number; gw: number; gl: number; pw: number; pl: number; rw: number; rl: number }>();
  const os = (f: string) => { let v = osMap.get(f); if (!v) { v = { gp: 0, gw: 0, gl: 0, pw: 0, pl: 0, rw: 0, rl: 0 }; osMap.set(f, v); } return v; };
  const lrMap = new Map<string, { rl: number; net: number; out: number; kit: number; uf: number; pop: number; opp: number; other: number }>();
  const lr = (f: string) => { let v = lrMap.get(f); if (!v) { v = { rl: 0, net: 0, out: 0, kit: 0, uf: 0, pop: 0, opp: 0, other: 0 }; lrMap.set(f, v); } return v; };
  // Partner-pair rally tallies: key `${player}|${partner}` → rallies together.
  const pairMap = new Map<string, number>();
  const pair = (a: string, b: string) => { const k = a + '|' + b; pairMap.set(k, (pairMap.get(k) ?? 0) + 1); };
  const tgt = (f: string) => { let v = tgtMap.get(f); if (!v) { v = { games: 0, attacks: 0, fin: 0, clean: 0, pop: 0, gotAttacked: 0 }; tgtMap.set(f, v); } return v; };
  const ks = (f: string) => { let v = ksMap.get(f); if (!v) { v = { serveNum: 0, serveDen: 0, recvNum: 0, recvDen: 0 }; ksMap.set(f, v); } return v; };

  const firstNameOf = (pd: (AugPlayerData | null)[], pid: number | undefined): string | undefined =>
    pid != null ? pd[pid]?.name?.trim()?.toLowerCase() : undefined;
  const teamOf = (pd: (AugPlayerData | null)[], pid: number | undefined): number | undefined =>
    pid != null ? pd[pid]?.team : undefined;

  for (const night of nights) {
    const rawSessions = Array.isArray(night.augmentedSessions) ? night.augmentedSessions : [];
    for (let i = 0; i < rawSessions.length; i++) {
      const key = `${night.id}_${i}`;
      const ins = asInsights(rawSessions[i]);
      const pd = ins.player_data ?? [];
      const ral = ins.rallies ?? [];
      const sessionName = getSessionName(ins.session, pd, i);
      const sessionInfo: SessionInfo = { key, index: i, nightId: night.id, nightLabel: night.label, name: sessionName };
      allSessions.push(sessionInfo);
      if (gameFilter && !gameFilter.has(key)) continue;

      processSession(ins, accumMap);
      // Per-game kitchen arrival for pairing analysis.
      for (const [pid, stats] of getSessionKitchenByPlayer(ins).entries()) {
        kitchenByGame.push({ pid, sessionKey: key, ...stats });
      }

      // ── Outcomes (games / points / rallies) and loss attribution ──────────
      // Which players are on each team this game.
      const teamPlayers: Record<number, string[]> = { 0: [], 1: [] };
      for (const p of pd) {
        const f = p?.name?.trim()?.toLowerCase();
        if (f && (p!.team === 0 || p!.team === 1)) teamPlayers[p!.team].push(f);
      }
      // Game result from game_data.game_outcome ([team0, team1] final scores).
      const outcome = ins.game_data?.game_outcome;
      let gameWinner: number | undefined;
      if (Array.isArray(outcome) && typeof outcome[0] === 'number' && typeof outcome[1] === 'number') {
        gameWinner = outcome[0] > outcome[1] ? 0 : outcome[1] > outcome[0] ? 1 : undefined;
      }
      for (const t of [0, 1] as const) {
        for (const f of teamPlayers[t]) {
          const v = os(f); v.gp++;
          if (gameWinner === t) v.gw++; else if (gameWinner != null) v.gl++;
        }
      }
      // Points: derive from running_score deltas across rallies (side-out safe —
      // only the serving team can score, so a point is a running_score increase).
      let prevScore: [number, number] = [0, 0];
      for (const rally of ral) {
        const rs = rally.scoring_info?.running_score;
        if (Array.isArray(rs) && typeof rs[0] === 'number' && typeof rs[1] === 'number') {
          for (const t of [0, 1] as const) {
            const gained = rs[t] - prevScore[t];
            if (gained > 0) {
              for (const f of teamPlayers[t]) os(f).pw += gained;
              for (const f of teamPlayers[1 - t]) os(f).pl += gained;
            }
          }
          prevScore = [rs[0], rs[1]];
        }
      }
      // Rallies won/lost + loss attribution by the losing rally's final shot.
      for (const rally of ral) {
        const wt = rally.winning_team;
        if (wt !== 0 && wt !== 1) continue;
        const lt = 1 - wt;
        for (const f of teamPlayers[wt]) os(f).rw++;
        for (const f of teamPlayers[lt]) os(f).rl++;
        // Record partner pairings (both directions) for partner-adjustment.
        for (const t of [0, 1] as const) {
          const tp = teamPlayers[t];
          if (tp.length === 2) { pair(tp[0], tp[1]); pair(tp[1], tp[0]); }
        }
        // Attribute the loss.
        const shots = rally.shots ?? [];
        const last = shots[shots.length - 1];
        const lastTeam = last?.player_id != null ? pd[last.player_id]?.team : undefined;
        const cat = (k: 'net' | 'out' | 'kit' | 'uf' | 'pop' | 'opp' | 'other') => {
          for (const f of teamPlayers[lt]) { const v = lr(f); v.rl++; v[k]++; }
        };
        // Find whether the losing team popped it up and got exploited this rally.
        const exploitedByLoser = shots.some((s) =>
          s.errors?.popup === 'exploited' && (s.player_id != null ? pd[s.player_id]?.team : undefined) === lt);
        if (last && lastTeam === lt && last.errors?.faults) {
          const fl = last.errors.faults;
          if (fl.net) cat('net');
          else if (fl.out) cat('out');
          else if (fl.short) cat('kit');
          else cat('other'); // any other own-fault → unattributed (no distinct "unforced" bucket: it was always empty since net/out/short catch every fault first)
        } else if (exploitedByLoser) {
          cat('pop');
        } else if (last && lastTeam === wt && (last.is_putaway || last.winner_type === 'clean')) {
          cat('opp');
        } else {
          cat('other');
        }
      }

      // Per-rally serving data for left/right side pairing analysis. Court side
      // comes from rally.players[i].started_on_left_side (real per-player side).
      const cmVid = ins.session?.vid ?? '';
      const cmSi = ins.session?.session_index ?? i;
      if (Array.isArray(ral)) {
        for (let rIdx = 0; rIdx < ral.length; rIdx++) {
          const rally = ral[rIdx];
          const shots = rally.shots ?? [];
          if (shots.length === 0) continue;
          const serve = shots[0];
          const servingPlayer = serve.player_id != null ? pd[serve.player_id] : undefined;
          if (!servingPlayer) continue;
          const servedByPid = servingPlayer.name?.trim()?.toLowerCase();
          if (!servedByPid) continue;
          const servingTeam = servingPlayer.team;
          if (servingTeam == null) continue;

          // Physical side per serving-team player: 0 = Left, 1 = Right.
          const sides: Record<string, number> = {};
          for (let pi = 0; pi < pd.length; pi++) {
            const pl = pd[pi];
            if (!pl || pl.team !== servingTeam) continue;
            const nm = pl.name?.trim()?.toLowerCase();
            if (!nm) continue;
            sides[nm] = rally.players?.[pi]?.started_on_left_side ? 0 : 1;
          }
          const reached = teamReachedKitchen(rally, pd, servingTeam);
          const won = rally.winning_team === servingTeam;
          servingRallies.push({ sessionKey: key, servingTeam, servedByPid, sides, reached, won });

          // Court-map shots: every shot with reconstructed trajectory, in
          // absolute court feet, tagged with hitter, type, outcome and pop-up.
          if (rally.winning_team === 0 || rally.winning_team === 1) {
            for (let si2 = 0; si2 < shots.length; si2++) {
              const sh = shots[si2];
              const hitter = sh.player_id != null ? pd[sh.player_id] : undefined;
              const nm = hitter?.name?.trim()?.toLowerCase();
              if (!nm) continue;
              const traj = sh.resulting_ball_movement?.trajectory;
              const from = traj?.start?.location;
              const end = traj?.end?.location;
              if (!from || !end || from.x == null || from.y == null || end.x == null || end.y == null) continue;
              // Trajectory x/y are already in a single ABSOLUTE court frame (verified
              // from the data): team 0 serves from y≈0, team 1 from y≈44, net at 22,
              // x across the width 0-20. No per-team mirroring needed. Values slightly
              // outside [0,44]/[0,20] are players reaching behind a baseline/sideline.
              courtShots.push({
                pid: nm,
                sessionKey: key,
                vid: cmVid, si: cmSi, rallyNum: rIdx + 1,
                shotNum: si2 + 1,
                type: sh.shot_type ?? (si2 === 0 ? 'serve' : si2 === 1 ? 'return' : 'other'),
                fromX: from.x, fromY: from.y,
                toX: end.x, toY: end.y,
                endZone: traj?.end?.zone ?? 'unknown',
                won: rally.winning_team === hitter?.team,
                isPutaway: sh.is_putaway === true,
                popup: sh.errors?.popup ?? null,
                quality: sh.quality?.overall ?? null,
              });
            }
          }

          // Per-team side rows (both teams) for the win-by-side section.
          if (rally.winning_team === 0 || rally.winning_team === 1) {
            const teamSides = new Map<number, Record<string, number>>();
            for (let pi = 0; pi < pd.length; pi++) {
              const pl = pd[pi];
              if (!pl || pl.team == null) continue;
              const nm = pl.name?.trim()?.toLowerCase();
              if (!nm) continue;
              if (!teamSides.has(pl.team)) teamSides.set(pl.team, {});
              teamSides.get(pl.team)![nm] = rally.players?.[pi]?.started_on_left_side ? 0 : 1;
            }
            for (const [team, teamSide] of teamSides) {
              rallySides.push({
                sessionKey: key,
                team,
                serving: team === servingTeam,
                won: rally.winning_team === team,
                reached: teamReachedKitchen(rally, pd, team),
                sides: teamSide,
              });
            }
          }
        }
      }

      // ── Rally impact, targeting, kitchen serve/receive, coaching ──
      {
        for (let pi = 0; pi < pd.length; pi++) {
          const p = pd[pi]; const f = p?.name?.trim()?.toLowerCase(); if (!p || !f) continue;
          ri(f).games++; tgt(f).games++;
          const rs = p.role_data?.serving?.oneself; const rr = p.role_data?.receiving?.oneself;
          if (rs) { const kk = ks(f); kk.serveDen += rs.total ?? 0; kk.serveNum += rs.kitchen_arrival ?? 0; }
          if (rr) { const kk = ks(f); kk.recvDen += rr.total ?? 0; kk.recvNum += rr.kitchen_arrival ?? 0; }
          const adv = ins.coach_advice?.[pi]?.advice;
          if (Array.isArray(adv)) {
            let m = coachMap.get(f); if (!m) { m = new Map(); coachMap.set(f, m); }
            for (const a of adv) { let e = m.get(a.kind); if (!e) { e = { vs: 0, rs: 0, n: 0 }; m.set(a.kind, e); } e.vs += a.value; e.rs += a.relevance; e.n++; }
          }
        }
        if (Array.isArray(ral)) {
          for (const rally of ral) {
            const shots = rally.shots ?? []; if (!shots.length) continue;
            if (rally.winning_team !== 0 && rally.winning_team !== 1) continue;
            const last = shots[shots.length - 1];
            const lf = firstNameOf(pd, last.player_id);
            if (lf) { if (last.errors?.faults) ri(lf).lostDirect++; else ri(lf).won++; }
            shots.forEach((sh) => {
              const f = firstNameOf(pd, sh.player_id); if (!f) return;
              const tt = tgt(f);
              if (isAttack(sh)) tt.attacks++;
              if (sh.is_putaway) tt.fin++;
              if (sh.winner_type === 'clean') tt.clean++;
              if (sh.errors?.popup) tt.pop++;
              // Exploited pop-up → the opponent put it away. Use the authoritative
              // errors.popup==='exploited' flag (no next-shot lookahead needed).
              if (sh.errors?.popup === 'exploited') {
                tt.gotAttacked++;
                ri(f).setup++;
              }
            });

            // Drive-and-drop: attribute the serving team's 3rd shot to its hitter.
            const st = teamOf(pd, shots[0].player_id);
            if (st !== undefined) {
              const team = shots.filter((x) => teamOf(pd, x.player_id) === st);
              const t3 = team[1];
              const f3 = t3 && firstNameOf(pd, t3.player_id);
              if (t3 && f3) {
                const won = rally.winning_team === st;
                const d = dd(f3);
                if (isDrop(t3)) {
                  d.dropN++; if (won) d.dropWon++;
                  if (teamReachedKitchen(rally, pd, st)) d.dropReached++;
                } else if (isDrive(t3)) {
                  d.driveN++; if (won) d.driveWon++;
                  const t5 = team[2];
                  if (t5 && isDrop(t5)) { d.dndN++; if (won) d.dndWon++; if (t5.errors?.popup) d.dndPop++; }
                  else if (t5 && (isDrive(t5) || isAttack(t5))) { d.offN++; if (won) d.offWon++; }
                }
              }
            }
          }
        }
      }

      // ── Per-night trend rollup ──
      {
        const nl = night.label; const ts = ins.session?.gameEpoch ?? 0;
        for (const p of pd) {
          const f = p?.name?.trim()?.toLowerCase(); if (!f) continue;
          const v = nt(f, nl, ts);
          v.gp++; if (p!.trends?.flags?.won_game) v.gw++;
          const sc = p!.shot_count ?? 0; const ov = p!.trends?.ratings?.overall;
          if (ov != null && sc > 0) { v.rS += ov * sc; v.rW += sc; }
          const rs = p!.role_data?.serving?.oneself; if (rs) { v.ksD += rs.total ?? 0; v.ksN += rs.kitchen_arrival ?? 0; }
          const rr = p!.role_data?.receiving?.oneself; if (rr) { v.krD += rr.total ?? 0; v.krN += rr.kitchen_arrival ?? 0; }
          const ac = p!.trends?.shot_accuracy; if (ac && sc > 0) { v.accW += sc; v.accIn += (ac.in ?? 0) * sc; v.accNet += (ac.net ?? 0) * sc; v.accOut += (ac.out ?? 0) * sc; }
          const sq = p!.trends?.shot_quality; if (sq && sc > 0) { v.sqW += sc; v.sqEx += (sq.excellent ?? 0) * sc; }
          const sd = p!.trends?.serve_depth; if (sd && sc > 0) { v.sdW += sc; v.sdDeep += (sd.deep ?? 0) * sc; }
          const rd = p!.trends?.return_depth; if (rd && sc > 0) { v.rdW += sc; v.rdDeep += (rd.deep ?? 0) * sc; }
          const spf = p!.trends?.serve_speed; if (Array.isArray(spf) && sc > 0) { const avg = serveSpeedAvg(spf); if (avg > 0) { v.ssSum += avg * sc; v.ssW2 += sc; } }
        }
        if (Array.isArray(ral)) {
          for (const rally of ral) {
            const shots = rally.shots ?? []; if (!shots.length) continue;
            shots.forEach((sh, si) => {
              const f = firstNameOf(pd, sh.player_id); if (!f) return; const v = nt(f, nl, ts);
              if (sh.is_putaway) v.finA++; if (sh.winner_type === 'clean') v.finC++;
              if (isAttack(sh)) { v.atk++; if ((rally.winning_team === 0 || rally.winning_team === 1) && rally.winning_team === teamOf(pd, sh.player_id)) v.atkW++; }
              if (sh.errors?.popup) v.pop++;
              if (sh.errors?.faults) { v.errTot++; if (sh.errors.faults.net) v.errNet++; if (sh.errors.faults.out) v.errOut++; if (sh.errors.unforced) v.errUf++; }
              if (isDink(sh)) { v.dinkN++; v.dinkEx += shotEx(sh) ?? 0; }
              if (si >= 2 && isDrive(sh)) { const spd = shotSpeedMph(sh); if (spd !== null) { v.dvSum += spd; v.dvN++; } }
              // gotAttacked → exploited pop-up (authoritative).
              if (sh.errors?.popup === 'exploited') v.got++;
            });
            if (rally.winning_team !== 0 && rally.winning_team !== 1) continue;
            const last = shots[shots.length - 1]; const lf = firstNameOf(pd, last.player_id);
            if (lf) { const v = nt(lf, nl, ts); if (last.errors?.faults) v.riL++; else v.riW++; }
            shots.forEach((sh) => { if (sh.errors?.popup === 'exploited') { const f = firstNameOf(pd, sh.player_id); if (f) nt(f, nl, ts).riS++; } });
            const st2 = teamOf(pd, shots[0].player_id); if (st2 === undefined) continue;
            const team = shots.filter((x) => teamOf(pd, x.player_id) === st2);
            const t3 = team[1]; const f3 = t3 && firstNameOf(pd, t3.player_id);
            if (t3 && f3) {
              const v = nt(f3, nl, ts); const won = rally.winning_team === st2;
              if (isDrop(t3)) { v.dropN++; if (won) v.dropW++; if (teamReachedKitchen(rally, pd, st2)) v.dropK++; }
              else if (isDrive(t3)) {
                v.driveN++; if (teamReachedKitchen(rally, pd, st2)) v.driveK++;
                const t5 = team[2];
                if (t5 && isDrop(t5)) { v.dndN++; if (won) v.dndW++; if (t5.errors?.popup) v.dndP++; }
                else if (t5 && (isDrive(t5) || isAttack(t5))) { v.offN++; if (won) v.offW++; }
              }
            }
          }
        }
      }

      // Collect per-game skill ratings for the By Game breakdown tab.
      for (const player of pd) {
        if (!player) continue;
        const nm = player.name?.trim(); if (!nm) continue;
        const sc = player.shot_count ?? 0;
        const r: AugRatings | undefined = player.trends?.ratings;
        if (r && sc > 0) {
          skillRatingsByGame.push({
            pid: nm.toLowerCase(),
            sessionKey: key,
            sessionName,
            nightLabel: night.label,
            timestamp: ins.session?.gameEpoch ?? 0,
            team: player.team ?? 0,
            overall: r.overall ?? 0,
            courtIq: r.court_iq ?? 0,
            kitchenGame: r.kitchen_game ?? 0,
            ballControl: r.ball_control ?? 0,
            targeting: r.targeting ?? 0,
            offense: r.offense ?? 0,
            defense: r.defense ?? 0,
            // Legacy skills absent from augmented ratings → default 0.
            serve: r.serve ?? 0,
            return: r.return ?? 0,
            agility: r.agility ?? 0,
            consistency: r.consistency ?? 0,
            shotCount: sc,
          });
        }
      }

      // Collect rally highlights. Uses real quality.overall per shot.
      const vid = ins.session?.vid;
      const si = ins.session?.session_index ?? i;
      if (vid && Array.isArray(ral)) {
        for (let r = 0; r < ral.length; r++) {
          const rally = ral[r];
          const shots = rally.shots ?? [];
          if (shots.length < 6) continue;
          const qualities = shots.map((sh) => sh.quality?.overall ?? 0).filter((q) => q > 0);
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
      dropN: v.dropN, driveN: v.driveN, dropKitchen: v.dropK, driveKitchen: v.driveK, dropWon: v.dropW,
      dndN: v.dndN, dndWon: v.dndW, dndPop: v.dndP, offN: v.offN, offWon: v.offW,
      finAtt: v.finA, finClean: v.finC, attacks: v.atk, attackWins: v.atkW, pop: v.pop, gotAttacked: v.got,
      riWon: v.riW, riLost: v.riL, riSetup: v.riS,
      accIn: v.accIn, accNet: v.accNet, accOut: v.accOut, accW: v.accW,
      sqEx: v.sqEx, sqW: v.sqW, sdDeep: v.sdDeep, sdW: v.sdW, rdDeep: v.rdDeep, rdW: v.rdW,
      ssSum: v.ssSum, ssW: v.ssW2, dvSum: v.dvSum, dvN: v.dvN,
      errTot: v.errTot, errNet: v.errNet, errOut: v.errOut, errUf: v.errUf, dinkN: v.dinkN, dinkEx: v.dinkEx,
    }));

  const outcomeStats: OutcomeStatsRow[] = data.players.map((p) => {
    const v = os(p.pid) ?? { gp: 0, gw: 0, gl: 0, pw: 0, pl: 0, rw: 0, rl: 0 };
    return {
      pid: p.pid, gamesPlayed: v.gp, gamesWon: v.gw, gamesLost: v.gl,
      pointsWon: v.pw, pointsLost: v.pl, ralliesWon: v.rw, ralliesLost: v.rl,
      netPointsPerGame: v.gp > 0 ? (v.pw - v.pl) / v.gp : 0,
    };
  });
  const lossReasons: LossReasonRow[] = data.players.map((p) => {
    const v = lrMap.get(p.pid) ?? { rl: 0, net: 0, out: 0, kit: 0, uf: 0, pop: 0, opp: 0, other: 0 };
    return {
      pid: p.pid, ralliesLost: v.rl, ownNet: v.net, ownOut: v.out, ownKitchen: v.kit,
      ownUnforced: v.uf, popupExploited: v.pop, oppWinner: v.opp, other: v.other,
    };
  });
  // Lightweight partner-adjusted rally win% (approximate). expected = rally-
  // weighted average of each partner's own overall rally win%.
  const rallyWinPctOf = new Map<string, number>();
  for (const o of outcomeStats) {
    const tot = o.ralliesWon + o.ralliesLost;
    rallyWinPctOf.set(o.pid, tot > 0 ? (100 * o.ralliesWon) / tot : 0);
  }
  const partnerAdj: PartnerAdjRow[] = data.players.map((p) => {
    let wSum = 0, n = 0;
    for (const [k, cnt] of pairMap) {
      const [a, b] = k.split('|');
      if (a !== p.pid) continue;
      wSum += (rallyWinPctOf.get(b) ?? 0) * cnt;
      n += cnt;
    }
    const actual = rallyWinPctOf.get(p.pid) ?? 0;
    const expected = n > 0 ? wSum / n : 0;
    return { pid: p.pid, rallies: n, actualWinPct: actual, expectedWinPct: expected, lift: actual - expected };
  });

  return { ...data, highlights, skillRatingsByGame, kitchenByGame, servingRallies, rallySides, coaching, rallyImpact, targeting, kitchenSR, driveDrop, nightTrends, courtShots, outcomeStats, lossReasons, partnerAdj };
}

// Convenience wrapper for a single augmented game.
export function parseAugmentedFile(insights: unknown, nightId = 'default', nightLabel = ''): DashboardData {
  return parseAugmentedNights([{ id: nightId, label: nightLabel, augmentedSessions: [insights] }]);
}
