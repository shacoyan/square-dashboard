import { useMemo } from 'react';
import { formatYen } from '../utils';
import type { CustomerSegmentAnalysis, PeriodPreset, SegmentBreakdown, AcquisitionBreakdown, Transaction } from '../types';
import { SegmentPieChart, SegmentTrendChart, AcquisitionChart } from './charts';
import { PeriodSelector, Card, KpiSkeleton, ChartSkeleton, EmptyState, ErrorState } from './ui';
import { MSG } from '../lib/messages';
import { granularityFor, cardTitleByGranularity, formatBucketRangeLabel } from '../lib/trendAggregation';
import WeekdayAnalysisSection from './WeekdayAnalysisSection';
import OccupancyAnalysisSection from './sections/OccupancyAnalysisSection';
import { formatYoY, yoyClassToColorClass, calculateYoY, type SalesRangeYoYResult, type DailyTotalPoint, type YoYDelta } from '../lib/yoy';

interface Props {
  data: CustomerSegmentAnalysis | null;
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
  period: PeriodPreset;
  onPeriodChange: (p: PeriodPreset) => void;
  weekIndex: number;
  onWeekIndexChange: (n: number) => void;
  availableWeeks: number;
  quarterIndex: number;
  onQuarterIndexChange: (n: number) => void;
  startHour?: number;
  endHour?: number;
  // Phase 3 Team B: 2 段階ロード対応
  // detailAvailable: 将来の権限・機能フラグ等で false にする余地を残すため props は維持 (デフォルト true)
  detailAvailable?: boolean;
  detailLoading?: boolean;
  detailError?: string | null;
  // Phase 4 Team C: YoY 前年系列 (optional pass-through、SegmentTrendChart 客数線に重ね描き)
  yoy?: SalesRangeYoYResult | null;
  showYoY?: boolean;
}

function SegmentCustomerCard({
  label,
  count,
  sales,
  showCount = true,
  yoyDelta,
  showYoY,
}: {
  label: string;
  count: number;
  sales: number;
  showCount?: boolean;
  yoyDelta?: YoYDelta | null;
  showYoY?: boolean;
}) {
  return (
    <div className="bg-surface-muted rounded-xl border border-border p-6">
      <p className="text-sm font-medium text-text-muted mb-1">{label}</p>
      {showCount ? (
        <>
          <p className="text-2xl font-bold text-text">{count.toLocaleString()}人</p>
          <p className="text-sm text-text-muted mt-1">売上: {formatYen(sales)}</p>
        </>
      ) : (
        <p className="text-2xl font-bold text-text">{formatYen(sales)}</p>
      )}
      {showYoY && yoyDelta && (
        <p className={`text-xs mt-1 ${yoyClassToColorClass(yoyDelta.classification)}`}>
          {formatYoY(yoyDelta, {
            formatLastYear: showCount
              ? (v) => `${v.toLocaleString()}人`
              : formatYen,
          })}
        </p>
      )}
    </div>
  );
}

const SEGMENT_LABELS: { key: keyof SegmentBreakdown; label: string }[] = [
  { key: 'new', label: '新規' },
  { key: 'repeat', label: 'リピート' },
  { key: 'regular', label: '常連' },
  { key: 'staff', label: 'スタッフ' },
  { key: 'unlisted', label: '記載なし' },
];

const SALES_COLORS: Record<keyof SegmentBreakdown, string> = {
  new: '#3b82f6',
  repeat: '#eab308',
  regular: '#ef4444',
  staff: '#a855f7',
  unlisted: '#6b7280',
};

const ACQUISITION_CONFIG: { key: keyof AcquisitionBreakdown; label: string; color: string }[] = [
  { key: 'google', label: 'Google', color: '#4285f4' },
  { key: 'review', label: '口コミ', color: '#ea4335' },
  { key: 'signboard', label: '看板', color: '#fbbc04' },
  { key: 'sns', label: 'SNS', color: '#34a853' },
  { key: 'unknown', label: '打ち漏れ', color: '#9ca3af' }
];

export default function CustomerSegmentSection({
  data,
  transactions,
  loading,
  error,
  period,
  onPeriodChange,
  weekIndex,
  onWeekIndexChange,
  availableWeeks,
  quarterIndex,
  onQuarterIndexChange,
  startHour,
  endHour,
  detailAvailable = true,
  detailLoading = false,
  detailError = null,
  yoy = null,
  showYoY = false,
}: Props) {
  const totalSales = data ? data.totalSales : 0;

  // 前年同期の合計客数系列 (新+リピート+常連+スタッフ)。SegmentTrendChart は人数 metric なので customer_count を使用。
  // currentDate を併せて渡すことで、うるう年 (2/29) などのケースでも chart 側で当年軸へ正しくマップできる。
  const lastYearTotalsSeries = useMemo<DailyTotalPoint[] | undefined>(() => {
    if (!showYoY || !yoy?.byDate) return undefined;
    return yoy.byDate
      .filter(b => b.lastYear !== null)
      .map(b => ({ date: b.lastYearDate, total: b.lastYear!.customer_count, currentDate: b.business_date }));
  }, [yoy, showYoY]);

  // 派生 YoY: 平均日売上 / 全体客単価。
  // 当年値は data.averageDailySales / data.overallAveragePerCustomer をそのまま使い、
  // 前年値は yoy.lastYear から派生計算する。
  //   - 前年平均日売上   = lastYear.total_amount / 前年実在日数 (yoy.byDate で lastYear !== null の数)
  //   - 前年全体客単価   = lastYear.total_amount / lastYear.customer_count
  // 前年データがない場合 (yoy.lastYear === null) は calculateYoY が 'no_data' で返るよう null を渡す。
  const derivedYoY = useMemo<{ avgDaily: YoYDelta | null; perCustomer: YoYDelta | null }>(() => {
    if (!data) return { avgDaily: null, perCustomer: null };

    const lyTotal = yoy?.lastYear?.total_amount ?? null;
    const lyCustomerCount = yoy?.lastYear?.customer_count ?? null;
    const lyDays = yoy?.byDate.filter(b => b.lastYear !== null).length ?? 0;

    const lyAvgDaily = lyTotal !== null && lyDays > 0 ? lyTotal / lyDays : null;
    const lyPerCustomer = lyTotal !== null && lyCustomerCount !== null && lyCustomerCount > 0
      ? lyTotal / lyCustomerCount
      : null;

    const avgDaily = data.averageDailySales !== null
      ? calculateYoY(data.averageDailySales, lyAvgDaily)
      : null;
    const perCustomer = data.overallAveragePerCustomer !== null
      ? calculateYoY(data.overallAveragePerCustomer, lyPerCustomer)
      : null;

    return { avgDaily, perCustomer };
  }, [yoy, data]);
  const totalAcquisition = data
    ? ACQUISITION_CONFIG.reduce(
        (sum, item) => sum + (data.acquisitionBreakdown[item.key] || 0),
        0
      )
    : 0;

  return (
    <div className="space-y-6">
      <Card
        title="店舗データ分析"
        actions={
          <PeriodSelector
            period={period}
            onPeriodChange={onPeriodChange}
            weekIndex={weekIndex}
            onWeekIndexChange={onWeekIndexChange}
            availableWeeks={availableWeeks}
            quarterIndex={quarterIndex}
            onQuarterIndexChange={onQuarterIndexChange}
          />
        }
      >
        {loading && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}><KpiSkeleton /></Card>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}><KpiSkeleton /></Card>
              ))}
            </div>
          </div>
        )}

        {error && (
          <ErrorState variant="inline" tone="danger" title={MSG.error.fetch} description={error} />
        )}

        {!loading && !error && !data && (
          <EmptyState title={MSG.empty.generic} />
        )}

        {!loading && !error && data && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-surface-muted rounded-xl border border-border p-6">
                <p className="text-sm font-medium text-text-muted mb-1">期間売上</p>
                <p className="text-2xl font-bold text-text">{formatYen(totalSales)}</p>
                <p className="text-xs text-text-muted mt-1">
                  {data.periodStart} 〜 {data.periodEnd} ({data.elapsedDays}日間)
                </p>
                {showYoY && yoy?.yoy.total_amount && (
                  <p className={`text-xs mt-1 ${yoyClassToColorClass(yoy.yoy.total_amount.classification)}`}>
                    {formatYoY(yoy.yoy.total_amount, { formatLastYear: formatYen })}
                  </p>
                )}
              </div>

              <div className="bg-surface-muted rounded-xl border border-border p-6">
                <p className="text-sm font-medium text-text-muted mb-1">平均日売上</p>
                <p className="text-2xl font-bold text-text">
                  {data.averageDailySales !== null ? formatYen(Math.round(data.averageDailySales)) : '--'}
                </p>
                {showYoY && derivedYoY.avgDaily && (
                  <p className={`text-xs mt-1 ${yoyClassToColorClass(derivedYoY.avgDaily.classification)}`}>
                    {formatYoY(derivedYoY.avgDaily, { formatLastYear: (v) => formatYen(Math.round(v)) })}
                  </p>
                )}
              </div>

              <div className="bg-surface-muted rounded-xl border border-border p-6">
                <p className="text-sm font-medium text-text-muted mb-1">全体客単価</p>
                <p className="text-2xl font-bold text-text">
                  {data.overallAveragePerCustomer !== null ? formatYen(Math.round(data.overallAveragePerCustomer)) : '--'}
                </p>
                {showYoY && derivedYoY.perCustomer && (
                  <p className={`text-xs mt-1 ${yoyClassToColorClass(derivedYoY.perCustomer.classification)}`}>
                    {formatYoY(derivedYoY.perCustomer, { formatLastYear: (v) => formatYen(Math.round(v)) })}
                  </p>
                )}
              </div>

              <div className="bg-surface-muted rounded-xl border border-border p-6">
                <p className="text-sm font-medium text-text-muted mb-1">合計客数</p>
                <p className="text-2xl font-bold text-text">
                  {(data.customersBySegment.new + data.customersBySegment.repeat + data.customersBySegment.regular + data.customersBySegment.staff).toLocaleString()}人
                </p>
                <p className="text-xs text-text-muted mt-1">
                  新規 {data.customersBySegment.new} / リピート {data.customersBySegment.repeat} / 常連 {data.customersBySegment.regular} / スタ {data.customersBySegment.staff}
                </p>
                {showYoY && yoy?.yoy.customer_count && (
                  <p className={`text-xs mt-1 ${yoyClassToColorClass(yoy.yoy.customer_count.classification)}`}>
                    {formatYoY(yoy.yoy.customer_count, { formatLastYear: (v) => `${v.toLocaleString()}人` })}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {SEGMENT_LABELS.map(({ key, label }) => {
                const isUnlisted = key === 'unlisted';
                const segmentYoYMap: Partial<Record<keyof SegmentBreakdown, YoYDelta | undefined>> = {
                  new: yoy?.yoy.new_customer_count,
                  repeat: yoy?.yoy.repeat_customer_count,
                  regular: yoy?.yoy.regular_customer_count,
                  staff: yoy?.yoy.staff_customer_count,
                };
                return (
                  <SegmentCustomerCard
                    key={key}
                    label={isUnlisted ? `${label}売上` : `${label}客数`}
                    count={data.customersBySegment[key]}
                    sales={data.salesBySegment[key]}
                    showCount={!isUnlisted}
                    yoyDelta={segmentYoYMap[key]}
                    showYoY={showYoY}
                  />
                );
              })}
            </div>
          </>
        )}
      </Card>

      {!loading && !error && data && (() => {
        const granularity = granularityFor(period);
        const trendCardTitle = cardTitleByGranularity(granularity);
        return (
        <>
          <Card title="売上構成">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
              <div className="md:col-span-2">
                <SegmentPieChart sales={data.salesBySegment} />
              </div>
              <div className="space-y-2">
                {SEGMENT_LABELS.map(({ key, label }) => {
                  const sales = data.salesBySegment[key];
                  const percent = totalSales > 0 ? Math.round((sales / totalSales) * 100) : 0;
                  return (
                    <div key={key} className="text-sm text-text-muted flex items-center">
                      <span className="inline-block w-3 h-3 rounded-full mr-2 flex-shrink-0" style={{ backgroundColor: SALES_COLORS[key] }} />
                      <span>{label}: {formatYen(sales)} ({percent}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>

          <Card title={trendCardTitle}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
              <div className="md:col-span-2">
                <SegmentTrendChart
                  data={data.dailyTrend}
                  period={period}
                  lastYearTotalsSeries={lastYearTotalsSeries}
                  showYoY={showYoY}
                />
              </div>
              <div className="max-h-[280px] overflow-y-auto space-y-2">
                {data.dailyTrend.map((day) => (
                  <div key={day.date} className="text-sm text-text-muted">
                    {formatBucketRangeLabel(day.date, granularity)}: 合計{day.new + day.repeat + day.regular + day.staff}人（新{day.new}/リ{day.repeat}/常{day.regular}/ス{day.staff}/記{day.unlisted}）
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {granularity === 'daily' && (
            <WeekdayAnalysisSection dailyTrend={data.dailyTrend} />
          )}

          {detailAvailable && detailLoading && (
            <>
              <Card title="新規獲得経路">
                <ChartSkeleton heightPreset="standard" />
              </Card>
              <Card title="着座分析">
                <ChartSkeleton heightPreset="standard" />
              </Card>
            </>
          )}

          {detailAvailable && !detailLoading && (
            <>
              <OccupancyAnalysisSection transactions={transactions} startHour={startHour} endHour={endHour} />

              <Card title="新規獲得経路">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                  <div className="md:col-span-2">
                    <AcquisitionChart data={data.acquisitionBreakdown} />
                  </div>
                  <div className="space-y-2">
                    {ACQUISITION_CONFIG.map(({ key, label, color }) => {
                      const count = data.acquisitionBreakdown[key] || 0;
                      const percent = totalAcquisition > 0 ? Math.round((count / totalAcquisition) * 100) : 0;
                      return (
                        <div key={key} className="text-sm text-text-muted flex items-center">
                          <span className="inline-block w-3 h-3 rounded-full mr-2 flex-shrink-0" style={{ backgroundColor: color }} />
                          <span>{label}: {count}件 ({percent}%)</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>

              {detailError && (
                <ErrorState
                  variant="inline"
                  tone="warning"
                  role="status"
                  title="明細データの一部取得に失敗しました"
                  description={detailError}
                />
              )}
            </>
          )}
        </>
        );
      })()}
    </div>
  );
}
