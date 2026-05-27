import { useState, useEffect, lazy, Suspense } from 'react';
import AppShell from './layout/AppShell';
import TopBar from './layout/TopBar';
import ControlBar from './layout/ControlBar';
import { Card, Container, Stack, EmptyState, ErrorState } from './ui';
import { ChartSkeleton, ListSkeleton } from './ui/skeletons';
import DashboardTabs from './DashboardTabs';
import DailyTabPanel from './tabs/DailyTabPanel';
import { useSquareData } from '../hooks/useSquareData';
import { useOpenOrders } from '../hooks/useOpenOrders';
import { useCustomerSegment } from '../hooks/useCustomerSegment';
import { useShowYoYFlag } from '../hooks/useShowYoYFlag';
import type { Location } from '../types';
import type { PeriodPreset } from '../types';
import { getBusinessDate } from '../lib/businessDate';
import { MSG } from '../lib/messages';

const SegmentTabPanel = lazy(() => import('./tabs/SegmentTabPanel'));
const LocationComparisonSection = lazy(() => import('./LocationComparisonSection'));

interface DashboardProps {
  token: string;
  onLogout: () => void;
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
  // 営業時間は 10:00 起点 / 翌 09:59 終端で固定 (SABABA 共通運用)
  const startHour = 10;
  const endHour = 9;

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
  const [hasSegmentBeenActive, setHasSegmentBeenActive] = useState(() => activeTab === 'segment');
  const [hasCompareBeenActive, setHasCompareBeenActive] = useState(() => activeTab === 'compare');

  useEffect(() => {
    if (activeTab === 'segment' && !hasSegmentBeenActive) setHasSegmentBeenActive(true);
    if (activeTab === 'compare' && !hasCompareBeenActive) setHasCompareBeenActive(true);
  }, [activeTab, hasSegmentBeenActive, hasCompareBeenActive]);

  const handleTabChange = (t: DashboardTab) => {
    setActiveTab(t);
    localStorage.setItem('sq_dashboard_tab', t);
  };

  const [weekIndex, setWeekIndex] = useState<number>(() => getWeekIndexForDate(getBusinessDate(startHour)));
  const [quarterIndex, setQuarterIndex] = useState<number>(() => {
    const m = parseInt(getBusinessDate(startHour).split('-')[1], 10);
    return Math.floor((m - 1) / 3) + 1;
  });

  useEffect(() => {
    setWeekIndex(getWeekIndexForDate(date));
  }, [date, period]);

  useEffect(() => {
    const m = parseInt(date.split('-')[1], 10);
    setQuarterIndex(Math.floor((m - 1) / 3) + 1);
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
          throw new Error(`${MSG.error.locations} (HTTP ${res.status})`);
        }
        const data = await res.json();
        const locs: Location[] = data.locations ?? [];
        setLocations(locs);
        if (locs.length > 0) {
          // ALL モード (locs.length > 1) 時のみ localStorage 復元、なければ先頭フォールバック
          let restored: string | null = null;
          if (locs.length > 1 && typeof window !== 'undefined') {
            try {
              const saved = localStorage.getItem('sq_default_location_id');
              if (saved && locs.some((l) => l.id === saved)) {
                restored = saved;
              }
            } catch {
              // private mode 等で localStorage 例外 → サイレントにフォールバック
            }
          }
          setSelectedLocationId(restored ?? locs[0].id);
        }
      } catch (err) {
        setLocationsError(err instanceof Error ? err.message : MSG.error.locations);
      } finally {
        setLocationsLoading(false);
      }
    };
    fetchLocations();
  }, [token]);

  // 店舗切替時に localStorage 保存 (ALL モード: locations.length > 1 のときのみ)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!selectedLocationId) return;
    if (locations.length <= 1) return;
    try {
      localStorage.setItem('sq_default_location_id', selectedLocationId);
    } catch {
      // private mode 等で localStorage 例外 → サイレントに無視
    }
  }, [selectedLocationId, locations.length]);

  const { sales, transactions, loading, error, lastUpdated, refresh } = useSquareData({
    token,
    date,
    locationId: selectedLocationId,
    startHour,
    endHour,
  });

  // Phase 4 YoY: ControlBar のトグル状態を localStorage と双方向同期 (Team C)
  const [showYoY, setShowYoY] = useShowYoYFlag();

  const {
    data: segmentData,
    transactions: segmentTransactions,
    loading: segmentLoading,
    error: segmentError,
    availableWeeks: segmentAvailableWeeks,
    detailAvailable: segmentDetailAvailable,
    detailLoading: segmentDetailLoading,
    detailError: segmentDetailError,
    yoy: segmentYoY,
  } = useCustomerSegment({
    token,
    locationId: selectedLocationId,
    period,
    baseDate: date,
    startHour,
    endHour,
    weekIndex,
    quarterIndex,
    enabled: hasSegmentBeenActive,
    enableYoy: showYoY,
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
    <AppShell header={<TopBar onLogout={onLogout} />}>
      <Container className="py-6">
        <Stack gap="lg">
          <ControlBar
            date={date}
            onDateChange={setDate}
            locations={locations}
            selectedLocationId={selectedLocationId}
            onLocationChange={setSelectedLocationId}
            locationsLoading={locationsLoading}
            locationsError={locationsError}
            loading={loading}
            onRefresh={refresh}
            periodLabel={getPeriodLabel(date, startHour, endHour)}
            formattedLastUpdated={formattedLastUpdated}
            showYoY={showYoY}
            onShowYoYChange={setShowYoY}
          />

          {error && (
            <ErrorState variant="inline" tone="danger" title={MSG.error.generic} description={error} />
          )}

          {!selectedLocationId && !locationsLoading && locations.length === 0 && (
            <EmptyState variant="inline" tone="warning" title="店舗が登録されていません" description="Square Developer ダッシュボードで店舗を確認してください。" />
          )}

          <DashboardTabs active={activeTab} onChange={handleTabChange} />
          {activeTab === 'daily' ? (
            <div
              role="tabpanel"
              id={`tabpanel-${activeTab}`}
              aria-labelledby={`tab-${activeTab}`}
              tabIndex={0}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md"
            >
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
                yoy={null}
                showYoy={false}
                date={date}
                periodLabel={getPeriodLabel(date, startHour, endHour)}
              />
            </div>
          ) : activeTab === 'segment' ? (
            <div
              role="tabpanel"
              id={`tabpanel-${activeTab}`}
              aria-labelledby={`tab-${activeTab}`}
              tabIndex={0}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md"
            >
              <Suspense fallback={<SegmentTabFallback />}>
                <SegmentTabPanel
                  data={segmentData}
                  transactions={segmentTransactions}
                  loading={segmentLoading}
                  error={segmentError}
                  period={period}
                  onPeriodChange={setPeriod}
                  weekIndex={weekIndex}
                  availableWeeks={segmentAvailableWeeks}
                  onWeekIndexChange={setWeekIndex}
                  quarterIndex={quarterIndex}
                  onQuarterIndexChange={setQuarterIndex}
                  startHour={startHour}
                  endHour={endHour}
                  detailAvailable={segmentDetailAvailable}
                  detailLoading={segmentDetailLoading}
                  detailError={segmentDetailError}
                  yoy={segmentYoY}
                  showYoY={showYoY}
                />
              </Suspense>
            </div>
          ) : activeTab === 'compare' ? (
            <div
              role="tabpanel"
              id={`tabpanel-${activeTab}`}
              aria-labelledby={`tab-${activeTab}`}
              tabIndex={0}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md"
            >
              <Suspense fallback={<CompareTabFallback />}>
                <LocationComparisonSection
                  token={token}
                  locations={locations}
                  period={period}
                  onPeriodChange={setPeriod}
                  weekIndex={weekIndex}
                  onWeekIndexChange={setWeekIndex}
                  availableWeeks={segmentAvailableWeeks}
                  quarterIndex={quarterIndex}
                  onQuarterIndexChange={setQuarterIndex}
                  baseDate={date}
                  startHour={startHour}
                  endHour={endHour}
                  enabled={hasCompareBeenActive}
                  showYoY={showYoY}
                />
              </Suspense>
            </div>
          ) : null}
        </Stack>
      </Container>
    </AppShell>
  );
}

function SegmentTabFallback() {
  return (
    <Card>
      <Stack gap="lg">
        <ChartSkeleton heightPreset="standard" withLegend />
        <ChartSkeleton heightPreset="standard" withLegend />
      </Stack>
    </Card>
  );
}

function CompareTabFallback() {
  return (
    <Card>
      <Stack gap="lg">
        <ChartSkeleton heightPreset="detail" withLegend />
        <ListSkeleton rows={5} />
      </Stack>
    </Card>
  );
}
