'use client';

import type { WeekdayAggregate } from '../../lib/weekdayAggregation';
import { formatYen } from '../../utils';
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

interface Props {
  data: WeekdayAggregate[];
  metric: 'customers' | 'sales';
  stacked?: boolean;
}

const SEGMENT_CONFIG = [
  { key: 'new', label: '新規', color: '#3b82f6' },
  { key: 'repeat', label: 'リピート', color: '#eab308' },
  { key: 'regular', label: '常連', color: '#ef4444' },
  { key: 'staff', label: 'スタッフ', color: '#a855f7' },
  { key: 'unlisted', label: '記載なし', color: '#6b7280' },
] as const;

type SegmentKey = (typeof SEGMENT_CONFIG)[number]['key'];

function getSegmentKeys(): SegmentKey[] {
  return SEGMENT_CONFIG.map((s) => s.key);
}

function getDataKey(segmentKey: SegmentKey, metric: Props['metric']): string {
  if (metric === 'customers') return segmentKey;
  return `${segmentKey}Sales`;
}

function getSegmentLabel(segmentKey: SegmentKey): string {
  const config = SEGMENT_CONFIG.find((s) => s.key === segmentKey);
  return config ? config.label : segmentKey;
}

function getSegmentColor(segmentKey: SegmentKey): string {
  const config = SEGMENT_CONFIG.find((s) => s.key === segmentKey);
  return config ? config.color : '#6b7280';
}

const WEEKDAY_NAMES: Record<string, string> = {
  月: '月曜日',
  火: '火曜日',
  水: '水曜日',
  木: '木曜日',
  金: '金曜日',
  土: '土曜日',
  日: '日曜日',
};

function CustomTooltip({ active, payload, label, metric }: TooltipProps<number, string> & { metric: Props['metric'] }) {
  if (!active || !payload || payload.length === 0) return null;

  const raw = payload[0]?.payload as Record<string, number> | undefined;
  if (!raw) return null;

  const segmentKeys = getSegmentKeys();
  const dayLabel = WEEKDAY_NAMES[label ?? ''] ?? label ?? '';
  const sampleCount = raw.sampleCount ?? 0;

  const formatValue = (val: number): string => {
    if (metric === 'customers') {
      return (Math.round(val * 10) / 10).toFixed(1);
    }
    return formatYen(Math.round(val));
  };

  let total = 0;
  let unlistedValue = 0;

  segmentKeys.forEach((key) => {
    const dataKey = getDataKey(key, metric);
    const v = raw[dataKey] ?? 0;
    if (key === 'unlisted') {
      unlistedValue = v;
    }
    total += v;
  });

  const displayTotal = metric === 'customers' ? total - unlistedValue : total;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg text-sm">
      <p className="font-bold text-gray-800 mb-1">{dayLabel}</p>
      {segmentKeys.map((key) => {
        const dataKey = getDataKey(key, metric);
        const value = raw[dataKey] ?? 0;
        if (value === 0) return null;
        return (
          <div key={key} className="flex justify-between gap-4">
            <span className="text-gray-600">{getSegmentLabel(key)}</span>
            <span className="font-medium">{formatValue(value)}</span>
          </div>
        );
      })}
      <hr className="my-1 border-gray-200" />
      <div className="flex justify-between gap-4 font-bold">
        <span>合計</span>
        <span>{formatValue(displayTotal)}</span>
      </div>
      {metric === 'customers' && unlistedValue > 0 && (
        <div className="text-xs text-gray-500 mt-0.5">
          (記載なし {formatValue(unlistedValue)})
        </div>
      )}
      <div className="text-xs text-gray-400 mt-1">日数: {sampleCount}日</div>
    </div>
  );
}

function CustomLegend() {
  return (
    <div className="flex justify-center gap-4 text-gray-600 text-xs mt-2 flex-wrap">
      {SEGMENT_CONFIG.map((segment) => (
        <div key={segment.key} className="flex items-center gap-1">
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{ backgroundColor: segment.color }}
          />
          <span>{segment.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function WeekdayBarChart({ data, metric, stacked = true }: Props) {
  const hasData = data.some((d) => d.sampleCount > 0);

  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-[240px] text-gray-400">
        曜日データなし
      </div>
    );
  }

  const segmentKeys = getSegmentKeys();

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
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
            <CustomTooltip {...props} metric={metric} />
          )}
        />
        <Legend content={() => <CustomLegend />} />
        {segmentKeys.map((key) => {
          const dataKey = getDataKey(key, metric);
          return (
            <Bar
              key={key}
              dataKey={dataKey}
              name={getSegmentLabel(key)}
              stackId={stacked ? 'a' : undefined}
              fill={getSegmentColor(key)}
            />
          );
        })}
      </BarChart>
    </ResponsiveContainer>
  );
}
