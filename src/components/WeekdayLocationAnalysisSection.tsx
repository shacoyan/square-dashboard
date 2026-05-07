'use client';

import { useMemo, useState } from 'react';
import type { DailySegmentPoint } from '../types';
import {
  aggregateByWeekdayPerLocation,
  type LocationSeriesInput,
} from '../lib/weekdayLocationAggregation';
import WeekdayLocationBarChart from './charts/WeekdayLocationBarChart';
import WeekdayLocationTable from './WeekdayLocationTable';
import { Card } from './ui';

interface LocationSeriesProp {
  locationId: string;
  locationName: string;
  dailyTrend: DailySegmentPoint[];
}

interface Props {
  locationSeries: LocationSeriesProp[];
  colorMap: Record<string, string>;
  mode?: 'average' | 'sum';
}

export default function WeekdayLocationAnalysisSection({
  locationSeries,
  colorMap,
  mode,
}: Props) {
  const [selectedMode, setSelectedMode] = useState<'average' | 'sum'>(mode ?? 'average');

  const locationMeta = useMemo(
    () =>
      locationSeries.map((l) => ({
        locationId: l.locationId,
        locationName: l.locationName,
      })),
    [locationSeries]
  );

  const aggregates = useMemo(() => {
    const input: LocationSeriesInput[] = locationSeries.map((l) => ({
      locationId: l.locationId,
      locationName: l.locationName,
      points: l.dailyTrend,
    }));
    return aggregateByWeekdayPerLocation(input, selectedMode);
  }, [locationSeries, selectedMode]);

  return (
    <Card
      title="曜日別分析（店舗別）"
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
        <WeekdayLocationBarChart
          data={aggregates}
          locationSeries={locationMeta}
          colorMap={colorMap}
          metric="customers"
        />

        <h3 className="text-sm font-semibold text-text mt-4 mb-2">客数（テーブル）</h3>
        <WeekdayLocationTable
          data={aggregates}
          locationSeries={locationMeta}
          metric="customers"
        />

        <h3 className="text-sm font-semibold text-text mt-4 mb-2">売上（棒グラフ）</h3>
        <WeekdayLocationBarChart
          data={aggregates}
          locationSeries={locationMeta}
          colorMap={colorMap}
          metric="sales"
        />

        <h3 className="text-sm font-semibold text-text mt-4 mb-2">売上（テーブル）</h3>
        <WeekdayLocationTable
          data={aggregates}
          locationSeries={locationMeta}
          metric="sales"
        />
      </div>
    </Card>
  );
}
