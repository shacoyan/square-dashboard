import { useState, useEffect } from 'react';
import StoreSwitcher from './StoreSwitcher';
import DatePicker from './DatePicker';
import DashboardTabs from './DashboardTabs';
import DailyTabPanel from './tabs/DailyTabPanel';
import SegmentTabPanel from './tabs/SegmentTabPanel';
import LocationComparisonSection from './LocationComparisonSection';
import { useSquareData } from '../hooks/useSquareData';
import { useOpenOrders } from '../hooks/useOpenOrders';
import { useCustomerSegment } from '../hooks/useCustomerSegment';
import type { Location } from '../types';
import type { PeriodPreset } from '../types';

interface DashboardProps {
  token: string;
  onLogout: () => void;
}

function getBusinessDate(startHour: number): string {
  const now = new Date();
  const jstHour = (now.getUTCHours() + 9) % 24;
  if (startHour > 0 && jstHour < startHour) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  }
  return now.toISOString().split('T')[0];
}

function getPeriodLabel(date: string, startHour: number, endHour: number): string {
  const isNextDay = endHour < startHour;
  const endDate = isNextDay ? (() => {
    const d = new Date(date + 'T12:00:00+09:00');
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  })() : date;
  return `${date} ${String(startHour).padStart(2, '0')}:00 〜 ${endDate} ${String(endHour).padStart(2, '0')}:59`;
}

function getWeekIndexForDate(dateStr: string): number {
  const date = new Date(dateStr + 'T12:00:00');
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const dayOfMonth = date.getDate();
  const firstMonday = firstDayOfMonth === 0 ? 1 : (8 - firstDayOfMonth) % 7 || 7;
  const adjustedFirstMonday = firstMonday > 1 ? firstMonday - 7 : firstMonday;
  const weekIndex = Math.ceil((dayOfMonth - adjustedFirstMonday + 1) / 7);
  return weekIndex;
}

export default function Dashboard({ token, onLogout }: DashboardProps) {
  const [startHour, setStartHour] = useState<number>(() => {
    const saved = localStorage.getItem('sq_start_hour');
    return saved ? parseInt(saved, 10) : 13;
  });
  const [endHour, setEndHour] = useState<number>(() => {
    const saved = localStorage.getItem('sq_end_hour');
    return saved ? parseInt(saved, 10) : 12;
  });

  const [date, setDate] = useState(() => getBusinessDate(startHour));
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [locationsError, setLocationsError] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodPreset>('month');

  type DashboardTab = 'daily' | 'segment' | 'compare';
  const [activeTab, setActiveTab] = useState<DashboardTab>(() => {
    const saved = localStorage.getItem('sq_dashboard_tab');
    return saved === 'segment' || saved === 'compare' ? saved : 'daily';
  });
  const handleTabChange = (t: DashboardTab) => {
    setActiveTab(t);
    localStorage.setItem('sq_dashboard_tab', t);
  };

  const [weekIndex, setWeekIndex] = useState<number>(() => getWeekIndexForDate(getBusinessDate(13)));

  useEffect(() => {
    setWeekIndex(getWeekIndexForDate(date));
  }, [date, period]);

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
    startHour,
    endHour,
  });

  const {
    data: segmentData,
    loading: segmentLoading,
    error: segmentError,
    availableWeeks: segmentAvailableWeeks,
  } = useCustomerSegment({
    token,
    locationId: selectedLocationId,
    period,
    baseDate: date,
    startHour,
    endHour,
    weekIndex,
  });

  const { orders: openOrders, loading: openOrdersLoading, error: openOrdersError } = useOpenOrders({
    token,
    locationId: selectedLocationId,
    date,
    startHour,
    endHour,
  });

  const openTotal = openOrders.reduce((sum, o) => sum + o.total_money, 0);
  const openCount = openOrders.length;

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
            <DatePicker value={date} onChange={setDate} />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">営業開始:</label>
              <select
                value={startHour}
                onChange={(e) => {
                  const h = parseInt(e.target.value, 10);
                  setStartHour(h);
                  localStorage.setItem('sq_start_hour', String(h));
                  setDate(getBusinessDate(h));
                }}
                className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">営業終了:</label>
              <select
                value={endHour}
                onChange={(e) => {
                  const h = parseInt(e.target.value, 10);
                  setEndHour(h);
                  localStorage.setItem('sq_end_hour', String(h));
                }}
                className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{String(i).padStart(2, '0')}:59</option>
                ))}
              </select>
            </div>
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
            <div className="text-right">
              <p className="text-xs text-gray-400">{getPeriodLabel(date, startHour, endHour)}</p>
              <span className="text-xs text-gray-500">
                最終更新: {formattedLastUpdated}
              </span>
            </div>
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

        <DashboardTabs active={activeTab} onChange={handleTabChange} />
        {activeTab === 'daily' ? (
          <DailyTabPanel
            salesTotal={sales?.total_amount ?? 0}
            salesCount={sales?.transaction_count ?? 0}
            openTotal={openTotal}
            openCount={openCount}
            loading={loading}
            openOrders={openOrders}
            openOrdersLoading={openOrdersLoading}
            openOrdersError={openOrdersError}
            transactions={transactions}
          />
        ) : activeTab === 'segment' ? (
          <SegmentTabPanel
            data={segmentData}
            loading={segmentLoading}
            error={segmentError}
            period={period}
            onPeriodChange={setPeriod}
            weekIndex={weekIndex}
            availableWeeks={segmentAvailableWeeks}
            onWeekIndexChange={setWeekIndex}
          />
        ) : activeTab === 'compare' ? (
          <LocationComparisonSection
            token={token}
            locations={locations}
            period={period}
            onPeriodChange={setPeriod}
            weekIndex={weekIndex}
            onWeekIndexChange={setWeekIndex}
            availableWeeks={segmentAvailableWeeks}
            baseDate={date}
            startHour={startHour}
            endHour={endHour}
          />
        ) : null}
      </main>
    </div>
  );
}
