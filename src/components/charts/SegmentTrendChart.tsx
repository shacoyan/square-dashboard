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
  { key: 'new' as const, color: '#3b82f6', label: '新規' },
  { key: 'repeat' as const, color: '#eab308', label: 'リピート' },
  { key: 'regular' as const, color: '#ef4444', label: '常連' },
  { key: 'staff' as const, color: '#a855f7', label: 'スタッフ' },
  { key: 'unlisted' as const, color: '#6b7280', label: '記載なし' },
];

export default function SegmentTrendChart({ data }: Props) {
  const isEmpty = !data || data.length === 0;

  const chartData = isEmpty
    ? [{ date: '', new: 0, repeat: 0, regular: 0, staff: 0, unlisted: 0 }]
    : data;

  return (
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
            labelFormatter={(label) => {
              if (!label) return '';
              const parts = String(label).split('-');
              if (parts.length >= 3) return `${parts[1]}/${parts[2]}`;
              return String(label);
            }}
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
