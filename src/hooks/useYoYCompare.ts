import { useState, useEffect, useRef } from 'react';
import { fetchSalesRange } from '../lib/salesRangeAdapter';
import type { SalesRangeMeta, SalesRangeResponse } from '../lib/salesRangeAdapter';
import {
  calculateYoY,
  shiftRangeOneYearBack,
  shiftDateOneYearBack,
  aggregateSalesRangeTotals,
  isLastYearDataInsufficient,
} from '../lib/yoy';
import type { SalesRangeYoYResult, SalesRangeTotal } from '../lib/yoy';

export interface UseYoYCompareArgs {
  start_date: string;
  end_date: string;
  location_id: string;
  start_hour?: number;
  token?: string;
  enabled: boolean;
}

export interface UseYoYCompareResult {
  data: SalesRangeYoYResult | null;
  loading: boolean;
  error: string | null;
  currentMeta: SalesRangeMeta | null;
  lastYearMeta: SalesRangeMeta | null;
}

/**
 * 純粋関数: current/lastYear の SalesRangeResponse から SalesRangeYoYResult を組み立てる。
 *
 * - lastYearRes が null または byDate が空 → lastYear=null 部分成功
 * - byDate ペアリング: current の各日付を -1 year シフトして lastYear 側を引く
 * - dataCoverage: 前年データがある日数 / current 日数
 *
 * テスタビリティのため hook 本体から分離 (React 環境なしでもユニットテスト可能)。
 */
export function buildYoYResultFromResponses(args: {
  start_date: string;
  end_date: string;
  currentRes: SalesRangeResponse;
  lastYearRes: SalesRangeResponse | null;
}): SalesRangeYoYResult {
  const { start_date, end_date, currentRes } = args;
  const lastYearRange = shiftRangeOneYearBack({ start_date, end_date });

  const hasLastYear = !!args.lastYearRes && Object.keys(args.lastYearRes.byDate).length > 0;
  const lastYearRes = hasLastYear ? args.lastYearRes : null;

  const currentTotals: SalesRangeTotal = aggregateSalesRangeTotals(currentRes.byDate);
  const rawLastYearTotals: SalesRangeTotal | null = lastYearRes
    ? aggregateSalesRangeTotals(lastYearRes.byDate)
    : null;

  // 前年 4 セグメント客数合計が MIN_LASTYEAR_CUSTOMERS 未満なら
  // 事実上データなしとみなし、lastYear 全体を null 化 (YoY 全フィールド no_data)。
  // SABABA は Square 本格運用が 2025-03 開始のため 2024 年度以前は集計が空。
  const lastYearInsufficient = isLastYearDataInsufficient(rawLastYearTotals);
  const lastYearTotals: SalesRangeTotal | null = lastYearInsufficient ? null : rawLastYearTotals;
  const effectiveLastYearRes = lastYearInsufficient ? null : lastYearRes;

  const currentDates = Object.keys(currentRes.byDate).sort();
  let matchedDays = 0;

  const byDate: SalesRangeYoYResult['byDate'] = currentDates.map((date) => {
    const cur = currentRes.byDate[date];
    const lastYearDate = shiftDateOneYearBack(date);
    const lyDay = effectiveLastYearRes?.byDate[lastYearDate] ?? null;
    if (lyDay) matchedDays++;
    return {
      business_date: date,
      lastYearDate,
      current: {
        total_amount: cur.total_amount,
        transaction_count: cur.transaction_count,
        customer_count: cur.customer_count,
      },
      lastYear: lyDay
        ? {
            total_amount: lyDay.total_amount,
            transaction_count: lyDay.transaction_count,
            customer_count: lyDay.customer_count,
          }
        : null,
    };
  });

  const totalDays = currentDates.length;
  const dataCoverage = totalDays > 0 ? matchedDays / totalDays : 0;

  const yoy = {
    total_amount: calculateYoY(currentTotals.total_amount, lastYearTotals?.total_amount ?? null),
    transaction_count: calculateYoY(currentTotals.transaction_count, lastYearTotals?.transaction_count ?? null),
    customer_count: calculateYoY(currentTotals.customer_count, lastYearTotals?.customer_count ?? null),
    new_customer_count: calculateYoY(currentTotals.new_customer_count, lastYearTotals?.new_customer_count ?? null),
    repeat_customer_count: calculateYoY(currentTotals.repeat_customer_count, lastYearTotals?.repeat_customer_count ?? null),
    regular_customer_count: calculateYoY(currentTotals.regular_customer_count, lastYearTotals?.regular_customer_count ?? null),
    staff_customer_count: calculateYoY(currentTotals.staff_customer_count, lastYearTotals?.staff_customer_count ?? null),
  };

  return {
    period: { start: start_date, end: end_date },
    lastYearPeriod: { start: lastYearRange.start_date, end: lastYearRange.end_date },
    current: currentTotals,
    lastYear: lastYearTotals,
    yoy,
    dataCoverage,
    byDate,
  };
}

/**
 * current 期間 + lastYear 期間を並列フェッチして YoY 結果を返す hook。
 *
 * 設計書: .company/engineering/docs/2026-05-22-square-dashboard-phase4-yoy-techdesign.md §4.3
 *
 * - args.enabled=false の間は fetch しない (state は初期値に戻る)
 * - 両期間を Promise.allSettled で並列実行
 * - current 失敗 → error='YoY 取得失敗 (当年)' で data=null
 * - lastYear のみ失敗 → 部分成功 (data.lastYear=null、yoy.* は no_data)
 * - AbortController で前回 fetch を中断
 *
 * NOTE: Phase 4 では Dashboard から直接使われない (既存 useCustomerSegment /
 * useMultiLocationSegment が enableYoy=true 時に内部で lastYear fetch を行う方針 §4.3.3)。
 * 将来 segment 以外の画面で YoY を使う場合の独立利用用に export しておく。
 */
export function useYoYCompare(args: UseYoYCompareArgs): UseYoYCompareResult {
  const { enabled, start_date, end_date, location_id, start_hour, token } = args;

  const [data, setData] = useState<SalesRangeYoYResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentMeta, setCurrentMeta] = useState<SalesRangeMeta | null>(null);
  const [lastYearMeta, setLastYearMeta] = useState<SalesRangeMeta | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      setLoading(false);
      setError(null);
      setCurrentMeta(null);
      setLastYearMeta(null);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);
    setData(null);
    setCurrentMeta(null);
    setLastYearMeta(null);

    const lastYearRange = shiftRangeOneYearBack({ start_date, end_date });

    const fetchCurrent = fetchSalesRange({
      start_date,
      end_date,
      location_id,
      start_hour,
      token,
      signal: controller.signal,
    });

    const fetchLastYear = fetchSalesRange({
      start_date: lastYearRange.start_date,
      end_date: lastYearRange.end_date,
      location_id,
      start_hour,
      token,
      signal: controller.signal,
    });

    Promise.allSettled([fetchCurrent, fetchLastYear]).then(([currentResult, lastYearResult]) => {
      if (controller.signal.aborted) return;

      if (currentResult.status === 'rejected') {
        const reason = currentResult.reason;
        if (reason instanceof DOMException && reason.name === 'AbortError') {
          return;
        }
        setError('YoY 取得失敗 (当年)');
        setData(null);
        setLoading(false);
        return;
      }

      const currentRes = currentResult.value;
      setCurrentMeta(currentRes.meta);

      let lastYearRes: SalesRangeResponse | null = null;
      if (lastYearResult.status === 'fulfilled') {
        const lyRes = lastYearResult.value;
        if (Object.keys(lyRes.byDate).length > 0) {
          lastYearRes = lyRes;
          setLastYearMeta(lyRes.meta);
        }
      } else {
        const reason = lastYearResult.reason;
        if (reason instanceof DOMException && reason.name === 'AbortError') {
          return;
        }
        // lastYear 失敗は部分成功扱い (error には設定しない)
      }

      const result = buildYoYResultFromResponses({
        start_date,
        end_date,
        currentRes,
        lastYearRes,
      });

      setData(result);
      setLoading(false);
    });

    return () => {
      controller.abort();
    };
  }, [enabled, start_date, end_date, location_id, start_hour, token]);

  return { data, loading, error, currentMeta, lastYearMeta };
}
