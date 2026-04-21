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
  LabelList,
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
    <div className="w-full h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fontSize: 11, fill: '#d1d5db' }}
            axisLine={{ stroke: '#4b5563' }}
            tickLine={{ stroke: '#4b5563' }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#d1d5db' }}
            axisLine={{ stroke: '#4b5563' }}
            tickLine={{ stroke: '#4b5563' }}
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
              <span className="text-gray-200 text-xs">{value}</span>
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
            >
              {!isEmpty && (
                <LabelList dataKey={s.key} position="top" fill="#e5e7eb" fontSize={10} />
              )}
            </Line>
          ))}
        </LineChart>
      </ResponsiveContainer>
      {isEmpty && (
        <p className="text-center text-gray-400 text-sm -mt-4">推移データなし</p>
      )}
    </div>
  );
}
