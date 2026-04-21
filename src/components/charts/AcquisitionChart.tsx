'use client';

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import type { AcquisitionBreakdown } from '../../types';

interface Props {
  data: AcquisitionBreakdown;
}

const CHANNEL_CONFIG: { key: keyof AcquisitionBreakdown; label: string; color: string }[] = [
  { key: 'google', label: 'Google', color: '#6366f1' },      // indigo-500
  { key: 'review', label: 'クチコミ', color: '#10b981' },    // emerald-500
  { key: 'signboard', label: '看板', color: '#f59e0b' },     // amber-500
  { key: 'sns', label: 'SNS', color: '#8b5cf6' },            // violet-500
  { key: 'unknown', label: '打ち漏れ', color: '#f87171' },    // red-400
];

export default function AcquisitionChart({ data }: Props) {
  const total = CHANNEL_CONFIG.reduce((sum, ch) => sum + (data[ch.key] ?? 0), 0);

  if (total === 0) {
    return (
      <div className="w-full h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={[{ name: '新規客なし', value: 1 }]}
              cx="50%"
              cy="50%"
              outerRadius={80}
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
    <div className="w-full h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
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
              backgroundColor: '#1f2937',
              border: 'none',
              borderRadius: '8px',
              color: '#f9fafb',
              fontSize: '13px',
            }}
          />
          <Legend
            formatter={(value: string) => (
              <span className="text-gray-300 text-xs">{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

