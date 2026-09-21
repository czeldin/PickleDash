'use client';

import { DashboardData, KitchenArrivalRow, NightTrendRow } from '@/types/dashboard';
import { SortableTable, ColumnDef } from '@/components/SortableTable';
import { SectionCard } from '@/components/SectionCard';
import { TrendButton, MetricDef } from '@/components/TrendChart';

const rt = (n: number, d: number) => (d > 0 ? (100 * n) / d : null);
const KA_METRICS: MetricDef<NightTrendRow>[] = [
  { key: 'drop', label: '3rd drop → kitchen %', value: (r) => rt(r.dropKitchen, r.dropN), pct: true },
  { key: 'drive', label: '3rd drive → kitchen %', value: (r) => rt(r.driveKitchen, r.driveN), pct: true },
  { key: 'either', label: '3rd either → kitchen %', value: (r) => rt(r.dropKitchen + r.driveKitchen, r.dropN + r.driveN), pct: true },
];

interface Props {
  data: DashboardData;
}

type ColKey = 'third_drop_kitchen_pct' | 'third_drive_kitchen_pct' | 'third_kitchen_pct' | 'fifth_drop_kitchen_pct' | 'fifth_drive_kitchen_pct' | 'fifth_kitchen_pct';
const totalKeys: Record<ColKey, keyof KitchenArrivalRow> = {
  third_drop_kitchen_pct: 'third_drop_total',
  third_drive_kitchen_pct: 'third_drive_total',
  third_kitchen_pct: 'third_total',
  fifth_drop_kitchen_pct: 'fifth_drop_total',
  fifth_drive_kitchen_pct: 'fifth_drive_total',
  fifth_kitchen_pct: 'fifth_total',
};

function buildHighlights(kitchenArrival: KitchenArrivalRow[], keys: ColKey[]) {
  const result: Record<ColKey, { max: number; min: number }> = {} as never;
  for (const key of keys) {
    const vals = kitchenArrival.filter((r) => (r[totalKeys[key]] as number) > 0).map((r) => r[key]);
    result[key] = {
      max: vals.length ? Math.max(...vals) : -1,
      min: vals.length > 1 ? Math.min(...vals) : -1,
    };
  }
  return result;
}

function pctCell(pct: number, total: number, key: ColKey, highlights: Record<ColKey, { max: number; min: number }>) {
  if (total === 0) return <span className="text-gray-400 text-sm">—</span>;
  const { max, min } = highlights[key];
  const isMax = pct === max && max > 0;
  const isMin = pct === min && min >= 0 && min !== max;
  return (
    <div className="inline-flex items-center gap-1">
      <span className={`text-sm font-semibold px-2 py-0.5 rounded-full ${
        isMax ? 'bg-blue-100 text-blue-800' : isMin ? 'bg-orange-100 text-orange-800' : 'text-gray-800'
      }`}>
        {pct.toFixed(0)}%
      </span>
      <span className="text-gray-400 text-xs">({total})</span>
    </div>
  );
}

export function KitchenArrivalSection({ data }: Props) {
  const { kitchenArrival, players } = data;

  const thirdKeys: ColKey[] = ['third_drop_kitchen_pct', 'third_drive_kitchen_pct', 'third_kitchen_pct'];
  const fifthKeys: ColKey[] = ['fifth_drop_kitchen_pct', 'fifth_drive_kitchen_pct', 'fifth_kitchen_pct'];
  const thirdHL = buildHighlights(kitchenArrival, thirdKeys);
  const fifthHL = buildHighlights(kitchenArrival, fifthKeys);

  const thirdColumns: ColumnDef<KitchenArrivalRow>[] = [
    {
      key: 'third_drop_kitchen_pct',
      header: 'Drop → Kitchen',
      getValue: (r) => r.third_drop_kitchen_pct,
      render: (r) => pctCell(r.third_drop_kitchen_pct, r.third_drop_total, 'third_drop_kitchen_pct', thirdHL),
    },
    {
      key: 'third_drive_kitchen_pct',
      header: 'Drive → Kitchen',
      getValue: (r) => r.third_drive_kitchen_pct,
      render: (r) => pctCell(r.third_drive_kitchen_pct, r.third_drive_total, 'third_drive_kitchen_pct', thirdHL),
    },
    {
      key: 'third_kitchen_pct',
      header: 'Either → Kitchen',
      getValue: (r) => r.third_kitchen_pct,
      render: (r) => pctCell(r.third_kitchen_pct, r.third_total, 'third_kitchen_pct', thirdHL),
    },
  ];

  const fifthColumns: ColumnDef<KitchenArrivalRow>[] = [
    {
      key: 'fifth_drop_kitchen_pct',
      header: 'Drop → Kitchen',
      getValue: (r) => r.fifth_drop_kitchen_pct,
      render: (r) => pctCell(r.fifth_drop_kitchen_pct, r.fifth_drop_total, 'fifth_drop_kitchen_pct', fifthHL),
    },
    {
      key: 'fifth_drive_kitchen_pct',
      header: 'Drive → Kitchen',
      getValue: (r) => r.fifth_drive_kitchen_pct,
      render: (r) => pctCell(r.fifth_drive_kitchen_pct, r.fifth_drive_total, 'fifth_drive_kitchen_pct', fifthHL),
    },
    {
      key: 'fifth_kitchen_pct',
      header: 'Either → Kitchen',
      getValue: (r) => r.fifth_kitchen_pct,
      render: (r) => pctCell(r.fifth_kitchen_pct, r.fifth_total, 'fifth_kitchen_pct', fifthHL),
    },
  ];

  return (
    <SectionCard title="Kitchen Arrival by Shot Type" action={<TrendButton title="Kitchen arrival by shot" metrics={KA_METRICS} rows={data.nightTrends} players={data.players} />}>
      <p className="text-xs text-gray-400 -mt-1.5 mb-3">
        % of rallies where the serving team reached the kitchen after hitting that shot type. Green = best · Red = lowest.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">3rd Shot</h3>
          <SortableTable
            rows={kitchenArrival}
            columns={thirdColumns}
            players={players}
            defaultSortKey="third_kitchen_pct"
          />
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">5th Shot</h3>
          <SortableTable
            rows={kitchenArrival}
            columns={fifthColumns}
            players={players}
            defaultSortKey="fifth_kitchen_pct"
          />
        </div>
      </div>
    </SectionCard>
  );
}
