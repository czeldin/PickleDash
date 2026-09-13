'use client';

import { useMemo, useState } from 'react';
import { DashboardData, PlayerMeta } from '@/types/dashboard';
import { SectionCard } from '@/components/SectionCard';

interface Props { data: DashboardData; }

const pct = (n: number, d: number) => (d > 0 ? Math.round((100 * n) / d) : null);

function Avatar({ p }: { p: PlayerMeta }) {
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold flex-shrink-0"
      style={{ backgroundColor: p.color.bg, color: p.color.text }}>{p.initials}</span>
  );
}

function WinCell({ won, n, sub }: { won: number; n: number; sub?: string }) {
  const v = pct(won, n);
  if (v === null) return <span className="text-gray-300">—</span>;
  const color = v >= 50 ? 'text-emerald-700' : v >= 42 ? 'text-gray-800' : 'text-red-600';
  return (
    <span>
      <span className={`font-semibold tabular-nums ${color}`}>{v}%</span>
      <span className="text-gray-400 text-xs ml-1">({won}/{n})</span>
      {sub && <span className="block text-[11px] text-amber-600">{sub}</span>}
    </span>
  );
}

export function DriveDropSection({ data }: Props) {
  const { driveDrop, players } = data;
  const pm = useMemo(() => new Map(players.map((p) => [p.pid, p])), [players]);
  const rows = useMemo(
    () => driveDrop.filter((r) => pm.has(r.pid) && r.dropN + r.driveN >= 5),
    [driveDrop, pm]
  );
  const [sortByGap, setSortByGap] = useState(true);

  const gap = (r: typeof rows[number]) => {
    const d = pct(r.dropWon, r.dropN);
    const dnd = pct(r.dndWon, r.dndN);
    return d !== null && dnd !== null ? d - dnd : null;
  };

  const sorted = useMemo(() => {
    const arr = [...rows];
    if (sortByGap) arr.sort((a, b) => (gap(b) ?? -999) - (gap(a) ?? -999));
    else arr.sort((a, b) => (pct(b.dndWon, b.dndN) ?? -1) - (pct(a.dndWon, a.dndN) ?? -1));
    return arr;
  }, [rows, sortByGap]);

  if (rows.length === 0) return null;

  return (
    <SectionCard title="Drive-and-Drop Analysis">
      <p className="text-sm text-gray-500 -mt-2 mb-4">
        For each player&apos;s own 3rd shots. A <strong className="text-gray-600">drive-and-drop</strong> (drive the 3rd, drop the 5th) usually forces a hard reset — it wins less than just dropping the 3rd. Compare each path&apos;s win rate. <strong className="text-amber-600">Gap</strong> = how many points per 100 you lose by drive-and-dropping instead of dropping the 3rd.
      </p>
      <div className="flex items-center gap-1 text-xs mb-3">
        <span className="text-gray-400">Sort by</span>
        <button type="button" onClick={() => setSortByGap(true)}
          className={`px-2 py-0.5 rounded-full font-medium transition-colors ${sortByGap ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>Biggest gap</button>
        <button type="button" onClick={() => setSortByGap(false)}
          className={`px-2 py-0.5 rounded-full font-medium transition-colors ${!sortByGap ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>Drive-and-drop win%</button>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 font-medium">
              <th className="text-left px-5 py-3">Player</th>
              <th className="text-right px-4 py-3">3rd drop win</th>
              <th className="text-right px-4 py-3">Drive-and-drop win</th>
              <th className="text-right px-4 py-3">Drive → offense win</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">Gap (drop − D&amp;D)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sorted.map((r) => {
              const p = pm.get(r.pid)!;
              const g = gap(r);
              const popPct = pct(r.dndPop, r.dndN);
              return (
                <tr key={r.pid} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3"><div className="flex items-center gap-2"><Avatar p={p} /><span className="text-gray-700 font-medium">{p.name}</span></div></td>
                  <td className="px-4 py-3 text-right align-top"><WinCell won={r.dropWon} n={r.dropN} /></td>
                  <td className="px-4 py-3 text-right align-top"><WinCell won={r.dndWon} n={r.dndN} sub={popPct !== null ? `${popPct}% pop-up` : undefined} /></td>
                  <td className="px-4 py-3 text-right align-top"><WinCell won={r.offWon} n={r.offN} /></td>
                  <td className="px-4 py-3 text-right align-top tabular-nums font-bold">
                    {g === null ? <span className="text-gray-300">—</span>
                      : <span className={g > 0 ? 'text-red-600' : 'text-emerald-700'}>{g > 0 ? '+' : ''}{g} pts</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-3">
        A positive gap (red) means dropping the 3rd wins more than drive-and-dropping — that player is leaving points on the table by driving into a reset. &ldquo;Drive → offense&rdquo; is when the drive earned a 5th-shot drive or attack instead of a reset (the drive working as intended).
      </p>
    </SectionCard>
  );
}
