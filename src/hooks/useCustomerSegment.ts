import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Transaction, CustomerSegmentAnalysis, PeriodPreset, DailySegmentPoint, OpenOrder } from '../types';
import { aggregateSegments, countCustomersByTransaction } from '../lib/customerSegment';

interface Args {
  token: string;
  locationId: string;
  period: PeriodPreset;
  baseDate: string;
  startHour: number;
  endHour: number;
  weekIndex?: number;
}

function getJSTDateParts(date: Date): { year: number; month: number; day: number } {
  const jstString = date.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = jstString.split('/').map(Number);
  return { year: parts[0], month: parts[1], day: parts[2] };
}

function formatJSTDateString(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getMonOffset(date: Date): number {
  const d = date.getUTCDay(); // 0=Sun ... 6=Sat
  return (d + 6) % 7; // Mon=0, Sun=6
}

function getFirstWeekMonday(year: number, month: number): Date {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = getMonOffset(first);
  return new Date(Date.UTC(year, month - 1, 1 - offset));
}

function getMonthWeekCount(year: number, month: number): number {
  const firstMon = getFirstWeekMonday(year, month);
  const lastDay = new Date(Date.UTC(year, month, 0));
  const diffDays = Math.floor((lastDay.getTime() - firstMon.getTime()) / 86400000);
  return Math.floor(diffDays / 7) + 1;
}

function calculatePeriodDates(period: PeriodPreset, baseDate: string, weekIndex?: number): string[] {
  const [by, bm, bd] = baseDate.split('-').map(Number);

  const { year: todayY, month: todayM, day: todayD } = getJSTDateParts(new Date());
  const todayStr = formatJSTDateString(todayY, todayM, todayD);

  const dates: string[] = [];
  let startDateObj: Date;
  let endDateObj: Date;

  if (period === 'today') {
    startDateObj = new Date(Date.UTC(by, bm - 1, bd));
    endDateObj = new Date(Date.UTC(by, bm - 1, bd));
  } else if (period === 'week') {
    const firstMon = getFirstWeekMonday(by, bm);
    const baseDateUTC = Date.UTC(by, bm - 1, bd);
    
    let effectiveIndex: number;
    if (weekIndex !== undefined) {
      effectiveIndex = weekIndex;
    } else {
      const diff = baseDateUTC - firstMon.getTime();
      const days = diff / 86400000;
      effectiveIndex = Math.floor(days / 7) + 1;
      if (effectiveIndex < 1) effectiveIndex = 1;
    }
    
    startDateObj = new Date(firstMon.getTime() + 7 * (effectiveIndex - 1) * 86400000);
    endDateObj = new Date(firstMon.getTime() + (7 * (effectiveIndex - 1) + 6) * 86400000);
  } else {
    startDateObj = new Date(Date.UTC(by, bm - 1, 1));
    endDateObj = new Date(Date.UTC(by, bm, 0));
  }

  const startDateStr = formatJSTDateString(startDateObj.getUTCFullYear(), startDateObj.getUTCMonth() + 1, startDateObj.getUTCDate());
  if (startDateStr > todayStr) {
    return dates;
  }

  const endDateStr = formatJSTDateString(endDateObj.getUTCFullYear(), endDateObj.getUTCMonth() + 1, endDateObj.getUTCDate());
  if (endDateStr > todayStr) {
    endDateObj = new Date(Date.UTC(todayY, todayM - 1, todayD));
  }

  const current = new Date(startDateObj.getTime());
  while (current.getTime() <= endDateObj.getTime()) {
    dates.push(formatJSTDateString(current.getUTCFullYear(), current.getUTCMonth() + 1, current.getUTCDate()));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  if (period === 'week') {
    const prefix = `${by}-${String(bm).padStart(2, '0')}-`;
    return dates.filter(d => d.startsWith(prefix));
  }

  return dates;
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
  loading: boolean;
  error: string | null;
  refresh: () => void;
  availableWeeks: number;
} {
  const { token, locationId, period, baseDate, startHour, endHour, weekIndex } = args;

  const [data, setData] = useState<CustomerSegmentAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const availableWeeks = useMemo(() => {
    const [by, bm] = baseDate.split('-').map(Number);
    return getMonthWeekCount(by, bm);
  }, [baseDate]);

  const fetchData = useCallback(async () => {
    if (!locationId) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const currentAbortController = new AbortController();
    abortControllerRef.current = currentAbortController;

    setLoading(true);
    setError(null);
    setData(null);

    const dates = calculatePeriodDates(period, baseDate, weekIndex);

    const headers: HeadersInit = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const allTransactions: Transaction[] = [];
    let bothFailures = 0;
    let failures = 0;
    let openFailures = 0;
    let dailySalesTotal = 0;
    let dailyCustomersTotal = 0;
    const dailyTrend: DailySegmentPoint[] = [];

    const fetchPromises = dates.map(date => {
      const txUrl = `/api/transactions?date=${date}&location_id=${locationId}&start_hour=${startHour}&end_hour=${endHour}`;
      const openUrl = `/api/open-orders?date=${date}&location_id=${locationId}&start_hour=${startHour}&end_hour=${endHour}`;

      const txPromise = fetch(txUrl, {
        headers,
        signal: currentAbortController.signal,
      }).then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ transactions: Transaction[] }>;
      }).then(payload => payload.transactions ?? []);

      const openPromise = fetch(openUrl, {
        headers,
        signal: currentAbortController.signal,
      }).then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ orders?: OpenOrder[] }>;
      }).then(payload => payload.orders ?? []);

      return Promise.allSettled([txPromise, openPromise]).then(async (results) => {
        if (currentAbortController.signal.aborted) return;

        const [txResult, openResult] = results;

        if (txResult.status === 'rejected' && openResult.status === 'rejected') {
          bothFailures++;
          failures++;
          return;
        }

        if (txResult.status === 'rejected') {
          failures++;
        }

        if (openResult.status === 'rejected') {
          openFailures++;
        }

        const transactions: Transaction[] = txResult.status === 'fulfilled' ? txResult.value : [];
        const openOrders: OpenOrder[] = openResult.status === 'fulfilled' ? openResult.value : [];

        const mappedOpenOrders = openOrders.map(openOrderToTransaction);
        const combinedTransactions = [...transactions, ...mappedOpenOrders];
        
        allTransactions.push(...combinedTransactions);

        let dayNew = 0;
        let dayRepeat = 0;
        let dayRegular = 0;

        combinedTransactions.forEach(tx => {
          const dayCounts = countCustomersByTransaction(tx);
          dayNew += dayCounts.new;
          dayRepeat += dayCounts.repeat;
          dayRegular += dayCounts.regular;
        });

        dailyTrend.push({
          date,
          new: dayNew,
          repeat: dayRepeat,
          regular: dayRegular,
        });

        const dayTotalCustomers = dayNew + dayRepeat + dayRegular;
        dailyCustomersTotal += dayTotalCustomers;

        const daySales = combinedTransactions.reduce((sum, t) => sum + (t.amount ?? 0), 0);
        dailySalesTotal += daySales;
      });
    });

    try {
      await Promise.all(fetchPromises);

      if (currentAbortController.signal.aborted) {
        return;
      }

      if (bothFailures === dates.length) {
        setData(null);
        setError('期間データ取得失敗');
        return;
      }

      const warningMessages: string[] = [];
      if (failures > 0) {
        warningMessages.push(`${failures}日のデータ取得に失敗しました。一部データが欠落しています。`);
      }
      if (openFailures > 0) {
        warningMessages.push(`${openFailures}日のオープンオーダー取得に失敗しました。`);
      }
      const warning = warningMessages.length > 0 ? warningMessages.join(' ') : null;
      setError(warning);

      const result = aggregateSegments(allTransactions);

      const elapsedDays = dates.length;
      const averageDailySales = period === 'today' ? dailySalesTotal : (dates.length > 0 ? dailySalesTotal / elapsedDays : null);
      const overallAveragePerCustomer = dailyCustomersTotal > 0 ? dailySalesTotal / dailyCustomersTotal : null;

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
        dailyTrend: dailyTrend.sort((a, b) => a.date.localeCompare(b.date)),
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setError(err instanceof Error ? err.message : 'データの取得に失敗しました');
      setData(null);
    } finally {
      if (!currentAbortController.signal.aborted) {
        setLoading(false);
      }
    }
  }, [token, locationId, period, baseDate, startHour, endHour, weekIndex]);

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
    loading,
    error,
    refresh: fetchData,
    availableWeeks,
  };
}
