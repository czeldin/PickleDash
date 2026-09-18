import { CourtShotRow } from '@/types/dashboard';

// Court geometry (absolute frame, feet): 20 wide × 44 long, net at 22, kitchen
// lines at 15 & 29. Matches CourtMapsSection. Rendered as a small icon showing
// this one shot's trajectory (contact → landing) — free, from data we already
// have, and more useful for a shot queue than a blurry video frame.
const CW = 20, CL = 44, NET = 22, K1 = 15, K2 = 29;
const clampX = (x: number) => Math.max(0, Math.min(CW, x));
const clampY = (y: number) => Math.max(0, Math.min(CL, y));

const TYPE_COLORS: Record<string, string> = {
  drop: '#0077BB', drive: '#EE7733', dink: '#009988', lob: '#AAAA00',
  atp: '#CC3377', smash: '#882255',
};

export function ShotThumbnail({ shot, size = 34 }: { shot: CourtShotRow; size?: number }) {
  const color = TYPE_COLORS[shot.type] ?? '#64748b';
  const fx = clampX(shot.fromX), fy = clampY(shot.fromY);
  const tx = clampX(shot.toX), ty = clampY(shot.toY);
  return (
    <svg
      width={size}
      height={size * (CL / CW) * 0.5}
      viewBox={`0 0 ${CW} ${CL}`}
      className="shrink-0 rounded-sm border border-gray-200 bg-[#eef4f9]"
      preserveAspectRatio="none"
      aria-hidden
    >
      {/* kitchen band */}
      <rect x={0} y={K1} width={CW} height={K2 - K1} fill="#dbeafe" />
      {/* net + kitchen lines */}
      <line x1={0} y1={NET} x2={CW} y2={NET} stroke="#334155" strokeWidth={0.6} />
      <line x1={0} y1={K1} x2={CW} y2={K1} stroke="#94a3b8" strokeWidth={0.3} />
      <line x1={0} y1={K2} x2={CW} y2={K2} stroke="#94a3b8" strokeWidth={0.3} />
      {/* trajectory + landing dot */}
      <line x1={fx} y1={fy} x2={tx} y2={ty} stroke={color} strokeWidth={0.9} />
      <circle cx={tx} cy={ty} r={1.6} fill={shot.won ? '#16a34a' : '#dc2626'} stroke="#fff" strokeWidth={0.3} />
    </svg>
  );
}
