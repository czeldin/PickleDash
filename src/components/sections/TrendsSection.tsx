'use client';

import { DashboardData, NightTrendRow } from '@/types/dashboard';
import { SectionCard } from '@/components/SectionCard';
import { TrendChartInline, MetricDef } from '@/components/TrendChart';

interface Props { data: DashboardData }

const rt = (n: number, d: number) => (d > 0 ? (100 * n) / d : null);
const perGame = (n: number, r: NightTrendRow) => (r.gamesPlayed > 0 ? n / r.gamesPlayed : null);

// The handful of trends that matter most, curated for the Trends tab. Each uses
// null for nights with no data so lines start where the metric begins.
const WIN_METRICS: MetricDef<NightTrendRow>[] = [
  { key: 'winrate', label: 'Game win %', value: (r) => rt(r.gamesWon, r.gamesPlayed), pct: true },
  { key: 'rating', label: 'Overall rating', value: (r) => (r.ratingW > 0 ? r.ratingSum / r.ratingW : null), pct: false },
];
const FINISH_METRICS: MetricDef<NightTrendRow>[] = [
  { key: 'attackwin', label: 'Attack win %', value: (r) => rt(r.attackWins, r.attacks), pct: true },
  { key: 'finclean', label: 'Finish clean %', value: (r) => rt(r.finClean, r.finAtt), pct: true },
  { key: 'attacks', label: 'Attacks / game', value: (r) => perGame(r.attacks, r), pct: false },
];
const KITCHEN_METRICS: MetricDef<NightTrendRow>[] = [
  { key: 'drop', label: '3rd drop → kitchen %', value: (r) => rt(r.dropKitchen, r.dropN), pct: true },
  { key: 'either', label: '3rd shot → kitchen %', value: (r) => rt(r.dropKitchen + r.driveKitchen, r.dropN + r.driveN), pct: true },
];
const ERROR_TREND_METRICS: MetricDef<NightTrendRow>[] = [
  { key: 'errg', label: 'Errors / game', value: (r) => perGame(r.errTot, r), pct: false },
  { key: 'netg', label: 'Net errors / game', value: (r) => perGame(r.errNet, r), pct: false },
  { key: 'popg', label: 'Pop-ups given / game', value: (r) => perGame(r.pop, r), pct: false },
];

export function TrendsSection({ data }: Props) {
  const rows = data.nightTrends;
  const nightCount = new Set(rows.map((r) => r.night)).size;

  if (nightCount <= 1) {
    return (
      <SectionCard title="Trends Over Time">
        <p className="text-sm text-gray-400 py-6 text-center">
          Trends need more than one night. View <strong>All Nights</strong> to see how each metric moves over time.
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Trends Over Time">
      <p className="text-xs text-gray-400 -mt-1.5 mb-3">
        Each point is one night. A line starts at the first night its metric has data, so newer stats simply begin later
        rather than showing a misleading zero. Toggle players below each chart.
      </p>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <TrendChartInline title="Winning & rating" metrics={WIN_METRICS} rows={rows} players={data.players} />
        <TrendChartInline title="Attacking & finishing" metrics={FINISH_METRICS} rows={rows} players={data.players} />
        <TrendChartInline title="Kitchen arrival" metrics={KITCHEN_METRICS} rows={rows} players={data.players} />
        <TrendChartInline title="Errors" metrics={ERROR_TREND_METRICS} rows={rows} players={data.players} />
      </div>
    </SectionCard>
  );
}
