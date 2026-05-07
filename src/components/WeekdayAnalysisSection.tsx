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
            aria-pressed={selectedMode === 'average'}
            className={`px-3 py-1 text-sm rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 ${
              selectedMode === 'average'
                ? 'bg-primary text-white'
                : 'bg-surface-subtle text-text'
            }`}
          >
            平均
          </button>
          <button
            type="button"
            onClick={() => setSelectedMode('sum')}
            aria-pressed={selectedMode === 'sum'}
            className={`px-3 py-1 text-sm rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 ${
              selectedMode === 'sum'
                ? 'bg-primary text-white'
                : 'bg-surface-subtle text-text'
            }`}
          >
            合計
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-text mt-4 mb-2">客数（棒グラフ）</h3>
        <WeekdayBarChart data={aggregates} metric="customers" />

        <h3 className="text-sm font-semibold text-text mt-4 mb-2">客数（テーブル）</h3>
        <WeekdayTable data={aggregates} metric="customers" />

        <h3 className="text-sm font-semibold text-text mt-4 mb-2">売上（棒グラフ）</h3>
        <WeekdayBarChart data={aggregates} metric="sales" />

        <h3 className="text-sm font-semibold text-text mt-4 mb-2">売上（テーブル）</h3>
        <WeekdayTable data={aggregates} metric="sales" />
      </div>
    </Card>
  );
}
