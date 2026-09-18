'use client';

import { useMemo, useState } from 'react';
import { DashboardData, CourtShotRow, PlayerMeta } from '@/types/dashboard';
import { SectionCard } from '@/components/SectionCard';
import { PlayerAvatar } from '@/components/PlayerAvatar';

interface Props {
  data: DashboardData;
  focusPid: string | null;
}

// Court geometry in feet (absolute frame): width 20 (x), length 44 (y), net at
// y=22, kitchen lines at y=15 and y=29. We render with a margin around it.
const CW = 20, CL = 44, NET = 22, KITCHEN_NEAR = 15, KITCHEN_FAR = 29;
const M = 3;                       // margin in feet
const VBW = CW + M * 2, VBH = CL + M * 2;
const fx = (x: number) => M + Math.max(-M, Math.min(CW + M, x));
const fy = (y: number) => M + Math.max(-M, Math.min(CL + M, y));

type ShotNumFilter = 'all' | '3' | '5';
type TypeFilter = 'all' | 'drop' | 'drive' | 'dink';

const TYPE_COLORS: Record<string, string> = {
  drop: '#0077BB', drive: '#EE7733', dink: '#009988', lob: '#AAAA00',
  atp: '#CC3377', smash: '#882255',
};

function CourtDiagram({ shots }: { shots: CourtShotRow[] }) {
  return (
    <svg viewBox={`0 0 ${VBW} ${VBH}`} className="w-full max-w-[360px] mx-auto" style={{ aspectRatio: `${VBW}/${VBH}` }}>
      {/* court surface */}
      <rect x={M} y={M} width={CW} height={CL} fill="#e8f0f7" stroke="#94a3b8" strokeWidth={0.25} />
      {/* kitchen zone */}
      <rect x={M} y={M + KITCHEN_NEAR} width={CW} height={KITCHEN_FAR - KITCHEN_NEAR} fill="#dbeafe" />
      {/* net */}
      <line x1={M} y1={M + NET} x2={M + CW} y2={M + NET} stroke="#334155" strokeWidth={0.5} />
      {/* kitchen lines */}
      <line x1={M} y1={M + KITCHEN_NEAR} x2={M + CW} y2={M + KITCHEN_NEAR} stroke="#94a3b8" strokeWidth={0.2} />
      <line x1={M} y1={M + KITCHEN_FAR} x2={M + CW} y2={M + KITCHEN_FAR} stroke="#94a3b8" strokeWidth={0.2} />
      {/* center line */}
      <line x1={M + CW / 2} y1={M} x2={M + CW / 2} y2={M + CL} stroke="#94a3b8" strokeWidth={0.15} strokeDasharray="1 1" />

      {/* shots: line contact→landing, dot at landing colored by win/loss */}
      {shots.map((s, i) => {
        const won = s.won;
        const color = TYPE_COLORS[s.type] ?? '#64748b';
        return (
          <g key={i} opacity={0.55}>
            <line x1={fx(s.fromX)} y1={fy(s.fromY)} x2={fx(s.toX)} y2={fy(s.toY)} stroke={color} strokeWidth={0.18} />
            <circle cx={fx(s.toX)} cy={fy(s.toY)} r={0.7} fill={won ? '#16a34a' : '#dc2626'} stroke="#fff" strokeWidth={0.12} />
          </g>
        );
      })}
    </svg>
  );
}

function breakdown(shots: CourtShotRow[]) {
  const drop = shots.filter((s) => s.type === 'drop');
  const drive = shots.filter((s) => s.type === 'drive');
  const winPct = (a: CourtShotRow[]) => (a.length ? Math.round((100 * a.filter((s) => s.won).length) / a.length) : null);
  const kitchenPct = (a: CourtShotRow[]) => (a.length ? Math.round((100 * a.filter((s) => s.endZone === 'kitchen').length) / a.length) : null);
  return {
    all: { n: shots.length, win: winPct(shots), kitchen: kitchenPct(shots) },
    drop: { n: drop.length, win: winPct(drop), kitchen: kitchenPct(drop) },
    drive: { n: drive.length, win: winPct(drive), kitchen: kitchenPct(drive) },
  };
}

export function CourtMapsSection({ data, focusPid }: Props) {
  const courtShots = data.courtShots;
  const players = data.players;
  const [shotNum, setShotNum] = useState<ShotNumFilter>('3');
  const [typeF, setTypeF] = useState<TypeFilter>('all');
  const [playerPid, setPlayerPid] = useState<string | null>(focusPid);

  const filtered = useMemo(() => {
    if (!courtShots) return [];
    return courtShots.filter((s) => {
      if (shotNum === '3' && s.shotNum !== 3) return false;
      if (shotNum === '5' && s.shotNum !== 5) return false;
      if (typeF !== 'all' && s.type !== typeF) return false;
      if (playerPid && s.pid !== playerPid) return false;
      return true;
    });
  }, [courtShots, shotNum, typeF, playerPid]);

  if (!courtShots || courtShots.length === 0) {
    return (
      <SectionCard title="Court Maps">
        <p className="text-sm text-gray-400 py-8 text-center">
          Court maps need pb.vision augmented insights (ball trajectories), which aren&apos;t available for this night yet.
          Newer nights include them automatically.
        </p>
      </SectionCard>
    );
  }

  const Chip = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-xs font-medium rounded-full border ${
        active ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  );

  const rows = players
    .map((p) => ({ player: p, bd: breakdown(courtShots.filter((s) => s.pid === p.pid && (shotNum === 'all' || s.shotNum === Number(shotNum)))) }))
    .filter((r) => r.bd.all.n > 0)
    .sort((a, b) => (b.bd.drop.win ?? -1) - (a.bd.drop.win ?? -1));

  return (
    <SectionCard title="Court Maps — Shot Locations">
      <p className="text-xs text-gray-400 -mt-2 mb-3">
        Where shots are hit and where they land. Lines run contact → landing; the dot is the landing spot,
        <span className="text-green-600 font-medium"> green = won the rally</span>,
        <span className="text-red-600 font-medium"> red = lost</span>. Kitchen band shaded.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-xs text-gray-400 mr-1">Shot:</span>
        <Chip active={shotNum === '3'} onClick={() => setShotNum('3')}>3rd</Chip>
        <Chip active={shotNum === '5'} onClick={() => setShotNum('5')}>5th</Chip>
        <Chip active={shotNum === 'all'} onClick={() => setShotNum('all')}>All</Chip>
        <span className="text-xs text-gray-400 mx-1">Type:</span>
        <Chip active={typeF === 'all'} onClick={() => setTypeF('all')}>All</Chip>
        <Chip active={typeF === 'drop'} onClick={() => setTypeF('drop')}>Drops</Chip>
        <Chip active={typeF === 'drive'} onClick={() => setTypeF('drive')}>Drives</Chip>
        <Chip active={typeF === 'dink'} onClick={() => setTypeF('dink')}>Dinks</Chip>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <button
              onClick={() => setPlayerPid(null)}
              className={`px-2 py-0.5 text-xs rounded-full border ${playerPid === null ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}
            >All players</button>
            {players.map((p) => (
              <button
                key={p.pid}
                onClick={() => setPlayerPid(p.pid)}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded-full border ${playerPid === p.pid ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}
              >
                <PlayerAvatar player={p} size="sm" /> {p.name}
              </button>
            ))}
          </div>
          <CourtDiagram shots={filtered} />
          <p className="text-center text-xs text-gray-400 mt-1">{filtered.length} shots shown</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-200">
                <th className="py-1.5 pr-2">Player</th>
                <th className="py-1.5 px-2">Drop n / win% / →kit%</th>
                <th className="py-1.5 px-2">Drive n / win% / →kit%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ player, bd }: { player: PlayerMeta; bd: ReturnType<typeof breakdown> }) => (
                <tr key={player.pid} className="border-b border-gray-100">
                  <td className="py-1.5 pr-2">
                    <span className="inline-flex items-center gap-1.5"><PlayerAvatar player={player} size="sm" /> {player.name}</span>
                  </td>
                  <td className="py-1.5 px-2 tabular-nums text-gray-700">
                    {bd.drop.n} · {bd.drop.win ?? '—'}% · {bd.drop.kitchen ?? '—'}%
                  </td>
                  <td className="py-1.5 px-2 tabular-nums text-gray-700">
                    {bd.drive.n} · {bd.drive.win ?? '—'}% · {bd.drive.kitchen ?? '—'}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-400 mt-2">
            win% = rally win rate when hitting that {shotNum === 'all' ? '' : shotNum + (shotNum === '3' ? 'rd' : 'th') + '-shot '}type;
            →kit% = landed in the kitchen. Table reflects the Shot filter, not the Type filter.
          </p>
        </div>
      </div>
    </SectionCard>
  );
}
