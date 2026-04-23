import React from 'react';
import type { Location, PeriodPreset, LocationSegmentRow } from '../types';
import { useMultiLocationSegment } from '../hooks/useMultiLocationSegment';
import { LocationBarChart, LocationStackChart, LocationTrendChart } from './charts';
import { formatYen } from '../utils';
import WeekdayLocationAnalysisSection from './WeekdayLocationAnalysisSection';
import { getLocationColors } from '../lib/locationColors';

const PERIOD_TABS: { key: PeriodPreset; label: string }[] = [
  { key: 'today', label: '今日' },
  { key: 'week', label: '週' },
  { key: 'month', label: '今月' },
];

const SEGMENT_SERIES = [
  { key: 'new', label: '新規', color: '#3b82f6' },
  { key: 'repeat', label: 'リピート', color: '#eab308' },
  { key: 'regular', label: '常連', color: '#ef4444' },
  { key: 'staff', label: 'スタッフ', color: '#a855f7' },
  { key: 'unlisted', label: '記載なし', color: '#6b7280' },
];

const ACQUISITION_SERIES = [
  { key: 'google', label: 'Google', color: '#4285f4' },
  { key: 'review', label: '口コミ', color: '#ea4335' },
  { key: 'signboard', label: '看板', color: '#fbbc04' },
  { key: 'sns', label: 'SNS', color: '#34a853' },
  { key: 'unknown', label: '不明', color: '#9ca3af' },
];

const TD_NUM = 'px-3 py-2 text-right tabular-nums whitespace-nowrap';
const TD_NAME = 'px-3 py-2 text-left whitespace-nowrap sticky left-0';

function SkeletonCompareSection() {
  return (
    <div className="space-y-4">
      <div className="space-y-3 animate-pulse">
        <div className="h-8 bg-gray-200 rounded" />
        <div className="h-8 bg-gray-200 rounded" />
        <div className="h-8 bg-gray-200 rounded" />
        <div className="h-8 bg-gray-200 rounded" />
        <div className="h-8 bg-gray-200 rounded" />
        <div className="h-8 bg-gray-200 rounded" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="h-64 bg-gray-200 rounded-xl animate-pulse" />
        <div className="h-64 bg-gray-200 rounded-xl animate-pulse" />
        <div className="h-64 bg-gray-200 rounded-xl animate-pulse" />
      </div>
    </div>
  );
}

interface Props {
  token: string;
  locations: Location[];
  period: PeriodPreset;
  onPeriodChange: (p: PeriodPreset) => void;
  weekIndex: number;
  onWeekIndexChange: (n: number) => void;
  availableWeeks: number;
  baseDate: string;
  startHour: number;
  endHour: number;
  enabled: boolean;
}

export default function LocationComparisonSection(props: Props) {
  const {
    token,
    locations,
    period,
    onPeriodChange,
    weekIndex,
    onWeekIndexChange,
    availableWeeks,
    baseDate,
    startHour,
    endHour,
    enabled,
  } = props;

  const { data, loading, error } = useMultiLocationSegment({
    token,
    locations,
    period,
    baseDate,
    startHour,
    endHour,
    weekIndex,
    enabled: enabled && locations.length > 0,
  });

  const barColorsMap = React.useMemo(
    () => getLocationColors(data ? data.rows.map(r => r.locationId) : []),
    [data]
  );

  type RowInput = LocationSegmentRow | Omit<LocationSegmentRow, 'locationId' | 'locationName' | 'loadError' | 'partialFailure'>;
  const renderRow = (row: RowInput, isTotal = false) => {
    const rowTyped = row as LocationSegmentRow;
    const hasError = !isTotal && rowTyped.loadError;
    const hasPartialFailure = !isTotal && rowTyped.partialFailure !== null;
    const nameBg = isTotal
      ? 'bg-gray-50 font-bold'
      : hasPartialFailure
        ? 'bg-amber-50'
        : 'bg-white';

    return (
      <tr key={isTotal ? 'totals' : rowTyped.locationId} className={`border-b border-gray-200 ${isTotal ? 'font-bold bg-gray-50' : ''} ${hasPartialFailure ? 'bg-amber-50' : ''}`}>
        <td className={`${TD_NAME} ${nameBg}`}>
          {isTotal ? '合計' : rowTyped.locationName}
          {hasPartialFailure && <span className="text-amber-700 ml-1">※</span>}
          {hasError && (
            <span className="text-xs text-red-600 ml-1">({rowTyped.loadError})</span>
          )}
        </td>
        <td className={TD_NUM}>{formatYen(row.totalSales)}</td>
        <td className={TD_NUM}>
          {row.averageDailySales !== null ? formatYen(Math.round(row.averageDailySales)) : '--'}
          {hasPartialFailure && <span className="text-xs text-amber-700 block">（{rowTyped.partialFailure!.failedDays}日失敗）</span>}
        </td>
        <td className={TD_NUM}>
          {row.overallAveragePerCustomer !== null ? formatYen(Math.round(row.overallAveragePerCustomer)) : '--'}
        </td>
        <td className={TD_NUM}>{row.totalCustomers.toLocaleString()}</td>
        <td className={TD_NUM}>{row.customersBySegment.new.toLocaleString()}</td>
        <td className={TD_NUM}>{row.customersBySegment.repeat.toLocaleString()}</td>
        <td className={TD_NUM}>{row.customersBySegment.regular.toLocaleString()}</td>
        <td className={TD_NUM}>{row.customersBySegment.staff.toLocaleString()}</td>
        <td className={TD_NUM}>{formatYen(row.salesBySegment.unlisted)}</td>
        <td className={TD_NUM}>{row.acquisitionBreakdown.google.toLocaleString()}</td>
        <td className={TD_NUM}>{row.acquisitionBreakdown.review.toLocaleString()}</td>
        <td className={TD_NUM}>{row.acquisitionBreakdown.signboard.toLocaleString()}</td>
        <td className={TD_NUM}>{row.acquisitionBreakdown.sns.toLocaleString()}</td>
        <td className={TD_NUM}>{row.acquisitionBreakdown.unknown.toLocaleString()}</td>
      </tr>
    );
  };

  const detailThClassName = "px-2 py-1 text-right tabular-nums bg-gray-50 font-medium text-gray-700";
  const detailThNameClassName = "px-2 py-1 text-left bg-gray-50 font-medium text-gray-700";
  const detailTdNumClassName = "px-2 py-1 text-right tabular-nums";
  const detailTdNameClassName = "px-2 py-1 text-left whitespace-nowrap";

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-gray-900">全店舗比較</h2>

      <div className="flex space-x-2" role="tablist" aria-label="期間選択">
        {PERIOD_TABS.map((tab) => {
          const isSelected = period === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => onPeriodChange(tab.key)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${
                isSelected
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {period === 'week' && availableWeeks > 0 && (
        <div className="flex flex-wrap gap-2 mb-4" role="tablist" aria-label="週選択">
          {Array.from({ length: availableWeeks }, (_, i) => i + 1).map((n) => {
            const isSelected = weekIndex === n;
            return (
              <button
                key={n}
                type="button"
                role="tab"
                aria-selected={isSelected}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => onWeekIndexChange(n)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${
                  isSelected
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                第{n}週
              </button>
            );
          })}
        </div>
      )}

      {loading && <SkeletonCompareSection />}

      {error && !data && (
        <div className="bg-red-50 border border-red-300 text-red-800 px-4 py-3 rounded-lg" role="alert">
          <p className="font-medium">データの取得に失敗しました</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      )}

      {error && data && (
        <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 px-4 py-3 rounded-lg" role="alert">
          <p className="font-medium">一部の店舗データの取得に失敗しました</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      )}

      {!loading && !error && !data && (
        <p className="text-gray-500">店舗データがありません。</p>
      )}

      {data && (
        <>
          <div className="overflow-auto -mx-6 px-6 max-h-[70vh]">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-gray-100 sticky top-0 z-20">
                <tr className="border-b border-gray-200">
                  <th className="px-3 py-2 text-left whitespace-nowrap">店舗名</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">期間売上</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">平均日売上</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">客単価</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">合計客数</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">新規</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">リピート</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">常連</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">スタッフ</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">記載なし売上</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">Google</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">口コミ</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">看板</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">SNS</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">不明</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => renderRow(row))}
                {renderRow(data.totals, true)}
              </tbody>
            </table>
            {data.rows.some(r => r.partialFailure !== null) && (
              <p className="text-xs text-amber-700 mt-2">※ 一部日付のデータ取得に失敗した店舗です。平均日売上は全期間日数で按分しているため実績より低く表示されている可能性があります。</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6">
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
              <h3 className="text-md font-bold text-gray-900 mb-4">店舗別 売上・客数</h3>
              <LocationBarChart
                rows={data.rows.map((r) => ({
                  locationName: r.locationName,
                  totalSales: r.totalSales,
                  totalCustomers:
                    r.customersBySegment.new +
                    r.customersBySegment.repeat +
                    r.customersBySegment.regular +
                    r.customersBySegment.staff,
                  color: barColorsMap[r.locationId] ?? '#6b7280',
                }))}
              />
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      <th className={detailThNameClassName}>店舗名</th>
                      <th className={detailThClassName}>売上</th>
                      <th className={detailThClassName}>客数</th>
                      <th className={detailThClassName}>客単価</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={r.locationId} className="border-b border-gray-200">
                        <td className={detailTdNameClassName}>{r.locationName}</td>
                        <td className={detailTdNumClassName}>{formatYen(r.totalSales)}</td>
                        <td className={detailTdNumClassName}>{r.totalCustomers.toLocaleString()}</td>
                        <td className={detailTdNumClassName}>{r.overallAveragePerCustomer !== null ? formatYen(Math.round(r.overallAveragePerCustomer)) : '--'}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-100 font-bold">
                      <td className={detailTdNameClassName}>合計</td>
                      <td className={detailTdNumClassName}>{formatYen(data.totals.totalSales)}</td>
                      <td className={detailTdNumClassName}>{data.totals.totalCustomers.toLocaleString()}</td>
                      <td className={detailTdNumClassName}>{data.totals.overallAveragePerCustomer !== null ? formatYen(Math.round(data.totals.overallAveragePerCustomer)) : '--'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
              <h3 className="text-md font-bold text-gray-900 mb-4">店舗別 お客様構成</h3>
              <LocationStackChart
                rows={data.rows.map((r) => ({
                  locationName: r.locationName,
                  new: r.customersBySegment.new,
                  repeat: r.customersBySegment.repeat,
                  regular: r.customersBySegment.regular,
                  staff: r.customersBySegment.staff,
                  unlisted: r.customersBySegment.unlisted,
                }))}
                series={SEGMENT_SERIES}
                valueUnit="人"
                emptyMessage="セグメントデータなし"
              />
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      <th className={detailThNameClassName}>店舗名</th>
                      <th className={detailThClassName}>新規</th>
                      <th className={detailThClassName}>リピート</th>
                      <th className={detailThClassName}>常連</th>
                      <th className={detailThClassName}>スタッフ</th>
                      <th className={detailThClassName}>記載なし</th>
                      <th className={detailThClassName}>合計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => {
                      const totalSegment = r.customersBySegment.new + r.customersBySegment.repeat + r.customersBySegment.regular + r.customersBySegment.staff + r.customersBySegment.unlisted;
                      return (
                        <tr key={r.locationId} className="border-b border-gray-200">
                          <td className={detailTdNameClassName}>{r.locationName}</td>
                          <td className={detailTdNumClassName}>{r.customersBySegment.new.toLocaleString()}{totalSegment !== 0 && <span className="text-gray-500 ml-1 text-[10px]">({Math.round((r.customersBySegment.new / totalSegment) * 100)}%)</span>}</td>
                          <td className={detailTdNumClassName}>{r.customersBySegment.repeat.toLocaleString()}{totalSegment !== 0 && <span className="text-gray-500 ml-1 text-[10px]">({Math.round((r.customersBySegment.repeat / totalSegment) * 100)}%)</span>}</td>
                          <td className={detailTdNumClassName}>{r.customersBySegment.regular.toLocaleString()}{totalSegment !== 0 && <span className="text-gray-500 ml-1 text-[10px]">({Math.round((r.customersBySegment.regular / totalSegment) * 100)}%)</span>}</td>
                          <td className={detailTdNumClassName}>{r.customersBySegment.staff.toLocaleString()}{totalSegment !== 0 && <span className="text-gray-500 ml-1 text-[10px]">({Math.round((r.customersBySegment.staff / totalSegment) * 100)}%)</span>}</td>
                          <td className={detailTdNumClassName}>{r.customersBySegment.unlisted.toLocaleString()}{totalSegment !== 0 && <span className="text-gray-500 ml-1 text-[10px]">({Math.round((r.customersBySegment.unlisted / totalSegment) * 100)}%)</span>}</td>
                          <td className={detailTdNumClassName}>{totalSegment.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-gray-100 font-bold">
                      <td className={detailTdNameClassName}>合計</td>
                      <td className={detailTdNumClassName}>{data.totals.customersBySegment.new.toLocaleString()}{(() => { const total = data.totals.customersBySegment.new + data.totals.customersBySegment.repeat + data.totals.customersBySegment.regular + data.totals.customersBySegment.staff + data.totals.customersBySegment.unlisted; return total !== 0 ? <span className="text-gray-500 ml-1 text-[10px]">({Math.round((data.totals.customersBySegment.new / total) * 100)}%)</span> : null; })()}</td>
                      <td className={detailTdNumClassName}>{data.totals.customersBySegment.repeat.toLocaleString()}{(() => { const total = data.totals.customersBySegment.new + data.totals.customersBySegment.repeat + data.totals.customersBySegment.regular + data.totals.customersBySegment.staff + data.totals.customersBySegment.unlisted; return total !== 0 ? <span className="text-gray-500 ml-1 text-[10px]">({Math.round((data.totals.customersBySegment.repeat / total) * 100)}%)</span> : null; })()}</td>
                      <td className={detailTdNumClassName}>{data.totals.customersBySegment.regular.toLocaleString()}{(() => { const total = data.totals.customersBySegment.new + data.totals.customersBySegment.repeat + data.totals.customersBySegment.regular + data.totals.customersBySegment.staff + data.totals.customersBySegment.unlisted; return total !== 0 ? <span className="text-gray-500 ml-1 text-[10px]">({Math.round((data.totals.customersBySegment.regular / total) * 100)}%)</span> : null; })()}</td>
                      <td className={detailTdNumClassName}>{data.totals.customersBySegment.staff.toLocaleString()}{(() => { const total = data.totals.customersBySegment.new + data.totals.customersBySegment.repeat + data.totals.customersBySegment.regular + data.totals.customersBySegment.staff + data.totals.customersBySegment.unlisted; return total !== 0 ? <span className="text-gray-500 ml-1 text-[10px]">({Math.round((data.totals.customersBySegment.staff / total) * 100)}%)</span> : null; })()}</td>
                      <td className={detailTdNumClassName}>{data.totals.customersBySegment.unlisted.toLocaleString()}{(() => { const total = data.totals.customersBySegment.new + data.totals.customersBySegment.repeat + data.totals.customersBySegment.regular + data.totals.customersBySegment.staff + data.totals.customersBySegment.unlisted; return total !== 0 ? <span className="text-gray-500 ml-1 text-[10px]">({Math.round((data.totals.customersBySegment.unlisted / total) * 100)}%)</span> : null; })()}</td>
                      <td className={detailTdNumClassName}>{(data.totals.customersBySegment.new + data.totals.customersBySegment.repeat + data.totals.customersBySegment.regular + data.totals.customersBySegment.staff + data.totals.customersBySegment.unlisted).toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
              <h3 className="text-md font-bold text-gray-900 mb-4">店舗別 新規獲得経路</h3>
              <LocationStackChart
                rows={data.rows.map((r) => ({
                  locationName: r.locationName,
                  google: r.acquisitionBreakdown.google,
                  review: r.acquisitionBreakdown.review,
                  signboard: r.acquisitionBreakdown.signboard,
                  sns: r.acquisitionBreakdown.sns,
                  unknown: r.acquisitionBreakdown.unknown,
                }))}
                series={ACQUISITION_SERIES}
                valueUnit="件"
                emptyMessage="獲得経路データなし"
              />
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      <th className={detailThNameClassName}>店舗名</th>
                      <th className={detailThClassName}>Google</th>
                      <th className={detailThClassName}>口コミ</th>
                      <th className={detailThClassName}>看板</th>
                      <th className={detailThClassName}>SNS</th>
                      <th className={detailThClassName}>不明</th>
                      <th className={detailThClassName}>合計新規</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => {
                      const totalNew = r.acquisitionBreakdown.google + r.acquisitionBreakdown.review + r.acquisitionBreakdown.signboard + r.acquisitionBreakdown.sns + r.acquisitionBreakdown.unknown;
                      return (
                        <tr key={r.locationId} className="border-b border-gray-200">
                          <td className={detailTdNameClassName}>{r.locationName}</td>
                          <td className={detailTdNumClassName}>{r.acquisitionBreakdown.google.toLocaleString()}</td>
                          <td className={detailTdNumClassName}>{r.acquisitionBreakdown.review.toLocaleString()}</td>
                          <td className={detailTdNumClassName}>{r.acquisitionBreakdown.signboard.toLocaleString()}</td>
                          <td className={detailTdNumClassName}>{r.acquisitionBreakdown.sns.toLocaleString()}</td>
                          <td className={detailTdNumClassName}>{r.acquisitionBreakdown.unknown.toLocaleString()}</td>
                          <td className={detailTdNumClassName}>{totalNew.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-gray-100 font-bold">
                      <td className={detailTdNameClassName}>合計</td>
                      <td className={detailTdNumClassName}>{data.totals.acquisitionBreakdown.google.toLocaleString()}</td>
                      <td className={detailTdNumClassName}>{data.totals.acquisitionBreakdown.review.toLocaleString()}</td>
                      <td className={detailTdNumClassName}>{data.totals.acquisitionBreakdown.signboard.toLocaleString()}</td>
                      <td className={detailTdNumClassName}>{data.totals.acquisitionBreakdown.sns.toLocaleString()}</td>
                      <td className={detailTdNumClassName}>{data.totals.acquisitionBreakdown.unknown.toLocaleString()}</td>
                      <td className={detailTdNumClassName}>{(data.totals.acquisitionBreakdown.google + data.totals.acquisitionBreakdown.review + data.totals.acquisitionBreakdown.signboard + data.totals.acquisitionBreakdown.sns + data.totals.acquisitionBreakdown.unknown).toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
              <h3 className="text-md font-bold text-gray-900 mb-4">日次推移（客数）</h3>
              <LocationTrendChart
                locationSeries={data.rows.map((r) => ({
                  locationId: r.locationId,
                  locationName: r.locationName,
                  points: r.dailyTrend,
                }))}
                totalsSeries={data.totals.dailyTrend}
                allDates={data.allDates}
                metric="customers"
                colorMap={barColorsMap}
              />
            </div>

            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
              <h3 className="text-md font-bold text-gray-900 mb-4">日次推移（売上）</h3>
              <LocationTrendChart
                locationSeries={data.rows.map((r) => ({
                  locationId: r.locationId,
                  locationName: r.locationName,
                  points: r.dailyTrend,
                }))}
                totalsSeries={data.totals.dailyTrend}
                allDates={data.allDates}
                metric="sales"
                colorMap={barColorsMap}
              />
            </div>

            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
              <WeekdayLocationAnalysisSection
                locationSeries={data.rows.map((r) => ({
                  locationId: r.locationId,
                  locationName: r.locationName,
                  dailyTrend: r.dailyTrend,
                }))}
                colorMap={barColorsMap}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
