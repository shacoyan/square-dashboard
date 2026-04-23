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
import { getLocationColor, TOTAL_LINE_COLOR } from '../../lib/locationColors';
import SeriesCheckboxGroup, { type SeriesCheckboxItem } from './SeriesCheckboxGroup';

const TOTAL_KEY = '__total__';

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

export default function LocationTrendChart({
  locationSeries,
  totalsSeries,
  allDates,
  metric = 'customers',
}: Props) {
  const getValue = metric === 'sales' ? getTotalSales : getTotalCount;

  const [visibility, setVisibility] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = { [TOTAL_KEY]: true };
    for (const loc of locationSeries) {
      initial[loc.locationId] = true;
    }
    return initial;
  });

  const locationIdsKey = locationSeries.map((l) => l.locationId).join(',');
  useEffect(() => {
    setVisibility((prev) => {
      const next: Record<string, boolean> = {
        [TOTAL_KEY]: prev[TOTAL_KEY] ?? true,
      };
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

  const totalsByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of totalsSeries) m.set(p.date, getValue(p));
    return m;
  }, [totalsSeries, getValue]);

  const chartData = useMemo(() => {
    return allDates.map((date) => {
      const row: Record<string, string | number> = { date };
      for (const loc of locationSeries) {
        const val = locationPointsByDate.get(date)?.get(loc.locationId) ?? 0;
        row[loc.locationId] = val;
      }
      row[TOTAL_KEY] = totalsByDate.get(date) ?? 0;
      return row;
    });
  }, [allDates, locationSeries, locationPointsByDate, totalsByDate]);

  const allZero = chartData.every((row) => {
    for (const loc of locationSeries) {
      if ((row[loc.locationId] as number) > 0) return false;
    }
    if ((row[TOTAL_KEY] as number) > 0) return false;
    return true;
  });

  const isEmpty = allDates.length === 0 || allZero;

  const checkboxItems: SeriesCheckboxItem[] = [
    ...locationSeries.map((loc, i) => ({
      key: loc.locationId,
      label: loc.locationName,
      color: getLocationColor(loc.locationId, i),
    })),
    { key: TOTAL_KEY, label: '合計', color: TOTAL_LINE_COLOR },
  ];

  const handleVisibleChange = (key: string, next: boolean) => {
    setVisibility((prev) => ({ ...prev, [key]: next }));
  };

  const handleAllOn = () => {
    const next: Record<string, boolean> = { [TOTAL_KEY]: true };
    for (const loc of locationSeries) next[loc.locationId] = true;
    setVisibility(next);
  };

  const handleAllOff = () => {
    const next: Record<string, boolean> = { [TOTAL_KEY]: false };
    for (const loc of locationSeries) next[loc.locationId] = false;
    setVisibility(next);
  };

  if (isEmpty) {
    return (
      <div className="w-full">
        <SeriesCheckboxGroup
          items={checkboxItems}
          visible={visibility}
          onChange={handleVisibleChange}
          onAllOn={handleAllOn}
          onAllOff={handleAllOff}
          className="mb-2"
        />
        <div className="w-full h-[320px] flex items-center justify-center">
          <p className="text-gray-500 text-sm">推移データなし</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <SeriesCheckboxGroup
        items={checkboxItems}
        visible={visibility}
        onChange={handleVisibleChange}
        onAllOn={handleAllOn}
        onAllOff={handleAllOff}
        className="mb-2"
      />
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
            />
            {locationSeries.map((loc, i) => {
              const color = getLocationColor(loc.locationId, i);
              return (
                <Line
                  key={loc.locationId}
                  type="monotone"
                  dataKey={loc.locationId}
                  name={loc.locationName}
                  stroke={color}
                  strokeWidth={2}
                  dot={{ r: 3, fill: color }}
                  activeDot={{ r: 5 }}
                  connectNulls
                  hide={!visibility[loc.locationId]}
                />
              );
            })}
            <Line
              type="monotone"
              dataKey={TOTAL_KEY}
              name="合計"
              stroke={TOTAL_LINE_COLOR}
              strokeWidth={4}
              dot={{ r: 4, fill: TOTAL_LINE_COLOR }}
              activeDot={{ r: 6 }}
              connectNulls
              hide={!visibility[TOTAL_KEY]}
            >
              {metric !== 'sales' && (
                <LabelList
                  dataKey={TOTAL_KEY}
                  position="top"
                  fontSize={10}
                  fill={TOTAL_LINE_COLOR}
                  formatter={(v: number) => (typeof v === 'number' && v > 0 ? String(v) : '')}
                />
              )}
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
