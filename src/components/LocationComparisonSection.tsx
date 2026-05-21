import React from 'react';
import type { Location, PeriodPreset, LocationSegmentRow } from '../types';
import { useMultiLocationSegment } from '../hooks/useMultiLocationSegment';
import { LocationBarChart, LocationStackChart, LocationTrendChart } from './charts';
import { PeriodSelector, Card, TableSkeleton, ChartSkeleton, EmptyState, ErrorState } from './ui';
import { MSG } from '../lib/messages';
import { formatYen } from '../utils';
import WeekdayLocationAnalysisSection from './WeekdayLocationAnalysisSection';
import { getLocationColors } from '../lib/locationColors';
import { granularityFor, cardTitleByGranularity } from '../lib/trendAggregation';
import type { DailyTotalPoint, SalesRangeYoYResult, YoYDelta } from '../lib/yoy';
import { calculateYoY, formatYoY, yoyClassToColorClass } from '../lib/yoy';

import OccupancyAnalysisSection from './sections/OccupancyAnalysisSection';

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

interface Props {
  token: string;
  locations: Location[];
  period: PeriodPreset;
  onPeriodChange: (p: PeriodPreset) => void;
  weekIndex: number;
  onWeekIndexChange: (n: number) => void;
  availableWeeks: number;
  quarterIndex: number;
  onQuarterIndexChange: (n: number) => void;
  baseDate: string;
  startHour: number;
  endHour: number;
  enabled: boolean;
  /** Phase 4 Team C: YoY 前年系列を LocationTrendChart に重ね描き */
  showYoY?: boolean;
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
    quarterIndex,
    onQuarterIndexChange,
    baseDate,
    startHour,
    endHour,
    enabled,
    showYoY = false,
  } = props;

  const { data, loading, error, detailAvailable = true, detailLoading = false, detailError, yoy, locationYoy } = useMultiLocationSegment({
    token,
    locations,
    period,
    baseDate,
    startHour,
    endHour,
    weekIndex,
    quarterIndex,
    enabled: enabled && locations.length > 0,
    enableYoy: showYoY,
  });

  // 前年合計系列を metric (customers / sales) ごとに事前算出
  // currentDate を併せて渡すことで、うるう年 (2/29) などのケースでも chart 側で当年軸へ正しくマップできる。
  const lastYearTotalsCustomers = React.useMemo<DailyTotalPoint[] | undefined>(() => {
    if (!showYoY || !yoy?.byDate) return undefined;
    return yoy.byDate
      .filter(b => b.lastYear !== null)
      .map(b => ({ date: b.lastYearDate, total: b.lastYear!.customer_count, currentDate: b.business_date }));
  }, [yoy, showYoY]);

  const lastYearTotalsSales = React.useMemo<DailyTotalPoint[] | undefined>(() => {
    if (!showYoY || !yoy?.byDate) return undefined;
    return yoy.byDate
      .filter(b => b.lastYear !== null)
      .map(b => ({ date: b.lastYearDate, total: b.lastYear!.total_amount, currentDate: b.business_date }));
  }, [yoy, showYoY]);

  const barColorsMap = React.useMemo(
    () => getLocationColors(data ? data.rows.map(r => r.locationId) : []),
    [data]
  );

  const granularity = granularityFor(period);
  const trendPrefix = cardTitleByGranularity(granularity);

  // 行ごとの YoY ヘルパー: 行の locationId (合計行は null) から YoY セットを返す
  // - 売上 / 客数 は SalesRangeYoYResult から直接取得
  // - 平均日売上 / 客単価 は current/lastYear から派生計算して YoY を組み立てる
  const getRowYoy = (locationId: string | null): {
    totalSales: YoYDelta;
    avgDailySales: YoYDelta;
    perCustomer: YoYDelta;
    customers: YoYDelta;
  } | null => {
    if (!showYoY) return null;
    const yoyData: SalesRangeYoYResult | null | undefined = locationId === null
      ? yoy
      : (locationYoy ? locationYoy[locationId] : undefined);
    if (!yoyData) return null;
    const cur = yoyData.current;
    const ly = yoyData.lastYear;
    const daysCur = yoyData.byDate.length;
    const daysLy = yoyData.byDate.filter(b => b.lastYear !== null).length;
    const avgDailyCur = daysCur > 0 ? cur.total_amount / daysCur : 0;
    const avgDailyLy = ly && daysLy > 0 ? ly.total_amount / daysLy : null;
    const perCusCur = cur.customer_count > 0 ? cur.total_amount / cur.customer_count : 0;
    const perCusLy = ly && ly.customer_count > 0 ? ly.total_amount / ly.customer_count : null;
    return {
      totalSales: yoyData.yoy.total_amount,
      customers: yoyData.yoy.customer_count,
      avgDailySales: calculateYoY(avgDailyCur, avgDailyLy),
      perCustomer: calculateYoY(perCusCur, perCusLy),
    };
  };

  // YoY 小行 (数値セルの下に「↑ +12.3%」を表示)
  const renderYoyHint = (delta: YoYDelta | undefined) => {
    if (!delta) return null;
    return (
      <div className={`text-[10px] ${yoyClassToColorClass(delta.classification)} leading-tight`}>
        {formatYoY(delta, { compact: true })}
      </div>
    );
  };

  type RowInput = LocationSegmentRow | Omit<LocationSegmentRow, 'locationId' | 'locationName' | 'loadError' | 'partialFailure' | 'transactions'>;
  const renderRow = (row: RowInput, isTotal = false) => {
    const rowTyped = row as LocationSegmentRow;
    const hasError = !isTotal && rowTyped.loadError;
    const hasPartialFailure = !isTotal && rowTyped.partialFailure !== null;
    const nameBg = isTotal
      ? 'bg-surface-muted font-bold'
      : hasPartialFailure
        ? 'bg-warning-50'
        : 'bg-white';

    const rowYoy = getRowYoy(isTotal ? null : rowTyped.locationId);

    return (
      <tr key={isTotal ? 'totals' : rowTyped.locationId} className={`border-b border-border ${isTotal ? 'font-bold bg-surface-muted' : ''} ${hasPartialFailure ? 'bg-warning-50' : ''}`}>
        <td className={`${TD_NAME} ${nameBg}`}>
          {isTotal ? '合計' : rowTyped.locationName}
          {hasPartialFailure && <span className="text-warning-800 ml-1">※</span>}
          {hasError && (
            <span className="text-xs text-danger ml-1">({rowTyped.loadError})</span>
          )}
        </td>
        <td className={TD_NUM}>
          {formatYen(row.totalSales)}
          {renderYoyHint(rowYoy?.totalSales)}
        </td>
        <td className={TD_NUM}>
          {row.averageDailySales !== null ? formatYen(Math.round(row.averageDailySales)) : '--'}
          {hasPartialFailure && <span className="text-xs text-warning-800 block">（{rowTyped.partialFailure!.failedDays}日失敗）</span>}
          {renderYoyHint(rowYoy?.avgDailySales)}
        </td>
        <td className={TD_NUM}>
          {row.overallAveragePerCustomer !== null ? formatYen(Math.round(row.overallAveragePerCustomer)) : '--'}
          {renderYoyHint(rowYoy?.perCustomer)}
        </td>
        <td className={TD_NUM}>
          {row.totalCustomers.toLocaleString()}
          {renderYoyHint(rowYoy?.customers)}
        </td>
        <td className={TD_NUM}>{row.customersBySegment.new.toLocaleString()}</td>
        <td className={TD_NUM}>{row.customersBySegment.repeat.toLocaleString()}</td>
        <td className={TD_NUM}>{row.customersBySegment.regular.toLocaleString()}</td>
        <td className={TD_NUM}>{row.customersBySegment.staff.toLocaleString()}</td>
        <td className={TD_NUM}>{formatYen(row.salesBySegment.unlisted)}</td>
        {detailAvailable && detailLoading && (
          <>
            <td className={TD_NUM}>--</td>
            <td className={TD_NUM}>--</td>
            <td className={TD_NUM}>--</td>
            <td className={TD_NUM}>--</td>
            <td className={TD_NUM}>--</td>
          </>
        )}
        {detailAvailable && !detailLoading && (
          <>
            <td className={TD_NUM}>{row.acquisitionBreakdown.google.toLocaleString()}</td>
            <td className={TD_NUM}>{row.acquisitionBreakdown.review.toLocaleString()}</td>
            <td className={TD_NUM}>{row.acquisitionBreakdown.signboard.toLocaleString()}</td>
            <td className={TD_NUM}>{row.acquisitionBreakdown.sns.toLocaleString()}</td>
            <td className={TD_NUM}>{row.acquisitionBreakdown.unknown.toLocaleString()}</td>
          </>
        )}
      </tr>
    );
  };

  const detailThClassName = "px-2 py-1 text-right tabular-nums bg-surface-muted font-medium text-text-muted";
  const detailThNameClassName = "px-2 py-1 text-left bg-surface-muted font-medium text-text-muted";
  const detailTdNumClassName = "px-2 py-1 text-right tabular-nums";
  const detailTdNameClassName = "px-2 py-1 text-left whitespace-nowrap";

  return (
    <Card title="全店舗比較" actions={
      <PeriodSelector
        period={period}
        onPeriodChange={onPeriodChange}
        weekIndex={weekIndex}
        onWeekIndexChange={onWeekIndexChange}
        availableWeeks={availableWeeks}
        quarterIndex={quarterIndex}
        onQuarterIndexChange={onQuarterIndexChange}
      />
    }>
      <div className="space-y-6">
        {loading && (
          <div className="space-y-4">
            <TableSkeleton rows={6} rowHeight={32} />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card padded={false} className="p-4"><ChartSkeleton heightPreset="compact" /></Card>
              <Card padded={false} className="p-4"><ChartSkeleton heightPreset="compact" /></Card>
              <Card padded={false} className="p-4"><ChartSkeleton heightPreset="compact" /></Card>
            </div>
          </div>
        )}

        {error && !data && (
          <ErrorState variant="inline" tone="danger" title={MSG.error.fetch} description={error} />
        )}

        {error && data && (
          <ErrorState variant="inline" tone="warning" title="一部の店舗データの取得に失敗しました" description={error} />
        )}

        {!loading && !error && !data && (
          <EmptyState title={MSG.empty.locations} />
        )}

        {data && (
          <>
            <div className="overflow-auto -mx-5 px-5 max-h-[70vh]">
              <table className="min-w-[1100px] w-full text-sm">
                <thead className="bg-surface-subtle sticky top-0 z-20">
                  <tr className="border-b border-border">
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
                    {detailAvailable && (
                      <>
                        <th className="px-3 py-2 text-right whitespace-nowrap">Google</th>
                        <th className="px-3 py-2 text-right whitespace-nowrap">口コミ</th>
                        <th className="px-3 py-2 text-right whitespace-nowrap">看板</th>
                        <th className="px-3 py-2 text-right whitespace-nowrap">SNS</th>
                        <th className="px-3 py-2 text-right whitespace-nowrap">不明</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => renderRow(row))}
                  {renderRow(data.totals, true)}
                </tbody>
              </table>
              {data.rows.some(r => r.partialFailure !== null) && (
                <p className="text-xs text-warning-800 mt-2">※ 一部日付のデータ取得に失敗した店舗です。平均日売上は全期間日数で按分しているため実績より低く表示されている可能性があります。</p>
              )}
            </div>

            {detailAvailable && detailError && (
              <ErrorState
                variant="inline"
                tone="warning"
                role="status"
                title="明細データの一部取得に失敗しました"
                description={detailError}
              />
            )}

            <div className="grid grid-cols-1 gap-6">
              <div className="bg-surface-muted rounded-xl border border-border p-4">
                <h3 className="text-md font-bold text-text mb-4">店舗別 売上・客数</h3>
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
                      {data.rows.map((r) => {
                        const ry = getRowYoy(r.locationId);
                        return (
                          <tr key={r.locationId} className="border-b border-border">
                            <td className={detailTdNameClassName}>{r.locationName}</td>
                            <td className={detailTdNumClassName}>
                              {formatYen(r.totalSales)}
                              {renderYoyHint(ry?.totalSales)}
                            </td>
                            <td className={detailTdNumClassName}>
                              {r.totalCustomers.toLocaleString()}
                              {renderYoyHint(ry?.customers)}
                            </td>
                            <td className={detailTdNumClassName}>
                              {r.overallAveragePerCustomer !== null ? formatYen(Math.round(r.overallAveragePerCustomer)) : '--'}
                              {renderYoyHint(ry?.perCustomer)}
                            </td>
                          </tr>
                        );
                      })}
                      {(() => {
                        const ty = getRowYoy(null);
                        return (
                          <tr className="bg-surface-subtle font-bold">
                            <td className={detailTdNameClassName}>合計</td>
                            <td className={detailTdNumClassName}>
                              {formatYen(data.totals.totalSales)}
                              {renderYoyHint(ty?.totalSales)}
                            </td>
                            <td className={detailTdNumClassName}>
                              {data.totals.totalCustomers.toLocaleString()}
                              {renderYoyHint(ty?.customers)}
                            </td>
                            <td className={detailTdNumClassName}>
                              {data.totals.overallAveragePerCustomer !== null ? formatYen(Math.round(data.totals.overallAveragePerCustomer)) : '--'}
                              {renderYoyHint(ty?.perCustomer)}
                            </td>
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-surface-muted rounded-xl border border-border p-4">
                <h3 className="text-md font-bold text-text mb-4">店舗別 お客様構成</h3>
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
                          <tr key={r.locationId} className="border-b border-border">
                            <td className={detailTdNameClassName}>{r.locationName}</td>
                            <td className={detailTdNumClassName}>{r.customersBySegment.new.toLocaleString()}{totalSegment !== 0 && <span className="text-text-muted ml-1 text-[10px]">({Math.round((r.customersBySegment.new / totalSegment) * 100)}%)</span>}</td>
                            <td className={detailTdNumClassName}>{r.customersBySegment.repeat.toLocaleString()}{totalSegment !== 0 && <span className="text-text-muted ml-1 text-[10px]">({Math.round((r.customersBySegment.repeat / totalSegment) * 100)}%)</span>}</td>
                            <td className={detailTdNumClassName}>{r.customersBySegment.regular.toLocaleString()}{totalSegment !== 0 && <span className="text-text-muted ml-1 text-[10px]">({Math.round((r.customersBySegment.regular / totalSegment) * 100)}%)</span>}</td>
                            <td className={detailTdNumClassName}>{r.customersBySegment.staff.toLocaleString()}{totalSegment !== 0 && <span className="text-text-muted ml-1 text-[10px]">({Math.round((r.customersBySegment.staff / totalSegment) * 100)}%)</span>}</td>
                            <td className={detailTdNumClassName}>{r.customersBySegment.unlisted.toLocaleString()}{totalSegment !== 0 && <span className="text-text-muted ml-1 text-[10px]">({Math.round((r.customersBySegment.unlisted / totalSegment) * 100)}%)</span>}</td>
                            <td className={detailTdNumClassName}>{totalSegment.toLocaleString()}</td>
                          </tr>
                        );
                      })}
                      <tr className="bg-surface-subtle font-bold">
                        <td className={detailTdNameClassName}>合計</td>
                        <td className={detailTdNumClassName}>{data.totals.customersBySegment.new.toLocaleString()}{(() => { const total = data.totals.customersBySegment.new + data.totals.customersBySegment.repeat + data.totals.customersBySegment.regular + data.totals.customersBySegment.staff + data.totals.customersBySegment.unlisted; return total !== 0 ? <span className="text-text-muted ml-1 text-[10px]">({Math.round((data.totals.customersBySegment.new / total) * 100)}%)</span> : null; })()}</td>
                        <td className={detailTdNumClassName}>{data.totals.customersBySegment.repeat.toLocaleString()}{(() => { const total = data.totals.customersBySegment.new + data.totals.customersBySegment.repeat + data.totals.customersBySegment.regular + data.totals.customersBySegment.staff + data.totals.customersBySegment.unlisted; return total !== 0 ? <span className="text-text-muted ml-1 text-[10px]">({Math.round((data.totals.customersBySegment.repeat / total) * 100)}%)</span> : null; })()}</td>
                        <td className={detailTdNumClassName}>{data.totals.customersBySegment.regular.toLocaleString()}{(() => { const total = data.totals.customersBySegment.new + data.totals.customersBySegment.repeat + data.totals.customersBySegment.regular + data.totals.customersBySegment.staff + data.totals.customersBySegment.unlisted; return total !== 0 ? <span className="text-text-muted ml-1 text-[10px]">({Math.round((data.totals.customersBySegment.regular / total) * 100)}%)</span> : null; })()}</td>
                        <td className={detailTdNumClassName}>{data.totals.customersBySegment.staff.toLocaleString()}{(() => { const total = data.totals.customersBySegment.new + data.totals.customersBySegment.repeat + data.totals.customersBySegment.regular + data.totals.customersBySegment.staff + data.totals.customersBySegment.unlisted; return total !== 0 ? <span className="text-text-muted ml-1 text-[10px]">({Math.round((data.totals.customersBySegment.staff / total) * 100)}%)</span> : null; })()}</td>
                        <td className={detailTdNumClassName}>{data.totals.customersBySegment.unlisted.toLocaleString()}{(() => { const total = data.totals.customersBySegment.new + data.totals.customersBySegment.repeat + data.totals.customersBySegment.regular + data.totals.customersBySegment.staff + data.totals.customersBySegment.unlisted; return total !== 0 ? <span className="text-text-muted ml-1 text-[10px]">({Math.round((data.totals.customersBySegment.unlisted / total) * 100)}%)</span> : null; })()}</td>
                        <td className={detailTdNumClassName}>{(data.totals.customersBySegment.new + data.totals.customersBySegment.repeat + data.totals.customersBySegment.regular + data.totals.customersBySegment.staff + data.totals.customersBySegment.unlisted).toLocaleString()}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {detailAvailable && detailLoading && (
                <div className="bg-surface-muted rounded-xl border border-border p-4">
                  <h3 className="text-md font-bold text-text mb-4">店舗別 新規獲得経路</h3>
                  <ChartSkeleton heightPreset="standard" />
                </div>
              )}

              {detailAvailable && !detailLoading && (
              <div className="bg-surface-muted rounded-xl border border-border p-4">
                <h3 className="text-md font-bold text-text mb-4">店舗別 新規獲得経路</h3>
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
                          <tr key={r.locationId} className="border-b border-border">
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
                      <tr className="bg-surface-subtle font-bold">
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
              )}

              <div className="bg-surface-muted rounded-xl border border-border p-4">
                <h3 className="text-md font-bold text-text mb-4">{`${trendPrefix}（客数）`}</h3>
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
                  period={period}
                  lastYearTotalsSeries={lastYearTotalsCustomers}
                  showYoY={showYoY}
                />
              </div>

              <div className="bg-surface-muted rounded-xl border border-border p-4">
                <h3 className="text-md font-bold text-text mb-4">{`${trendPrefix}（売上）`}</h3>
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
                  period={period}
                  lastYearTotalsSeries={lastYearTotalsSales}
                  showYoY={showYoY}
                />
              </div>

              {granularity === 'daily' && (
                <div className="bg-surface-muted rounded-xl border border-border p-4">
                  <WeekdayLocationAnalysisSection
                    locationSeries={data.rows.map((r) => ({
                      locationId: r.locationId,
                      locationName: r.locationName,
                      dailyTrend: r.dailyTrend,
                    }))}
                    colorMap={barColorsMap}
                  />
                </div>
              )}

              {detailAvailable && detailLoading && (
                <div className="bg-surface-muted rounded-xl border border-border p-2 md:p-4">
                  <h3 className="text-md font-bold text-text mb-4">着座分析</h3>
                  <ChartSkeleton heightPreset="standard" />
                </div>
              )}

              {detailAvailable && !detailLoading && (
                <div className="bg-surface-muted rounded-xl border border-border p-2 md:p-4">
                  <OccupancyAnalysisSection transactions={data.rows.flatMap((r) => r.transactions ?? [])} startHour={startHour} endHour={endHour} />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
