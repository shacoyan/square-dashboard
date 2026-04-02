import { Transaction } from '../hooks/useSquareData'

interface TransactionListProps {
  transactions: Transaction[]
  loading: boolean
}

function formatCurrency(amount: number): string {
  return `¥${amount.toLocaleString('ja-JP')}`
}

function getStatusLabel(status: string): { label: string; className: string } {
  switch (status) {
    case 'COMPLETED':
      return { label: '完了', className: 'bg-green-50 text-green-700' }
    case 'CANCELED':
      return { label: 'キャンセル', className: 'bg-red-50 text-red-600' }
    case 'FAILED':
      return { label: '失敗', className: 'bg-red-50 text-red-600' }
    case 'PENDING':
      return { label: '保留中', className: 'bg-yellow-50 text-yellow-700' }
    default:
      return { label: status, className: 'bg-gray-100 text-gray-600' }
  }
}

export default function TransactionList({ transactions, loading }: TransactionListProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50">
          <h2 className="text-sm font-semibold text-gray-700">伝票一覧</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="px-4 py-3.5 flex items-center justify-between">
              <div className="space-y-1.5 flex-1">
                <div className="h-3.5 bg-gray-100 rounded animate-pulse w-1/3" />
                <div className="h-3 bg-gray-100 rounded animate-pulse w-1/4" />
              </div>
              <div className="h-5 bg-gray-100 rounded animate-pulse w-16 ml-4" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (transactions.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
        <p className="text-gray-400 text-sm">この日の伝票はありません</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50">
        <h2 className="text-sm font-semibold text-gray-700">
          伝票一覧
          <span className="ml-2 text-xs font-normal text-gray-400">{transactions.length}件</span>
        </h2>
      </div>
      <div className="divide-y divide-gray-50">
        {transactions.map((tx) => {
          const status = getStatusLabel(tx.status)
          return (
            <div key={tx.id} className="px-4 py-3.5 flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-gray-900">{tx.time_jst}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${status.className}`}>
                    {status.label}
                  </span>
                </div>
                <p className="text-xs text-gray-500 truncate">{tx.payment_method}</p>
                {tx.note && (
                  <p className="text-xs text-gray-400 truncate mt-0.5">{tx.note}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className={`text-sm font-semibold ${tx.status === 'CANCELED' || tx.status === 'FAILED' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                  {formatCurrency(tx.amount)}
                </p>
                {tx.receipt_number && (
                  <p className="text-xs text-gray-400 mt-0.5">#{tx.receipt_number}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
