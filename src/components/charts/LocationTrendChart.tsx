'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { formatYen } from '../../utils';

const LOCATION_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#14b8a6', '#8b5cf6'];

function getTotalCount(point: DailySegmentPoint): number {
  return (point.new ?? 0) + (point.repeat ?? 0) + (point.regular ?? 0) + (point.staff ?? 0);
}

function getTotalSales(point: DailySegmentPoint): number {
  return (
    (point.newSales ?? 0) +
    (point.repeatSales ?? 0) +
    (point.regularSales ?? 0) +
    (point.staffSales ?? 0) +
    (point.unlistedSales ?? 0)
  );
}

interface Props {
  locationSeries: { locationId: string; locationName: string; points: DailySegmentPoint[] }[];
  totalsSeries: DailySegmentPoint[];
  allDates: string[];
  metric?: 'customers' | 'sales';
}

interface LegendClickPayload {
  dataKey?: string | number;
  [k: string]: unknown;
}

export default function LocationTrendChart({
  locationSeries,
  totalsSeries,
  allDates,
  metric = 'customers',
}: Props) {
  const getValue = metric === 'sales' ? getTotalSales : getTotalCount;

  const [visibleLocations, setVisibleLocations] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const loc of locationSeries) {
      initial[loc.locationId] = true;
    }
    return initial;
  });
  const [totalVisible, setTotalVisible] = useState(true);

  const locationIdsKey = locationSeries.map((l) => l.locationId).join(',');
  useEffect(() => {
    setVisibleLocations((prev) => {
      const next: Record<string, boolean> = {};
      for (const loc of locationSeries) {
        next[loc.locationId] = prev[loc.locationId] ?? true;
      }
      return next;
    });
    // locationSeries の id 群が変わった時だけ再初期化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationIdsKey]);

  const locationPointsByDate = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const loc of locationSeries) {
      for (const point of loc.points) {
        if (!map.has(point.date)) {
          map.set(point.date, new Map());
        }
        map.get(point.date)!.set(loc.locationId, getValue(point));
      }
    }
    return map;
  }, [locationSeries, getValue]);

  // totalsSeries は参照のみ（将来の拡張用）。現状の合計は visible 店舗から再計算している。
  void totalsSeries;

  const chartData = useMemo(() => {
    return allDates.map((date) => {
      const row: Record<string, string | number> = { date };
      let visibleTotal = 0;
      for (const loc of locationSeries) {
        const val = locationPointsByDate.get(date)?.get(loc.locationId) ?? 0;
        row[loc.locationId] = val;
        if (visibleLocations[loc.locationId]) {
          visibleTotal += val;
        }
      }
      row['__total__'] = visibleTotal;
      return row;
    });
  }, [allDates, locationSeries, locationPointsByDate, visibleLocations]);

  const allZero = chartData.every((row) => {
    for (const loc of locationSeries) {
      if ((row[loc.locationId] as number) > 0) return false;
    }
    if ((row['__total__'] as number) > 0) return false;
    return true;
  });

  const isEmpty = allDates.length === 0 || allZero;

  const isAllVisible =
    locationSeries.length > 0 &&
    locationSeries.every((loc) => visibleLocations[loc.locationId] !== false);
  const totalLineName = isAllVisible ? '合計' : '合計（選択中）';

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
            formatter={(value: number, name: string) =>
              metric === 'sales' ? [formatYen(value), name] : [value, name]
            }
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
            onClick={(payload) => {
              const p = payload as unknown as LegendClickPayload;
              const key = p.dataKey;
              if (key === '__total__') {
                setTotalVisible((prev) => !prev);
              } else if (typeof key === 'string') {
                setVisibleLocations((prev) => ({
                  ...prev,
                  [key]: !prev[key],
                }));
              }
            }}
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
              hide={!visibleLocations[loc.locationId]}
            />
          ))}
          <Line
            type="monotone"
            dataKey="__total__"
            name={totalLineName}
            stroke="#111827"
            strokeWidth={4}
            dot={{ r: 4, fill: '#111827' }}
            activeDot={{ r: 6 }}
            connectNulls
            hide={!totalVisible}
          >
            {metric !== 'sales' && (
              <LabelList
                dataKey="__total__"
                position="top"
                fontSize={10}
                fill="#111827"
                formatter={(v: number) => (typeof v === 'number' && v > 0 ? String(v) : '')}
              />
            )}
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
