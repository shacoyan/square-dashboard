import { describe, it, expect } from 'vitest';
import { buildYoYResultFromResponses } from './useYoYCompare';
import type { SalesRangeDay, SalesRangeResponse } from '../lib/salesRangeAdapter';

function makeDay(overrides: Partial<SalesRangeDay> = {}): SalesRangeDay {
  return {
    total_amount: 10000,
    open_total_amount: 0,
    transaction_count: 10,
    customer_count: 7,
    new_customer_count: 2,
    repeat_customer_count: 3,
    regular_customer_count: 1,
    staff_customer_count: 0,
    unlisted_customer_count: 1,
    new_sales: 2000,
    repeat_sales: 5000,
    regular_sales: 2000,
    staff_sales: 0,
    unlisted_sales: 1000,
    open_order_count: 0,
    ...overrides,
  };
}

function makeResponse(byDate: Record<string, SalesRangeDay>): SalesRangeResponse {
  return {
    byDate,
    meta: {
      source: 'aggregate',
      location_ids: ['L1'],
      live_dates: [],
      aggregate_dates: Object.keys(byDate),
      future_dates: [],
      use_aggregate: true,
    },
  };
}

describe('buildYoYResultFromResponses (useYoYCompare の純粋ロジック)', () => {
  it('current + lastYear 両方ある → yoy 計算され dataCoverage=1', () => {
    const currentRes = makeResponse({
      '2026-05-01': makeDay({ total_amount: 1100, transaction_count: 11, customer_count: 6 }),
      '2026-05-02': makeDay({ total_amount: 1200, transaction_count: 12, customer_count: 7 }),
    });
    const lastYearRes = makeResponse({
      '2025-05-01': makeDay({ total_amount: 1000, transaction_count: 10, customer_count: 5 }),
      '2025-05-02': makeDay({ total_amount: 1000, transaction_count: 10, customer_count: 5 }),
    });

    const res = buildYoYResultFromResponses({
      start_date: '2026-05-01',
      end_date: '2026-05-02',
      currentRes,
      lastYearRes,
    });

    expect(res.current.total_amount).toBe(2300);
    expect(res.lastYear?.total_amount).toBe(2000);
    expect(res.yoy.total_amount.classification).toBe('up');
    expect(res.yoy.total_amount.deltaPercent).toBeCloseTo(15);
    expect(res.dataCoverage).toBe(1);
    expect(res.period).toEqual({ start: '2026-05-01', end: '2026-05-02' });
    expect(res.lastYearPeriod).toEqual({ start: '2025-05-01', end: '2025-05-02' });
    expect(res.byDate).toHaveLength(2);
    expect(res.byDate[0].business_date).toBe('2026-05-01');
    expect(res.byDate[0].lastYearDate).toBe('2025-05-01');
    expect(res.byDate[0].lastYear).not.toBeNull();

    // セグメント別 YoY が計算される (makeDay defaults: new=2, repeat=3, regular=1, staff=0)
    expect(res.current.new_customer_count).toBe(4);     // 2 + 2
    expect(res.lastYear?.new_customer_count).toBe(4);    // 2 + 2
    expect(res.yoy.new_customer_count.classification).toBe('flat');
    expect(res.yoy.repeat_customer_count.classification).toBe('flat');
    expect(res.yoy.regular_customer_count.classification).toBe('flat');
    // staff は両期間 0 のため lastYear=0 で no_data
    expect(res.yoy.staff_customer_count.classification).toBe('no_data');
  });

  it('lastYear=null → 部分成功、yoy.* は no_data', () => {
    const currentRes = makeResponse({
      '2026-05-01': makeDay({ total_amount: 1000, transaction_count: 10, customer_count: 5 }),
    });

    const res = buildYoYResultFromResponses({
      start_date: '2026-05-01',
      end_date: '2026-05-01',
      currentRes,
      lastYearRes: null,
    });

    expect(res.current.total_amount).toBe(1000);
    expect(res.lastYear).toBeNull();
    expect(res.yoy.total_amount.classification).toBe('no_data');
    expect(res.yoy.transaction_count.classification).toBe('no_data');
    expect(res.yoy.customer_count.classification).toBe('no_data');
    expect(res.yoy.new_customer_count.classification).toBe('no_data');
    expect(res.yoy.repeat_customer_count.classification).toBe('no_data');
    expect(res.yoy.regular_customer_count.classification).toBe('no_data');
    expect(res.yoy.staff_customer_count.classification).toBe('no_data');
    expect(res.dataCoverage).toBe(0);
    expect(res.byDate[0].lastYear).toBeNull();
  });

  it('lastYearRes.byDate が空 dict → lastYear=null と同等扱い', () => {
    const currentRes = makeResponse({
      '2026-05-01': makeDay({ total_amount: 1000, transaction_count: 10, customer_count: 5 }),
    });
    const lastYearRes = makeResponse({});

    const res = buildYoYResultFromResponses({
      start_date: '2026-05-01',
      end_date: '2026-05-01',
      currentRes,
      lastYearRes,
    });

    expect(res.lastYear).toBeNull();
    expect(res.yoy.total_amount.classification).toBe('no_data');
  });

  it('current 3 日中 lastYear 2 日のみ → dataCoverage = 2/3', () => {
    const currentRes = makeResponse({
      '2026-05-01': makeDay({ total_amount: 1000, transaction_count: 10, customer_count: 5 }),
      '2026-05-02': makeDay({ total_amount: 1000, transaction_count: 10, customer_count: 5 }),
      '2026-05-03': makeDay({ total_amount: 1000, transaction_count: 10, customer_count: 5 }),
    });
    const lastYearRes = makeResponse({
      '2025-05-01': makeDay({ total_amount: 800, transaction_count: 8, customer_count: 4 }),
      '2025-05-02': makeDay({ total_amount: 900, transaction_count: 9, customer_count: 4 }),
      // 2025-05-03 欠損
    });

    const res = buildYoYResultFromResponses({
      start_date: '2026-05-01',
      end_date: '2026-05-03',
      currentRes,
      lastYearRes,
    });

    expect(res.dataCoverage).toBeCloseTo(2 / 3);
    expect(res.byDate[0].lastYear).not.toBeNull();
    expect(res.byDate[1].lastYear).not.toBeNull();
    expect(res.byDate[2].lastYear).toBeNull();
    // yoy 集計は totals ベース (3日 vs 2日でも実行される)
    expect(res.yoy.total_amount.classification).not.toBe('no_data');
  });

  it('うるう年期間 (2024-02-29) → lastYearDate=2023-02-28', () => {
    const currentRes = makeResponse({
      '2024-02-29': makeDay({ total_amount: 1000, transaction_count: 10, customer_count: 5 }),
    });
    const lastYearRes = makeResponse({
      '2023-02-28': makeDay({ total_amount: 1000, transaction_count: 10, customer_count: 5 }),
    });

    const res = buildYoYResultFromResponses({
      start_date: '2024-02-29',
      end_date: '2024-02-29',
      currentRes,
      lastYearRes,
    });

    expect(res.byDate[0].business_date).toBe('2024-02-29');
    expect(res.byDate[0].lastYearDate).toBe('2023-02-28');
    expect(res.byDate[0].lastYear).not.toBeNull();
    expect(res.lastYearPeriod).toEqual({ start: '2023-02-28', end: '2023-02-28' });
  });

  it('current が空 byDate → dataCoverage=0、byDate=[]', () => {
    const currentRes = makeResponse({});
    const lastYearRes = makeResponse({
      '2025-05-01': makeDay({ total_amount: 1000, transaction_count: 10, customer_count: 5 }),
    });

    const res = buildYoYResultFromResponses({
      start_date: '2026-05-01',
      end_date: '2026-05-01',
      currentRes,
      lastYearRes,
    });

    expect(res.dataCoverage).toBe(0);
    expect(res.byDate).toEqual([]);
    expect(res.current).toEqual({
      total_amount: 0,
      open_total_amount: 0,
      transaction_count: 0,
      customer_count: 0,
      new_customer_count: 0,
      repeat_customer_count: 0,
      regular_customer_count: 0,
      staff_customer_count: 0,
      unlisted_customer_count: 0,
    });
  });
});
