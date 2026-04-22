'use client';

import React from 'react';
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { TooltipProps } from 'recharts';
import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';
import { formatYen } from '../../utils';

interface RowData {
  locationName: string;
  totalSales: number;
  totalCustomers: number;
}

interface Props {
  rows: RowData[];
}

const CustomTooltip = ({ active, payload, label }: TooltipProps<ValueType, NameType>) => {
  if (active && payload && payload.length) {
    return (
      <div
        style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          color: '#111827',
          fontSize: '13px',
          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
          padding: '10px',
        }}
      >
        <p style={{ color: '#111827', marginBottom: '4px', fontWeight: 'bold' }}>{label}</p>
        {payload.map((entry, index) => (
          <p key={index} style={{ color: '#111827' }}>
            {entry.name === 'totalSales' ? `売上: ${formatYen(Number(entry.value ?? 0))}` : `客数: ${entry.value}人`}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const renderLegend = (value: string) => {
  const label = value === 'totalSales' ? '売上' : '客数';
  return <span className="text-gray-600 text-xs">{label}</span>;
};

const LocationBarChart: React.FC<Props> = ({ rows }) => {
  if (rows.length === 0) {
    return (
      <div
        style={{
          height: 320,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          color: '#6b7280',
        }}
      >
        店舗データなし
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={rows} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="locationName"
          tick={{ fontSize: 12 }}
          angle={rows.length > 5 ? -20 : 0}
          textAnchor={rows.length > 5 ? 'end' : 'middle'}
          height={60}
        />
        <YAxis
          yAxisId="left"
          orientation="left"
          tickFormatter={(value: number) => formatYen(value)}
          tick={{ fontSize: 12 }}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tickFormatter={(value: number) => `${value}人`}
          tick={{ fontSize: 12 }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend formatter={renderLegend} />
        <Bar
          yAxisId="left"
          dataKey="totalSales"
          name="totalSales"
          fill="#6366f1"
          barSize={20}
        />
        <Bar
          yAxisId="right"
          dataKey="totalCustomers"
          name="totalCustomers"
          fill="#f59e0b"
          barSize={20}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
};

export default LocationBarChart;
