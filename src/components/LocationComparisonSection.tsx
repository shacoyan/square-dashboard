import { useState } from 'react';
import type { Location, PeriodPreset, LocationSegmentRow } from '../types';
import { useMultiLocationSegment } from '../hooks/useMultiLocationSegment';
import { LocationBarChart, LocationStackChart, LocationTrendChart } from './charts';
import { formatYen } from '../utils';

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
  } = props;

  const [expanded, setExpanded] = useState(
    () => localStorage.getItem('sq_location_compare_expanded') === '1'
  );

  const { data, loading, error } = useMultiLocationSegment({
    token,
    locations,
    period,
    baseDate,
    startHour,
    endHour,
    weekIndex,
    enabled: expanded && locations.length > 0,
  });

  const toggleExpanded = () => {
    const n = !expanded;
    setExpanded(n);
    localStorage.setItem('sq_location_compare_expanded', n ? '1' : '0');
  };

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

  return (
    <div className="bg-white rounded-xl shadow">
      <button
        type="button"
        className="w-full flex items-center justify-between p-6"
        aria-expanded={expanded}
        aria-controls="location-compare-body"
        onClick={toggleExpanded}
      >
        <h2 className="text-lg font-bold text-gray-900">全店舗比較</h2>
        <span className="text-gray-500 transition-transform">
          {expanded ? '▼' : '▶'}
        </span>
      </button>

      {expanded && (
        <div id="location-compare-body" className="p-6 pt-0 space-y-6">
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
              <div className="overflow-x-auto -mx-6 px-6">
                <table className="min-w-[1100px] w-full text-sm">
                  <thead className="bg-gray-100">
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

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                  <h3 className="text-md font-bold text-gray-900 mb-4">店舗別 売上・客数</h3>
                  <LocationBarChart
                    rows={data.rows.map((r) => ({
                      locationName: r.locationName,
                      totalSales: r.totalSales,
                      totalCustomers: r.totalCustomers,
                    }))}
                  />
                </div>

                <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                  <h3 className="text-md font-bold text-gray-900 mb-4">店舗別 セグメント構成（客数）</h3>
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
                </div>

                <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                  <h3 className="text-md font-bold text-gray-900 mb-4">店舗別 獲得経路</h3>
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
                  />
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
