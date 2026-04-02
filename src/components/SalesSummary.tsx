import { SalesSummary as SalesSummaryType } from '../hooks/useSquareData'

interface SalesSummaryProps {
  summary: SalesSummaryType | null
  loading: boolean
}

function formatCurrency(amount: number): string {
  return `¥${amount.toLocaleString('ja-JP')}`
}

export default function SalesSummary({ summary, loading }: SalesSummaryProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <p className="text-xs text-gray-500 mb-1">合計売上</p>
        {loading ? (
          <div className="h-7 bg-gray-100 rounded animate-pulse w-3/4 mt-1" />
        ) : (
          <p className="text-2xl font-bold text-gray-900 leading-tight">
            {summary ? formatCurrency(summary.total_amount) : '—'}
          </p>
        )}
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <p className="text-xs text-gray-500 mb-1">決済件数</p>
        {loading ? (
          <div className="h-7 bg-gray-100 rounded animate-pulse w-1/2 mt-1" />
        ) : (
          <p className="text-2xl font-bold text-gray-900 leading-tight">
            {summary ? `${summary.total_count}件` : '—'}
          </p>
        )}
        {!loading && summary && summary.all_count !== summary.total_count && (
          <p className="text-xs text-gray-400 mt-0.5">
            全{summary.all_count}件中
          </p>
        )}
      </div>
    </div>
  )
}
