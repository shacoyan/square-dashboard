'use client';

import React from 'react';
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
import type { TooltipProps } from 'recharts';
import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';
import { formatYen } from '../../utils';

interface RowData {
  locationName: string;
  totalSales: number;
  totalCustomers: number;
  color: string;
}

interface Props {
  rows: RowData[];
}

const SalesTooltip = ({ active, payload, label }: TooltipProps<ValueType, NameType>) => {
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
        <p style={{ color: '#111827' }}>
          売上: {formatYen(Number(payload[0].value ?? 0))}
        </p>
      </div>
    );
  }
  return null;
};

const CustomersTooltip = ({ active, payload, label }: TooltipProps<ValueType, NameType>) => {
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
        <p style={{ color: '#111827' }}>
          客数: {payload[0].value}人
        </p>
      </div>
    );
  }
  return null;
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
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">総売上</h4>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={rows} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="locationName"
              tick={{ fontSize: 12 }}
              angle={rows.length > 5 ? -20 : 0}
              textAnchor={rows.length > 5 ? 'end' : 'middle'}
              height={60}
            />
            <YAxis
              tickFormatter={(value: number) => formatYen(value)}
              tick={{ fontSize: 12 }}
            />
            <Tooltip content={<SalesTooltip />} />
            <Bar dataKey="totalSales" barSize={20}>
              {rows.map((r, i) => (
                <Cell key={r.locationName + i} fill={r.color} />
              ))}
              <LabelList
                position="top"
                fontSize={10}
                fill="#111827"
                formatter={(v: number) => (typeof v === 'number' && v > 0 ? formatYen(v) : '')}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">総客数</h4>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={rows} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="locationName"
              tick={{ fontSize: 12 }}
              angle={rows.length > 5 ? -20 : 0}
              textAnchor={rows.length > 5 ? 'end' : 'middle'}
              height={60}
            />
            <YAxis
              tickFormatter={(value: number) => `${value}人`}
              tick={{ fontSize: 12 }}
            />
            <Tooltip content={<CustomersTooltip />} />
            <Bar dataKey="totalCustomers" barSize={20}>
              {rows.map((r, i) => (
                <Cell key={r.locationName + i} fill={r.color} />
              ))}
              <LabelList
                position="top"
                fontSize={10}
                fill="#111827"
                formatter={(v: number) => (typeof v === 'number' && v > 0 ? `${v}人` : '')}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default LocationBarChart;
