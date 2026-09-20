import { DashboardData } from '@/types/dashboard';

// ---------------------------------------------------------------------------
// Player fact engine.
//
// The summaries used to hand the LLM ~30 raw stats and let it (a) choose which
// mattered and (b) compute rankings ("highest poor% in the group"). It was bad
// at both — it cherry-picked and it mis-ranked. This module moves BOTH jobs
// into code, which does them exactly:
//   - a metric registry defines every rankable stat, its direction, and a
//     minimum sample so a 1-game player isn't crowned/blamed;
//   - for each metric we compute the group mean/σ and every player's z-score
//     and exact rank;
//   - for each player we surface their genuine outliers (biggest +z = real
//     strengths, biggest −z = real weaknesses), not a random handful.
// The LLM then only writes prose around these pre-verified facts. It never
// picks a stat or asserts a rank we didn't hand it.
// ---------------------------------------------------------------------------

export type Direction = 'higher_better' | 'lower_better';
export type Category = 'outcome' | 'quality' | 'positioning' | 'rating';

// Category weights: outcome stats decide games (strongest signal); pb.vision
// ratings sit in a narrow 4.1–4.5 band and discriminate poorly, so weight them
// lightly. A metric's selection score = |z| × categoryWeight.
const CATEGORY_WEIGHT: Record<Category, number> = {
  outcome: 1.0,
  quality: 0.85,
  positioning: 0.75,
  rating: 0.4,
};

interface MetricDef {
  key: string;
  label: string;          // human phrase, e.g. "rally win %"
  category: Category;
  direction: Direction;
  minSample: number;      // player needs at least this `sample` to be ranked
  unit?: string;          // '%' | 'mph' | '/g' | '' — for formatting the value
  // Minimum best-to-worst spread across the group for the metric to matter at
  // all. Guards against prose inflating a trivial gap ("9.5 vs 10 errors/game"
  // is not a real difference) — if the whole group is within this range, the
  // metric is suppressed even when σ is tiny and z looks large.
  minSpread: number;
  // Returns the player's value + the sample size behind it, or null if absent.
  get: (pid: string, data: DashboardData) => { value: number; sample: number } | null;
}

const num = (n: number | undefined | null): number => (typeof n === 'number' && isFinite(n) ? n : 0);

// Registry. Every metric here is a real, direct-or-derived pb.vision value —
// nothing modeled or invented. Samples gate out tiny denominators.
const METRICS: MetricDef[] = [
  // minSpread = the smallest best-to-worst gap that is worth calling a real
  // difference for this metric. Anything tighter is treated as "everyone's the
  // same here" and suppressed, no matter what the z-score says.

  // --- Outcome (weight 1.0) ---
  {
    key: 'rally_win', label: 'rally win %', category: 'outcome', direction: 'higher_better', minSample: 30, unit: '%', minSpread: 6,
    get: (pid, d) => { const r = d.outcomeStats?.find((x) => x.pid === pid); if (!r) return null; const n = r.ralliesWon + r.ralliesLost; return n ? { value: (r.ralliesWon / n) * 100, sample: n } : null; },
  },
  {
    // Use the SAME "Net/g" the Rally Impact table shows (winners − own errors −
    // pop-ups-lost, per game), not the scoreboard points margin — so a "lowest
    // net" claim in the summary matches the table the reader sees. (Both were
    // labeled "net" but computed differently, producing contradictory ranks.)
    key: 'net_points', label: 'net (winners − points given away) per game', category: 'outcome', direction: 'higher_better', minSample: 3, unit: '/g', minSpread: 2,
    get: (pid, d) => { const r = d.rallyImpact?.find((x) => x.pid === pid); if (!r || !r.games) return null; return { value: (r.won - r.lostDirect - r.setup) / r.games, sample: r.games }; },
  },
  {
    key: 'finish_win', label: 'finishing (putaway) win %', category: 'outcome', direction: 'higher_better', minSample: 8, unit: '%', minSpread: 12,
    get: (pid, d) => { const r = d.targeting?.find((x) => x.pid === pid); if (!r || !r.fin) return null; return { value: (r.clean / r.fin) * 100, sample: r.fin }; },
  },
  {
    // Use the LOST-point pop-up count (rallyImpact.setup) — the same "Popped up
    // (lost)" number the Rally Impact table shows — not the raw exploited-pop-up
    // behavior count, so the summary can't claim "most pop-ups" while the table
    // shows the player mid-pack.
    key: 'popups_lost', label: 'points lost to pop-ups per game', category: 'outcome', direction: 'lower_better', minSample: 3, unit: '/g', minSpread: 0.8,
    get: (pid, d) => { const r = d.rallyImpact?.find((x) => x.pid === pid); if (!r || !r.games) return null; return { value: r.setup / r.games, sample: r.games }; },
  },
  {
    key: 'got_attacked', label: 'times attacked per game', category: 'outcome', direction: 'lower_better', minSample: 3, unit: '/g', minSpread: 1.2,
    get: (pid, d) => { const r = d.targeting?.find((x) => x.pid === pid); if (!r || !r.games) return null; return { value: r.gotAttacked / r.games, sample: r.games }; },
  },

  // --- Shot quality & accuracy (weight 0.85) ---
  {
    key: 'excellent_pct', label: 'excellent-shot %', category: 'quality', direction: 'higher_better', minSample: 150, unit: '%', minSpread: 4,
    get: (pid, d) => { const r = d.shotQuality?.find((x) => x.pid === pid); if (!r || r.excellentPct <= 0) return null; const n = r.excellentCount + r.poorCount ? Math.round(r.excellentCount / (r.excellentPct / 100)) : 0; return { value: r.excellentPct, sample: n || 150 }; },
  },
  {
    key: 'poor_pct', label: 'poor-shot %', category: 'quality', direction: 'lower_better', minSample: 150, unit: '%', minSpread: 3,
    get: (pid, d) => { const r = d.shotQuality?.find((x) => x.pid === pid); if (!r || r.excellentPct <= 0) return null; const n = r.poorPct > 0 ? Math.round(r.poorCount / (r.poorPct / 100)) : 150; return { value: r.poorPct, sample: n || 150 }; },
  },
  {
    key: 'shot_acc', label: 'shot accuracy (landed in) %', category: 'quality', direction: 'higher_better', minSample: 150, unit: '%', minSpread: 3,
    get: (pid, d) => { const r = d.shotAccuracy?.find((x) => x.pid === pid); if (!r || !r.totalShots) return null; return { value: r.inPct * 100, sample: r.totalShots }; },
  },
  {
    key: 'errors_pg', label: 'errors per game', category: 'quality', direction: 'lower_better', minSample: 3, unit: '/g', minSpread: 2.5,
    get: (pid, d) => { const r = d.errors?.find((x) => x.pid === pid); if (!r || !r.gamesPlayed) return null; return { value: r.totalPerGame, sample: r.gamesPlayed }; },
  },

  // --- Positioning & shot selection (weight 0.75) ---
  {
    // % of SERVING rallies where they reached the kitchen line — a FREQUENCY,
    // not a speed. Label says "% of serves" so the model doesn't call a low
    // value "slow".
    key: 'kitchen_serve', label: '% of serves where they reached the kitchen line', category: 'positioning', direction: 'higher_better', minSample: 15, unit: '%', minSpread: 10,
    get: (pid, d) => { const r = d.kitchenSR?.find((x) => x.pid === pid); if (!r || !r.serveDen) return null; return { value: (r.serveNum / r.serveDen) * 100, sample: r.serveDen }; },
  },
  {
    key: 'kitchen_recv', label: '% of returns where they reached the kitchen line', category: 'positioning', direction: 'higher_better', minSample: 15, unit: '%', minSpread: 10,
    get: (pid, d) => { const r = d.kitchenSR?.find((x) => x.pid === pid); if (!r || !r.recvDen) return null; return { value: (r.recvNum / r.recvDen) * 100, sample: r.recvDen }; },
  },
  {
    key: 'third_drop_mix', label: '3rd-shot drop rate %', category: 'positioning', direction: 'higher_better', minSample: 10, unit: '%', minSpread: 20,
    get: (pid, d) => { const r = d.thirdShot?.find((x) => x.pid === pid); if (!r) return null; const n = r.dropCount + r.driveCount; return n >= 1 ? { value: r.dropPct, sample: n } : null; },
  },
  {
    key: 'attack_win', label: 'attack win %', category: 'positioning', direction: 'higher_better', minSample: 12, unit: '%', minSpread: 12,
    get: (pid, d) => { const r = d.attacks?.find((x) => x.pid === pid); if (!r || !r.attackTotal) return null; return { value: r.attackWinPct, sample: r.attackTotal }; },
  },
  {
    // Shown as an integer "%" in Attacking & Dinking → Dink Quality; use unit
    // '%' so the fact reads "63%" like the table, not "62.50".
    key: 'dink_quality', label: 'dink quality %', category: 'positioning', direction: 'higher_better', minSample: 20, unit: '%', minSpread: 8,
    get: (pid, d) => { const r = d.dinks?.find((x) => x.pid === pid); if (!r || r.dinkTotal < 1) return null; return { value: r.dinkExcellentPct, sample: r.dinkTotal }; },
  },

  // --- pb.vision skill ratings (weight 0.4). Narrow 4.1–4.5 band, so a real
  // gap needs ~0.2 of a rating point. ---
  {
    key: 'rating_overall', label: 'overall rating', category: 'rating', direction: 'higher_better', minSample: 1, unit: '', minSpread: 0.2,
    get: (pid, d) => { const r = d.skillRatings?.find((x) => x.pid === pid); if (!r || !r.overall) return null; return { value: r.overall, sample: 1 }; },
  },
  {
    key: 'rating_kitchen', label: 'kitchen rating', category: 'rating', direction: 'higher_better', minSample: 1, unit: '', minSpread: 0.2,
    get: (pid, d) => { const r = d.skillRatings?.find((x) => x.pid === pid); if (!r || !r.kitchenGame) return null; return { value: r.kitchenGame, sample: 1 }; },
  },
  {
    key: 'rating_offense', label: 'offense rating', category: 'rating', direction: 'higher_better', minSample: 1, unit: '', minSpread: 0.2,
    get: (pid, d) => { const r = d.skillRatings?.find((x) => x.pid === pid); if (!r || !r.offense) return null; return { value: r.offense, sample: 1 }; },
  },
  {
    key: 'rating_defense', label: 'defense rating', category: 'rating', direction: 'higher_better', minSample: 1, unit: '', minSpread: 0.2,
    get: (pid, d) => { const r = d.skillRatings?.find((x) => x.pid === pid); if (!r || !r.defense) return null; return { value: r.defense, sample: 1 }; },
  },
];

export interface RankedMetric {
  key: string;
  label: string;
  category: Category;
  value: number;
  unit: string;
  z: number;              // z-score vs the ranked group (signed: + = better than avg on THIS metric's good direction)
  rank: number;           // 1 = best on this metric
  outOf: number;          // number of ranked players on this metric
  leaderPid: string;      // pid of the group's best on this metric
  laggardPid: string;     // pid of the group's worst on this metric
  score: number;          // |z| × categoryWeight — used to pick a player's standouts
}

export interface PlayerFacts {
  pid: string;
  strengths: RankedMetric[];  // top few where the player is genuinely above the group
  weaknesses: RankedMetric[]; // top few where the player is genuinely below the group
  gamesPlayed: number;
  smallSample: boolean;
}

function fmtVal(v: number, unit: string): string {
  if (unit === '%') return `${v.toFixed(1)}%`;
  if (unit === '/g') return `${v.toFixed(1)}/g`;
  if (unit === 'mph') return `${Math.round(v)} mph`;
  return v.toFixed(2);
}

// Compute, for one metric, every ranked player's z-score and rank.
function rankMetric(m: MetricDef, data: DashboardData): Map<string, RankedMetric> | null {
  const raw: { pid: string; value: number }[] = [];
  for (const p of data.players) {
    const g = m.get(p.pid, data);
    if (g && g.sample >= m.minSample) raw.push({ pid: p.pid, value: g.value });
  }
  if (raw.length < 3) return null; // need a real group to rank against

  const vals = raw.map((r) => r.value);
  const spread = Math.max(...vals) - Math.min(...vals);
  // Everyone's basically the same on this metric — don't let prose invent a
  // difference (the "9.5 vs 10 errors/game is not really different" case).
  if (spread < m.minSpread) return null;

  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
  const sd = Math.sqrt(variance);

  // Order best→worst by direction. rank 1 = best.
  const better = (a: number, b: number) => (m.direction === 'higher_better' ? b - a : a - b);
  const ordered = [...raw].sort((x, y) => better(x.value, y.value));
  const leaderPid = ordered[0].pid;
  const laggardPid = ordered[ordered.length - 1].pid;

  const out = new Map<string, RankedMetric>();
  raw.forEach((r) => {
    // Signed z in the "good" direction: positive means better-than-average.
    const zRaw = sd > 0 ? (r.value - mean) / sd : 0;
    const z = m.direction === 'higher_better' ? zRaw : -zRaw;
    const rank = ordered.findIndex((o) => o.pid === r.pid) + 1;
    out.set(r.pid, {
      key: m.key, label: m.label, category: m.category, value: r.value, unit: m.unit ?? '',
      z, rank, outOf: raw.length, leaderPid, laggardPid,
      score: Math.abs(z) * CATEGORY_WEIGHT[m.category],
    });
  });
  return out;
}

const MIN_GAMES_FOR_CONFIDENCE = 4;
const Z_MEANINGFUL = 0.6;   // below this, the player is basically mid-pack on that metric — not a "standout"
const MAX_ITEMS = 3;        // at most this many strengths / weaknesses per player

export function computePlayerFacts(data: DashboardData): PlayerFacts[] {
  // Rank every metric once.
  const ranked: Map<string, RankedMetric>[] = [];
  for (const m of METRICS) { const r = rankMetric(m, data); if (r) ranked.push(r); }

  const gamesOf = (pid: string): number =>
    num(data.outcomeStats?.find((x) => x.pid === pid)?.gamesPlayed) ||
    num(data.errors?.find((x) => x.pid === pid)?.gamesPlayed) ||
    num(data.hero?.find((x) => x.pid === pid)?.gamesPlayed);

  return data.players.map((p) => {
    const mine: RankedMetric[] = [];
    for (const rm of ranked) { const v = rm.get(p.pid); if (v) mine.push(v); }

    // Genuine standouts only: meaningful z, then ranked by weighted score.
    const strengths = mine
      .filter((r) => r.z >= Z_MEANINGFUL)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_ITEMS);
    const weaknesses = mine
      .filter((r) => r.z <= -Z_MEANINGFUL)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_ITEMS);

    const gp = gamesOf(p.pid);
    return { pid: p.pid, strengths, weaknesses, gamesPlayed: gp, smallSample: gp < MIN_GAMES_FOR_CONFIDENCE };
  });
}

// Render the facts as a compact, unambiguous block for the LLM. Each line is a
// pre-verified fact with the exact value, the exact rank, and the true group
// leader/laggard named — so the model can phrase it but cannot mis-rank it.
export function factsForPrompt(data: DashboardData): string {
  const facts = computePlayerFacts(data);
  const nameOf = (pid: string) => data.players.find((p) => p.pid === pid)?.name ?? pid;
  const lines: string[] = [];
  lines.push('## Pre-computed facts (USE ONLY THESE — do not derive your own ranks or pick other stats)');
  lines.push('Each fact: metric = value (rank of N; group best = X, group worst = Y). "rank 1" = best.');
  lines.push('');
  for (const f of facts) {
    lines.push(`### ${nameOf(f.pid)}${f.smallSample ? `  [SMALL SAMPLE: ${f.gamesPlayed} game(s) — treat as a snapshot, hedge, no fixed identity]` : ` (${f.gamesPlayed} games)`}`);
    if (f.strengths.length === 0 && f.weaknesses.length === 0) {
      lines.push('- No clear outlier either way — middle of the pack across the board. Say exactly that.');
    }
    if (f.strengths.length) {
      lines.push('STRENGTHS (genuinely above the group):');
      for (const s of f.strengths) lines.push(`- ${s.label} = ${fmtVal(s.value, s.unit)} (rank ${s.rank} of ${s.outOf}; group best = ${nameOf(s.leaderPid)})`);
    }
    if (f.weaknesses.length) {
      lines.push('WEAKNESSES (genuinely below the group):');
      for (const w of f.weaknesses) lines.push(`- ${w.label} = ${fmtVal(w.value, w.unit)} (rank ${w.rank} of ${w.outOf}; group worst = ${nameOf(w.laggardPid)})`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
