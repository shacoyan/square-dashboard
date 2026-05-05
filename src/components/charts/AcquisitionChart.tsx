'use client';

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import type { AcquisitionBreakdown } from '../../types';
import { ChartLegend, ChartTooltip } from '../ui';
import { chartTheme } from '../../lib/chartTheme';

interface Props {
  data: AcquisitionBreakdown;
}

const CHANNEL_CONFIG: { key: keyof AcquisitionBreakdown; label: string; color: string }[] = [
  { key: 'google',    label: 'Google',   color: '#4285f4' },
  { key: 'review',    label: '口コミ',   color: '#ea4335' },
  { key: 'signboard', label: '看板',     color: '#fbbc04' },
  { key: 'sns',       label: 'SNS',      color: '#34a853' },
  { key: 'unknown',   label: '打ち漏れ', color: '#9ca3af' },
];

export default function AcquisitionChart({ data }: Props) {
  const total = CHANNEL_CONFIG.reduce((sum, ch) => sum + (data[ch.key] ?? 0), 0);

  if (total === 0) {
    return (
      <div className="w-full min-w-0 space-y-3">
        <div className="w-full min-w-0">
          <ResponsiveContainer width="100%" height={chartTheme.heightPreset.standard}>
            <PieChart margin={chartTheme.marginPie}>
              <Pie
                data={[{ name: '新規客なし', value: 1 }]}
                cx="50%"
                cy="50%"
                outerRadius={110}
                dataKey="value"
              >
                <Cell fill="#374151" stroke="none" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <p className="text-center text-gray-500 text-sm -mt-4">新規客なし</p>
        </div>
      </div>
    );
  }

  const chartData = CHANNEL_CONFIG.map((ch) => ({
    name: ch.label,
    value: data[ch.key] ?? 0,
    color: ch.color,
  })).filter((d) => d.value > 0);

  return (
    <div className="w-full min-w-0 space-y-3">
      <div className="w-full min-w-0">
        <ResponsiveContainer width="100%" height={chartTheme.heightPreset.standard}>
          <PieChart margin={chartTheme.marginPie}>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={110}
              paddingAngle={2}
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
              ))}
            </Pie>
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
                      return `${Number(value).toLocaleString()}人（${(percent * 100).toFixed(1)}%）`;
                    },
                  }}
                />
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend
        size="sm"
        align="center"
        items={CHANNEL_CONFIG.map((ch) => ({
          id: ch.key,
          label: ch.label,
          color: ch.color,
        }))}
      />
    </div>
  );
}
