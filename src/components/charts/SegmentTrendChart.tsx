'use client';

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
import type { DailySegmentPoint } from '../../types';

interface Props {
  data: DailySegmentPoint[];
}

const SERIES = [
  { key: 'new' as const, color: '#6366f1', label: '新規' },      // indigo-500
  { key: 'repeat' as const, color: '#10b981', label: 'リピート' }, // emerald-500
  { key: 'regular' as const, color: '#f59e0b', label: '常連' },    // amber-500
];

const formatDate = (dateStr: string) => {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
};

export default function SegmentTrendChart({ data }: Props) {
  const isEmpty = !data || data.length === 0;

  const chartData = isEmpty
    ? [{ date: '', new: 0, repeat: 0, regular: 0 }]
    : data;

  return (
    <div className="w-full h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#d1d5db" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
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
            contentStyle={{
              backgroundColor: '#1f2937',
              border: 'none',
              borderRadius: '8px',
              color: '#f9fafb',
              fontSize: '13px',
            }}
            labelFormatter={(label: string) => (label ? formatDate(String(label)) : '')}
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
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {isEmpty && (
        <p className="text-center text-gray-500 text-sm -mt-4">推移データなし</p>
      )}
    </div>
  );
}
