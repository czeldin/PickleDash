'use client';

import { useMemo } from 'react';
import { DashboardData } from '@/types/dashboard';
import { Night } from '@/types/nights';
import { parseMultipleNights } from '@/lib/parser';
import { SectionCard } from '@/components/SectionCard';
import { PlayerAvatar } from '@/components/PlayerAvatar';

interface Props {
  data: DashboardData;
  night: Night | null;
}

interface PaddleStats {
  paddle: string;
  games: number;
  winRate: number | null;
  dupr: number;
  offense: number;
  defense: number;
  serve: number;
  return: number;
  consistency: number;
  returnDeepPct: number;
  returnShallowPct: number;
  drivePct: number;
  dropKitchenPct: number;
  excellentPct: number;
  errorsPerGame: number;
  attackWinPct: number | null;
  dinkExcellentPct: number | null;
}

function parsePaddleStats(night: Night, playerName: string, paddle: string): PaddleStats | null {
  const tags = night.paddleTags ?? [];
  const sessionIdxs = tags
    .filter(t => t.playerName === playerName && t.paddle === paddle)
    .map(t => t.sessionIdx);
  if (sessionIdxs.length === 0) return null;

  const keys = new Set(sessionIdxs.map(i => `${night.id}_${i}`));
  const parsed = parseMultipleNights([night], keys);
  const pid = playerName.trim().toLowerCase();

  const h = parsed.hero.find(r => r.pid === pid);
  const sr = parsed.skillRatings.find(r => r.pid === pid);
  const rd = parsed.returnDepth.find(r => r.pid === pid);
  const ts = parsed.thirdShot.find(r => r.pid === pid);
  const ka = parsed.kitchenArrival.find(r => r.pid === pid);
  const sq = parsed.shotQuality.find(r => r.pid === pid);
  const er = parsed.errors.find(r => r.pid === pid);
  const atk = parsed.attacks.find(r => r.pid === pid);
  const dk = parsed.dinks.find(r => r.pid === pid);

  if (!h && !sr) return null;

  const games = h?.gamesPlayed ?? sessionIdxs.length;
  const total = (h?.wins ?? 0) + (h?.losses ?? 0);

  return {
    paddle,
    games,
    winRate: total > 0 ? (h!.wins / total) * 100 : null,
    dupr: h?.dupr ?? 0,
    offense: sr?.offense ?? 0,
    defense: sr?.defense ?? 0,
    serve: sr?.serve ?? 0,
    return: sr?.return ?? 0,
    consistency: sr?.consistency ?? 0,
    returnDeepPct: rd?.deepPct ?? 0,
    returnShallowPct: rd?.shallowPct ?? 0,
    drivePct: ts?.drivePct ?? 0,
    dropKitchenPct: ka?.third_drop_kitchen_pct ?? 0,
    excellentPct: sq?.excellentPct ?? 0,
    errorsPerGame: er?.totalPerGame ?? 0,
    attackWinPct: atk && atk.attackTotal >= 3 ? atk.attackWinPct : null,
    dinkExcellentPct: dk && dk.dinkTotal >= 5 ? dk.dinkExcellentPct : null,
  };
}

function StatRow({ label, a, b, higherIsBetter = true, fmt }: {
  label: string;
  a: number | null;
  b: number | null;
  higherIsBetter?: boolean;
  fmt: (v: number) => string;
}) {
  if (a == null && b == null) return null;
  const aWins = a != null && b != null && (higherIsBetter ? a > b : a < b);
  const bWins = a != null && b != null && (higherIsBetter ? b > a : b < a);
  const diff = a != null && b != null ? Math.abs(a - b) : null;
  const significant = diff != null && diff > 0.01;

  return (
    <tr className="border-t border-gray-50">
      <td className="py-2 pr-4 text-sm text-gray-500 whitespace-nowrap">{label}</td>
      <td className={`py-2 px-3 text-sm font-semibold text-center ${aWins && significant ? 'text-green-600' : 'text-gray-800'}`}>
        {a != null ? fmt(a) : '—'}
        {aWins && significant && <span className="ml-1 text-green-500 text-xs">▲</span>}
      </td>
      <td className={`py-2 px-3 text-sm font-semibold text-center ${bWins && significant ? 'text-green-600' : 'text-gray-800'}`}>
        {b != null ? fmt(b) : '—'}
        {bWins && significant && <span className="ml-1 text-green-500 text-xs">▲</span>}
      </td>
    </tr>
  );
}

function PlayerPaddleCard({ playerName, statsA, statsB, data }: {
  playerName: string;
  statsA: PaddleStats;
  statsB: PaddleStats;
  data: DashboardData;
}) {
  const player = data.players.find(p => p.pid === playerName.trim().toLowerCase());
  const pct = (v: number) => `${v.toFixed(0)}%`;
  const rating = (v: number) => v.toFixed(2);
  const err = (v: number) => v.toFixed(1);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      {/* Player header */}
      <div className="flex items-center gap-3 mb-4">
        {player && <PlayerAvatar player={player} size="md" />}
        <div>
          <p className="font-bold text-gray-900">{playerName}</p>
          <p className="text-xs text-gray-400">{statsA.games + statsB.games} games total</p>
        </div>
      </div>

      {/* Comparison table */}
      <table className="w-full">
        <thead>
          <tr>
            <th className="text-left text-xs text-gray-400 font-medium pb-2 pr-4">Stat</th>
            <th className="text-center text-xs font-bold pb-2 px-3" style={{ color: '#7c3aed' }}>{statsA.paddle}</th>
            <th className="text-center text-xs font-bold pb-2 px-3" style={{ color: '#0077BB' }}>{statsB.paddle}</th>
          </tr>
          <tr>
            <th className="pr-4" />
            <th className="text-center text-xs text-gray-400 font-normal pb-2 px-3">{statsA.games}G</th>
            <th className="text-center text-xs text-gray-400 font-normal pb-2 px-3">{statsB.games}G</th>
          </tr>
        </thead>
        <tbody>
          <StatRow label="Win Rate" a={statsA.winRate} b={statsB.winRate} fmt={pct} />
          <StatRow label="Overall Rating" a={statsA.dupr} b={statsB.dupr} fmt={rating} />
          <StatRow label="Offense" a={statsA.offense} b={statsB.offense} fmt={rating} />
          <StatRow label="Defense" a={statsA.defense} b={statsB.defense} fmt={rating} />
          <StatRow label="Serve" a={statsA.serve} b={statsB.serve} fmt={rating} />
          <StatRow label="Return" a={statsA.return} b={statsB.return} fmt={rating} />
          <StatRow label="Consistency" a={statsA.consistency} b={statsB.consistency} fmt={rating} />
          <StatRow label="Return Depth (deep)" a={statsA.returnDeepPct} b={statsB.returnDeepPct} fmt={pct} />
          <StatRow label="Return (shallow)" a={statsA.returnShallowPct} b={statsB.returnShallowPct} higherIsBetter={false} fmt={pct} />
          <StatRow label="Drive %" a={statsA.drivePct} b={statsB.drivePct} fmt={pct} higherIsBetter={false} />
          <StatRow label="Kitchen (after drop)" a={statsA.dropKitchenPct} b={statsB.dropKitchenPct} fmt={pct} />
          <StatRow label="Excellent Shot %" a={statsA.excellentPct} b={statsB.excellentPct} fmt={pct} />
          <StatRow label="Errors / Game" a={statsA.errorsPerGame} b={statsB.errorsPerGame} higherIsBetter={false} fmt={err} />
          <StatRow label="Attack Win %" a={statsA.attackWinPct} b={statsB.attackWinPct} fmt={pct} />
          <StatRow label="Dink Quality" a={statsA.dinkExcellentPct} b={statsB.dinkExcellentPct} fmt={pct} />
        </tbody>
      </table>
    </div>
  );
}

export function PaddleComparisonSection({ data, night }: Props) {
  const comparisons = useMemo(() => {
    if (!night?.paddleTags || night.paddleTags.length === 0) return [];

    // Find unique players with tags
    const playerNames = Array.from(new Set(night.paddleTags.map(t => t.playerName)));
    // Find unique paddles
    const paddles = Array.from(new Set(night.paddleTags.map(t => t.paddle)));
    if (paddles.length < 2) return [];

    const results: { playerName: string; statsA: PaddleStats; statsB: PaddleStats }[] = [];

    for (const playerName of playerNames) {
      const statsA = parsePaddleStats(night, playerName, paddles[0]);
      const statsB = parsePaddleStats(night, playerName, paddles[1]);
      if (statsA && statsB && statsA.games > 0 && statsB.games > 0) {
        results.push({ playerName, statsA, statsB });
      }
    }

    return results;
  }, [night]);

  if (comparisons.length === 0) return null;

  const paddles = Array.from(new Set(night!.paddleTags!.map(t => t.paddle)));

  return (
    <SectionCard title="Paddle Comparison">
      <p className="text-xs text-gray-400 -mt-2 mb-4">
        Head-to-head stats for each player across their two paddles. ▲ = better result.
        <span className="ml-2 font-semibold" style={{ color: '#7c3aed' }}>{paddles[0]}</span>
        {' vs '}
        <span className="font-semibold" style={{ color: '#0077BB' }}>{paddles[1]}</span>
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {comparisons.map(({ playerName, statsA, statsB }) => (
          <PlayerPaddleCard
            key={playerName}
            playerName={playerName}
            statsA={statsA}
            statsB={statsB}
            data={data}
          />
        ))}
      </div>
    </SectionCard>
  );
}
