import { formatYen } from '../utils';
import type { CustomerSegmentAnalysis, PeriodPreset, SegmentBreakdown } from '../types';
import { SegmentPieChart, SegmentTrendChart, AcquisitionChart } from './charts';

interface Props {
  data: CustomerSegmentAnalysis | null;
  loading: boolean;
  error: string | null;
  period: PeriodPreset;
  onPeriodChange: (p: PeriodPreset) => void;
}

const PERIOD_TABS: { key: PeriodPreset; label: string }[] = [
  { key: 'today', label: '今日' },
  { key: 'week', label: '今週' },
  { key: 'month', label: '今月' },
];

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl shadow p-6 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-24 mb-3" />
      <div className="h-8 bg-gray-200 rounded w-32" />
    </div>
  );
}

function SkeletonSection() {
  return (
    <div className="space-y-6">
      <div className="flex space-x-2">
        {PERIOD_TABS.map((tab) => (
          <div key={tab.key} className="h-9 w-20 bg-gray-200 rounded-lg animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}

function SegmentCustomerCard({ label, count, sales }: { label: string; count: number; sales: number }) {
  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-6">
      <p className="text-sm font-medium text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{count.toLocaleString()}人</p>
      <p className="text-sm text-gray-500 mt-1">売上: {formatYen(sales)}</p>
    </div>
  );
}

const SEGMENT_LABELS: { key: keyof SegmentBreakdown; label: string }[] = [
  { key: 'new', label: '新規' },
  { key: 'repeat', label: 'リピート' },
  { key: 'regular', label: '常連' },
];

const SALES_COLORS: Record<keyof SegmentBreakdown, string> = {
  new: '#6366f1',
  repeat: '#10b981',
  regular: '#f59e0b'
};

const ACQUISITION_CONFIG = [
  { key: 'google', label: 'Google', color: '#4285f4' },
  { key: 'review', label: '口コミ', color: '#ea4335' },
  { key: 'signboard', label: '看板', color: '#fbbc04' },
  { key: 'sns', label: 'SNS', color: '#9334ea' },
  { key: 'unknown', label: '打ち漏れ', color: '#9ca3af' }
] as const;

export default function CustomerSegmentSection({
  data,
  loading,
  error,
  period,
  onPeriodChange,
}: Props) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">顧客セグメント分析</h2>
        <SkeletonSection />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">顧客セグメント分析</h2>
        <div className="bg-red-50 border border-red-300 text-red-800 px-4 py-3 rounded-lg" role="alert">
          <p className="font-medium">データの取得に失敗しました</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">顧客セグメント分析</h2>
        <p className="text-gray-500">データがありません。</p>
      </div>
    );
  }

  const totalSales = data.totalSales;
  
  const totalAcquisition = ACQUISITION_CONFIG.reduce(
    (sum, item) => sum + (data.acquisitionBreakdown[item.key] || 0), 
    0
  );

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
          <h2 className="text-lg font-bold text-gray-900 mb-2 sm:mb-0">顧客セグメント分析</h2>

          <div className="flex space-x-2" role="tablist" aria-label="期間選択">
            {PERIOD_TABS.map((tab) => {
              const isSelected = period === tab.key;
              return (
                <button
                  key={tab.key}
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
        </div>

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
              {(data.customersBySegment.new + data.customersBySegment.repeat + data.customersBySegment.regular).toLocaleString()}人
            </p>
            <p className="text-xs text-gray-500 mt-1">
              新規 {data.customersBySegment.new} / リピート {data.customersBySegment.repeat} / 常連 {data.customersBySegment.regular}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {SEGMENT_LABELS.map(({ key, label }) => (
            <SegmentCustomerCard
              key={key}
              label={`${label}客数`}
              count={data.customersBySegment[key]}
              sales={data.salesBySegment[key]}
            />
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-6">
        <h3 className="text-md font-bold text-gray-900 mb-4">売上構成</h3>
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
      </div>

      <div className="bg-white rounded-xl shadow p-6">
        <h3 className="text-md font-bold text-gray-900 mb-4">日次推移</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          <div className="md:col-span-2">
            <SegmentTrendChart data={data.dailyTrend} />
          </div>
          <div className="max-h-[280px] overflow-y-auto space-y-2">
            {data.dailyTrend.map((day) => (
              <div key={day.date} className="text-sm text-gray-700">
                {day.date}: 合計{day.new + day.repeat + day.regular}人（新{day.new}/リ{day.repeat}/常{day.regular}）
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-6">
        <h3 className="text-md font-bold text-gray-900 mb-4">新規獲得経路</h3>
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
      </div>
    </div>
  );
}
