'use client';

import { DashboardData, PlayerMeta, HeroStats } from '@/types/dashboard';
import { PlayerAvatar } from '@/components/PlayerAvatar';

interface Props {
  data: DashboardData;
}

interface Summary {
  pid: string;
  style: string;
  superpower: string;
  improve: string;
}

// How far above the group mean is this player's value? Returns a margin score.
function margin(val: number, allVals: number[]): number {
  const nonzero = allVals.filter((v) => v > 0);
  if (nonzero.length < 2) return 0;
  const mean = nonzero.reduce((a, b) => a + b, 0) / nonzero.length;
  return val - mean;
}

function rankDesc(pid: string, values: { pid: string; val: number }[]) {
  return [...values].sort((a, b) => b.val - a.val).findIndex((v) => v.pid === pid) + 1;
}

function ordinal(n: number) {
  return ['1st', '2nd', '3rd', '4th', '5th', '6th'][n - 1] ?? `${n}th`;
}

function buildSummary(pid: string, data: DashboardData): Summary {
  const { skillRatings, errors, kitchenArrival, thirdShot, shotQuality, returnDepth, serveSpeed, driveSpeed, hero } = data;
  const n = data.players.length;

  const h = hero.find((r) => r.pid === pid)!;
  const sr = skillRatings.find((r) => r.pid === pid);
  const er = errors.find((r) => r.pid === pid);
  const ka = kitchenArrival.find((r) => r.pid === pid);
  const ts = thirdShot.find((r) => r.pid === pid);
  const sq = shotQuality.find((r) => r.pid === pid);
  const rd = returnDepth.find((r) => r.pid === pid);
  const ss = serveSpeed.find((r) => r.pid === pid);
  const ds = driveSpeed.find((r) => r.pid === pid);

  // ── Style ────────────────────────────────────────────────────────────────
  let style = 'All-around player';
  if (ts) {
    if (ts.drivePct > 60) style = 'Drive-first attacker';
    else if (ts.dropPct > 65) style = 'Drop-and-transition specialist';
    else style = 'Balanced shot-maker';
  }
  if (er && er.totalPerGame < (errors.reduce((a, b) => a + b.totalPerGame, 0) / n) * 0.75) {
    style += ' · Low-error';
  } else if (sq && sq.excellentPct > 48 && sq.poorPct > 12) {
    style += ' · High-variance';
  }

  // ── Superpower candidates ────────────────────────────────────────────────
  interface Candidate { score: number; text: string }
  const candidates: Candidate[] = [];

  // Skill ratings
  if (sr) {
    const skills = ['serve', 'return', 'offense', 'defense', 'agility', 'consistency'] as const;
    for (const skill of skills) {
      const allVals = skillRatings.map((r) => r[skill]);
      const m = margin(sr[skill], allVals);
      const rk = rankDesc(pid, skillRatings.map((r) => ({ pid: r.pid, val: r[skill] })));
      if (rk === 1 && m > 0.05) {
        const descriptions: Record<string, string> = {
          offense: `Best offensive rating on the team (${sr.offense.toFixed(2)}). They create pressure and put opponents in tough spots more than anyone else.`,
          defense: `Top defensive rating (${sr.defense.toFixed(2)}). They get to difficult balls and keep rallies alive when others would pop it up or net it.`,
          return: `Best return game on the team (${sr.return.toFixed(2)}). Strong returns set up the whole point — they're starting rallies on the front foot.`,
          serve: `Sharpest serve in the group (${sr.serve.toFixed(2)}). Consistent serving under pressure gives them a reliable platform for every point.`,
          agility: `Most agile player on the team (${sr.agility.toFixed(2)}). They cover more court and recover faster, making them hard to exploit positionally.`,
          consistency: `Most consistent player on the team (${sr.consistency.toFixed(2)}). They rarely give away cheap points and keep opponents grinding.`,
        };
        candidates.push({ score: m * 12, text: descriptions[skill] });
      }
    }
  }

  // Shot quality
  if (sq) {
    const allEx = shotQuality.map((r) => r.excellentPct);
    const m = margin(sq.excellentPct, allEx);
    const rk = rankDesc(pid, shotQuality.map((r) => ({ pid: r.pid, val: r.excellentPct })));
    if (rk <= 2 && m > 2) {
      candidates.push({ score: m * 0.8, text: `${ordinal(rk)}-highest excellent shot rate (${sq.excellentPct.toFixed(0)}%). They generate quality ball-striking more consistently than almost anyone — building pressure shot by shot.` });
    }
  }

  // Serve speed
  if (ss && ss.avgMph > 0) {
    const allMph = serveSpeed.filter((r) => r.avgMph > 0).map((r) => r.avgMph);
    const m = margin(ss.avgMph, allMph);
    const rk = rankDesc(pid, serveSpeed.map((r) => ({ pid: r.pid, val: r.avgMph })));
    if (rk === 1 && m > 1.5) {
      candidates.push({ score: m * 0.6, text: `Hardest server in the group at ${ss.avgMph.toFixed(0)} mph avg (top: ${ss.topMph.toFixed(0)} mph). Pace on serve forces weak returns and shortens points in their favor.` });
    }
  }

  // Drive speed
  if (ds && ds.avgMph > 0) {
    const allMph = driveSpeed.filter((r) => r.avgMph > 0).map((r) => r.avgMph);
    const m = margin(ds.avgMph, allMph);
    const rk = rankDesc(pid, driveSpeed.map((r) => ({ pid: r.pid, val: r.avgMph })));
    if (rk === 1 && m > 1.5) {
      candidates.push({ score: m * 0.5, text: `Biggest ball-striker off the ground at ${ds.avgMph.toFixed(0)} mph avg. Their drives create pace that others struggle to handle.` });
    }
  }

  // Kitchen arrival
  if (ka && ka.third_drop_kitchen_pct > 0) {
    const allDrop = kitchenArrival.map((r) => r.third_drop_kitchen_pct);
    const m = margin(ka.third_drop_kitchen_pct, allDrop);
    const rk = rankDesc(pid, kitchenArrival.map((r) => ({ pid: r.pid, val: r.third_drop_kitchen_pct })));
    if (rk === 1 && m > 5) {
      candidates.push({ score: m * 0.4, text: `Best at getting to the kitchen after a drop (${ka.third_drop_kitchen_pct.toFixed(0)}%). This is the most important transition in pickleball — they do it better than anyone on the team.` });
    }
  }

  // Return depth
  if (rd) {
    const allDeep = returnDepth.map((r) => r.deepPct);
    const m = margin(rd.deepPct, allDeep);
    const rk = rankDesc(pid, returnDepth.map((r) => ({ pid: r.pid, val: r.deepPct })));
    if (rk === 1 && m > 8) {
      candidates.push({ score: m * 0.35, text: `Most aggressive returner on the team — ${rd.deepPct.toFixed(0)}% of returns land deep, pinning opponents at the baseline and buying time to take the net.` });
    }
  }

  // Low errors
  if (er && er.gamesPlayed > 0) {
    const allErr = errors.map((r) => r.totalPerGame);
    const m = margin(er.totalPerGame, allErr); // negative = fewer errors = good
    const rk = rankDesc(pid, errors.map((r) => ({ pid: r.pid, val: -r.totalPerGame })));
    if (rk === 1 && m < -1.5) {
      candidates.push({ score: Math.abs(m) * 0.9, text: `Cleanest player on the team by a wide margin — only ${er.totalPerGame.toFixed(1)} errors/game. In a game where unforced mistakes decide close points, they make opponents earn every winner.` });
    }
  }

  // Win rate above expectation
  if (h && h.wins + h.losses >= 3) {
    const winRate = h.wins / (h.wins + h.losses);
    const duprRank = rankDesc(pid, hero.map((r) => ({ pid: r.pid, val: r.dupr })));
    const winRank = rankDesc(pid, hero.map((r) => ({ pid: r.pid, val: r.wins / Math.max(r.wins + r.losses, 1) })));
    if (winRank < duprRank && winRank === 1) {
      candidates.push({ score: 6, text: `Top win rate on the team (${Math.round(winRate * 100)}%) despite not having the highest skill rating — a sign of composure, smart point construction, and clutch play.` });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const superpower = candidates[0]?.text ?? 'Consistent across all areas — no obvious weak point for opponents to target.';

  // ── Improvement candidates ───────────────────────────────────────────────
  interface ImproveCand { priority: number; text: string }
  const improveCands: ImproveCand[] = [];

  // 3rd shot strategy mismatch
  if (ts && ka && ts.driveCount + ts.dropCount >= 8) {
    const drivePct = ts.drivePct;
    const dropKitchen = ka.third_drop_kitchen_pct;
    const driveKitchen = ka.third_drive_kitchen_pct;
    const gap = dropKitchen - driveKitchen;
    if (drivePct > 45 && gap > 15 && ka.third_drive_total >= 6) {
      improveCands.push({ priority: 9, text: `3rd shot selection. They drive ${drivePct.toFixed(0)}% of the time but only reach the kitchen ${driveKitchen.toFixed(0)}% after drives vs ${dropKitchen.toFixed(0)}% after drops — a ${gap.toFixed(0)}-point gap. Committing to more drops would directly improve net position and win rate.` });
    }
  }

  // Unforced errors
  if (er && er.total >= 5 && er.unforced / er.total > 0.55) {
    const unforcedPct = Math.round((er.unforced / er.total) * 100);
    const errRank = rankDesc(pid, errors.map((r) => ({ pid: r.pid, val: r.totalPerGame })));
    if (errRank <= 2) {
      improveCands.push({ priority: 8, text: `Shot discipline. ${unforcedPct}% of their errors are unforced — they're beating themselves without being pressured. More conservative shot selection in neutral positions could cut their error count significantly.` });
    } else {
      improveCands.push({ priority: 6, text: `Shot discipline. ${unforcedPct}% of errors are unforced. Slowing down in neutral rallies and choosing higher-percentage shots would reduce self-inflicted damage.` });
    }
  }

  // Popup rate
  if (er && er.total >= 5 && er.popups / er.total > 0.2) {
    improveCands.push({ priority: 7, text: `Defensive positioning. ${Math.round((er.popups / er.total) * 100)}% of errors are pop-ups, handing opponents easy put-aways. Working on resetting hard-driven balls softly into the kitchen — rather than counter-driving — would reduce this significantly.` });
  }

  // Shallow returns
  if (rd && rd.shallowPct > 30) {
    const rk = rankDesc(pid, returnDepth.map((r) => ({ pid: r.pid, val: r.shallowPct })));
    if (rk <= 2) {
      improveCands.push({ priority: 6, text: `Return depth. ${rd.shallowPct.toFixed(0)}% of returns land short, giving opponents an easy transition to the net. Hitting deeper returns — even if slower — would force opponents back and buy more time to take the kitchen.` });
    }
  }

  // Poor kitchen arrival overall
  if (ka) {
    const avgArrival = (ka.third_drop_kitchen_pct + ka.third_drive_kitchen_pct) / 2;
    const groupAvg = kitchenArrival.reduce((a, r) => a + (r.third_drop_kitchen_pct + r.third_drive_kitchen_pct) / 2, 0) / n;
    const rk = rankDesc(pid, kitchenArrival.map((r) => ({ pid: r.pid, val: (r.third_drop_kitchen_pct + r.third_drive_kitchen_pct) / 2 })));
    if (rk === n && avgArrival < groupAvg - 8) {
      improveCands.push({ priority: 7, text: `Kitchen transition. They reach the kitchen on only ${avgArrival.toFixed(0)}% of 3rd shots on average — the lowest on the team. Getting to the net more consistently after the 3rd shot is the single biggest lever in amateur pickleball.` });
    }
  }

  // Worst skill relative to own profile (only if large gap)
  if (sr) {
    const skills = ['serve', 'return', 'offense', 'defense', 'agility', 'consistency'] as const;
    const vals = skills.map((s) => ({ skill: s, val: sr[s] })).filter((x) => x.val > 0);
    if (vals.length >= 4) {
      vals.sort((a, b) => a.val - b.val);
      const worst = vals[0];
      const best = vals[vals.length - 1];
      const gap = best.val - worst.val;
      const worstRk = rankDesc(pid, skillRatings.map((r) => ({ pid: r.pid, val: r[worst.skill] })));
      if (gap > 0.4 && worstRk >= n - 1) {
        const label = worst.skill.charAt(0).toUpperCase() + worst.skill.slice(1);
        improveCands.push({ priority: 5, text: `${label} (${worst.val.toFixed(2)}), their lowest-rated skill by ${gap.toFixed(2)} points and ranked ${ordinal(worstRk)} on the team. Closing this gap would make them a significantly more complete player.` });
      }
    }
  }

  improveCands.sort((a, b) => b.priority - a.priority);
  const improve = improveCands[0]?.text ?? 'Continue building consistency — the numbers are solid across the board.';

  return { pid, style, superpower, improve };
}

export function PlayerSummarySection({ data }: Props) {
  const { players } = data;
  if (players.length === 0) return null;

  const playerMap = new Map<string, PlayerMeta>(players.map((p) => [p.pid, p]));
  const sorted = [...data.hero].filter((h) => h.dupr > 0).sort((a, b) => b.dupr - a.dupr);

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-gray-800 border-b border-gray-200 pb-2">
        Player Summaries
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sorted.map((h: HeroStats) => {
          const player = playerMap.get(h.pid);
          if (!player) return null;
          const summary = buildSummary(h.pid, data);

          return (
            <div key={h.pid} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <PlayerAvatar player={player} size="lg" />
                  <div>
                    <p className="font-bold text-gray-900">{player.name}</p>
                    <p className="text-sm text-gray-400">{h.dupr.toFixed(2)} · {h.wins}W–{h.losses}L</p>
                  </div>
                </div>
                <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded-full text-right leading-tight max-w-[140px]">
                  {summary.style}
                </span>
              </div>

              {/* Superpower */}
              <div className="space-y-1">
                <p className="text-xs font-bold text-emerald-600 uppercase tracking-wide">⚡ Superpower</p>
                <p className="text-sm text-gray-700 leading-relaxed">{summary.superpower}</p>
              </div>

              {/* Improve */}
              <div className="space-y-1">
                <p className="text-xs font-bold text-amber-500 uppercase tracking-wide">🎯 Biggest opportunity</p>
                <p className="text-sm text-gray-700 leading-relaxed">{summary.improve}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
