'use client';

import { useMemo, useState } from 'react';
import type { DailySegmentPoint } from '../types';
import {
  aggregateByWeekdayPerLocation,
  type LocationSeriesInput,
} from '../lib/weekdayLocationAggregation';
import WeekdayLocationBarChart from './charts/WeekdayLocationBarChart';
import WeekdayLocationTable from './WeekdayLocationTable';

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
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-md font-bold text-gray-900">曜日別分析（店舗別）</h3>
        <div className="flex gap-1">
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
      </div>

      <h4 className="text-sm font-semibold text-gray-700 mt-4 mb-2">客数（棒グラフ）</h4>
      <WeekdayLocationBarChart
        data={aggregates}
        locationSeries={locationMeta}
        colorMap={colorMap}
        metric="customers"
      />

      <h4 className="text-sm font-semibold text-gray-700 mt-4 mb-2">客数（テーブル）</h4>
      <WeekdayLocationTable
        data={aggregates}
        locationSeries={locationMeta}
        metric="customers"
      />

      <h4 className="text-sm font-semibold text-gray-700 mt-4 mb-2">売上（棒グラフ）</h4>
      <WeekdayLocationBarChart
        data={aggregates}
        locationSeries={locationMeta}
        colorMap={colorMap}
        metric="sales"
      />

      <h4 className="text-sm font-semibold text-gray-700 mt-4 mb-2">売上（テーブル）</h4>
      <WeekdayLocationTable
        data={aggregates}
        locationSeries={locationMeta}
        metric="sales"
      />
    </section>
  );
}
