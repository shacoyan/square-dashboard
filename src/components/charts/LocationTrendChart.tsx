'use client';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LabelList,
} from 'recharts';
import type { DailySegmentPoint } from '../../types';

const LOCATION_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#14b8a6', '#8b5cf6'];

function getTotalCount(point: DailySegmentPoint): number {
  return (point.new ?? 0) + (point.repeat ?? 0) + (point.regular ?? 0) + (point.staff ?? 0);
}

interface Props {
  locationSeries: { locationId: string; locationName: string; points: DailySegmentPoint[] }[];
  totalsSeries: DailySegmentPoint[];
  allDates: string[];
}

export default function LocationTrendChart({ locationSeries, totalsSeries, allDates }: Props) {
  const totalsByDate = new Map<string, number>();
  for (const point of totalsSeries) {
    totalsByDate.set(point.date, getTotalCount(point));
  }

  const locationPointsByDate = new Map<string, Map<string, number>>();
  for (const loc of locationSeries) {
    for (const point of loc.points) {
      if (!locationPointsByDate.has(point.date)) {
        locationPointsByDate.set(point.date, new Map());
      }
      locationPointsByDate.get(point.date)!.set(loc.locationId, getTotalCount(point));
    }
  }

  const chartData = allDates.map((date) => {
    const row: Record<string, string | number> = { date };
    for (const loc of locationSeries) {
      row[loc.locationId] = locationPointsByDate.get(date)?.get(loc.locationId) ?? 0;
    }
    row['__total__'] = totalsByDate.get(date) ?? 0;
    return row;
  });

  const allZero = chartData.every((row) => {
    for (const loc of locationSeries) {
      if ((row[loc.locationId] as number) > 0) return false;
    }
    if ((row['__total__'] as number) > 0) return false;
    return true;
  });

  const isEmpty = allDates.length === 0 || allZero;

  if (isEmpty) {
    return (
      <div className="w-full h-[320px] flex items-center justify-center">
        <p className="text-gray-500 text-sm">推移データなし</p>
      </div>
    );
  }

  return (
    <div className="w-full h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#d1d5db" />
          <XAxis
            dataKey="date"
            tickFormatter={(value) => {
              if (!value) return '--';
              const parts = String(value).split('-');
              if (parts.length >= 3) return `${parts[1]}/${parts[2]}`;
              return String(value);
            }}
            tick={{ fontSize: 11, fill: '#6b7280' }}
            axisLine={{ stroke: '#d1d5db' }}
            tickLine={{ stroke: '#d1d5db' }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#6b7280' }}
            axisLine={{ stroke: '#d1d5db' }}
            tickLine={{ stroke: '#d1d5db' }}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              color: '#111827',
              fontSize: '13px',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
            }}
            itemStyle={{ color: '#111827' }}
            labelStyle={{ color: '#111827' }}
            labelFormatter={(label) => {
              if (!label) return '';
              const parts = String(label).split('-');
              if (parts.length >= 3) return `${parts[1]}/${parts[2]}`;
              return String(label);
            }}
          />
          <Legend
            formatter={(value: string) => (
              <span className="text-gray-600 text-xs">{value}</span>
            )}
          />
          {locationSeries.map((loc, i) => (
            <Line
              key={loc.locationId}
              type="monotone"
              dataKey={loc.locationId}
              name={loc.locationName}
              stroke={LOCATION_COLORS[i % 6]}
              strokeWidth={2}
              dot={{ r: 3, fill: LOCATION_COLORS[i % 6] }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          ))}
          <Line
            type="monotone"
            dataKey="__total__"
            name="合計"
            stroke="#111827"
            strokeWidth={4}
            dot={{ r: 4, fill: '#111827' }}
            activeDot={{ r: 6 }}
            connectNulls
          >
            <LabelList
              dataKey="__total__"
              position="top"
              fontSize={10}
              fill="#111827"
              formatter={(v: number) => (typeof v === 'number' && v > 0 ? String(v) : '')}
            />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
