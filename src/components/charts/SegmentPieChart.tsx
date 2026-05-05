'use client';

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import type { SegmentBreakdown } from '../../types';
import { ChartLegend, ChartTooltip } from '../ui';
import { chartTheme } from '../../lib/chartTheme';

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

export default function SegmentPieChart({ sales }: Props) {
  const total = sales.new + sales.repeat + sales.regular + sales.staff + sales.unlisted;

  const data = total === 0
    ? [{ name: 'データなし', value: 1, segment: 'new' as const }]
    : SEGMENT_ORDER.map((segment) => ({ name: LABELS[segment], value: sales[segment], segment }));

  const legendItems = SEGMENT_ORDER.map(s => ({ id: s, label: LABELS[s], color: COLORS[s] }));

  return (
    <div className="w-full min-w-0 space-y-3">
      <div className="w-full min-w-0">
        <ResponsiveContainer width="100%" height={chartTheme.heightPreset.standard}>
          <PieChart margin={chartTheme.marginPie}>
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
                cursor={{ fill: 'rgba(15,23,42,0.04)' }}
                content={(p) => (
                  <ChartTooltip
                    active={p.active}
                    payload={p.payload as never}
                    label={p.label as string | number | undefined}
                    formatters={{
                      value: (value: number | string | Array<number | string>, _name?: string | number, item?: { payload?: Record<string, unknown> }) => {
                        const percent =
                          (item?.payload as { percent?: number } | undefined)?.percent ?? 0;
                        return `¥${Number(value).toLocaleString()}（${(percent * 100).toFixed(1)}%）`;
                      },
                    }}
                  />
                )}
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
