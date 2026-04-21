'use client';

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import type { AcquisitionBreakdown } from '../../types';

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
      <div className="w-full h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
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
    );
  }

  const chartData = CHANNEL_CONFIG.map((ch) => ({
    name: ch.label,
    value: data[ch.key] ?? 0,
    color: ch.color,
  })).filter((d) => d.value > 0);

  return (
    <div className="w-full h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
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
            formatter={(value: number, name: string, props: { payload?: { percent?: number } }) => {
              const percent = props.payload?.percent ?? 0;
              return [`${value}人（${(percent * 100).toFixed(1)}%）`, name];
            }}
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
          <Legend
            formatter={(value: string) => (
              <span className="text-gray-600 text-xs">{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
