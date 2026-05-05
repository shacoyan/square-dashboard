'use client';

import { useMemo, useState } from 'react';
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
import type { TooltipProps } from 'recharts';
import {
  WEEKDAY_COUNT,
  WEEKDAY_LABELS,
  getLineChartData,
  type OccupancyMatrix,
} from '../../lib/occupancyAggregation';

interface Props {
  matrix: OccupancyMatrix;
  activeSlots: number[];
}

type Mode = 'average' | 'sum';

function formatVal(v: number | undefined, mode: Mode): string {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return mode === 'average' ? n.toFixed(2) : Math.round(n).toLocaleString();
}

function CustomTooltip({
  active,
  payload,
  label,
  mode,
}: TooltipProps<number, string> & { mode: Mode }) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload as { groups?: number; persons?: number } | undefined;
  const g = row?.groups ?? 0;
  const p = row?.persons ?? 0;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-2 shadow-lg text-xs">
      <p className="font-bold text-gray-800 mb-1">{label}</p>
      <div className="flex justify-between gap-4">
        <span className="text-gray-600">組数</span>
        <span className="font-normal text-gray-700">
          {formatVal(g, mode)} 組
        </span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-gray-600">人数</span>
        <span className="font-bold">
          {formatVal(p, mode)} 人
        </span>
      </div>
    </div>
  );
}

export default function OccupancyLineChart({ matrix, activeSlots }: Props) {
  const [mode, setMode] = useState<Mode>('average');
  const [weekdayFilter, setWeekdayFilter] = useState<boolean[]>(
    () => Array.from({ length: WEEKDAY_COUNT }, () => true),
  );

  const data = useMemo(
    () => getLineChartData(matrix, weekdayFilter, mode, activeSlots),
    [matrix, weekdayFilter, mode, activeSlots],
  );

  const hasAnyChecked = weekdayFilter.some((b) => b);
  const hasNonZero = data.some((d) => d.groups > 0 || d.persons > 0);

  const toggleWeekday = (w: number) => {
    setWeekdayFilter((prev) => prev.map((b, i) => (i === w ? !b : b)));
  };

  const unit = '人';
  const metricLabel = '同時滞在人数';
  const modeLabel = mode === 'average' ? '平均' : '合計';

  const dataMaxPersons = useMemo(() => data.reduce((m,d) => (d.persons > m ? d.persons : m), 0), [data]);
  const yDomain: [number, number] = mode === 'average' ? [0, Math.max(10, dataMaxPersons)] : [0, dataMaxPersons];

  return (
    <div className="w-full">
      {/* コントロール行 */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        {/* mode toggle */}
        <div className="inline-flex rounded-md overflow-hidden border border-gray-300">
          <button
            type="button"
            onClick={() => setMode('average')}
            className={`px-3 py-1 text-sm ${mode === 'average' ? 'bg-blue-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            平均
          </button>
          <button
            type="button"
            onClick={() => setMode('sum')}
            className={`px-3 py-1 text-sm ${mode === 'sum' ? 'bg-blue-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            合計
          </button>
        </div>

        {/* weekday checkboxes */}
        <div className="flex flex-wrap items-center gap-2">
          {WEEKDAY_LABELS.map((lbl, w) => (
            <label key={`wf-${w}`} className="inline-flex items-center gap-1 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={weekdayFilter[w]}
                onChange={() => toggleWeekday(w)}
                className="accent-blue-500"
              />
              <span>{lbl}</span>
            </label>
          ))}
        </div>
      </div>

      {/* chart */}
      {!hasAnyChecked || !hasNonZero ? (
        <div className="flex items-center justify-center h-[240px] text-gray-400 text-sm">
          {hasAnyChecked ? 'データがありません' : '曜日を 1 つ以上選択してください'}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="label"
              tick={{ fill: '#6b7280', fontSize: 11 }}
              axisLine={{ stroke: '#d1d5db' }}
              interval={5}
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 11 }}
              axisLine={{ stroke: '#d1d5db' }}
              allowDecimals={mode === 'average'}
              domain={yDomain}
            />
            <Tooltip
              content={(props: TooltipProps<number, string>) => (
                <CustomTooltip {...props} mode={mode} />
              )}
            />
            <Legend
              content={() => (
                <div className="flex justify-center gap-2 text-gray-600 text-xs mt-2">
                  <span className="inline-block w-3 h-3 rounded-sm bg-blue-500" />
                  <span>{modeLabel}{metricLabel}（{unit}）</span>
                </div>
              )}
            />
            <Line
              type="monotone"
              dataKey="persons"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              name={`${modeLabel}${metricLabel}`}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
