import { useSquareData } from '../hooks/useSquareData'
import StoreSwitcher from './StoreSwitcher'
import SalesSummary from './SalesSummary'
import TransactionList from './TransactionList'

interface DashboardProps {
  token: string
  onLogout: () => void
}

function formatLastUpdated(date: Date | null): string {
  if (!date) return ''
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

export default function Dashboard({ token, onLogout }: DashboardProps) {
  const {
    locations,
    selectedLocationId,
    setSelectedLocationId,
    selectedDate,
    setSelectedDate,
    summary,
    transactions,
    loading,
    error,
    lastUpdated,
    refresh,
  } = useSquareData(token)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 bg-blue-600 rounded-lg">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-900 leading-none">SABABA</h1>
              <p className="text-xs text-gray-400 leading-none mt-0.5">売上ダッシュボード</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="text-xs text-gray-400 hover:text-gray-600 transition py-1 px-2 rounded hover:bg-gray-50"
          >
            ログアウト
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        {/* コントロールバー */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <StoreSwitcher
              locations={locations}
              selectedId={selectedLocationId}
              onChange={setSelectedLocationId}
            />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            />
          </div>

          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 disabled:text-gray-400 transition py-2 px-3 rounded-lg hover:bg-blue-50 disabled:bg-transparent"
          >
            <svg
              className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            更新
          </button>
        </div>

        {/* 最終更新時刻 */}
        {lastUpdated && (
          <p className="text-xs text-gray-400 -mt-2">
            最終更新: {formatLastUpdated(lastUpdated)}（60秒ごとに自動更新）
          </p>
        )}

        {/* エラー表示 */}
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* 売上サマリー */}
        <SalesSummary summary={summary} loading={loading} />

        {/* 伝票一覧 */}
        <TransactionList transactions={transactions} loading={loading} />
      </div>
    </div>
  )
}
