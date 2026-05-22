import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Transaction, CustomerSegmentAnalysis, PeriodPreset, DailySegmentPoint, OpenOrder } from '../types';
import { aggregateSegments, allocateSalesByTransaction, countCustomersByTransaction } from '../lib/customerSegment';
import { aggregateTrendByGranularity, granularityFor } from '../lib/trendAggregation';
import { calculatePeriodDates, getMonthWeekCount } from '../lib/periodDates';
import { MSG } from '../lib/messages';
import { fetchSalesRange, buildSegmentAnalysisFromSalesRange } from '../lib/salesRangeAdapter';
import type { SalesRangeMeta, SalesRangeResponse } from '../lib/salesRangeAdapter';
import { getSalesRangeFlag } from '../lib/featureFlags';
import { shiftRangeOneYearBack } from '../lib/yoy';
import type { SalesRangeYoYResult } from '../lib/yoy';
import { buildYoYResultFromResponses } from './useYoYCompare';

interface Args {
  token: string;
  locationId: string;
  period: PeriodPreset;
  baseDate: string;
  startHour: number;
  endHour: number;
  weekIndex?: number;
  quarterIndex?: number;
  enabled: boolean;
  /**
   * 前年同期比 (YoY) 計算を有効化する。
   * true のとき、current fetch と並行して lastYear (前年同期) を追加 fetch し、
   * 戻り値の `yoy` フィールドに集計結果を格納する。
   * false (default) のときは既存挙動完全互換 (追加 fetch なし)。
   * 設計書: §4.3.3 / §4.4
   */
  enableYoy?: boolean;
}

export interface UseCustomerSegmentResult {
  data: CustomerSegmentAnalysis | null;
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  availableWeeks: number;
  detailLoading: boolean;
  detailError: string | null;
  detailAvailable: boolean;
  meta: SalesRangeMeta | null;
  /** 前年同期比結果。enableYoy=false 時は常に null。 */
  yoy: SalesRangeYoYResult | null;
  /** YoY 用 lastYear fetch の進行中フラグ (current の loading とは独立)。 */
  yoyLoading: boolean;
  /** lastYear fetch 失敗時のエラー (current の error とは独立)。 */
  yoyError: string | null;
}

function openOrderToTransaction(o: OpenOrder): Transaction {
  return {
    id: o.id,
    customer_name: o.customer_name,
    created_at_jst: o.created_at ?? '',
    amount: o.total_money,
    status: 'OPEN',
    source: 'OPEN_TICKET',
    line_items: o.line_items,
    discounts: o.discounts,
  };
}

export function useCustomerSegment(args: Args): UseCustomerSegmentResult {
  const { token, locationId, period, baseDate, startHour, endHour, weekIndex, quarterIndex, enabled, enableYoy = false } = args;

  const [data, setData] = useState<CustomerSegmentAnalysis | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailAvailable, setDetailAvailable] = useState(true);
  const [meta, setMeta] = useState<SalesRangeMeta | null>(null);
  const [yoy, setYoy] = useState<SalesRangeYoYResult | null>(null);
  const [yoyLoading, setYoyLoading] = useState(false);
  const [yoyError, setYoyError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const availableWeeks = useMemo(() => {
    const [by, bm] = baseDate.split('-').map(Number);
    return getMonthWeekCount(by, bm);
  }, [baseDate]);

  const fetchData = useCallback(async () => {
    if (!enabled) return;
    if (!locationId) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const currentAbortController = new AbortController();
    abortControllerRef.current = currentAbortController;

    setLoading(true);
    setError(null);
    setData(null);
    setTransactions([]);
    setDetailLoading(false);
    setDetailError(null);
    setMeta(null);
    setYoy(null);
    setYoyLoading(false);
    setYoyError(null);

    const dates = calculatePeriodDates(period, baseDate, weekIndex, quarterIndex);

    if (dates.length === 0) {
      setLoading(false);
      setData(null);
      setTransactions([]);
      setError('この週はまだ経過していません');
      setDetailAvailable(true);
      return;
    }

    const useSalesRangeFlag = getSalesRangeFlag();
    // 35 日ガード撤廃 (2026-05-21): 長期間 (四半期/年間) でも明細セクションを常時表示するため。
    // detailAvailable は将来の別理由 (権限・機能フラグ等) で false にする余地を残し、デフォルト true 固定。
    setDetailAvailable(true);

    const headers: HeadersInit = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const start_date = dates[0];
    const end_date = dates[dates.length - 1];

    if (!useSalesRangeFlag) {
      // 旧コードパス (transactions-range + open-orders-range 直叩き、フォールバック)
      const txUrl = `/api/transactions-range?start_date=${start_date}&end_date=${end_date}&location_id=${encodeURIComponent(locationId)}&start_hour=${startHour}&end_hour=${endHour}`;
      const openUrl = `/api/open-orders-range?start_date=${start_date}&end_date=${end_date}&location_id=${encodeURIComponent(locationId)}&start_hour=${startHour}&end_hour=${endHour}`;

      const txPromise = fetch(txUrl, {
        headers,
        signal: currentAbortController.signal,
      }).then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ byDate: Record<string, { transactions?: Transaction[] }> }>;
      });

      const openPromise = fetch(openUrl, {
        headers,
        signal: currentAbortController.signal,
      }).then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ byDate: Record<string, { orders?: OpenOrder[] }> }>;
      });

      try {
        const [txResult, openResult] = await Promise.allSettled([txPromise, openPromise]);

        if (currentAbortController.signal.aborted) return;

        const isTxFailure = txResult.status === 'rejected';
        const isOpenFailure = openResult.status === 'rejected';

        if (isTxFailure && isOpenFailure) {
          setError(MSG.error.period);
          setData(null);
          setTransactions([]);
          setLoading(false);
          return;
        }

        const txByDate = !isTxFailure ? txResult.value.byDate : {};
        const openByDate = !isOpenFailure ? openResult.value.byDate : {};

        const allTransactions: Transaction[] = [];
        let dailySalesTotal = 0;
        let dailyCustomersTotal = 0;
        const dailyTrend: DailySegmentPoint[] = [];
        const warningMessages: string[] = [];

        if (isTxFailure) {
          warningMessages.push(`${dates.length}${MSG.warning.partialFailureTransactions}`);
        }
        if (isOpenFailure) {
          warningMessages.push(`${dates.length}${MSG.warning.partialFailureOpenOrders}`);
        }

        dates.forEach(date => {
          const dateTransactions = txByDate[date]?.transactions ?? [];
          const openOrders = openByDate[date]?.orders ?? [];

          const mappedOpenOrders = openOrders.map(openOrderToTransaction);
          const combinedTransactions = [...dateTransactions, ...mappedOpenOrders];

          allTransactions.push(...combinedTransactions);

          let dayNew = 0;
          let dayRepeat = 0;
          let dayRegular = 0;
          let dayStaff = 0;
          let dayUnlisted = 0;
          let dayNewSales = 0;
          let dayRepeatSales = 0;
          let dayRegularSales = 0;
          let dayStaffSales = 0;
          let dayUnlistedSales = 0;

          combinedTransactions.forEach(tx => {
            const dayCounts = countCustomersByTransaction(tx);
            dayNew += dayCounts.new;
            dayRepeat += dayCounts.repeat;
            dayRegular += dayCounts.regular;
            dayStaff += dayCounts.staff;
            dayUnlisted += dayCounts.unlisted;

            const daySales = allocateSalesByTransaction(tx);
            dayNewSales += daySales.new;
            dayRepeatSales += daySales.repeat;
            dayRegularSales += daySales.regular;
            dayStaffSales += daySales.staff;
            dayUnlistedSales += daySales.unlisted;
          });

          dailyTrend.push({
            date,
            new: dayNew,
            repeat: dayRepeat,
            regular: dayRegular,
            staff: dayStaff,
            unlisted: dayUnlisted,
            newSales: dayNewSales,
            repeatSales: dayRepeatSales,
            regularSales: dayRegularSales,
            staffSales: dayStaffSales,
            unlistedSales: dayUnlistedSales,
          });

          const dayTotalCustomers = dayNew + dayRepeat + dayRegular + dayStaff;
          dailyCustomersTotal += dayTotalCustomers;

          const daySalesTotal = combinedTransactions.reduce((sum, t) => sum + (t.amount ?? 0), 0);
          dailySalesTotal += daySalesTotal;
        });

        const warning = warningMessages.length > 0 ? warningMessages.join(' ') : null;
        setError(warning);

        const result = aggregateSegments(allTransactions);

        const elapsedDays = dates.length;
        const averageDailySales = period === 'today' ? dailySalesTotal : (dates.length > 0 ? dailySalesTotal / elapsedDays : null);
        // 客単価 = 総売上 / (新規 + リピート + 常連 + スタッフ) 客数合計。unlisted は除外。
        const overallAveragePerCustomer = dailyCustomersTotal > 0 ? dailySalesTotal / dailyCustomersTotal : null;

        const sortedDailyTrend = dailyTrend.sort((a, b) => a.date.localeCompare(b.date));
        const aggregatedTrend = aggregateTrendByGranularity(sortedDailyTrend, granularityFor(period));

        setData({
          period,
          periodStart: dates[0] ?? baseDate,
          periodEnd: dates[dates.length - 1] ?? baseDate,
          elapsedDays,
          totalSales: dailySalesTotal,
          totalCustomers: dailyCustomersTotal,
          averageDailySales,
          overallAveragePerCustomer,
          customersBySegment: result.customers,
          salesBySegment: result.sales,
          acquisitionBreakdown: result.acquisition,
          dailyTrend: aggregatedTrend,
        });
        setTransactions(allTransactions);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        setError(err instanceof Error ? err.message : MSG.error.fetch);
        setData(null);
        setTransactions([]);
      } finally {
        if (!currentAbortController.signal.aborted) {
          setLoading(false);
        }
      }
      return;
    }

    // 新コードパス (sales-range Layer 1 + Layer 2 は期間長に関わらず常時試行)
    try {
      const response = await fetchSalesRange({
        start_date,
        end_date,
        location_id: locationId,
        start_hour: startHour,
        token,
        signal: currentAbortController.signal,
      });

      if (currentAbortController.signal.aborted) return;

      setMeta(response.meta);

      if (response.meta?.warnings && response.meta.warnings.length > 0) {
        console.warn('[useCustomerSegment] sales-range meta.warnings:', response.meta.warnings);
      }
      if (response.meta?.partial_failures && response.meta.partial_failures.length > 0) {
        console.warn('[useCustomerSegment] sales-range meta.partial_failures:', response.meta.partial_failures);
      }
      if (response.meta?.missing_combinations && response.meta.missing_combinations.length > 0) {
        console.warn('[useCustomerSegment] sales-range meta.missing_combinations:', response.meta.missing_combinations);
      }

      const segmentData = buildSegmentAnalysisFromSalesRange({
        byDate: response.byDate,
        dates,
        period,
        baseDate,
      });

      setData(segmentData);

      // YoY: enableYoy=true なら lastYear を追加 fetch (current は再利用、ネットワーク +1 回)
      if (enableYoy) {
        setYoyLoading(true);
        const lastYearRange = shiftRangeOneYearBack({ start_date, end_date });
        try {
          const lastYearResponse: SalesRangeResponse = await fetchSalesRange({
            start_date: lastYearRange.start_date,
            end_date: lastYearRange.end_date,
            location_id: locationId,
            start_hour: startHour,
            token,
            signal: currentAbortController.signal,
          });

          if (currentAbortController.signal.aborted) return;

          const yoyResult = buildYoYResultFromResponses({
            start_date,
            end_date,
            currentRes: response,
            lastYearRes: lastYearResponse,
          });
          setYoy(yoyResult);
        } catch (yoyErr) {
          if (yoyErr instanceof DOMException && yoyErr.name === 'AbortError') {
            return;
          }
          // current 成功 + lastYear 失敗 → 部分成功 (yoy.lastYear=null) で組み立てる
          const yoyResult = buildYoYResultFromResponses({
            start_date,
            end_date,
            currentRes: response,
            lastYearRes: null,
          });
          setYoy(yoyResult);
          setYoyError(yoyErr instanceof Error ? yoyErr.message : 'YoY 取得失敗 (前年)');
        } finally {
          if (!currentAbortController.signal.aborted) {
            setYoyLoading(false);
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setError(err instanceof Error ? err.message : MSG.error.fetch);
      setData(null);
      setTransactions([]);
      setLoading(false);
      return;
    }

    if (!currentAbortController.signal.aborted) {
      setLoading(false);
    }

    // Layer 2: transactions 詳細を別途並列ロード (期間長に関わらず常時試行)
    setDetailLoading(true);

    const txUrl = `/api/transactions-range?start_date=${start_date}&end_date=${end_date}&location_id=${encodeURIComponent(locationId)}&start_hour=${startHour}&end_hour=${endHour}`;
    const openUrl = `/api/open-orders-range?start_date=${start_date}&end_date=${end_date}&location_id=${encodeURIComponent(locationId)}&start_hour=${startHour}&end_hour=${endHour}`;

    const txPromise = fetch(txUrl, {
      headers,
      signal: currentAbortController.signal,
    }).then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ byDate: Record<string, { transactions?: Transaction[] }> }>;
    });

    const openPromise = fetch(openUrl, {
      headers,
      signal: currentAbortController.signal,
    }).then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ byDate: Record<string, { orders?: OpenOrder[] }> }>;
    });

    try {
      const [txResult, openResult] = await Promise.allSettled([txPromise, openPromise]);

      if (currentAbortController.signal.aborted) return;

      const isTxFailure = txResult.status === 'rejected';
      const isOpenFailure = openResult.status === 'rejected';

      if (isTxFailure && isOpenFailure) {
        setDetailError(MSG.error.period);
        setTransactions([]);
        return;
      }

      const txByDate = !isTxFailure ? txResult.value.byDate : {};
      const openByDate = !isOpenFailure ? openResult.value.byDate : {};

      const allTransactions: Transaction[] = [];
      dates.forEach(date => {
        const dateTransactions = txByDate[date]?.transactions ?? [];
        const openOrders = openByDate[date]?.orders ?? [];
        const mappedOpenOrders = openOrders.map(openOrderToTransaction);
        allTransactions.push(...dateTransactions, ...mappedOpenOrders);
      });

      const result = aggregateSegments(allTransactions);
      setData(prev => (prev ? { ...prev, acquisitionBreakdown: result.acquisition } : prev));
      setTransactions(allTransactions);

      const warningMessages: string[] = [];
      if (isTxFailure) {
        warningMessages.push(`${dates.length}${MSG.warning.partialFailureTransactions}`);
      }
      if (isOpenFailure) {
        warningMessages.push(`${dates.length}${MSG.warning.partialFailureOpenOrders}`);
      }
      if (warningMessages.length > 0) {
        setDetailError(warningMessages.join(' '));
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setDetailError(err instanceof Error ? err.message : MSG.error.fetch);
      setTransactions([]);
    } finally {
      if (!currentAbortController.signal.aborted) {
        setDetailLoading(false);
      }
    }
  }, [token, locationId, period, baseDate, startHour, endHour, weekIndex, quarterIndex, enabled, enableYoy]);

  useEffect(() => {
    fetchData();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [fetchData]);

  return {
    data,
    transactions,
    loading,
    error,
    refresh: fetchData,
    availableWeeks,
    detailLoading,
    detailError,
    detailAvailable,
    meta,
    yoy,
    yoyLoading,
    yoyError,
  };
}
