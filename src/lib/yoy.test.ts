import { describe, it, expect } from 'vitest';
import {
  calculateYoY,
  formatYoY,
  shiftDateOneYearBack,
  shiftDateOneYearForward,
  shiftRangeOneYearBack,
  aggregateSalesRangeTotals,
  yoyClassToColorClass,
} from './yoy';

describe('calculateYoY', () => {
  it('up (current=110, lastYear=100)', () => {
    const res = calculateYoY(110, 100);
    expect(res.deltaPercent).toBeCloseTo(10);
    expect(res.classification).toBe('up');
  });

  it('down (current=80, lastYear=100)', () => {
    const res = calculateYoY(80, 100);
    expect(res.deltaPercent).toBeCloseTo(-20);
    expect(res.classification).toBe('down');
  });

  it('flat 境界 (current=102, lastYear=100 → 2%)', () => {
    const res = calculateYoY(102, 100);
    expect(res.deltaPercent).toBeCloseTo(2);
    expect(res.classification).toBe('flat');
  });

  it('flat わずか超え (current=103, lastYear=100 → 3% で up)', () => {
    const res = calculateYoY(103, 100);
    expect(res.deltaPercent).toBeCloseTo(3);
    expect(res.classification).toBe('up');
  });

  it('0 vs N (current=0, lastYear=100 → -100% down)', () => {
    const res = calculateYoY(0, 100);
    expect(res.deltaPercent).toBeCloseTo(-100);
    expect(res.classification).toBe('down');
  });

  it('N vs 0 (current=100, lastYear=0 → no_data)', () => {
    const res = calculateYoY(100, 0);
    expect(res.deltaPercent).toBeNull();
    expect(res.classification).toBe('no_data');
  });

  it('N vs null (current=100, lastYear=null → no_data)', () => {
    const res = calculateYoY(100, null);
    expect(res.deltaPercent).toBeNull();
    expect(res.classification).toBe('no_data');
  });
});

describe('shiftDateOneYearBack', () => {
  it('うるう年 2024-02-29 → 2023-02-28', () => {
    expect(shiftDateOneYearBack('2024-02-29')).toBe('2023-02-28');
  });

  it('通常 2024-01-01 → 2023-01-01', () => {
    expect(shiftDateOneYearBack('2024-01-01')).toBe('2023-01-01');
  });

  it('通常 2024-12-31 → 2023-12-31', () => {
    expect(shiftDateOneYearBack('2024-12-31')).toBe('2023-12-31');
  });

  it('平年→うるう年でも 2025-02-28 → 2024-02-28 (2/29 にしない)', () => {
    expect(shiftDateOneYearBack('2025-02-28')).toBe('2024-02-28');
  });

  it('月末 2024-05-31 → 2023-05-31', () => {
    expect(shiftDateOneYearBack('2024-05-31')).toBe('2023-05-31');
  });
});

describe('shiftDateOneYearForward', () => {
  it('うるう年 2024-02-29 → 2025-02-28', () => {
    expect(shiftDateOneYearForward('2024-02-29')).toBe('2025-02-28');
  });

  it('通常 2023-02-28 → 2024-02-28', () => {
    expect(shiftDateOneYearForward('2023-02-28')).toBe('2024-02-28');
  });

  it('通常 2023-01-01 → 2024-01-01', () => {
    expect(shiftDateOneYearForward('2023-01-01')).toBe('2024-01-01');
  });
});

describe('shiftRangeOneYearBack', () => {
  it('start+end 両方シフトされる (うるう年含む)', () => {
    const res = shiftRangeOneYearBack({
      start_date: '2024-02-29',
      end_date: '2024-03-15',
    });
    expect(res.start_date).toBe('2023-02-28');
    expect(res.end_date).toBe('2023-03-15');
  });

  it('年またぎ範囲', () => {
    const res = shiftRangeOneYearBack({
      start_date: '2024-12-15',
      end_date: '2025-01-15',
    });
    expect(res.start_date).toBe('2023-12-15');
    expect(res.end_date).toBe('2024-01-15');
  });
});

describe('aggregateSalesRangeTotals', () => {
  it('空 dict → 全 0', () => {
    const res = aggregateSalesRangeTotals({});
    expect(res).toEqual({
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

  it('1 日のみ → そのままの値 (セグメント未指定は 0)', () => {
    const res = aggregateSalesRangeTotals({
      '2024-01-01': { total_amount: 100, transaction_count: 10, customer_count: 5 },
    });
    expect(res).toEqual({
      total_amount: 100,
      open_total_amount: 0,
      transaction_count: 10,
      customer_count: 5,
      new_customer_count: 0,
      repeat_customer_count: 0,
      regular_customer_count: 0,
      staff_customer_count: 0,
      unlisted_customer_count: 0,
    });
  });

  it('複数日 → 正しく SUM される (セグメント未指定は 0)', () => {
    const res = aggregateSalesRangeTotals({
      '2024-01-01': { total_amount: 100, transaction_count: 10, customer_count: 5 },
      '2024-01-02': { total_amount: 200, transaction_count: 20, customer_count: 10 },
      '2024-01-03': { total_amount: 300, transaction_count: 30, customer_count: 15 },
    });
    expect(res).toEqual({
      total_amount: 600,
      open_total_amount: 0,
      transaction_count: 60,
      customer_count: 30,
      new_customer_count: 0,
      repeat_customer_count: 0,
      regular_customer_count: 0,
      staff_customer_count: 0,
      unlisted_customer_count: 0,
    });
  });

  it('セグメント別フィールド付き → 全フィールドが SUM される', () => {
    const res = aggregateSalesRangeTotals({
      '2024-01-01': {
        total_amount: 100, transaction_count: 10, customer_count: 5,
        new_customer_count: 2, repeat_customer_count: 1, regular_customer_count: 1, staff_customer_count: 1, unlisted_customer_count: 0,
      },
      '2024-01-02': {
        total_amount: 200, transaction_count: 20, customer_count: 10,
        new_customer_count: 3, repeat_customer_count: 4, regular_customer_count: 2, staff_customer_count: 1, unlisted_customer_count: 0,
      },
    });
    expect(res).toEqual({
      total_amount: 300,
      open_total_amount: 0,
      transaction_count: 30,
      customer_count: 15,
      new_customer_count: 5,
      repeat_customer_count: 5,
      regular_customer_count: 3,
      staff_customer_count: 2,
      unlisted_customer_count: 0,
    });
  });

  it('open_total_amount 付き → 未決済も正しく SUM される', () => {
    const res = aggregateSalesRangeTotals({
      '2024-01-01': {
        total_amount: 100, open_total_amount: 50, transaction_count: 10, customer_count: 5,
      },
      '2024-01-02': {
        total_amount: 200, open_total_amount: 30, transaction_count: 20, customer_count: 10,
      },
      '2024-01-03': {
        total_amount: 300, transaction_count: 30, customer_count: 15, // open_total_amount 省略 → 0 扱い
      },
    });
    expect(res).toEqual({
      total_amount: 600,
      open_total_amount: 80,
      transaction_count: 60,
      customer_count: 30,
      new_customer_count: 0,
      repeat_customer_count: 0,
      regular_customer_count: 0,
      staff_customer_count: 0,
      unlisted_customer_count: 0,
    });
  });
});

describe('formatYoY', () => {
  const baseUp = calculateYoY(110, 100);
  const baseDown = calculateYoY(80, 100);
  const baseFlat = calculateYoY(102, 100);
  const baseNoData = calculateYoY(100, null);

  it('up のフルテキスト', () => {
    expect(formatYoY(baseUp)).toBe('↑ +10.0% vs 前年');
  });

  it('down のフルテキスト', () => {
    expect(formatYoY(baseDown)).toBe('↓ -20.0% vs 前年');
  });

  it('flat のフルテキスト', () => {
    expect(formatYoY(baseFlat)).toBe('±0.0% 変化なし');
  });

  it('no_data のフルテキスト', () => {
    expect(formatYoY(baseNoData)).toBe('前年データなし');
  });

  it('compact=true で up が省略', () => {
    expect(formatYoY(baseUp, { compact: true })).toBe('↑ +10.0%');
  });

  it('compact=true で down が省略', () => {
    expect(formatYoY(baseDown, { compact: true })).toBe('↓ -20.0%');
  });

  it('compact=true で flat が省略', () => {
    expect(formatYoY(baseFlat, { compact: true })).toBe('±0.0%');
  });

  it('compact=true でも no_data は「前年データなし」で統一', () => {
    expect(formatYoY(baseNoData, { compact: true })).toBe('前年データなし');
  });

  it('formatLastYear 付き up (フル)', () => {
    const delta = calculateYoY(5000000, 4000000);
    const opts = { formatLastYear: (v: number) => `¥${v.toLocaleString()}` };
    expect(formatYoY(delta, opts)).toBe('↑ +25.0% vs 前年 (前年: ¥4,000,000)');
  });

  it('formatLastYear 付き up (compact)', () => {
    const delta = calculateYoY(5000000, 4000000);
    const opts = { compact: true, formatLastYear: (v: number) => `¥${v.toLocaleString()}` };
    expect(formatYoY(delta, opts)).toBe('↑ +25.0% (前年: ¥4,000,000)');
  });

  it('formatLastYear 付き down (フル)', () => {
    const delta = calculateYoY(80, 100);
    const opts = { formatLastYear: (v: number) => `${v}人` };
    expect(formatYoY(delta, opts)).toBe('↓ -20.0% vs 前年 (前年: 100人)');
  });

  it('formatLastYear 付き flat (フル)', () => {
    const delta = calculateYoY(102, 100);
    const opts = { formatLastYear: (v: number) => `¥${v.toLocaleString()}` };
    expect(formatYoY(delta, opts)).toBe('±0.0% 変化なし (前年: ¥100)');
  });

  it('formatLastYear 付き flat (compact)', () => {
    const delta = calculateYoY(102, 100);
    const opts = { compact: true, formatLastYear: (v: number) => `¥${v.toLocaleString()}` };
    expect(formatYoY(delta, opts)).toBe('±0.0% (前年: ¥100)');
  });

  it('formatLastYear 付き no_data は併記なし', () => {
    const delta = calculateYoY(100, null);
    const opts = { formatLastYear: (v: number) => `¥${v}` };
    expect(formatYoY(delta, opts)).toBe('前年データなし');
  });
});

describe('yoyClassToColorClass', () => {
  it('up → text-success', () => {
    expect(yoyClassToColorClass('up')).toBe('text-success');
  });
  it('down → text-danger', () => {
    expect(yoyClassToColorClass('down')).toBe('text-danger');
  });
  it('flat → text-text-muted', () => {
    expect(yoyClassToColorClass('flat')).toBe('text-text-muted');
  });
  it('no_data → text-text-muted', () => {
    expect(yoyClassToColorClass('no_data')).toBe('text-text-muted');
  });
});
