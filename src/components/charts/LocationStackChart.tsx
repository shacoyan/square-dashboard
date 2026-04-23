'use client';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LabelList,
} from 'recharts';
import type { ReactNode } from 'react';

interface Props {
  rows: Array<{ locationName: string; [key: string]: string | number }>;
  series: { key: string; label: string; color: string }[];
  valueUnit?: '人' | '件';
  emptyMessage?: string;
}

export default function LocationStackChart({ rows, series, valueUnit, emptyMessage }: Props) {
  const isEmpty =
    rows.length === 0 ||
    rows.every((row) =>
      series.every((s) => {
        const v = row[s.key];
        return typeof v !== 'number' || v === 0;
      })
    );

  if (isEmpty) {
    return (
      <div className="flex items-center justify-center w-full" style={{ height: '240px' }}>
        <p className="text-gray-500 text-sm">{emptyMessage ?? 'データなし'}</p>
      </div>
    );
  }

  const chartHeight = Math.max(240, rows.length * 48 + 80);
  const unit = valueUnit ?? '人';

  const tooltipFormatter = (
    value: number | string,
    name: string,
    props: { payload?: Record<string, number | string> }
  ): [ReactNode, ReactNode] => {
    const numValue = typeof value === 'number' ? value : Number(value) || 0;
    const payload = props.payload ?? {};
    
    let sum = 0;
    for (const s of series) {
      const v = payload[s.key];
      if (typeof v === 'number') {
        sum += v;
      }
    }

    const pct = sum > 0 ? Math.round((numValue / sum) * 100) : null;
    const formattedValue = pct !== null ? `${numValue}${unit} (${pct}%)` : `${numValue}${unit}`;

    return [
      formattedValue,
      <span key={name} className="text-gray-600 text-xs">{name}</span>,
    ];
  };

  return (
    <div className="w-full" style={{ height: `${chartHeight}px` }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
          <CartesianGrid stroke="#d1d5db" strokeDasharray="3 3" />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: '#6b7280' }}
            axisLine={{ stroke: '#d1d5db' }}
            tickLine={{ stroke: '#d1d5db' }}
          />
          <YAxis
            type="category"
            dataKey="locationName"
            width={140}
            tick={{ fontSize: 11, fill: '#6b7280' }}
            axisLine={{ stroke: '#d1d5db' }}
            tickLine={{ stroke: '#d1d5db' }}
          />
          <Tooltip
            formatter={tooltipFormatter}
            contentStyle={{
              backgroundColor: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              color: '#111827',
              fontSize: '13px',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)',
            }}
          />
          <Legend
            verticalAlign="top"
            formatter={(value: string) => (
              <span className="text-gray-600 text-xs">{value}</span>
            )}
          />
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="a"
              fill={s.color}
            >
              <LabelList
                dataKey={s.key}
                position="insideRight"
                fill="#fff"
                fontSize={10}
                formatter={(v: number) => (typeof v === 'number' && v > 0 ? String(v) : '')}
              />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
