'use client';

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import type { SegmentBreakdown } from '../../types';
import { ChartLegend } from '../ui';

interface Props {
  sales: SegmentBreakdown;
}

const COLORS = {
  new: '#3b82f6',
  repeat: '#eab308',
  regular: '#ef4444',
  staff: '#a855f7',
  unlisted: '#6b7280',
};

const SEGMENT_ORDER: (keyof SegmentBreakdown)[] = ['new', 'repeat', 'regular', 'staff', 'unlisted'];

const LABELS: Record<keyof SegmentBreakdown, string> = {
  new: '新規',
  repeat: 'リピート',
  regular: '常連',
  staff: 'スタッフ',
  unlisted: '記載なし',
};

const formatTooltip = (value: number, name: string, props: { payload?: { percent?: number } }) => {
  const percent = props.payload?.percent ?? 0;
  return [`¥${value.toLocaleString()}（${(percent * 100).toFixed(1)}%）`, name];
};

export default function SegmentPieChart({ sales }: Props) {
  const total = sales.new + sales.repeat + sales.regular + sales.staff + sales.unlisted;

  const data = total === 0
    ? [{ name: 'データなし', value: 1, segment: 'new' as const }]
    : SEGMENT_ORDER.map((segment) => ({ name: LABELS[segment], value: sales[segment], segment }));

  const legendItems = SEGMENT_ORDER.map(s => ({ id: s, label: LABELS[s], color: COLORS[s] }));

  return (
    <div className="space-y-3">
      <div className="w-full h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={110}
              paddingAngle={total === 0 ? 0 : 2}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={total === 0 ? '#d1d5db' : COLORS[entry.segment]}
                  stroke="none"
                />
              ))}
            </Pie>
            {total > 0 && (
              <Tooltip
                formatter={formatTooltip}
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
              />
            )}
          </PieChart>
        </ResponsiveContainer>
      </div>
      {total > 0 && (
        <ChartLegend items={legendItems} size="sm" align="center" />
      )}
      {total === 0 && (
        <p className="text-center text-gray-500 text-sm">売上データなし</p>
      )}
    </div>
  );
}
