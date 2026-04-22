import { useState, useEffect, useCallback, useRef } from 'react';
import type { Transaction, OpenOrder, Location, PeriodPreset, DailySegmentPoint, SegmentBreakdown, AcquisitionBreakdown, LocationSegmentRow, LocationComparisonData } from '../types';
import { aggregateSegments, countCustomersByTransaction } from '../lib/customerSegment';

function getJSTDateParts(date: Date): { year: number; month: number; day: number } {
  const jstString = date.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = jstString.split('/').map(Number);
  return { year: parts[0], month: parts[1], day: parts[2] };
}

function formatJSTDateString(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getMonOffset(date: Date): number {
  const d = date.getUTCDay();
  return (d + 6) % 7;
}

function getFirstWeekMonday(year: number, month: number): Date {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = getMonOffset(first);
  return new Date(Date.UTC(year, month - 1, 1 - offset));
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

export interface UseMultiLocationSegmentArgs {
  token: string;
  locations: Location[];
  period: PeriodPreset;
  baseDate: string;
  startHour: number;
  endHour: number;
  weekIndex?: number;
  enabled: boolean;
}

export interface UseMultiLocationSegmentResult {
  data: LocationComparisonData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useMultiLocationSegment(args: UseMultiLocationSegmentArgs): UseMultiLocationSegmentResult {
  const { token, locations, period, baseDate, startHour, endHour, weekIndex, enabled } = args;

  const [data, setData] = useState<LocationComparisonData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const locationIdsKey = locations.map(l => l.id).join(',');

  const fetchData = useCallback(async () => {
    if (!enabled) return;
    if (locations.length === 0) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);
    setData(null);

    try {
      const dates = calculatePeriodDates(period, baseDate, weekIndex);
      if (dates.length === 0) {
        setLoading(false);
        setData(null);
        setError('この週はまだ経過していません');
        return;
      }

      const headers: HeadersInit = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      type FetchResult = {
        locationId: string;
        date: string;
        transactions: Transaction[];
        openOrders: OpenOrder[];
        failed: boolean;
      };

      const tasks: Promise<FetchResult>[] = [];

      for (const loc of locations) {
        for (const date of dates) {
          const txUrl = `/api/transactions?date=${date}&location_id=${loc.id}&start_hour=${startHour}&end_hour=${endHour}`;
          const openUrl = `/api/open-orders?date=${date}&location_id=${loc.id}&start_hour=${startHour}&end_hour=${endHour}`;

          const txPromise = fetch(txUrl, { signal: controller.signal, headers })
            .then(res => {
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              return res.json() as Promise<{ transactions: Transaction[] }>;
            })
            .then(payload => payload.transactions ?? []);

          const openPromise = fetch(openUrl, { signal: controller.signal, headers })
            .then(res => {
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              return res.json() as Promise<{ orders?: OpenOrder[] }>;
            })
            .then(payload => payload.orders ?? []);

          const locationId = loc.id;
          const taskDate = date;

          const task = Promise.allSettled([txPromise, openPromise]).then((results): FetchResult => {
            const txResult = results[0];
            const openResult = results[1];
            const failed = txResult.status === 'rejected' && openResult.status === 'rejected';
            const transactions = txResult.status === 'fulfilled' ? txResult.value : [];
            const openOrders = openResult.status === 'fulfilled' ? openResult.value : [];
            return { locationId, date: taskDate, transactions, openOrders, failed };
          });

          tasks.push(task);
        }
      }

      const allResults = await Promise.all(tasks);
      if (controller.signal.aborted) return;

      const locMap = new Map<string, { transactions: Transaction[]; dailyTrend: DailySegmentPoint[]; failedDays: number; totalDays: number }>();
      locations.forEach(loc => locMap.set(loc.id, { transactions: [], dailyTrend: [], failedDays: 0, totalDays: dates.length }));

      let totalFailedPairs = 0;

      for (const r of allResults) {
        const entry = locMap.get(r.locationId);
        if (!entry) continue;
        if (r.failed) {
          entry.failedDays++;
          totalFailedPairs++;
          continue;
        }
        const mappedOpen = r.openOrders.map(openOrderToTransaction);
        const combined = [...r.transactions, ...mappedOpen];
        entry.transactions.push(...combined);

        let n = 0, rp = 0, rg = 0, st = 0, ul = 0;
        for (const tx of combined) {
          const c = countCustomersByTransaction(tx);
          n += c.new;
          rp += c.repeat;
          rg += c.regular;
          st += c.staff;
          ul += c.unlisted;
        }
        entry.dailyTrend.push({ date: r.date, new: n, repeat: rp, regular: rg, staff: st, unlisted: ul });
      }

      const elapsedDays = dates.length;
      const rows: LocationSegmentRow[] = locations.map(loc => {
        const entry = locMap.get(loc.id)!;
        const fullyFailed = entry.failedDays === entry.totalDays;
        if (fullyFailed) {
          return {
            locationId: loc.id,
            locationName: loc.name,
            totalSales: 0,
            averageDailySales: null,
            overallAveragePerCustomer: null,
            totalCustomers: 0,
            customersBySegment: { new: 0, repeat: 0, regular: 0, staff: 0, unlisted: 0 },
            salesBySegment: { new: 0, repeat: 0, regular: 0, staff: 0, unlisted: 0 },
            acquisitionBreakdown: { google: 0, review: 0, signboard: 0, sns: 0, unknown: 0 },
            dailyTrend: [],
            loadError: '期間データ取得失敗',
            partialFailure: null,
          };
        }
        const agg = aggregateSegments(entry.transactions);
        const totalSales = entry.transactions.reduce((sum, t) => sum + (t.amount ?? 0), 0);
        const totalCustomers = agg.customers.new + agg.customers.repeat + agg.customers.regular + agg.customers.staff;
        const averageDailySales = period === 'today' ? totalSales : (elapsedDays > 0 ? totalSales / elapsedDays : null);
        const overallAveragePerCustomer = totalCustomers > 0 ? totalSales / totalCustomers : null;
        const dailyTrend = [...entry.dailyTrend].sort((a, b) => a.date.localeCompare(b.date));
        return {
          locationId: loc.id,
          locationName: loc.name,
          totalSales,
          averageDailySales,
          overallAveragePerCustomer,
          totalCustomers,
          customersBySegment: agg.customers,
          salesBySegment: agg.sales,
          acquisitionBreakdown: agg.acquisition,
          dailyTrend,
          loadError: null,
          partialFailure: entry.failedDays > 0 ? { failedDays: entry.failedDays, totalDays: entry.totalDays } : null,
        };
      });

      const totalSalesAll = rows.reduce((s, r) => s + r.totalSales, 0);
      const customersAll = rows.reduce<SegmentBreakdown>((acc, r) => ({
        new: acc.new + r.customersBySegment.new,
        repeat: acc.repeat + r.customersBySegment.repeat,
        regular: acc.regular + r.customersBySegment.regular,
        staff: acc.staff + r.customersBySegment.staff,
        unlisted: acc.unlisted + r.customersBySegment.unlisted,
      }), { new: 0, repeat: 0, regular: 0, staff: 0, unlisted: 0 });

      const salesAll = rows.reduce<SegmentBreakdown>((acc, r) => ({
        new: acc.new + r.salesBySegment.new,
        repeat: acc.repeat + r.salesBySegment.repeat,
        regular: acc.regular + r.salesBySegment.regular,
        staff: acc.staff + r.salesBySegment.staff,
        unlisted: acc.unlisted + r.salesBySegment.unlisted,
      }), { new: 0, repeat: 0, regular: 0, staff: 0, unlisted: 0 });

      const acqAll = rows.reduce<AcquisitionBreakdown>((acc, r) => ({
        google: acc.google + r.acquisitionBreakdown.google,
        review: acc.review + r.acquisitionBreakdown.review,
        signboard: acc.signboard + r.acquisitionBreakdown.signboard,
        sns: acc.sns + r.acquisitionBreakdown.sns,
        unknown: acc.unknown + r.acquisitionBreakdown.unknown,
      }), { google: 0, review: 0, signboard: 0, sns: 0, unknown: 0 });

      const totalCustomersAll = customersAll.new + customersAll.repeat + customersAll.regular + customersAll.staff;

      const trendMap = new Map<string, DailySegmentPoint>();
      for (const r of rows) {
        for (const p of r.dailyTrend) {
          const e = trendMap.get(p.date) ?? { date: p.date, new: 0, repeat: 0, regular: 0, staff: 0, unlisted: 0 };
          e.new += p.new;
          e.repeat += p.repeat;
          e.regular += p.regular;
          e.staff += p.staff;
          e.unlisted += p.unlisted;
          trendMap.set(p.date, e);
        }
      }
      const totalsDailyTrend = Array.from(trendMap.values()).sort((a, b) => a.date.localeCompare(b.date));
      const totalsAvgDaily = period === 'today' ? totalSalesAll : (elapsedDays > 0 ? totalSalesAll / elapsedDays : null);
      const totalsAvgPerCustomer = totalCustomersAll > 0 ? totalSalesAll / totalCustomersAll : null;

      const totalPairs = locations.length * dates.length;
      if (totalFailedPairs === totalPairs) {
        setData(null);
        setError('期間データ取得失敗');
        return;
      }

      const fullyFailedCount = rows.filter(r => r.loadError).length;
      let warn: string | null = null;
      if (totalFailedPairs > 0) {
        warn = `${fullyFailedCount}店舗×${totalFailedPairs}日で取得失敗`;
      }

      setData({
        period,
        periodStart: dates[0],
        periodEnd: dates[dates.length - 1],
        elapsedDays,
        rows,
        totals: {
          totalSales: totalSalesAll,
          averageDailySales: totalsAvgDaily,
          overallAveragePerCustomer: totalsAvgPerCustomer,
          totalCustomers: totalCustomersAll,
          customersBySegment: customersAll,
          salesBySegment: salesAll,
          acquisitionBreakdown: acqAll,
          dailyTrend: totalsDailyTrend,
        },
        allDates: [...dates],
      });
      setError(warn);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      const message = err instanceof Error ? err.message : 'データの取得に失敗しました';
      setError(message);
      setData(null);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [token, period, baseDate, startHour, endHour, weekIndex, enabled, locationIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchData();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [fetchData]);

  const refresh = useCallback(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refresh,
  };
}
