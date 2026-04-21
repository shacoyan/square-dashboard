import { useState, useEffect, useCallback, useRef } from 'react';
import type { Transaction, CustomerSegmentAnalysis, PeriodPreset, DailySegmentPoint } from '../types';
import { aggregateSegments, countCustomersByTransaction } from '../lib/customerSegment';

interface Args {
  token: string;
  locationId: string;
  period: PeriodPreset;
  baseDate: string;
  startHour: number;
  endHour: number;
}

function getJSTDateParts(date: Date): { year: number; month: number; day: number } {
  const jstString = date.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = jstString.split('/').map(Number);
  return { year: parts[0], month: parts[1], day: parts[2] };
}

function formatJSTDateString(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function calculatePeriodDates(period: PeriodPreset, baseDate: string): string[] {
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
    let m = bm;
    let y = by;
    if (m < 3) {
      m += 12;
      y -= 1;
    }
    const k = y % 100;
    const j = Math.floor(y / 100);
    const h = (bd + Math.floor((13 * (m + 1)) / 5) + k + Math.floor(k / 4) + Math.floor(j / 4) + 5 * j) % 7;
    // h=0: Saturday, 1: Sunday, 2: Monday, 3: Tuesday, 4: Wednesday, 5: Thursday, 6: Friday
    const dayOfWeek = (h + 5) % 7; // Map to Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5, Sun=6
    
    startDateObj = new Date(Date.UTC(by, bm - 1, bd - dayOfWeek));
    endDateObj = new Date(Date.UTC(by, bm - 1, bd + (6 - dayOfWeek)));
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

  return dates;
}

export function useCustomerSegment(args: Args): {
  data: CustomerSegmentAnalysis | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const { token, locationId, period, baseDate, startHour, endHour } = args;

  const [data, setData] = useState<CustomerSegmentAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

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

    const dates = calculatePeriodDates(period, baseDate);

    const headers: HeadersInit = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const allTransactions: Transaction[] = [];
    let failures = 0;
    let dailySalesTotal = 0;
    let dailyCustomersTotal = 0;
    const dailyTrend: DailySegmentPoint[] = [];

    const fetchPromises = dates.map(date =>
      fetch(`/api/transactions?date=${date}&location_id=${locationId}&start_hour=${startHour}&end_hour=${endHour}`, {
        headers,
        signal: currentAbortController.signal,
      })
        .then(res => {
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          return res.json() as Promise<{ transactions: Transaction[] }>;
        })
        .then(payload => {
          const transactions = payload.transactions ?? [];
          allTransactions.push(...transactions);

          let dayNew = 0;
          let dayRepeat = 0;
          let dayRegular = 0;

          transactions.forEach(tx => {
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

          const daySales = transactions.reduce((sum, t) => sum + (t.amount ?? 0), 0);
          dailySalesTotal += daySales;
        })
        .catch(err => {
          if (err instanceof DOMException && err.name === 'AbortError') {
            throw err;
          }
          failures++;
        })
    );

    try {
      await Promise.all(fetchPromises);

      if (currentAbortController.signal.aborted) {
        return;
      }

      if (failures === dates.length) {
        setData(null);
        setError('期間データ取得失敗');
        return;
      }

      const warning = failures > 0 ? `${failures}日のデータ取得に失敗しました。一部データが欠落しています。` : null;
      setError(warning);

      const result = aggregateSegments(allTransactions);

      const elapsedDays = dates.length;
      const averageDailySales = period === 'today' ? null : (dates.length > 0 ? dailySalesTotal / elapsedDays : null);
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
  }, [token, locationId, period, baseDate, startHour, endHour]);

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
  };
}
