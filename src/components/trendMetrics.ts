import { NightTrendRow } from '@/types/dashboard';
import { MetricDef } from '@/components/TrendChart';

// n/d as a percentage (null when no data); per-game rate (null when no games)
const rt = (n: number, d: number) => (d > 0 ? (100 * n) / d : null);
const perGame = (n: number, r: NightTrendRow) => (r.gamesPlayed > 0 ? n / r.gamesPlayed : null);

export const SHOT_ACCURACY_METRICS: MetricDef<NightTrendRow>[] = [
  { key: 'in', label: 'In %', value: (r) => rt(r.accIn, r.accW), pct: true },
  { key: 'net', label: 'Net error %', value: (r) => rt(r.accNet, r.accW), pct: true },
  { key: 'out', label: 'Out %', value: (r) => rt(r.accOut, r.accW), pct: true },
];

export const SPEED_METRICS: MetricDef<NightTrendRow>[] = [
  { key: 'serve', label: 'Serve avg mph', value: (r) => (r.ssW > 0 ? r.ssSum / r.ssW : null), pct: false },
  { key: 'drive', label: 'Drive avg mph', value: (r) => (r.dvN > 0 ? r.dvSum / r.dvN : null), pct: false },
];

export const DEPTH_METRICS: MetricDef<NightTrendRow>[] = [
  { key: 'serve', label: 'Serve deep %', value: (r) => rt(r.sdDeep, r.sdW), pct: true },
  { key: 'return', label: 'Return deep %', value: (r) => rt(r.rdDeep, r.rdW), pct: true },
];

export const ERROR_METRICS: MetricDef<NightTrendRow>[] = [
  { key: 'total', label: 'Errors/g', value: (r) => perGame(r.errTot, r), pct: false },
  { key: 'unforced', label: 'Unforced/g', value: (r) => perGame(r.errUf, r), pct: false },
  { key: 'net', label: 'Net/g', value: (r) => perGame(r.errNet, r), pct: false },
  { key: 'out', label: 'Out/g', value: (r) => perGame(r.errOut, r), pct: false },
];

export const ATTACK_DINK_METRICS: MetricDef<NightTrendRow>[] = [
  { key: 'attacks', label: 'Attacks/g', value: (r) => perGame(r.attacks, r), pct: false },
  { key: 'attackwin', label: 'Attack win %', value: (r) => rt(r.attackWins, r.attacks), pct: true },
  { key: 'dinks', label: 'Dinks/g', value: (r) => perGame(r.dinkN, r), pct: false },
  { key: 'dinkq', label: 'Dink quality %', value: (r) => rt(r.dinkEx, r.dinkN), pct: true },
];

export const SHOT_QUALITY_METRICS: MetricDef<NightTrendRow>[] = [
  { key: 'excellent', label: 'Excellent %', value: (r) => rt(r.sqEx, r.sqW), pct: true },
  { key: 'poor', label: 'Poor %', value: (r) => rt(r.sqPoor, r.sqW), pct: true },
];
