import { DashboardData } from '@/types/dashboard';

const pct = (n: number, d: number) => (d > 0 ? Math.round((100 * n) / d) : null);

/**
 * Build a compact, labelled stats summary for the model from the CURRENT
 * (filtered) dashboard data. Shared by the Ask-Claude chat and the player
 * summaries. Includes the richer augmented outcome stats (win rates by lens,
 * loss attribution, finishing, partner lift) when present, since those drive
 * better synthesis than pb.vision's narrow skill ratings.
 */
export function buildStatsContext(data: DashboardData): string {
  const pm = new Map(data.players.map((p) => [p.pid, p.name]));
  const name = (pid: string) => pm.get(pid) ?? pid;
  const heroMap = new Map(data.hero.map((h) => [h.pid, h]));
  const out: string[] = [];

  out.push(`Players in view: ${data.players.map((p) => p.name).join(', ')}`);
  out.push(`Games (sessions) in view: ${data.sessions.length}`);
  out.push('Note: these players mostly play each other, so win rates near 50% are expected.');
  out.push('');

  // Outcomes — games / points / rallies (augmented)
  if (data.outcomeStats && data.outcomeStats.length) {
    out.push('### Outcomes — games / points / rallies (win%)');
    out.push('name | games W-L (win%) | point win% | rally win% | net pts/game');
    for (const o of data.outcomeStats) {
      const gw = pct(o.gamesWon, o.gamesWon + o.gamesLost);
      const pw = pct(o.pointsWon, o.pointsWon + o.pointsLost);
      const rw = pct(o.ralliesWon, o.ralliesWon + o.ralliesLost);
      out.push(`${name(o.pid)} | ${o.gamesWon}-${o.gamesLost} (${gw ?? '—'}%) | ${pw ?? '—'}% | ${rw ?? '—'}% | ${o.netPointsPerGame >= 0 ? '+' : ''}${o.netPointsPerGame.toFixed(1)}`);
    }
    out.push('');
  }

  // Why lost — attribution (augmented)
  if (data.lossReasons && data.lossReasons.some((r) => r.ralliesLost > 0)) {
    const gp = new Map((data.outcomeStats ?? []).map((o) => [o.pid, o.gamesPlayed]));
    out.push('### Lost rallies by cause — per game (the fixable "we…" causes are our own errors)');
    out.push('name | into net/g | out/g | short/g | popped-up-&-punished/g | opp winner/g | unattributed/g');
    for (const r of data.lossReasons) {
      if (r.ralliesLost === 0) continue;
      const g = gp.get(r.pid) ?? 0;
      const pg = (n: number) => (g > 0 ? (n / g).toFixed(1) : '—');
      out.push(`${name(r.pid)} | ${pg(r.ownNet)} | ${pg(r.ownOut)} | ${pg(r.ownKitchen)} | ${pg(r.popupExploited)} | ${pg(r.oppWinner)} | ${pg(r.other)}`);
    }
    out.push('');
  }

  // Partner-adjusted rally win% (augmented)
  if (data.partnerAdj && data.partnerAdj.some((r) => r.rallies > 0)) {
    out.push('### Partner-adjusted rally win% (actual vs partners’ baseline; +lift = raises partners)');
    out.push('name | actual% | expected% | lift');
    for (const r of data.partnerAdj) {
      if (r.rallies === 0) continue;
      out.push(`${name(r.pid)} | ${r.actualWinPct.toFixed(0)}% | ${r.expectedWinPct.toFixed(0)}% | ${r.lift >= 0 ? '+' : ''}${r.lift.toFixed(1)}`);
    }
    out.push('');
  }

  // Skill ratings (secondary — narrow band)
  out.push('### pb.vision skill ratings (narrow ~4.1-4.5 band; secondary to outcomes)');
  out.push('name | overall | courtIQ | kitchen | ballCtrl | targeting | offense | defense');
  for (const r of data.skillRatings) {
    const f = (v: number) => (v > 0 ? v.toFixed(2) : '—');
    out.push(`${name(r.pid)} | ${f(r.overall)} | ${f(r.courtIq)} | ${f(r.kitchenGame)} | ${f(r.ballControl)} | ${f(r.targeting)} | ${f(r.offense)} | ${f(r.defense)}`);
  }
  out.push('');

  // Targeting / finishing per game
  if (data.targeting.some((r) => r.games > 0)) {
    out.push('### Attacking & finishing per game');
    out.push('name | attacks/g | finishes/g | clean winners/g | popups given/g | got attacked/g');
    for (const r of data.targeting) {
      if (r.games === 0) continue;
      const per = (n: number) => (n / r.games).toFixed(1);
      out.push(`${name(r.pid)} | ${per(r.attacks)} | ${per(r.fin)} | ${per(r.clean)} | ${per(r.pop)} | ${per(r.gotAttacked)}`);
    }
    out.push('');
  }

  // 3rd shot selection + kitchen arrival (drop vs drive)
  if (data.thirdShot.length) {
    out.push('### 3rd shot: drop vs drive mix, and kitchen-arrival after each');
    out.push('name | drop% | drive% | drop→kitchen% | drive→kitchen%');
    for (const r of data.thirdShot) {
      const ka = data.kitchenArrival.find((k) => k.pid === r.pid);
      out.push(`${name(r.pid)} | ${Math.round(r.dropPct)}% | ${Math.round(r.drivePct)}% | ${ka ? Math.round(ka.third_drop_kitchen_pct) : '—'}% | ${ka ? Math.round(ka.third_drive_kitchen_pct) : '—'}%`);
    }
    out.push('');
  }

  // Errors per game + records (net/out/kitchen/popups are already per-game)
  out.push('### Errors per game & record');
  out.push('name | errors/g | net/g | out/g | kitchen/g | popups/g | record');
  for (const r of data.errors) {
    const h = heroMap.get(r.pid);
    const rec = h ? `${h.wins}W-${h.losses}L` : '—';
    out.push(`${name(r.pid)} | ${r.totalPerGame.toFixed(1)} | ${r.net.toFixed(1)} | ${r.out.toFixed(1)} | ${r.kitchen.toFixed(1)} | ${r.popups.toFixed(1)} | ${rec}`);
  }
  out.push('');

  // Shot quality. Use 1-decimal precision (0.1%): rounding to whole percents
  // erased the gap between e.g. 9.7% and 11.0% and let the model over-read a
  // near-tie. Also annotate the group's actual best/worst on each column so the
  // model never has to guess who "leads" — a superlative it derived itself was
  // wrong (it called a mid-pack poor% the group's highest).
  if (data.shotQuality.some((r) => r.excellentPct > 0)) {
    const rated = data.shotQuality.filter((r) => r.excellentPct > 0);
    const hiExc = Math.max(...rated.map((r) => r.excellentPct));
    const hiPoor = Math.max(...rated.map((r) => r.poorPct));
    const loPoor = Math.min(...rated.map((r) => r.poorPct));
    out.push('### Shot quality');
    out.push('(higher excellent% = better; higher poor% = worse)');
    out.push('name | excellent% | poor% | drop excellent% | clean winners');
    for (const r of rated) {
      const tags: string[] = [];
      if (r.excellentPct === hiExc) tags.push('best excellent%');
      if (r.poorPct === hiPoor) tags.push('WORST poor% (group high)');
      if (r.poorPct === loPoor) tags.push('best poor% (group low)');
      const tag = tags.length ? `  <- ${tags.join(', ')}` : '';
      out.push(`${name(r.pid)} | ${r.excellentPct.toFixed(1)}% | ${r.poorPct.toFixed(1)}% | ${r.dropTotal >= 5 ? r.dropExcellentPct.toFixed(0) + '%' : '—'} | ${r.winnerTotal}${tag}`);
    }
    out.push('');
  }

  // Serve/drive speed + return depth
  out.push('### Serve/drive speed (mph) & return depth');
  out.push('name | serve avg | drive avg | return deep%');
  for (const p of data.players) {
    const ss = data.serveSpeed.find((r) => r.pid === p.pid);
    const ds = data.driveSpeed.find((r) => r.pid === p.pid);
    const rd = data.returnDepth.find((r) => r.pid === p.pid);
    out.push(`${p.name} | ${ss && ss.avgMph > 0 ? ss.avgMph.toFixed(0) : '—'} | ${ds && ds.avgMph > 0 ? ds.avgMph.toFixed(0) : '—'} | ${rd ? rd.deepPct.toFixed(0) + '%' : '—'}`);
  }
  out.push('');

  // pb.vision coaching flags
  const withCoach = data.coaching.filter((c) => c.items.length > 0);
  if (withCoach.length > 0) {
    out.push('### pb.vision coaching flags (lowest-scoring metrics per player)');
    for (const c of withCoach) {
      const items = c.items.slice(0, 4).map((it) => `${it.kind.replace(/_/g, ' ')} ${Math.round(it.value * 100)}%`).join('; ');
      out.push(`${name(c.pid)}: ${items}`);
    }
    out.push('');
  }

  return out.join('\n');
}

/**
 * A stable signature of the stats that feed the summaries, used as the cache
 * key. Rounded so trivially-different views still hit the cache, but any real
 * change (different night, games, or players) produces a new key.
 */
export function statsSignature(data: DashboardData): string {
  const parts: string[] = [];
  parts.push('P:' + data.players.map((p) => p.pid).sort().join(','));
  // NOTE: data.sessions is intentionally the FULL session list (for the game
  // dropdown), so it does NOT vary with the night/game selection — don't rely on
  // it. Instead sign every per-player stat that reflects the actual selection,
  // with enough precision that two different selections can't collide.
  const r1 = (n: number) => Math.round(n * 10);
  for (const o of (data.outcomeStats ?? []).slice().sort((a, b) => a.pid.localeCompare(b.pid))) {
    parts.push(`${o.pid}:g${o.gamesWon}-${o.gamesLost}:p${o.pointsWon}-${o.pointsLost}:r${o.ralliesWon}-${o.ralliesLost}`);
  }
  for (const s of data.skillRatings.slice().sort((a, b) => a.pid.localeCompare(b.pid))) {
    parts.push(`${s.pid}:o${r1(s.overall)}:k${r1(s.kitchenGame)}:t${r1(s.targeting)}`);
  }
  // Per-player error/shot totals also pin the selection down further.
  for (const e of data.errors.slice().sort((a, b) => a.pid.localeCompare(b.pid))) {
    parts.push(`${e.pid}:e${e.total}:g${e.gamesPlayed}`);
  }
  return parts.join('|');
}
