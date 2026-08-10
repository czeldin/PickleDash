import { PlayerMeta } from '@/types/dashboard';

interface Props {
  player: PlayerMeta;
  size?: 'sm' | 'md' | 'lg';
}

const sizes = {
  sm: 'w-7 h-7 text-xs',
  md: 'w-9 h-9 text-sm',
  lg: 'w-12 h-12 text-base',
};

export function PlayerAvatar({ player, size = 'md' }: Props) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-bold flex-shrink-0 ${sizes[size]}`}
      style={{ backgroundColor: player.color.bg, color: player.color.text }}
    >
      {player.initials}
    </span>
  );
}
