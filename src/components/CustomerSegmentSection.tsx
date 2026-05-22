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
  // 前年同期の合計客数系列 (新+リピート+常連+スタッフ)。SegmentTrendChart は人数 metric なので customer_count を使用。
  // currentDate を併せて渡すことで、うるう年 (2/29) などのケースでも chart 側で当年軸へ正しくマップできる。
  const lastYearTotalsSeries = useMemo<DailyTotalPoint[] | undefined>(() => {
    if (!showYoY || !yoy?.byDate) return undefined;
    return yoy.byDate
      .filter(b => b.lastYear !== null)
      .map(b => ({ date: b.lastYearDate, total: b.lastYear!.customer_count, currentDate: b.business_date }));
  }, [yoy, showYoY]);

  // 派生 YoY: 平均日売上 / 全体客単価。
  // 当年値は yoy.current (sales-range 集計テーブル由来) から派生計算し、
  // 前年値は yoy.lastYear から派生計算する。計算式を当年 / 前年で統一。
  //   - 当年平均日売上   = current.total_amount / 当年期間日数 (yoy.byDate.length、current は常に存在)
  //   - 当年全体客単価   = current.total_amount / (new + repeat + regular + staff) 客数合計
  //   - 前年平均日売上   = lastYear.total_amount / 前年実在日数 (yoy.byDate で lastYear !== null の数)
  //   - 前年全体客単価   = lastYear.total_amount / (new + repeat + regular + staff) 客数合計
  // 客単価は 4 セグメント客数合計を分母とする (unlisted は除外)。
  // 前年データがない場合 (yoy.lastYear === null) は calculateYoY が 'no_data' で返るよう null を渡す。
  const derivedYoY = useMemo<{ avgDaily: YoYDelta | null; perCustomer: YoYDelta | null }>(() => {
    if (!yoy) return { avgDaily: null, perCustomer: null };

    const curTotal = yoy.current.total_amount;
    const curSegmentTotal = (yoy.current.new_customer_count ?? 0)
      + (yoy.current.repeat_customer_count ?? 0)
      + (yoy.current.regular_customer_count ?? 0)
      + (yoy.current.staff_customer_count ?? 0);
    const curDays = yoy.byDate.length;

    const curAvgDaily = curDays > 0 ? curTotal / curDays : null;
    const curPerCustomer = curSegmentTotal > 0 ? curTotal / curSegmentTotal : null;

    const lyTotal = yoy.lastYear?.total_amount ?? null;
    const lySegmentTotal = yoy.lastYear
      ? (yoy.lastYear.new_customer_count ?? 0)
        + (yoy.lastYear.repeat_customer_count ?? 0)
        + (yoy.lastYear.regular_customer_count ?? 0)
        + (yoy.lastYear.staff_customer_count ?? 0)
      : null;
    const lyDays = yoy.byDate.filter(b => b.lastYear !== null).length;

    const lyAvgDaily = lyTotal !== null && lyDays > 0 ? lyTotal / lyDays : null;
    const lyPerCustomer = lyTotal !== null && lySegmentTotal !== null && lySegmentTotal > 0
      ? lyTotal / lySegmentTotal
      : null;

    const avgDaily = curAvgDaily !== null ? calculateYoY(curAvgDaily, lyAvgDaily) : null;
    const perCustomer = curPerCustomer !== null ? calculateYoY(curPerCustomer, lyPerCustomer) : null;

    return { avgDaily, perCustomer };
  }, [yoy]);

  // UI 表示の合計売上 / 合計客数 / 客単価 / 平均日売上 / 各セグメント客数を yoy.current 由来に統一する。
  // これで derivedYoY (YoY 計算) と表示値の data source が完全一致し整合性を保つ。
  // yoy が無い場合 (showYoY=false など) は従来の data 由来にフォールバック。
  const displayMetrics = useMemo(() => {
    if (!data) return null;
    if (yoy?.current) {
      const cur = yoy.current;
      const segTotal = (cur.new_customer_count ?? 0)
        + (cur.repeat_customer_count ?? 0)
        + (cur.regular_customer_count ?? 0)
        + (cur.staff_customer_count ?? 0);
      // 未決済含む合計売上 (オーナー要望: 全店舗比較と店舗データ分析で売上値を統一)
      const totalWithOpen = (cur.total_amount ?? 0) + (cur.open_total_amount ?? 0);
      return {
        totalSales: totalWithOpen,
        totalCustomers: segTotal,
        overallAveragePerCustomer: segTotal > 0 ? totalWithOpen / segTotal : null,
        averageDailySales: yoy.byDate.length > 0 ? totalWithOpen / yoy.byDate.length : null,
        newCount: cur.new_customer_count ?? 0,
        repeatCount: cur.repeat_customer_count ?? 0,
        regularCount: cur.regular_customer_count ?? 0,
        staffCount: cur.staff_customer_count ?? 0,
        unlistedCount: cur.unlisted_customer_count ?? 0,
      };
    }
    return {
      totalSales: data.totalSales,
      totalCustomers: data.totalCustomers,
      overallAveragePerCustomer: data.overallAveragePerCustomer,
      averageDailySales: data.averageDailySales,
      newCount: data.customersBySegment?.new ?? 0,
      repeatCount: data.customersBySegment?.repeat ?? 0,
      regularCount: data.customersBySegment?.regular ?? 0,
      staffCount: data.customersBySegment?.staff ?? 0,
      unlistedCount: data.customersBySegment?.unlisted ?? 0,
    };
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
                <p className="text-2xl font-bold text-text">{formatYen(displayMetrics?.totalSales ?? 0)}</p>
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
                  {displayMetrics?.averageDailySales != null ? formatYen(Math.round(displayMetrics.averageDailySales)) : '--'}
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
                  {displayMetrics?.overallAveragePerCustomer != null ? formatYen(Math.round(displayMetrics.overallAveragePerCustomer)) : '--'}
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
                  {(displayMetrics?.totalCustomers ?? 0).toLocaleString()}人
                </p>
                <p className="text-xs text-text-muted mt-1">
                  新規 {displayMetrics?.newCount ?? 0} / リピート {displayMetrics?.repeatCount ?? 0} / 常連 {displayMetrics?.regularCount ?? 0} / スタ {displayMetrics?.staffCount ?? 0}
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
                const segmentCountMap: Record<keyof SegmentBreakdown, number> = {
                  new: displayMetrics?.newCount ?? 0,
                  repeat: displayMetrics?.repeatCount ?? 0,
                  regular: displayMetrics?.regularCount ?? 0,
                  staff: displayMetrics?.staffCount ?? 0,
                  unlisted: displayMetrics?.unlistedCount ?? 0,
                };
                return (
                  <SegmentCustomerCard
                    key={key}
                    label={isUnlisted ? `${label}売上` : `${label}客数`}
                    count={segmentCountMap[key]}
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
                  const totalSalesForPercent = displayMetrics?.totalSales ?? 0;
                  const percent = totalSalesForPercent > 0 ? Math.round((sales / totalSalesForPercent) * 100) : 0;
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
