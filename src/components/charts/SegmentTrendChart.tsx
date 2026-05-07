'use client';

import { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import type { DailySegmentPoint, PeriodPreset } from '../../types';
import { ChartTooltip, ChartFigure, type ChartTooltipPayloadItem } from '../ui';
import { chartTheme } from '../../lib/chartTheme';
import SeriesCheckboxGroup, { type SeriesCheckboxItem } from './SeriesCheckboxGroup';
import { granularityFor, type Granularity } from '../../lib/trendAggregation';
import { MSG } from '../../lib/messages';

interface Props {
  data: DailySegmentPoint[];
  /**
   * 期間プリセット。X 軸ラベルの粒度切替に使用。
   * 集約自体は hook 側で実施済み（このコンポーネントでは再集約しない）。
   * 省略時は 'month'（既存挙動 = daily ラベル）。
   */
  period?: PeriodPreset;
}

type CountKey = 'new' | 'repeat' | 'regular' | 'staff' | 'unlisted';
type SalesKey = 'newSales' | 'repeatSales' | 'regularSales' | 'staffSales' | 'unlistedSales';

interface SeriesDef {
  key: CountKey;
  salesKey: SalesKey;
  color: string;
  label: string;
}

const SERIES: SeriesDef[] = [
  { key: 'new', salesKey: 'newSales', color: '#3b82f6', label: '新規' },
  { key: 'repeat', salesKey: 'repeatSales', color: '#eab308', label: 'リピート' },
  { key: 'regular', salesKey: 'regularSales', color: '#ef4444', label: '常連' },
  { key: 'staff', salesKey: 'staffSales', color: '#a855f7', label: 'スタッフ' },
  { key: 'unlisted', salesKey: 'unlistedSales', color: '#6b7280', label: '記載なし' },
];

const COUNT_KEYS: ReadonlySet<string> = new Set<string>(SERIES.map(s => s.key));

function formatDateLabel(label: string | number | undefined, granularity: Granularity): string {
  if (label === undefined || label === null || label === '') return '';
  const parts = String(label).split('-');
  if (parts.length < 3) return String(label);
  const [y, m, d] = parts;
  switch (granularity) {
    case 'monthly':
      return `${y}/${m}`;
    case 'weekly':
      return `${m}/${d}週`;
    case 'daily':
    case 'hourly':
    default:
      return `${m}/${d}`;
  }
}

const INITIAL_VISIBLE_KEYS: Record<CountKey, boolean> = {
  new: true,
  repeat: true,
  regular: true,
  staff: true,
  unlisted: true,
};

const ALL_ON_VISIBLE_KEYS: Record<CountKey, boolean> = {
  new: true,
  repeat: true,
  regular: true,
  staff: true,
  unlisted: true,
};

const ALL_OFF_VISIBLE_KEYS: Record<CountKey, boolean> = {
  new: false,
  repeat: false,
  regular: false,
  staff: false,
  unlisted: false,
};

export default function SegmentTrendChart({ data, period = 'month' }: Props) {
  const [visibleKeys, setVisibleKeys] = useState<Record<CountKey, boolean>>(INITIAL_VISIBLE_KEYS);

  const granularity = granularityFor(period);

  const isEmpty = !data || data.length === 0;

  const chartData: DailySegmentPoint[] = isEmpty
    ? [{
        date: '',
        new: 0, repeat: 0, regular: 0, staff: 0, unlisted: 0,
        newSales: 0, repeatSales: 0, regularSales: 0, staffSales: 0, unlistedSales: 0,
      }]
    : data;

  const checkboxItems: SeriesCheckboxItem[] = SERIES.map(s => ({
    key: s.key,
    label: s.label,
    color: s.color,
  }));

  const handleVisibleChange = (key: string, next: boolean) => {
    if (COUNT_KEYS.has(key)) {
      const k = key as CountKey;
      setVisibleKeys(prev => ({ ...prev, [k]: next }));
    }
  };

  const handleAllOn = () => setVisibleKeys(ALL_ON_VISIBLE_KEYS);
  const handleAllOff = () => setVisibleKeys(ALL_OFF_VISIBLE_KEYS);

  // dataKey 別 formatter（人数表示）。設計書 §97 により合計表示は L14 以降へ送り、L13 では個別系列のみ。
  const formatters: Record<string, (v: number | string | Array<number | string>) => string> = {};
  for (const s of SERIES) {
    formatters[s.key] = (v) => {
      const n = typeof v === 'number' ? v : Number(v) || 0;
      return `${n.toLocaleString()}人`;
    };
  }

  return (
    <div className="w-full min-w-0">
      <SeriesCheckboxGroup
        items={checkboxItems}
        visible={visibleKeys as Record<string, boolean>}
        onChange={handleVisibleChange}
        onAllOn={handleAllOn}
        onAllOff={handleAllOff}
        className="mb-2"
      />
      <div className="w-full min-w-0" style={{ height: chartTheme.heightPreset.detail }}>
        <ChartFigure label="折れ線グラフ：日次の客数または売上をセグメント別（新規・リピート・常連・スタッフ・記載なし）に表示">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={chartTheme.defaultMargin}>
              <CartesianGrid {...chartTheme.grid} />
              <XAxis
                dataKey="date"
                tickFormatter={(value) => {
                  if (!value) return '--';
                  return formatDateLabel(String(value), granularity);
                }}
                tick={chartTheme.axis.tickStyle}
                axisLine={chartTheme.axis.axisLine}
                tickLine={chartTheme.axis.tickLine}
              />
              <YAxis
                tick={chartTheme.axis.tickStyle}
                axisLine={chartTheme.axis.axisLine}
                tickLine={chartTheme.axis.tickLine}
                allowDecimals={false}
              />
              <Tooltip
                content={(p) => {
                  // hide 系列が Recharts の payload に残るバージョン互換のため visibleKeys でフィルタ
                  const filtered = (p.payload as ChartTooltipPayloadItem[] | undefined)?.filter(
                    (it) => {
                      const k = it.dataKey != null ? String(it.dataKey) : '';
                      if (!COUNT_KEYS.has(k)) return false;
                      return visibleKeys[k as CountKey];
                    },
                  );
                  return (
                    <ChartTooltip
                      active={p.active}
                      payload={filtered as never}
                      label={p.label as string | number | undefined}
                      formatters={formatters}
                      labelFormatter={(l) => formatDateLabel(l, granularity)}
                    />
                  );
                }}
              />
              {SERIES.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={{ r: 3, fill: s.color }}
                  activeDot={{ r: 5 }}
                  connectNulls
                  hide={!visibleKeys[s.key]}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartFigure>
        {isEmpty && (
          <p className="text-center text-text-muted text-sm -mt-4">{MSG.empty.trend}</p>
        )}
      </div>
    </div>
  );
}
