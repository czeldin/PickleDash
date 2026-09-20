# PickleDash — Metric Provenance

Where every number on the dashboard comes from. Categories:

- **A — Direct from pb.vision**: the value pb.vision provides, used as-is.
- **B — Derived by our code** from pb.vision's raw shot/rally fields (signals are pb.vision's; the aggregation/formula is ours).
- **C — Our own model / heuristic / threshold** (not a pb.vision number; involves our assumptions).
- **CLAUDE** — LLM-generated prose that *interprets* the stats (not a raw metric).

Parser refs are `src/lib/parserAugmented.ts` unless noted.

## Player Overview (Hero)
| Metric | Cat | Source / formula | Caveats |
|---|---|---|---|
| Overall Rating (bar) | A | `player_data.trends.ratings.overall`, shot-weighted mean | pb.vision's own rating; our aggregation across games. |
| Record (W–L, win%) | B | game winner from `game_data.game_outcome`; win% = W/(W+L) | Scores direct; tally/% ours. |
| Games / shots | A | `sessionCount`; Σ `player_data.shot_count` | Counts of direct fields. |
| MVP by Game 👑 | C over A | argmax(per-game `overall`) | Rating direct; "MVP" = our selection rule. |

## Skill Ratings Breakdown
| Metric | Cat | Source | Caveats |
|---|---|---|---|
| Overall, Court IQ, Kitchen, Ball Ctrl, Targeting, Offense, Defense | A | `trends.ratings.*`, shot-weighted | Direct current-schema ratings. |
| Serve, Return, Agility, Consist | A (legacy) | `trends.ratings.serve/return/agility/consistency` | Absent from augmented exports → blank on newer nights; only from older exports. |
| Green/red pills | B/C | max/min across players in view | Our comparison highlight. |
| "Nn" night-coverage badge | C (meta) | distinct nights with data ÷ total nights | Data-completeness indicator, not a play stat. |

## Outcomes — Games · Points · Rallies
| Metric | Cat | Source | Caveats |
|---|---|---|---|
| Games W–L / win% | B | `game_data.game_outcome` → winner, tallied | Scores direct; W-L ours. |
| Points won/lost / win% | B | `rally.scoring_info.running_score` deltas, side-out-safe | Our reconstruction; `likely_bad` not consulted. |
| Rallies won/lost / win% | B | `rally.winning_team` tallied per player | Direct winner; our tally. |
| Net Pts / G | B | (pointsWon − pointsLost) / games | Fully derived. |
| Green column-leader | C | leader among **qualified** players only | Gated by our qualified threshold. |

## Why We Lost — Lost Rallies by Cause
Each lost rally charged to one cause from its final shot.
| Cause | Cat | Source | Caveats |
|---|---|---|---|
| We hit into net | B | loser's last shot, `end.zone==='net'` or `faults.net` | Direct fields; attribution rule ours. |
| We hit out | B | loser's last shot, `end.zone==='out'` or `faults.out` | Same. |
| We hit it short | B | loser's last shot, `faults.short` | **Ball fell short of the net and landed on the hitter's own side (`crossedNet=false`) — NOT an NVZ foot fault** (pb.vision doesn't track those). Visually similar to a net ball, but the ball never reached the net. |
| We popped it up | B | any loser shot `errors.popup==='exploited'` | Direct exploited flag. |
| They hit a winner | B | winner's last shot `is_putaway`/`winner_type==='clean'` | Direct winner flags. |
| Unattributed | C | anything unclassifiable | Deliberate honest residual (contradictory/noisy tags left here, not invented). |

## Partner-Adjusted Rally Win %
| Metric | Cat | Source | Caveats |
|---|---|---|---|
| Actual % | B | own rally win% | Derived. |
| Expected % | C | rally-weighted avg of partners' own rally win% | **Our model.** NOT Bradley-Terry; controls for partners, not opponents. |
| Lift | C | actual − expected | Modeled; UI labels "Approximate." |

## Shot Quality
| Metric | Cat | Source | Caveats |
|---|---|---|---|
| Excellent %, Poor % | A | `trends.shot_quality.excellent/.poor` | Direct distribution. |
| Excellent/Poor counts | B | fraction × totalShots (rounded) | **Reconstructed**, not exact per-shot counts. |
| Quality Score | C | excellentPct − poorPct | Our composite index. |

## Court Maps
| Metric | Cat | Source | Caveats |
|---|---|---|---|
| Dot positions / trajectories | A | `resulting_ball_movement.trajectory.start/end.location` (abs court feet) | Direct coords. |
| Dot color = shot quality | A | `quality.overall` → color ramp | Value direct; color presentational. |
| Drop/Drive n · quality · →kit% | A / B | quality avg (A); kit% = share with `end.zone==='kitchen'` (B) | endZone direct; % ours. |

## Kitchen Arrival by Shot Type
| Metric | Cat | Source | Caveats |
|---|---|---|---|
| 3rd/5th Drop/Drive/Either → Kitchen % | B | drop/drive on shot idx 2/4 (`shot_type`) + `rally.players.kitchen_arrivals` present | Arrival presence authoritative (A); split & % ours. |

## Kitchen Arrival — Serving vs Receiving
| Metric | Cat | Source | Caveats |
|---|---|---|---|
| Serving %, Receiving % (n/d) | A→B | `role_data.serving/receiving.oneself.kitchen_arrival / .total` | numerator & denominator **direct**; % is a trivial ratio. Strongest-provenance kitchen metric. |

## 3rd & 5th Shot Breakdown
| Metric | Cat | Source | Caveats |
|---|---|---|---|
| Drop % / Drive % (+counts) | B | `shot_type` of shot idx 2 / 4 by hitter | Shot type direct; mix % derived. |

## Drive-and-Drop
| Metric | Cat | Source | Caveats |
|---|---|---|---|
| 3rd drop win %, drive-and-drop win % (+ pop-up%), drive→offense win % | B | shot-sequence detection + `winning_team` + `errors.popup` | Derived sequence attribution. |
| Gap (drop − D&D) | C(light) | dropWin − dndWin | Our composite. |

## Targeting — Who Attacks / Gets Picked On
| Metric | Cat | Source | Caveats |
|---|---|---|---|
| Attacks/g | B | `is_speedup \|\| shot_type==='atp'` ÷ games | "Attack" definition ours; flags direct. |
| Winners/g (clean) | A→B | `winner_type==='clean'` ÷ games | Direct flag, rate ours. |
| Finish win % | B | clean ÷ is_putaway attempts | Ratio of two direct flags. |
| Pop-ups/g | A→B | `errors.popup` truthy ÷ games | Both potential+exploited. |
| Got attacked/g | A→B | `errors.popup==='exploited'` ÷ games | Direct exploited flag. |

## Rally Impact
| Metric | Cat | Source | Caveats |
|---|---|---|---|
| Winners/g | B | rally-ending shot with no `faults` | "Clean-ender" inferred from absence of fault (differs from Targeting's winner_type). |
| Lost/g | B | rally-ending shot WITH `faults` | Direct flag; attribution ours. |
| Set up opp/g | A→B | `errors.popup==='exploited'` | Direct. |
| Net/g | C(light) | won − lostDirect − setup | Our composite. |

## Shot Accuracy
| Metric | Cat | Source | Caveats |
|---|---|---|---|
| In / Net / Out % | A | `trends.shot_accuracy.in/net/out` | Direct distribution. |
| In/Net/Out counts | B | fraction × totalShots | **Reconstructed**, not exact. |

## Speed
| Metric | Cat | Source | Caveats |
|---|---|---|---|
| Serve avg / top mph | A / B fallback | per-serve `resulting_ball_movement.speed`; fallback = `trends.serve_speed` bucket midpoints | Real mph primary; bucket-midpoint fallback is an approximation (top=0). |
| Drive avg / top mph | A | `resulting_ball_movement.speed` for drives | Real mph; 0 if untracked. |

## Serve/Return Depth
| Metric | Cat | Source | Caveats |
|---|---|---|---|
| Deep / Med / Shallow % | A | `trends.serve_depth.*`, `trends.return_depth.*` | Direct distributions. |

## Error Breakdown
| Metric | Cat | Source | Caveats |
|---|---|---|---|
| Net/g, Out/g | A→B | `faults.net` / `faults.out` ÷ games | Direct flags. |
| Kitchen/g | A→B | `faults.short` | **Mislabeled "Kitchen" — it's the `short` fault (own-side short), not an NVZ foot fault.** |
| Popups/g, Unforced/g | A→B | `errors.popup` / `errors.unforced` | Direct flags. |
| Forced/g | B | (net\|out\|short) & !unforced | Our classification. |
| Out/g (corrected) | A→B | `faults.out` **only when `outcome !== 'intercepted'`** | pb.vision also flags balls headed out that an opponent intercepted before they landed; those near-misses are NOT lost points and are now excluded. |
| Total / per game | B | net + landed-out + short ÷ games | **Popups and unforced/forced are NOT in the total** (a popup stayed in). Prior version wrongly summed popups and intercepted-outs, inflating counts ~2.5×. |
| Headline tile: Shot accuracy % | A | `trends.shot_accuracy.in` (shot-weighted) | **Direct pb.vision metric** — the same % on pb.vision's leaderboard. Replaced the old derived "total errors / game" headline. |

## Attacking & Dinking
| Metric | Cat | Source | Caveats |
|---|---|---|---|
| Attacks, Attack Win Rate | B | `isAttack` + `winning_team` | Our attack definition. |
| Attack/Dink Quality | A→B | avg `quality.execution` × 100 | q.ex direct, averaged. |
| Dinks/Game | A→B | `shot_type==='dink'` ÷ games | Direct. |

## Areas for Improvement (Coaching)
| Metric | Cat | Source | Caveats |
|---|---|---|---|
| Coaching flags (kind, value%, relevance) | A | `coach_advice.advice[]` | pb.vision's own output; only averaging/sort ours. |

## Best Rallies / Highlights
| Metric | Cat | Source | Caveats |
|---|---|---|---|
| Rally #, shot count | A | rally index, `shots.length` | Direct. |
| "pts" score & ranking | C | avg `quality.overall` (near-A), ranked by quality×√length | Selection into top-N is our heuristic. |
| Thumbnails / deep-links | A | `vid`, `session_index`, rally num → pb.vision URLs | Constructed from direct ids. |

## Film Room
| Metric | Cat | Source | Caveats |
|---|---|---|---|
| Clip categories (clean winners, into net, out, popped up, put-away attempts) | A | `is_putaway`, `end.zone`, `errors.popup`, `won` | Category *definitions* ours; membership from direct flags. |
| q score, won/lost, deep-links | A | `quality.overall`, `won`, vid/rally link | Direct. |

## Cross-cutting: Qualified-players threshold
| Metric | Cat | Formula | Caveats |
|---|---|---|---|
| Qualification threshold | C | ≤20 games: min(⌈0.4·max⌉, ⌈0.33·total⌉); >20: max(4, ⌈0.15·max⌉); total ≈ max(maxGames, Σgames/4) | **Our heuristic** (from georgemurphy.net). Σgames/4 total estimate assumes ~4 players/game. |

## Claude-generated prose (interpretation, not raw stats)
| Item | Cat | Source | Notes |
|---|---|---|---|
| Player Summaries | CLAUDE | `/api/summaries` fed `buildStatsContext(data)` | LLM synthesis of the stats above. Guardrailed (v2): may only cite provided metrics; hedges on small samples. |
| Ask Claude chat | CLAUDE | `/api/ask` fed same context | Free-form; same no-invented-metrics guardrail. |

## Trust summary
Mostly **derived (B)** from a bedrock of **direct pb.vision measurements (A)**, with a small, clearly-labeled layer of **our own models (C)**. Strongest provenance: pb.vision ratings, shot quality/accuracy/depth, real ball-speed mph, `role_data` kitchen serve/receive, and coaching flags — all used essentially as-is. Only three things are genuinely modeled and each is labeled in the UI: partner-adjusted "lift", the qualified-players threshold, and the "Unattributed" loss bucket. Known caveats: the "Kitchen" error column and "we hit it short" cause are the `short` fault (not NVZ foot faults — pb.vision doesn't track those); Shot Accuracy/Quality counts are reconstructed from percentages; the serve-speed fallback uses bucket midpoints; and MVP / Best Rallies / Top Performer are our selection rules over direct values.
