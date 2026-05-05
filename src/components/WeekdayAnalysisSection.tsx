'use client';

import { useState, useMemo } from 'react';
import { aggregateByWeekday } from '../lib/weekdayAggregation';
import type { DailySegmentPoint } from '../types';
import WeekdayBarChart from './charts/WeekdayBarChart';
import WeekdayTable from './WeekdayTable';
import { Card } from './ui';

interface Props {
  dailyTrend: DailySegmentPoint[];
  mode?: 'average' | 'sum';
}

export default function WeekdayAnalysisSection({ dailyTrend, mode }: Props) {
  const [selectedMode, setSelectedMode] = useState<'average' | 'sum'>(mode ?? 'average');

  const aggregates = useMemo(
    () => aggregateByWeekday(dailyTrend, selectedMode),
    [dailyTrend, selectedMode]
  );

  return (
    <Card
      title="曜日別分析"
      actions={
        <div role="group" aria-label="集計モード切替" className="flex gap-1">
          <button
            type="button"
            onClick={() => setSelectedMode('average')}
            className={`px-3 py-1 text-sm rounded ${
              selectedMode === 'average'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            平均
          </button>
          <button
            type="button"
            onClick={() => setSelectedMode('sum')}
            className={`px-3 py-1 text-sm rounded ${
              selectedMode === 'sum'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            合計
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-gray-700 mt-4 mb-2">客数（棒グラフ）</h4>
        <WeekdayBarChart data={aggregates} metric="customers" />

        <h4 className="text-sm font-semibold text-gray-700 mt-4 mb-2">客数（テーブル）</h4>
        <WeekdayTable data={aggregates} metric="customers" />

        <h4 className="text-sm font-semibold text-gray-700 mt-4 mb-2">売上（棒グラフ）</h4>
        <WeekdayBarChart data={aggregates} metric="sales" />

        <h4 className="text-sm font-semibold text-gray-700 mt-4 mb-2">売上（テーブル）</h4>
        <WeekdayTable data={aggregates} metric="sales" />
      </div>
    </Card>
  );
}
