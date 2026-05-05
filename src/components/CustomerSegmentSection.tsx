import { formatYen } from '../utils';
import type { CustomerSegmentAnalysis, PeriodPreset, SegmentBreakdown, AcquisitionBreakdown, Transaction } from '../types';
import { SegmentPieChart, SegmentTrendChart, AcquisitionChart } from './charts';
import { PeriodSelector, Card, KpiSkeleton, EmptyState, ErrorState } from './ui';
import WeekdayAnalysisSection from './WeekdayAnalysisSection';
import OccupancyAnalysisSection from './sections/OccupancyAnalysisSection';

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
  startHour?: number;
  endHour?: number;
}

function SegmentCustomerCard({ label, count, sales, showCount = true }: { label: string; count: number; sales: number; showCount?: boolean }) {
  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-6">
      <p className="text-sm font-medium text-gray-500 mb-1">{label}</p>
      {showCount ? (
        <>
          <p className="text-2xl font-bold text-gray-900">{count.toLocaleString()}人</p>
          <p className="text-sm text-gray-500 mt-1">売上: {formatYen(sales)}</p>
        </>
      ) : (
        <p className="text-2xl font-bold text-gray-900">{formatYen(sales)}</p>
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
  startHour,
  endHour,
}: Props) {
  const totalSales = data ? data.totalSales : 0;
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
          <ErrorState variant="inline" tone="danger" title="データの取得に失敗しました" description={error} />
        )}

        {!loading && !error && !data && (
          <EmptyState title="データがありません" />
        )}

        {!loading && !error && data && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-6">
                <p className="text-sm font-medium text-gray-500 mb-1">期間売上</p>
                <p className="text-2xl font-bold text-gray-900">{formatYen(totalSales)}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {data.periodStart} 〜 {data.periodEnd} ({data.elapsedDays}日間)
                </p>
              </div>

              <div className="bg-gray-50 rounded-xl border border-gray-200 p-6">
                <p className="text-sm font-medium text-gray-500 mb-1">平均日売上</p>
                <p className="text-2xl font-bold text-gray-900">
                  {data.averageDailySales !== null ? formatYen(Math.round(data.averageDailySales)) : '--'}
                </p>
              </div>

              <div className="bg-gray-50 rounded-xl border border-gray-200 p-6">
                <p className="text-sm font-medium text-gray-500 mb-1">全体客単価</p>
                <p className="text-2xl font-bold text-gray-900">
                  {data.overallAveragePerCustomer !== null ? formatYen(Math.round(data.overallAveragePerCustomer)) : '--'}
                </p>
              </div>

              <div className="bg-gray-50 rounded-xl border border-gray-200 p-6">
                <p className="text-sm font-medium text-gray-500 mb-1">合計客数</p>
                <p className="text-2xl font-bold text-gray-900">
                  {(data.customersBySegment.new + data.customersBySegment.repeat + data.customersBySegment.regular + data.customersBySegment.staff).toLocaleString()}人
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  新規 {data.customersBySegment.new} / リピート {data.customersBySegment.repeat} / 常連 {data.customersBySegment.regular} / スタ {data.customersBySegment.staff}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {SEGMENT_LABELS.map(({ key, label }) => {
                const isUnlisted = key === 'unlisted';
                return (
                  <SegmentCustomerCard
                    key={key}
                    label={isUnlisted ? `${label}売上` : `${label}客数`}
                    count={data.customersBySegment[key]}
                    sales={data.salesBySegment[key]}
                    showCount={!isUnlisted}
                  />
                );
              })}
            </div>
          </>
        )}
      </Card>

      {!loading && !error && data && (
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
                    <div key={key} className="text-sm text-gray-700 flex items-center">
                      <span className="inline-block w-3 h-3 rounded-full mr-2 flex-shrink-0" style={{ backgroundColor: SALES_COLORS[key] }} />
                      <span>{label}: {formatYen(sales)} ({percent}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>

          <Card title="日次推移">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
              <div className="md:col-span-2">
                <SegmentTrendChart data={data.dailyTrend} />
              </div>
              <div className="max-h-[280px] overflow-y-auto space-y-2">
                {data.dailyTrend.map((day) => (
                  <div key={day.date} className="text-sm text-gray-700">
                    {day.date}: 合計{day.new + day.repeat + day.regular + day.staff}人（新{day.new}/リ{day.repeat}/常{day.regular}/ス{day.staff}/記{day.unlisted}）
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <WeekdayAnalysisSection dailyTrend={data.dailyTrend} />

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
                    <div key={key} className="text-sm text-gray-700 flex items-center">
                      <span className="inline-block w-3 h-3 rounded-full mr-2 flex-shrink-0" style={{ backgroundColor: color }} />
                      <span>{label}: {count}件 ({percent}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
