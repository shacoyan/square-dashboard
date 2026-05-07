import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Transaction, CustomerSegmentAnalysis, PeriodPreset, DailySegmentPoint, OpenOrder } from '../types';
import { aggregateSegments, allocateSalesByTransaction, countCustomersByTransaction } from '../lib/customerSegment';
import { aggregateTrendByGranularity, granularityFor } from '../lib/trendAggregation';
import { calculatePeriodDates, getMonthWeekCount } from '../lib/periodDates';
import { MSG } from '../lib/messages';

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

export function useCustomerSegment(args: Args): {
  data: CustomerSegmentAnalysis | null;
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  availableWeeks: number;
} {
  const { token, locationId, period, baseDate, startHour, endHour, weekIndex, quarterIndex, enabled } = args;

  const [data, setData] = useState<CustomerSegmentAnalysis | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    const dates = calculatePeriodDates(period, baseDate, weekIndex, quarterIndex);

    if (dates.length === 0) {
      setLoading(false);
      setData(null);
      setTransactions([]);
      setError('この週はまだ経過していません');
      return;
    }

    const headers: HeadersInit = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const start_date = dates[0];
    const end_date = dates[dates.length - 1];

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
        const transactions = txByDate[date]?.transactions ?? [];
        const openOrders = openByDate[date]?.orders ?? [];

        const mappedOpenOrders = openOrders.map(openOrderToTransaction);
        const combinedTransactions = [...transactions, ...mappedOpenOrders];

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

        const daySales = combinedTransactions.reduce((sum, t) => sum + (t.amount ?? 0), 0);
        dailySalesTotal += daySales;
      });

      const warning = warningMessages.length > 0 ? warningMessages.join(' ') : null;
      setError(warning);

      const result = aggregateSegments(allTransactions);

      const elapsedDays = dates.length;
      const averageDailySales = period === 'today' ? dailySalesTotal : (dates.length > 0 ? dailySalesTotal / elapsedDays : null);
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
  }, [token, locationId, period, baseDate, startHour, endHour, weekIndex, quarterIndex, enabled]);

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
  };
}
