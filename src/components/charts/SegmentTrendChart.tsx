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
  Legend,
} from 'recharts';
import type { TooltipProps } from 'recharts';
import type { DailySegmentPoint } from '../../types';
import { formatYen } from '../../utils';
import SeriesCheckboxGroup, { type SeriesCheckboxItem } from './SeriesCheckboxGroup';

interface Props {
  data: DailySegmentPoint[];
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

function formatDateLabel(label: string | number | undefined): string {
  if (label === undefined || label === null || label === '') return '';
  const parts = String(label).split('-');
  if (parts.length >= 3) return `${parts[1]}/${parts[2]}`;
  return String(label);
}

interface CustomTooltipProps extends TooltipProps<number, string> {
  visibleKeys: Record<CountKey, boolean>;
}

function CustomTooltip(props: CustomTooltipProps) {
  const { active, payload, label, visibleKeys } = props;
  if (!active || !payload || payload.length === 0) return null;

  const point = payload[0]?.payload as DailySegmentPoint | undefined;
  if (!point) return null;

  const totalCustomers = SERIES.reduce((sum, s) => {
    if (!visibleKeys[s.key]) return sum;
    return sum + ((point[s.key] as number) ?? 0);
  }, 0);

  const totalSalesExcludingUnlisted = SERIES.reduce((sum, s) => {
    if (!visibleKeys[s.key] || s.key === 'unlisted') return sum;
    return sum + ((point[s.salesKey] as number) ?? 0);
  }, 0);

  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        color: '#111827',
        fontSize: '13px',
        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
        padding: '10px 12px',
        minWidth: '200px',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{formatDateLabel(label)}</div>
      {SERIES.filter(s => visibleKeys[s.key]).map(s => {
        const count = (point[s.key] as number) ?? 0;
        const sales = (point[s.salesKey] as number) ?? 0;
        return (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6, lineHeight: 1.6 }}>
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: s.color,
                flexShrink: 0,
              }}
            />
            <span style={{ color: s.color, minWidth: 64 }}>{s.label}</span>
            <span style={{ color: '#111827' }}>{count}人</span>
            <span style={{ color: '#6b7280', marginLeft: 'auto' }}>{formatYen(sales)}</span>
          </div>
        );
      })}
      <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 6, paddingTop: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
          <span>合計人数</span>
          <span>{totalCustomers}人</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
          <span>合計売上</span>
          <span>{formatYen(totalSalesExcludingUnlisted)}</span>
        </div>
        <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: 2 }}>
          （合計売上は記載なしを除く）
        </div>
      </div>
    </div>
  );
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

export default function SegmentTrendChart({ data }: Props) {
  const [visibleKeys, setVisibleKeys] = useState<Record<CountKey, boolean>>(INITIAL_VISIBLE_KEYS);

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

  return (
    <div className="w-full">
      <SeriesCheckboxGroup
        items={checkboxItems}
        visible={visibleKeys as Record<string, boolean>}
        onChange={handleVisibleChange}
        onAllOn={handleAllOn}
        onAllOff={handleAllOff}
        className="mb-2"
      />
      <div className="w-full h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
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
              content={(tipProps: TooltipProps<number, string>) => (
                <CustomTooltip {...tipProps} visibleKeys={visibleKeys} />
              )}
            />
            <Legend
              formatter={(value: string) => (
                <span className="text-gray-600 text-xs">{value}</span>
              )}
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
        {isEmpty && (
          <p className="text-center text-gray-500 text-sm -mt-4">推移データなし</p>
        )}
      </div>
    </div>
  );
}
