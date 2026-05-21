import { useState, useEffect, useCallback, useRef } from 'react';
import type { Transaction, OpenOrder, Location, PeriodPreset, DailySegmentPoint, SegmentBreakdown, AcquisitionBreakdown, LocationSegmentRow, LocationComparisonData } from '../types';
import { aggregateSegments, allocateSalesByTransaction, countCustomersByTransaction } from '../lib/customerSegment';
import { aggregateTrendByGranularity, granularityFor } from '../lib/trendAggregation';
import { calculatePeriodDates } from '../lib/periodDates';
import { MSG } from '../lib/messages';
import { fetchSalesRange, dayMetricsToTrendPoint } from '../lib/salesRangeAdapter';
import type { SalesRangeMeta, SalesRangeResponse } from '../lib/salesRangeAdapter';
import { getSalesRangeFlag } from '../lib/featureFlags';
import {
  calculateYoY,
  shiftRangeOneYearBack,
  shiftDateOneYearBack,
  aggregateSalesRangeTotals,
} from '../lib/yoy';
import type { SalesRangeYoYResult, SalesRangeTotal } from '../lib/yoy';

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
  /**
   * 前年同期比 (YoY) 計算を有効化する (店舗合計のみ、店舗別 YoY は Phase 4 範囲外)。
   * false (default) のときは既存挙動完全互換 (追加 fetch なし)。
   * 設計書: §4.5
   */
  enableYoy?: boolean;
}

export interface UseMultiLocationSegmentResult {
  data: LocationComparisonData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  detailLoading: boolean;
  detailError: string | null;
  detailAvailable: boolean;
  meta: SalesRangeMeta | null;
  /** 店舗合計の前年同期比結果。enableYoy=false 時は常に null。 */
  yoy: SalesRangeYoYResult | null;
  yoyLoading: boolean;
  yoyError: string | null;
}

type RangeFetchResult = {
  locationId: string;
  txByDate: Record<string, { transactions: Transaction[] }> | null;
  openByDate: Record<string, { orders: OpenOrder[] }> | null;
  txFailed: boolean;
  openFailed: boolean;
};

const ZERO_SEGMENT: SegmentBreakdown = { new: 0, repeat: 0, regular: 0, staff: 0, unlisted: 0 };
const ZERO_ACQUISITION: AcquisitionBreakdown = { google: 0, review: 0, signboard: 0, sns: 0, unknown: 0 };

export function useMultiLocationSegment(args: UseMultiLocationSegmentArgs): UseMultiLocationSegmentResult {
  const { token, locations, period, baseDate, startHour, endHour, weekIndex, quarterIndex, enabled, enableYoy = false } = args;

  const [data, setData] = useState<LocationComparisonData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailAvailable, setDetailAvailable] = useState<boolean>(true);
  const [meta, setMeta] = useState<SalesRangeMeta | null>(null);
  const [yoy, setYoy] = useState<SalesRangeYoYResult | null>(null);
  const [yoyLoading, setYoyLoading] = useState<boolean>(false);
  const [yoyError, setYoyError] = useState<string | null>(null);

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
    setDetailLoading(false);
    setDetailError(null);
    setMeta(null);
    setDetailAvailable(true);
    setYoy(null);
    setYoyLoading(false);
    setYoyError(null);

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

      const useSalesRangeFlag = getSalesRangeFlag();
      // 35 日ガード撤廃 (2026-05-21): 長期間 (四半期/年間) でも明細セクションを常時表示するため。
      // detailAvailable は将来の別理由 (権限・機能フラグ等) で false にする余地を残し、デフォルト true 固定。
      setDetailAvailable(true);

      const elapsedDays = dates.length;
      const granularity = granularityFor(period);

      if (!useSalesRangeFlag) {
        // 分岐 A: 旧コードパス (transactions-range + open-orders-range のみ)
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
              const d = await txResult.value.json();
              txByDate = d.byDate ?? {};
            } else {
              txFailed = true;
            }

            if (openResult.status === 'fulfilled' && openResult.value.ok) {
              const d = await openResult.value.json();
              openByDate = d.byDate ?? {};
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
              customersBySegment: { ...ZERO_SEGMENT },
              salesBySegment: { ...ZERO_SEGMENT },
              acquisitionBreakdown: { ...ZERO_ACQUISITION },
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
        }), { ...ZERO_SEGMENT });

        const salesAll = rows.reduce<SegmentBreakdown>((acc, r) => ({
          new: acc.new + r.salesBySegment.new,
          repeat: acc.repeat + r.salesBySegment.repeat,
          regular: acc.regular + r.salesBySegment.regular,
          staff: acc.staff + r.salesBySegment.staff,
          unlisted: acc.unlisted + r.salesBySegment.unlisted,
        }), { ...ZERO_SEGMENT });

        const acqAll = rows.reduce<AcquisitionBreakdown>((acc, r) => ({
          google: acc.google + r.acquisitionBreakdown.google,
          review: acc.review + r.acquisitionBreakdown.review,
          signboard: acc.signboard + r.acquisitionBreakdown.signboard,
          sns: acc.sns + r.acquisitionBreakdown.sns,
          unknown: acc.unknown + r.acquisitionBreakdown.unknown,
        }), { ...ZERO_ACQUISITION });

        const totalCustomersAll = customersAll.new + customersAll.repeat + customersAll.regular + customersAll.staff;

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
        return;
      }

      // 分岐 B: 新コードパス (Layer 1 sales-range × N 並列)
      const layer1Promises = locations.map(loc =>
        fetchSalesRange({
          start_date,
          end_date,
          location_id: loc.id,
          start_hour: startHour,
          token,
          signal: controller.signal,
        })
      );

      const layer1Results = await Promise.allSettled(layer1Promises);
      if (controller.signal.aborted) return;

      const layer1Map = new Map<string, SalesRangeResponse | null>();
      let allFailed = true;
      locations.forEach((loc, idx) => {
        const result = layer1Results[idx];
        if (result.status === 'fulfilled') {
          layer1Map.set(loc.id, result.value);
          allFailed = false;
        } else {
          layer1Map.set(loc.id, null);
        }
      });

      if (allFailed) {
        setError(MSG.error.period);
        setData(null);
        return;
      }

      // 代表 meta (最初の成功 response から)
      let representativeMeta: SalesRangeMeta | null = null;
      for (const loc of locations) {
        const r = layer1Map.get(loc.id);
        if (r) {
          representativeMeta = r.meta;
          break;
        }
      }
      if (representativeMeta) {
        setMeta(representativeMeta);
        if (representativeMeta.warnings && representativeMeta.warnings.length > 0) {
          console.warn('[useMultiLocationSegment] sales-range meta.warnings:', representativeMeta.warnings);
        }
        if (representativeMeta.partial_failures && representativeMeta.partial_failures.length > 0) {
          console.warn('[useMultiLocationSegment] sales-range meta.partial_failures:', representativeMeta.partial_failures);
        }
        if (representativeMeta.missing_combinations && representativeMeta.missing_combinations.length > 0) {
          console.warn('[useMultiLocationSegment] sales-range meta.missing_combinations:', representativeMeta.missing_combinations);
        }
      }

      // 各店舗の row を構築 (acquisitionBreakdown は zeros 初期化)
      const locRawTrendMap = new Map<string, DailySegmentPoint[]>();
      const rows: LocationSegmentRow[] = locations.map(loc => {
        const response = layer1Map.get(loc.id);
        if (!response) {
          locRawTrendMap.set(loc.id, []);
          return {
            locationId: loc.id,
            locationName: loc.name,
            totalSales: 0,
            averageDailySales: null,
            overallAveragePerCustomer: null,
            totalCustomers: 0,
            customersBySegment: { ...ZERO_SEGMENT },
            salesBySegment: { ...ZERO_SEGMENT },
            acquisitionBreakdown: { ...ZERO_ACQUISITION },
            dailyTrend: [],
            loadError: MSG.error.period,
            partialFailure: null,
            transactions: [],
          };
        }

        let totalSales = 0;
        const customers: SegmentBreakdown = { new: 0, repeat: 0, regular: 0, staff: 0, unlisted: 0 };
        const sales: SegmentBreakdown = { new: 0, repeat: 0, regular: 0, staff: 0, unlisted: 0 };
        const rawTrend: DailySegmentPoint[] = [];

        for (const date of dates) {
          const day = response.byDate[date];
          if (!day) {
            rawTrend.push({
              date,
              new: 0, repeat: 0, regular: 0, staff: 0, unlisted: 0,
              newSales: 0, repeatSales: 0, regularSales: 0, staffSales: 0, unlistedSales: 0,
            });
            continue;
          }
          totalSales += day.total_amount + day.open_total_amount;
          customers.new += day.new_customer_count;
          customers.repeat += day.repeat_customer_count;
          customers.regular += day.regular_customer_count;
          customers.staff += day.staff_customer_count;
          customers.unlisted += day.unlisted_customer_count;
          sales.new += day.new_sales;
          sales.repeat += day.repeat_sales;
          sales.regular += day.regular_sales;
          sales.staff += day.staff_sales;
          sales.unlisted += day.unlisted_sales;
          rawTrend.push(dayMetricsToTrendPoint(date, day));
        }

        locRawTrendMap.set(loc.id, rawTrend);

        const totalCustomers = customers.new + customers.repeat + customers.regular + customers.staff;
        const averageDailySales = period === 'today' ? totalSales : (elapsedDays > 0 ? totalSales / elapsedDays : null);
        const overallAveragePerCustomer = totalCustomers > 0 ? totalSales / totalCustomers : null;

        const sortedRawTrend = [...rawTrend].sort((a, b) => a.date.localeCompare(b.date));
        const aggregatedDailyTrend = aggregateTrendByGranularity(sortedRawTrend, granularity);

        return {
          locationId: loc.id,
          locationName: loc.name,
          totalSales,
          averageDailySales,
          overallAveragePerCustomer,
          totalCustomers,
          customersBySegment: customers,
          salesBySegment: sales,
          acquisitionBreakdown: { ...ZERO_ACQUISITION },
          dailyTrend: aggregatedDailyTrend,
          loadError: null,
          partialFailure: null,
          transactions: [],
        };
      });

      // totals 集計 (raw daily trend を全店舗合算 → granularity 集約)
      const totalSalesAll = rows.reduce((s, r) => s + r.totalSales, 0);
      const customersAll = rows.reduce<SegmentBreakdown>((acc, r) => ({
        new: acc.new + r.customersBySegment.new,
        repeat: acc.repeat + r.customersBySegment.repeat,
        regular: acc.regular + r.customersBySegment.regular,
        staff: acc.staff + r.customersBySegment.staff,
        unlisted: acc.unlisted + r.customersBySegment.unlisted,
      }), { ...ZERO_SEGMENT });

      const salesAll = rows.reduce<SegmentBreakdown>((acc, r) => ({
        new: acc.new + r.salesBySegment.new,
        repeat: acc.repeat + r.salesBySegment.repeat,
        regular: acc.regular + r.salesBySegment.regular,
        staff: acc.staff + r.salesBySegment.staff,
        unlisted: acc.unlisted + r.salesBySegment.unlisted,
      }), { ...ZERO_SEGMENT });

      const totalCustomersAll = customersAll.new + customersAll.repeat + customersAll.regular + customersAll.staff;

      const rawTotalsByDate = new Map<string, DailySegmentPoint>();
      for (const [, rawTrend] of locRawTrendMap) {
        for (const p of rawTrend) {
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
      const allDates = totalsDailyTrend.map(p => p.date);

      const fullyFailedCount = rows.filter(r => r.loadError).length;
      const warn = fullyFailedCount > 0
        ? `${fullyFailedCount}${MSG.warning.partialFailureMultiLocation.replace('{n}', String(fullyFailedCount * dates.length))}`
        : null;

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
          acquisitionBreakdown: { ...ZERO_ACQUISITION },
          dailyTrend: totalsDailyTrend,
        },
        allDates,
      });
      setError(warn);
      setLoading(false);

      // YoY: enableYoy=true なら lastYear を店舗ごとに並列 fetch し、店舗合計の YoY のみ算出 (§4.5)
      if (enableYoy) {
        setYoyLoading(true);
        const lastYearRange = shiftRangeOneYearBack({ start_date, end_date });

        const lastYearPromises = locations.map(loc =>
          fetchSalesRange({
            start_date: lastYearRange.start_date,
            end_date: lastYearRange.end_date,
            location_id: loc.id,
            start_hour: startHour,
            token,
            signal: controller.signal,
          })
        );

        try {
          const lastYearResults = await Promise.allSettled(lastYearPromises);
          if (controller.signal.aborted) return;

          // 全店舗の lastYear byDate を一つに合算 (日付ごとに加算)
          const lastYearMergedByDate: Record<
            string,
            { total_amount: number; transaction_count: number; customer_count: number }
          > = {};
          let lastYearAnySuccess = false;
          for (const r of lastYearResults) {
            if (r.status !== 'fulfilled') continue;
            lastYearAnySuccess = true;
            for (const [date, day] of Object.entries(r.value.byDate)) {
              const acc = lastYearMergedByDate[date] ?? {
                total_amount: 0,
                transaction_count: 0,
                customer_count: 0,
              };
              acc.total_amount += day.total_amount;
              acc.transaction_count += day.transaction_count;
              acc.customer_count += day.customer_count;
              lastYearMergedByDate[date] = acc;
            }
          }

          // current 側の全店舗合算 byDate を組み立てる (layer1Map から)
          const currentMergedByDate: Record<
            string,
            { total_amount: number; transaction_count: number; customer_count: number }
          > = {};
          for (const date of dates) {
            const acc = { total_amount: 0, transaction_count: 0, customer_count: 0 };
            for (const loc of locations) {
              const response = layer1Map.get(loc.id);
              if (!response) continue;
              const day = response.byDate[date];
              if (!day) continue;
              acc.total_amount += day.total_amount;
              acc.transaction_count += day.transaction_count;
              acc.customer_count += day.customer_count;
            }
            currentMergedByDate[date] = acc;
          }

          const currentTotals: SalesRangeTotal = aggregateSalesRangeTotals(currentMergedByDate);
          const lastYearTotals: SalesRangeTotal | null =
            lastYearAnySuccess && Object.keys(lastYearMergedByDate).length > 0
              ? aggregateSalesRangeTotals(lastYearMergedByDate)
              : null;

          const currentDates = Object.keys(currentMergedByDate).sort();
          let matchedDays = 0;
          const byDateArr: SalesRangeYoYResult['byDate'] = currentDates.map(date => {
            const cur = currentMergedByDate[date];
            const lastYearDate = shiftDateOneYearBack(date);
            const lyDay = lastYearMergedByDate[lastYearDate] ?? null;
            if (lyDay) matchedDays++;
            return {
              business_date: date,
              lastYearDate,
              current: cur,
              lastYear: lyDay,
            };
          });

          const totalDays = currentDates.length;
          const dataCoverage = totalDays > 0 ? matchedDays / totalDays : 0;

          const yoyResult: SalesRangeYoYResult = {
            period: { start: start_date, end: end_date },
            lastYearPeriod: { start: lastYearRange.start_date, end: lastYearRange.end_date },
            current: currentTotals,
            lastYear: lastYearTotals,
            yoy: {
              total_amount: calculateYoY(currentTotals.total_amount, lastYearTotals?.total_amount ?? null),
              transaction_count: calculateYoY(currentTotals.transaction_count, lastYearTotals?.transaction_count ?? null),
              customer_count: calculateYoY(currentTotals.customer_count, lastYearTotals?.customer_count ?? null),
            },
            dataCoverage,
            byDate: byDateArr,
          };

          setYoy(yoyResult);

          // 全店舗失敗時のみ yoyError 設定 (current は影響なし)
          const allLastYearFailed = lastYearResults.every(r => r.status === 'rejected');
          if (allLastYearFailed) {
            setYoyError('YoY 取得失敗 (前年)');
          }
        } catch (yoyErr) {
          if (yoyErr instanceof DOMException && yoyErr.name === 'AbortError') {
            return;
          }
          setYoyError(yoyErr instanceof Error ? yoyErr.message : 'YoY 取得失敗 (前年)');
        } finally {
          if (!controller.signal.aborted) {
            setYoyLoading(false);
          }
        }
      }

      // Layer 2: transactions / open-orders を店舗ごとに並列ロード (期間長に関わらず常時試行)
      setDetailLoading(true);

      const layer2Tasks: Promise<RangeFetchResult>[] = locations.map(loc => {
        const txUrl = `/api/transactions-range?start_date=${start_date}&end_date=${end_date}&location_id=${encodeURIComponent(loc.id)}&start_hour=${startHour}&end_hour=${endHour}`;
        const openUrl = `/api/open-orders-range?start_date=${start_date}&end_date=${end_date}&location_id=${encodeURIComponent(loc.id)}&start_hour=${startHour}&end_hour=${endHour}`;

        const txPromise = fetch(txUrl, { signal: controller.signal, headers });
        const openPromise = fetch(openUrl, { signal: controller.signal, headers });

        const locationId = loc.id;
        return Promise.allSettled([txPromise, openPromise]).then(async (results): Promise<RangeFetchResult> => {
          const txResult = results[0];
          const openResult = results[1];

          let txByDate: Record<string, { transactions: Transaction[] }> | null = null;
          let openByDate: Record<string, { orders: OpenOrder[] }> | null = null;
          let txFailed = false;
          let openFailed = false;

          if (txResult.status === 'fulfilled' && txResult.value.ok) {
            const d = await txResult.value.json();
            txByDate = d.byDate ?? {};
          } else {
            txFailed = true;
          }

          if (openResult.status === 'fulfilled' && openResult.value.ok) {
            const d = await openResult.value.json();
            openByDate = d.byDate ?? {};
          } else {
            openFailed = true;
          }

          return { locationId, txByDate, openByDate, txFailed, openFailed };
        });
      });

      try {
        const layer2Results = await Promise.all(layer2Tasks);
        if (controller.signal.aborted) return;

        const txByLocation = new Map<string, Transaction[]>();
        const acqByLocation = new Map<string, AcquisitionBreakdown>();
        let allLayer2Failed = true;
        const failedLocationNames: string[] = [];
        const locationNameMap = new Map<string, string>(locations.map(l => [l.id, l.name]));

        for (const { locationId, txByDate, openByDate, txFailed, openFailed } of layer2Results) {
          if (txFailed && openFailed) {
            txByLocation.set(locationId, []);
            acqByLocation.set(locationId, { ...ZERO_ACQUISITION });
            failedLocationNames.push(locationNameMap.get(locationId) ?? locationId);
            continue;
          }
          allLayer2Failed = false;
          const txs: Transaction[] = [];
          for (const date of dates) {
            const dayTx = txByDate?.[date]?.transactions ?? [];
            const dayOpen = openByDate?.[date]?.orders ?? [];
            txs.push(...dayTx, ...dayOpen.map(openOrderToTransaction));
          }
          txByLocation.set(locationId, txs);
          const agg = aggregateSegments(txs);
          acqByLocation.set(locationId, agg.acquisition);
        }

        if (allLayer2Failed) {
          setDetailError(MSG.error.period);
          return;
        }

        // 部分失敗 (一部店舗のみ Layer 2 失敗) を detailError に反映
        if (failedLocationNames.length > 0) {
          setDetailError(`${failedLocationNames.length}店舗の明細取得失敗: ${failedLocationNames.join(', ')}`);
        }

        setData(prev => {
          if (!prev) return prev;
          const updatedRows = prev.rows.map(row => {
            const txs = txByLocation.get(row.locationId) ?? [];
            const acq = acqByLocation.get(row.locationId) ?? { ...ZERO_ACQUISITION };
            return {
              ...row,
              acquisitionBreakdown: acq,
              transactions: txs,
            };
          });

          const acqAll = updatedRows.reduce<AcquisitionBreakdown>((acc, r) => ({
            google: acc.google + r.acquisitionBreakdown.google,
            review: acc.review + r.acquisitionBreakdown.review,
            signboard: acc.signboard + r.acquisitionBreakdown.signboard,
            sns: acc.sns + r.acquisitionBreakdown.sns,
            unknown: acc.unknown + r.acquisitionBreakdown.unknown,
          }), { ...ZERO_ACQUISITION });

          return {
            ...prev,
            rows: updatedRows,
            totals: {
              ...prev.totals,
              acquisitionBreakdown: acqAll,
            },
          };
        });
      } catch (layer2Err) {
        if (layer2Err instanceof DOMException && layer2Err.name === 'AbortError') {
          return;
        }
        setDetailError(layer2Err instanceof Error ? layer2Err.message : MSG.error.fetch);
      } finally {
        if (!controller.signal.aborted) {
          setDetailLoading(false);
        }
      }
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
  }, [token, period, baseDate, startHour, endHour, weekIndex, quarterIndex, enabled, locationIdsKey, enableYoy]); // eslint-disable-line react-hooks/exhaustive-deps

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
    detailLoading,
    detailError,
    detailAvailable,
    meta,
    yoy,
    yoyLoading,
    yoyError,
  };
}
