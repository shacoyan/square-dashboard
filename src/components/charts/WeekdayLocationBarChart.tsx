'use client';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { TooltipProps } from 'recharts';
import { formatYen } from '../../utils';
import type { WeekdayLocationAggregate } from '../../lib/weekdayLocationAggregation';

interface LocationMeta {
  locationId: string;
  locationName: string;
}

interface Props {
  data: WeekdayLocationAggregate[];
  locationSeries: LocationMeta[];
  colorMap: Record<string, string>;
  metric: 'customers' | 'sales';
}

const WEEKDAY_FULL_NAMES: Record<string, string> = {
  月: '月曜日',
  火: '火曜日',
  水: '水曜日',
  木: '木曜日',
  金: '金曜日',
  土: '土曜日',
  日: '日曜日',
};

function formatValue(v: number, metric: 'customers' | 'sales'): string {
  if (metric === 'customers') {
    return (Math.round(v * 10) / 10).toFixed(1);
  }
  return formatYen(Math.round(v));
}

function CustomTooltip({
  active,
  payload,
  label,
  metric,
  locationSeries,
}: TooltipProps<number, string> & {
  metric: 'customers' | 'sales';
  locationSeries: LocationMeta[];
}) {
  if (!active || !payload || payload.length === 0) return null;

  const raw = payload[0]?.payload as Record<string, number | string> | undefined;
  if (!raw) return null;

  const sampleCount = (raw.sampleCount as number) ?? 0;
  const dayLabel = WEEKDAY_FULL_NAMES[String(label ?? '')] ?? String(label ?? '');

  let total = 0;
  const items: { name: string; value: number; color: string }[] = [];
  for (const loc of locationSeries) {
    const v = (raw[loc.locationId] as number) ?? 0;
    total += v;
    if (v > 0) {
      items.push({
        name: loc.locationName,
        value: v,
        color: payload.find((p) => p.dataKey === loc.locationId)?.color ?? '#6b7280',
      });
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg text-sm">
      <p className="font-bold text-gray-800 mb-1">{dayLabel}</p>
      {items.length === 0 ? (
        <div className="text-gray-500 text-xs">データなし</div>
      ) : (
        items.map((it) => (
          <div key={it.name} className="flex justify-between gap-4">
            <span className="flex items-center gap-1">
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: it.color }}
              />
              <span className="text-gray-600">{it.name}</span>
            </span>
            <span className="font-medium">{formatValue(it.value, metric)}</span>
          </div>
        ))
      )}
      <hr className="my-1 border-gray-200" />
      <div className="flex justify-between gap-4 font-bold">
        <span>合計</span>
        <span>{formatValue(total, metric)}</span>
      </div>
      <div className="text-xs text-gray-400 mt-1">日数: {sampleCount}日</div>
    </div>
  );
}

function CustomLegend({
  locationSeries,
  colorMap,
}: {
  locationSeries: LocationMeta[];
  colorMap: Record<string, string>;
}) {
  return (
    <div className="flex justify-center gap-4 text-gray-600 text-xs mt-2 flex-wrap">
      {locationSeries.map((loc) => (
        <div key={loc.locationId} className="flex items-center gap-1">
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{ backgroundColor: colorMap[loc.locationId] ?? '#6b7280' }}
          />
          <span>{loc.locationName}</span>
        </div>
      ))}
    </div>
  );
}

export default function WeekdayLocationBarChart({
  data,
  locationSeries,
  colorMap,
  metric,
}: Props) {
  const hasData = data.some((d) => d.sampleCount > 0);

  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-[240px] text-gray-400">
        曜日データなし
      </div>
    );
  }

  const chartData = data.map((d) => {
    const row: Record<string, string | number> = {
      label: d.label,
      sampleCount: d.sampleCount,
    };
    for (const loc of locationSeries) {
      const cell = d.perLocation.find((c) => c.locationId === loc.locationId);
      const v = cell ? (metric === 'customers' ? cell.customers : cell.sales) : 0;
      row[loc.locationId] = v;
    }
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="label"
          tick={{ fill: '#6b7280', fontSize: 12 }}
          axisLine={{ stroke: '#d1d5db' }}
        />
        <YAxis
          tick={{ fill: '#6b7280', fontSize: 12 }}
          axisLine={{ stroke: '#d1d5db' }}
          allowDecimals={metric === 'customers' ? false : true}
          tickFormatter={metric === 'sales' ? (v: number) => formatYen(v) : undefined}
        />
        <Tooltip
          content={(props: TooltipProps<number, string>) => (
            <CustomTooltip
              {...props}
              metric={metric}
              locationSeries={locationSeries}
            />
          )}
        />
        <Legend
          content={() => (
            <CustomLegend locationSeries={locationSeries} colorMap={colorMap} />
          )}
        />
        {locationSeries.map((loc) => (
          <Bar
            key={loc.locationId}
            dataKey={loc.locationId}
            name={loc.locationName}
            stackId="a"
            fill={colorMap[loc.locationId] ?? '#6b7280'}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
