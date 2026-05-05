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
  LabelList,
} from 'recharts';
import type { DailySegmentPoint } from '../../types';
import { formatYen } from '../../utils';
import { TOTAL_LINE_COLOR } from '../../lib/locationColors';
import { chartTheme } from '../../lib/chartTheme';
import { ChartTooltip, type ChartTooltipPayloadItem } from '../ui';
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
  colorMap: Record<string, string>;
}

export default function LocationTrendChart({
  locationSeries,
  totalsSeries,
  allDates,
  metric = 'customers',
  colorMap,
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
    ...locationSeries.map((loc) => ({
      key: loc.locationId,
      label: loc.locationName,
      color: colorMap[loc.locationId] ?? '#6b7280',
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

  // dataKey 別フォーマッタ。metric=sales なら円表示、それ以外は素の数値。
  const tooltipFormatters = useMemo(() => {
    const map: Record<
      string,
      (value: number | string | Array<number | string>) => string
    > = {};
    const fmt = (v: number | string | Array<number | string>): string => {
      if (Array.isArray(v)) return v.join(', ');
      const num = typeof v === 'number' ? v : Number(v) || 0;
      return metric === 'sales' ? formatYen(num) : `${num}`;
    };
    for (const loc of locationSeries) {
      map[loc.locationId] = fmt;
    }
    map[TOTAL_KEY] = fmt;
    return map;
  }, [locationSeries, metric]);

  // hide=true の系列が Recharts のバージョンによっては payload に残るため、
  // visibility で絞り込んだ payload を ChartTooltip に渡す（R2 対策）。
  const filterPayload = (
    payload: ChartTooltipPayloadItem[] | undefined
  ): ChartTooltipPayloadItem[] | undefined => {
    if (!payload) return payload;
    return payload.filter((p) => {
      const key = p.dataKey != null ? String(p.dataKey) : '';
      return visibility[key] !== false;
    });
  };

  if (isEmpty) {
    return (
      <div className="w-full min-w-0">
        <SeriesCheckboxGroup
          items={checkboxItems}
          visible={visibility}
          onChange={handleVisibleChange}
          onAllOn={handleAllOn}
          onAllOff={handleAllOff}
          className="mb-2"
        />
        <div
          className="w-full min-w-0 flex items-center justify-center"
          style={{ height: `${chartTheme.heightPreset.detail}px` }}
        >
          <p className="text-gray-500 text-sm">推移データなし</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0">
      <SeriesCheckboxGroup
        items={checkboxItems}
        visible={visibility}
        onChange={handleVisibleChange}
        onAllOn={handleAllOn}
        onAllOff={handleAllOff}
        className="mb-2"
      />
      <div className="w-full min-w-0" style={{ height: `${chartTheme.heightPreset.detail}px` }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={chartTheme.defaultMargin}>
            <CartesianGrid {...chartTheme.grid} />
            <XAxis
              dataKey="date"
              tickFormatter={(value) => {
                if (!value) return '--';
                const parts = String(value).split('-');
                if (parts.length >= 3) return `${parts[1]}/${parts[2]}`;
                return String(value);
              }}
              tick={chartTheme.axis.tickStyle}
              tickLine={chartTheme.axis.tickLine}
              axisLine={chartTheme.axis.axisLine}
              stroke={chartTheme.axis.stroke}
            />
            <YAxis
              tick={chartTheme.axis.tickStyle}
              tickLine={chartTheme.axis.tickLine}
              axisLine={chartTheme.axis.axisLine}
              stroke={chartTheme.axis.stroke}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ stroke: 'rgba(15,23,42,0.2)', strokeWidth: 1 }}
              content={(p) => (
                <ChartTooltip
                  active={p.active}
                  payload={filterPayload(p.payload as never) as never}
                  label={p.label as string | number | undefined}
                  formatters={tooltipFormatters}
                  labelFormatter={(label) => {
                    if (!label) return '';
                    const parts = String(label).split('-');
                    if (parts.length >= 3) return `${parts[1]}/${parts[2]}`;
                    return String(label);
                  }}
                />
              )}
            />
            {locationSeries.map((loc) => {
              const color = colorMap[loc.locationId] ?? '#6b7280';
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
