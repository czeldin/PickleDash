'use client';

import { DashboardData, PlayerMeta, HeroStats } from '@/types/dashboard';
import { PlayerAvatar } from '@/components/PlayerAvatar';

interface Props {
  data: DashboardData;
}

interface Point {
  type: 'strength' | 'weakness' | 'neutral';
  text: string;
}

function avg(vals: number[]) {
  const v = vals.filter((x) => x > 0);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}

function rankDesc(pid: string, values: { pid: string; val: number }[]) {
  return [...values].sort((a, b) => b.val - a.val).findIndex((v) => v.pid === pid) + 1;
}
function rankAsc(pid: string, values: { pid: string; val: number }[]) {
  return [...values].sort((a, b) => a.val - b.val).findIndex((v) => v.pid === pid) + 1;
}

function ordinal(n: number) {
  return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
}

function buildInsight(pid: string, data: DashboardData): Point[] {
  const { skillRatings, shotAccuracy, errors, kitchenArrival, thirdShot, shotQuality, returnDepth, hero } = data;
  const n = data.players.length;
  const points: Point[] = [];

  const h = hero.find((r) => r.pid === pid);
  const sr = skillRatings.find((r) => r.pid === pid);
  const sa = shotAccuracy.find((r) => r.pid === pid);
  const er = errors.find((r) => r.pid === pid);
  const ka = kitchenArrival.find((r) => r.pid === pid);
  const ts = thirdShot.find((r) => r.pid === pid);
  const sq = shotQuality.find((r) => r.pid === pid);
  const rd = returnDepth.find((r) => r.pid === pid);

  // 1. Win rate vs skill rank
  if (h && h.wins + h.losses >= 3) {
    const winRate = h.wins / (h.wins + h.losses);
    const duprRank = rankDesc(pid, hero.map((r) => ({ pid: r.pid, val: r.dupr })));
    const winRank = rankDesc(pid, hero.map((r) => ({ pid: r.pid, val: r.wins / Math.max(r.wins + r.losses, 1) })));
    const gap = duprRank - winRank;
    if (gap >= 2) {
      points.push({ type: 'strength', text: `Outperforms their rating in match results — ${ordinal(duprRank)} in skill but ${ordinal(winRank)} in win rate (${Math.round(winRate * 100)}%). They compete well under pressure.` });
    } else if (gap <= -2) {
      points.push({ type: 'weakness', text: `Skill ranks ${ordinal(duprRank)} but win rate ranks ${ordinal(winRank)} (${Math.round(winRate * 100)}%) — individual quality isn't converting to wins as often as expected.` });
    }
  }

  // 2. Best and worst skill relative to own mean
  if (sr) {
    const skills = ['serve', 'return', 'offense', 'defense', 'agility', 'consistency'] as const;
    const vals = skills.map((s) => ({ skill: s, val: sr[s] })).filter((x) => x.val > 0);
    if (vals.length >= 3) {
      vals.sort((a, b) => b.val - a.val);
      const top = vals[0];
      const bot = vals[vals.length - 1];
      const topGroupRank = rankDesc(pid, skillRatings.map((r) => ({ pid: r.pid, val: r[top.skill] })));
      const botGroupRank = rankDesc(pid, skillRatings.map((r) => ({ pid: r.pid, val: r[bot.skill] })));
      const spread = top.val - bot.val;

      const topLabel = top.skill.charAt(0).toUpperCase() + top.skill.slice(1);
      const botLabel = bot.skill.charAt(0).toUpperCase() + bot.skill.slice(1);

      if (topGroupRank <= 2) {
        points.push({ type: 'strength', text: `${topLabel} is their standout skill (${top.val.toFixed(2)}), ranking ${ordinal(topGroupRank)} on the team.` });
      } else {
        points.push({ type: 'neutral', text: `${topLabel} is their strongest category at ${top.val.toFixed(2)}, though there's room to climb vs the group.` });
      }

      if (botGroupRank >= n - 1) {
        points.push({ type: 'weakness', text: `${botLabel} is their weakest area (${bot.val.toFixed(2)}), ranking ${ordinal(botGroupRank)} of ${n}${spread > 0.35 ? ` — a notable ${spread.toFixed(2)} gap from their best skill` : ''}.` });
      } else {
        points.push({ type: 'neutral', text: `${botLabel} (${bot.val.toFixed(2)}) is the lowest-rated skill in their own profile${spread > 0.35 ? `, with a ${spread.toFixed(2)} gap from their peak` : ''}.` });
      }
    }
  }

  // 3. 3rd shot strategy vs kitchen efficiency
  if (ts && ka && ts.dropCount + ts.driveCount >= 8) {
    const dropKitchen = ka.third_drop_kitchen_pct;
    const driveKitchen = ka.third_drive_kitchen_pct;
    const gap = dropKitchen - driveKitchen;
    const prefersDriving = ts.drivePct > 50;

    if (prefersDriving && gap > 12 && ka.third_drive_total >= 6) {
      points.push({ type: 'weakness', text: `Drives ${ts.drivePct.toFixed(0)}% of 3rd shots but only reaches the kitchen ${driveKitchen.toFixed(0)}% of the time after drives vs ${dropKitchen.toFixed(0)}% after drops — dropping more would likely improve net presence.` });
    } else if (!prefersDriving && dropKitchen > 50) {
      points.push({ type: 'strength', text: `Drop-first on the 3rd shot (${ts.dropPct.toFixed(0)}%) and executes well — arrives at the kitchen ${dropKitchen.toFixed(0)}% of the time.` });
    } else if (prefersDriving && driveKitchen > 45 && ka.third_drive_total >= 6) {
      points.push({ type: 'strength', text: `Drives ${ts.drivePct.toFixed(0)}% of 3rd shots and transitions to the kitchen ${driveKitchen.toFixed(0)}% of the time after — an aggressive style that's working.` });
    } else {
      points.push({ type: 'neutral', text: `Splits 3rd shots ${ts.dropPct.toFixed(0)}% drops / ${ts.drivePct.toFixed(0)}% drives, reaching the kitchen ${dropKitchen.toFixed(0)}% and ${driveKitchen.toFixed(0)}% of the time respectively.` });
    }
  }

  // 4. Error composition
  if (er && er.total >= 4) {
    const netPct = er.net / er.total;
    const outPct = er.out / er.total;
    const popupPct = er.popups / er.total;
    const unforcedPct = er.unforced / er.total;
    const errRank = rankAsc(pid, errors.map((r) => ({ pid: r.pid, val: r.totalPerGame })));

    if (popupPct > 0.2) {
      points.push({ type: 'weakness', text: `${Math.round(popupPct * 100)}% of errors are pop-ups — giving opponents easy put-aways from weak defensive contact in dink exchanges.` });
    } else if (netPct > 0.5) {
      points.push({ type: 'weakness', text: `${Math.round(netPct * 100)}% of errors go into the net — often a sign of rushed contact or poor weight transfer through the shot.` });
    } else if (outPct > 0.4) {
      points.push({ type: 'weakness', text: `${Math.round(outPct * 100)}% of errors sail long — may be taking too much pace from opponents or over-swinging.` });
    } else if (unforcedPct > 0.6) {
      points.push({ type: 'weakness', text: `${Math.round(unforcedPct * 100)}% of errors are unforced — giving away points without being pressured. More disciplined shot selection could cut the error count.` });
    } else if (unforcedPct < 0.35 && er.totalPerGame > 2) {
      points.push({ type: 'neutral', text: `Most errors are forced (${Math.round((1 - unforcedPct) * 100)}%) — they're being pressured into mistakes rather than beating themselves. Staying out of losing positions is the key lever.` });
    }

    if (errRank === 1) {
      points.push({ type: 'strength', text: `Fewest errors on the team at ${er.totalPerGame.toFixed(1)}/game — rarely beats themselves.` });
    } else if (errRank === n) {
      points.push({ type: 'weakness', text: `Most errors on the team at ${er.totalPerGame.toFixed(1)}/game — cutting self-inflicted mistakes is the highest-leverage improvement.` });
    }
  }

  // 5. Shot quality profile
  if (sq && sq.excellentCount + sq.poorCount > 15) {
    const exPct = sq.excellentPct;
    const poorPct = sq.poorPct;
    const exRank = rankDesc(pid, shotQuality.map((r) => ({ pid: r.pid, val: r.excellentPct })));
    const poorRank = rankDesc(pid, shotQuality.map((r) => ({ pid: r.pid, val: r.poorPct })));

    if (exRank === 1 && poorRank >= n - 1) {
      points.push({ type: 'strength', text: `Best shot quality profile on the team: most excellent shots (${exPct.toFixed(0)}%) and among the fewest poor ones (${poorPct.toFixed(0)}%).` });
    } else if (exPct > 45 && poorPct > 12) {
      points.push({ type: 'neutral', text: `High-variance player: ${exPct.toFixed(0)}% excellent shots but ${poorPct.toFixed(0)}% poor — creates opportunities but also gives openings. Works well against weaker opponents, risky against stronger ones.` });
    } else if (exRank <= 2) {
      points.push({ type: 'strength', text: `${ordinal(exRank)}-highest excellent shot rate on the team (${exPct.toFixed(0)}%) — consistently generates quality ball-striking.` });
    } else if (poorRank <= 2 && poorPct > 10) {
      points.push({ type: 'weakness', text: `${ordinal(poorRank)}-highest poor shot rate (${poorPct.toFixed(0)}%) — too many low-quality balls ending up in attackable positions.` });
    }
  }

  // 6. Return depth
  if (rd && (rd.deepPct + rd.medPct + rd.shallowPct) > 0) {
    const deepRank = rankDesc(pid, data.returnDepth.map((r) => ({ pid: r.pid, val: r.deepPct })));
    if (deepRank <= 2 && rd.deepPct > 50) {
      points.push({ type: 'strength', text: `${ordinal(deepRank)}-deepest returner on the team (${rd.deepPct.toFixed(0)}% deep) — consistently pins opponents at the baseline and earns time to reach the kitchen.` });
    } else if (rd.shallowPct > 30) {
      points.push({ type: 'weakness', text: `${rd.shallowPct.toFixed(0)}% of returns are shallow — giving opponents an easier transition forward. Deeper returns would create more pressure from the first shot.` });
    }
  }

  if (points.length === 0) {
    points.push({ type: 'neutral', text: 'Performs consistently across all categories without major outliers.' });
  }

  return points;
}

export function PlayerSummarySection({ data }: Props) {
  const { players } = data;
  if (players.length === 0) return null;

  const playerMap = new Map<string, PlayerMeta>(players.map((p) => [p.pid, p]));
  const sorted = [...data.hero].sort((a, b) => b.dupr - a.dupr);

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-gray-800 border-b border-gray-200 pb-2">
        Player Summaries
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sorted.map((h: HeroStats) => {
          const player = playerMap.get(h.pid);
          if (!player) return null;
          const points = buildInsight(h.pid, data);

          return (
            <div key={h.pid} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
              <div className="flex items-center gap-3">
                <PlayerAvatar player={player} size="lg" />
                <div>
                  <p className="font-bold text-gray-900">{player.name}</p>
                  <p className="text-sm text-gray-400">{h.dupr.toFixed(2)} overall · {h.wins}W–{h.losses}L</p>
                </div>
              </div>

              <div className="space-y-2">
                {points.map((p, i) => (
                  <div key={i} className="flex gap-2 text-sm">
                    <span className="mt-0.5 flex-shrink-0">
                      {p.type === 'strength' ? <span className="text-emerald-500">✓</span>
                        : p.type === 'weakness' ? <span className="text-red-400">✗</span>
                        : <span className="text-blue-400">→</span>}
                    </span>
                    <span className="text-gray-700">{p.text}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
