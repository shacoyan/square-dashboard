'use client';

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import type { SegmentBreakdown } from '../../types';

interface Props {
  sales: SegmentBreakdown;
}

const COLORS = {
  new: '#6366f1',     // indigo-500
  repeat: '#10b981',  // emerald-500
  regular: '#f59e0b', // amber-500
};

const LABELS: Record<keyof SegmentBreakdown, string> = {
  new: '新規',
  repeat: 'リピート',
  regular: '常連',
};

const formatTooltip = (value: number, name: string, props: { payload?: { percent?: number } }) => {
  const percent = props.payload?.percent ?? 0;
  return [`¥${value.toLocaleString()}（${(percent * 100).toFixed(1)}%）`, name];
};

export default function SegmentPieChart({ sales }: Props) {
  const total = sales.new + sales.repeat + sales.regular;

  const data = total === 0
    ? [{ name: 'データなし', value: 1, segment: 'new' as const }]
    : (Object.keys(sales) as (keyof SegmentBreakdown)[]).map((segment) => ({
        name: LABELS[segment],
        value: sales[segment],
        segment,
      }));

  return (
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
                backgroundColor: '#1f2937',
                border: 'none',
                borderRadius: '8px',
                color: '#f9fafb',
                fontSize: '13px',
              }}
            />
          )}
          {total > 0 && (
            <Legend
              formatter={(value: string) => (
                <span className="text-gray-600 text-xs">{value}</span>
              )}
            />
          )}
        </PieChart>
      </ResponsiveContainer>
      {total === 0 && (
        <p className="text-center text-gray-500 text-sm -mt-4">売上データなし</p>
      )}
    </div>
  );
}
