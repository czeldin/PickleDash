import { SERVE_SPEED_BUCKETS } from '@/types/pbvision';
import {
  DashboardData, PlayerMeta, PLAYER_COLORS,
  HeroStats, SkillRatingsRow, SkillRatingsByGameRow, ShotAccuracyRow, SpeedRow,
  KitchenArrivalRow, ShotBreakdownRow, ShotQualityRow, DepthRow, ErrorRow, SessionInfo, HighlightRally,
  AttackRow, DinkRow,
} from '@/types/dashboard';

interface RawShot {
  pid: number; t: number[]; ss: number; st: number; sht?: number;
  q?: { ex?: number };
  err?: { f?: { n?: number; out?: number; sh?: number }; pop?: number; uf?: number };
}
interface RawPd {
  name: string; team: number; shot_count: number;
  trends: {
    ratings?: { serve?: number; return?: number; offense?: number; defense?: number; agility?: number; consistency?: number; overall?: number };
    shot_accuracy?: { in?: number; net?: number; out?: number };
    serve_depth?: { deep?: number; medium?: number; shallow?: number };
    return_depth?: { deep?: number; medium?: number; shallow?: number };
    serve_speed?: number[];
    shot_quality?: { excellent?: number; poor?: number };
  };
}
interface RawSession {
  ses: { vid: string; si: number; name?: string };
  ral: { sh: RawShot[]; wt: number }[];
  pd: RawPd[];
  gd?: { game_outcome?: number[] };
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
function reachedKitchen(shots: RawShot[], team: number, afterIdx: number) {
  let checked = 0;
  for (let i = afterIdx + 1; i < shots.length && checked < 5; i++) {
    if (shots[i].st === team) { if (shots[i].sht === 1 || shots[i].sht === 5) return true; checked++; }
  }
  return false;
}

interface PlayerAccum {
  name: string; sessionCount: number; totalShots: number;
  overallSum: number; overallW: number;
  skillSums: { serve: number; return: number; offense: number; defense: number; agility: number; consistency: number }; skillW: number;
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
    skillSums: { serve: 0, return: 0, offense: 0, defense: 0, agility: 0, consistency: 0 }, skillW: 0,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRawSessions(raw: unknown): RawSession[] { return (raw as any)?.data?.sessions ?? []; }

export function getSessionInfos(raw: unknown, nightId: string, nightLabel: string): SessionInfo[] {
  return getRawSessions(raw).map((s, i) => ({
    key: `${nightId}_${i}`,
    index: i,
    nightId,
    nightLabel,
    name: s.ses?.name ?? `Game ${i + 1}`,
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
      acc.skillSums.serve += (r.serve ?? 0) * sc; acc.skillSums.return += (r.return ?? 0) * sc;
      acc.skillSums.offense += (r.offense ?? 0) * sc; acc.skillSums.defense += (r.defense ?? 0) * sc;
      acc.skillSums.agility += (r.agility ?? 0) * sc; acc.skillSums.consistency += (r.consistency ?? 0) * sc;
      acc.skillW += sc;
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
        if (wt != null && shot.st === wt) acc.attackWins++;
        if (shot.q?.ex != null) { acc.attackExSum += shot.q.ex; acc.attackExW++; }
      }
      // Dink quality: sht=1
      if (shot.sht === 1) {
        acc.dinkTotal++;
        if (shot.q?.ex != null) { acc.dinkExSum += shot.q.ex; acc.dinkExW++; }
      }
      if (idx === 2) {
        if (shot.sht === 2) { acc.t3Drop++; acc.k3Drop[1]++; if (reachedKitchen(shots, shot.st, idx)) acc.k3Drop[0]++; }
        else if (shot.sht === 0) { acc.t3Drive++; acc.k3Drive[1]++; if (reachedKitchen(shots, shot.st, idx)) acc.k3Drive[0]++; }
      }
      if (idx === 4) {
        if (shot.sht === 2) { acc.t5Drop++; acc.k5Drop[1]++; if (reachedKitchen(shots, shot.st, idx)) acc.k5Drop[0]++; }
        else if (shot.sht === 0) { acc.t5Drive++; acc.k5Drive[1]++; if (reachedKitchen(shots, shot.st, idx)) acc.k5Drive[0]++; }
      }
    }
    // Clean winner: last shot, no error, hitter's team won
    if (shots.length > 0 && wt != null) {
      const last = shots[shots.length - 1];
      if (!last.err && last.st === wt) {
        const wp = pd[last.pid]; if (wp) {
          const wacc = getOrCreate(wp.name?.trim() ?? '');
          wacc.winnerTotal++;
          if (last.q?.ex != null) { wacc.winnerExSum += last.q.ex; wacc.winnerExW++; }
        }
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
  const skillRatings: SkillRatingsRow[] = accums.map((acc, i) => { const w = acc.skillW || 1; return { pid: players[i].pid, serve: acc.skillSums.serve / w, return: acc.skillSums.return / w, offense: acc.skillSums.offense / w, defense: acc.skillSums.defense / w, agility: acc.skillSums.agility / w, consistency: acc.skillSums.consistency / w }; });
  const shotAccuracy: ShotAccuracyRow[] = accums.map((acc, i) => { const w = acc.accW || 1; const inF = acc.accInSum / w, netF = acc.accNetSum / w, outF = acc.accOutSum / w; return { pid: players[i].pid, inShots: Math.round(inF * acc.totalShots), netShots: Math.round(netF * acc.totalShots), outShots: Math.round(outF * acc.totalShots), totalShots: acc.totalShots, inPct: inF, netPct: netF, outPct: outF }; });
  const serveSpeed: SpeedRow[] = accums.map((acc, i) => { const w = acc.ssW; const norm = acc.ssFreacs.map((v) => (w > 0 ? v / w : 0)); return { pid: players[i].pid, avgMph: serveSpeedAvg(norm), topMph: serveSpeedTop(norm) }; });
  const driveSpeed: SpeedRow[] = accums.map((acc, i) => { const sp = acc.driveSpeeds; return { pid: players[i].pid, avgMph: sp.length > 0 ? sp.reduce((a, b) => a + b, 0) / sp.length : 0, topMph: sp.length > 0 ? Math.max(...sp) : 0 }; });
  const kitchenArrival: KitchenArrivalRow[] = accums.map((acc, i) => ({ pid: players[i].pid, third_drop_kitchen_pct: pct(acc.k3Drop[0], acc.k3Drop[1]), third_drive_kitchen_pct: pct(acc.k3Drive[0], acc.k3Drive[1]), fifth_drop_kitchen_pct: pct(acc.k5Drop[0], acc.k5Drop[1]), fifth_drive_kitchen_pct: pct(acc.k5Drive[0], acc.k5Drive[1]), third_drop_total: acc.k3Drop[1], third_drive_total: acc.k3Drive[1], fifth_drop_total: acc.k5Drop[1], fifth_drive_total: acc.k5Drive[1] }));
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
  return { sessions: allSessions, highlights: [], players, hero, skillRatings, skillRatingsByGame: [], shotAccuracy, serveSpeed, driveSpeed, kitchenArrival, thirdShot, fifthShot, shotQuality, serveDepth, returnDepth, errors, attacks, dinks };
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

  for (const night of nights) {
    const rawSessions = getRawSessions(night.raw);
    for (let i = 0; i < rawSessions.length; i++) {
      const key = `${night.id}_${i}`;
      const s = rawSessions[i];
      const sessionName = s.ses?.name ?? `Game ${i + 1}`;
      const sessionInfo: SessionInfo = { key, index: i, nightId: night.id, nightLabel: night.label, name: sessionName };
      allSessions.push(sessionInfo);
      if (!selectedSessionKeys || selectedSessionKeys.has(key)) {
        processSession(s, accumMap);
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
                serve: r.serve ?? 0,
                return: r.return ?? 0,
                offense: r.offense ?? 0,
                defense: r.defense ?? 0,
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
  return { ...data, highlights, skillRatingsByGame };
}

// Convenience wrapper for a single file
export function parseFile(raw: unknown, nightId = 'default', nightLabel = ''): DashboardData {
  return parseMultipleNights([{ id: nightId, label: nightLabel, raw }]);
}
