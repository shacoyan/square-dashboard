import { useState, useEffect, useCallback, useRef } from 'react';
import type { Transaction, OpenOrder, Location, PeriodPreset, DailySegmentPoint, SegmentBreakdown, AcquisitionBreakdown, LocationSegmentRow, LocationComparisonData } from '../types';
import { aggregateSegments, allocateSalesByTransaction, countCustomersByTransaction } from '../lib/customerSegment';
import { aggregateTrendByGranularity, granularityFor } from '../lib/trendAggregation';
import { calculatePeriodDates } from '../lib/periodDates';
import { MSG } from '../lib/messages';

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
  quarterIndex?: number;
  enabled: boolean;
}

export interface UseMultiLocationSegmentResult {
  data: LocationComparisonData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

type RangeFetchResult = {
  locationId: string;
  txByDate: Record<string, { transactions: Transaction[] }> | null;
  openByDate: Record<string, { orders: OpenOrder[] }> | null;
  txFailed: boolean;
  openFailed: boolean;
};

export function useMultiLocationSegment(args: UseMultiLocationSegmentArgs): UseMultiLocationSegmentResult {
  const { token, locations, period, baseDate, startHour, endHour, weekIndex, quarterIndex, enabled } = args;

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
      const dates = calculatePeriodDates(period, baseDate, weekIndex, quarterIndex);
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

      const start_date = dates[0];
      const end_date = dates[dates.length - 1];

      const tasks: Promise<RangeFetchResult>[] = [];

      for (const loc of locations) {
        const txUrl = `/api/transactions-range?start_date=${start_date}&end_date=${end_date}&location_id=${encodeURIComponent(loc.id)}&start_hour=${startHour}&end_hour=${endHour}`;
        const openUrl = `/api/open-orders-range?start_date=${start_date}&end_date=${end_date}&location_id=${encodeURIComponent(loc.id)}&start_hour=${startHour}&end_hour=${endHour}`;

        const txPromise = fetch(txUrl, { signal: controller.signal, headers });
        const openPromise = fetch(openUrl, { signal: controller.signal, headers });

        const locationId = loc.id;

        const task = Promise.allSettled([txPromise, openPromise]).then(async (results): Promise<RangeFetchResult> => {
          const txResult = results[0];
          const openResult = results[1];

          let txByDate: Record<string, { transactions: Transaction[] }> | null = null;
          let openByDate: Record<string, { orders: OpenOrder[] }> | null = null;
          let txFailed = false;
          let openFailed = false;

          if (txResult.status === 'fulfilled' && txResult.value.ok) {
            const data = await txResult.value.json();
            txByDate = data.byDate ?? {};
          } else {
            txFailed = true;
          }

          if (openResult.status === 'fulfilled' && openResult.value.ok) {
            const data = await openResult.value.json();
            openByDate = data.byDate ?? {};
          } else {
            openFailed = true;
          }

          return { locationId, txByDate, openByDate, txFailed, openFailed };
        });

        tasks.push(task);
      }

      const allResults = await Promise.all(tasks);
      if (controller.signal.aborted) return;

      const locMap = new Map<string, { transactions: Transaction[]; dailyTrend: DailySegmentPoint[]; failedDays: number; totalDays: number }>();
      locations.forEach(loc => locMap.set(loc.id, { transactions: [], dailyTrend: [], failedDays: 0, totalDays: dates.length }));

      let totalFailedPairs = 0;

      for (const { locationId, txByDate, openByDate, txFailed, openFailed } of allResults) {
        const entry = locMap.get(locationId);
        if (!entry) continue;
        if (txFailed && openFailed) {
          entry.failedDays = dates.length;
          totalFailedPairs += dates.length;
          continue;
        }
        for (const date of dates) {
          const transactions = txByDate?.[date]?.transactions ?? [];
          const openOrders = openByDate?.[date]?.orders ?? [];
          const mappedOpen = openOrders.map(openOrderToTransaction);
          const combined = [...transactions, ...mappedOpen];
          entry.transactions.push(...combined);

          let n = 0, rp = 0, rg = 0, st = 0, ul = 0;
          let nS = 0, rpS = 0, rgS = 0, stS = 0, ulS = 0;
          for (const tx of combined) {
            const c = countCustomersByTransaction(tx);
            n += c.new; rp += c.repeat; rg += c.regular; st += c.staff; ul += c.unlisted;
            const s = allocateSalesByTransaction(tx);
            nS += s.new; rpS += s.repeat; rgS += s.regular; stS += s.staff; ulS += s.unlisted;
          }
          entry.dailyTrend.push({
            date,
            new: n, repeat: rp, regular: rg, staff: st, unlisted: ul,
            newSales: nS, repeatSales: rpS, regularSales: rgS, staffSales: stS, unlistedSales: ulS,
          });
        }
      }

      const elapsedDays = dates.length;
      const granularity = granularityFor(period);

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
            loadError: MSG.error.period,
            partialFailure: null,
            transactions: [],
          };
        }
        const agg = aggregateSegments(entry.transactions);
        const totalSales = entry.transactions.reduce((sum, t) => sum + (t.amount ?? 0), 0);
        const totalCustomers = agg.customers.new + agg.customers.repeat + agg.customers.regular + agg.customers.staff;
        const averageDailySales = period === 'today' ? totalSales : (elapsedDays > 0 ? totalSales / elapsedDays : null);
        const overallAveragePerCustomer = totalCustomers > 0 ? totalSales / totalCustomers : null;
        const sortedDailyTrend = [...entry.dailyTrend].sort((a, b) => a.date.localeCompare(b.date));
        const aggregatedDailyTrend = aggregateTrendByGranularity(sortedDailyTrend, granularity);
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
          dailyTrend: aggregatedDailyTrend,
          loadError: null,
          partialFailure: entry.failedDays > 0 ? { failedDays: entry.failedDays, totalDays: entry.totalDays } : null,
          transactions: entry.transactions,
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

      // Totals trend: locMap の raw daily を date キーで全店舗合算 → 最後に一回だけ granularity 集約
      // (P2-2: rows[*].dailyTrend は granularity 集約済のため二段集約になっていたのを解消)
      const rawTotalsByDate = new Map<string, DailySegmentPoint>();
      for (const [, entry] of locMap) {
        for (const p of entry.dailyTrend) {
          const e = rawTotalsByDate.get(p.date) ?? {
            date: p.date,
            new: 0, repeat: 0, regular: 0, staff: 0, unlisted: 0,
            newSales: 0, repeatSales: 0, regularSales: 0, staffSales: 0, unlistedSales: 0,
          };
          e.new += p.new;
          e.repeat += p.repeat;
          e.regular += p.regular;
          e.staff += p.staff;
          e.unlisted += p.unlisted;
          e.newSales += p.newSales;
          e.repeatSales += p.repeatSales;
          e.regularSales += p.regularSales;
          e.staffSales += p.staffSales;
          e.unlistedSales += p.unlistedSales;
          rawTotalsByDate.set(p.date, e);
        }
      }
      const rawTotalsSorted = Array.from(rawTotalsByDate.values()).sort((a, b) => a.date.localeCompare(b.date));
      const totalsDailyTrend = aggregateTrendByGranularity(rawTotalsSorted, granularity);
      const totalsAvgDaily = period === 'today' ? totalSalesAll : (elapsedDays > 0 ? totalSalesAll / elapsedDays : null);
      const totalsAvgPerCustomer = totalCustomersAll > 0 ? totalSalesAll / totalCustomersAll : null;

      const totalPairs = locations.length * dates.length;
      if (totalFailedPairs === totalPairs) {
        setData(null);
        setError(MSG.error.period);
        return;
      }

      const fullyFailedCount = rows.filter(r => r.loadError).length;
      let warn: string | null = null;
      if (totalFailedPairs > 0) {
        warn = `${fullyFailedCount}${MSG.warning.partialFailureMultiLocation.replace('{n}', String(totalFailedPairs))}`;
      }

      // allDates: chart の bucket key 配列。粒度集約後の date 列を採用（昇順）。
      const allDates = totalsDailyTrend.map(p => p.date);

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
        allDates,
      });
      setError(warn);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      const message = err instanceof Error ? err.message : MSG.error.fetch;
      setError(message);
      setData(null);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [token, period, baseDate, startHour, endHour, weekIndex, quarterIndex, enabled, locationIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
