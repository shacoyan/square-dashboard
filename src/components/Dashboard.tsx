// src/components/Dashboard.tsx
import { useState, useEffect } from 'react';
import StoreSwitcher from './StoreSwitcher';
import SalesSummary from './SalesSummary';
import TransactionList from './TransactionList';
import { useSquareData } from '../hooks/useSquareData';

interface Location {
  id: string;
  name: string;
}

interface DashboardProps {
  token: string;
  onLogout: () => void;
}

export default function Dashboard({ token, onLogout }: DashboardProps) {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [locationsError, setLocationsError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLocations = async () => {
      try {
        setLocationsLoading(true);
        setLocationsError(null);
        const res = await fetch('/api/locations', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(`店舗一覧の取得に失敗しました (HTTP ${res.status})`);
        }
        const data = await res.json();
        const locs: Location[] = data.locations ?? [];
        setLocations(locs);
        if (locs.length > 0) {
          setSelectedLocationId(locs[0].id);
        }
      } catch (err) {
        setLocationsError(err instanceof Error ? err.message : '店舗一覧の取得エラー');
      } finally {
        setLocationsLoading(false);
      }
    };
    fetchLocations();
  }, [token]);

  const { sales, transactions, loading, error, lastUpdated, refresh } = useSquareData({
    token,
    date,
    locationId: selectedLocationId,
  });

  const formattedLastUpdated = lastUpdated
    ? lastUpdated.toLocaleTimeString('ja-JP', { hour12: false })
    : '--:--:--';

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-indigo-600 text-white shadow">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">SABABA 売上ダッシュボード</h1>
          <button
            onClick={onLogout}
            className="px-4 py-2 text-sm bg-indigo-500 hover:bg-indigo-400 rounded transition-colors"
          >
            ログアウト
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="bg-white rounded-lg shadow p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <label htmlFor="date-select" className="text-sm font-medium text-gray-700 whitespace-nowrap">
              日付:
            </label>
            <input
              id="date-select"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {locationsLoading ? (
            <p className="text-sm text-gray-400">店舗情報を取得中...</p>
          ) : (
            <StoreSwitcher
              locations={locations}
              selectedId={selectedLocationId}
              onChange={setSelectedLocationId}
            />
          )}

          {locationsError && (
            <p className="text-red-600 text-sm">⚠ {locationsError}</p>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <button
              onClick={refresh}
              disabled={loading || !selectedLocationId}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? '読み込み中...' : '更新'}
            </button>
            <span className="text-xs text-gray-500">
              最終更新: {formattedLastUpdated}
            </span>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700 text-sm">⚠ {error}</p>
          </div>
        )}

        {!selectedLocationId && !locationsLoading && locations.length === 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-yellow-700 text-sm">
              店舗が登録されていません。Square Developerダッシュボードで店舗を確認してください。
            </p>
          </div>
        )}

        <SalesSummary
          total={sales?.total_amount ?? 0}
          count={sales?.transaction_count ?? 0}
          loading={loading}
        />

        <TransactionList transactions={transactions} loading={loading} />
      </main>
    </div>
  );
}
