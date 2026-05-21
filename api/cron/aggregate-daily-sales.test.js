import { describe, it, expect } from 'vitest';
import { parseBusinessDayRange } from './aggregate-daily-sales.js';

describe('parseBusinessDayRange', () => {
  it('通常日の営業日範囲を正しく計算する (2026-05-20, 開始時刻10時)', () => {
    const { beginTimeJST, endTimeJST } = parseBusinessDayRange({
      date: '2026-05-20',
      startHour: 10,
    });

    expect(beginTimeJST).toBe('2026-05-20T10:00:00+09:00');
    expect(endTimeJST).toBe('2026-05-21T10:00:00+09:00');
  });

  it('月をまたぐ営業日範囲を正しく計算する (2026-05-31, 開始時刻10時)', () => {
    const { beginTimeJST, endTimeJST } = parseBusinessDayRange({
      date: '2026-05-31',
      startHour: 10,
    });

    expect(beginTimeJST).toBe('2026-05-31T10:00:00+09:00');
    expect(endTimeJST).toBe('2026-06-01T10:00:00+09:00');
  });

  it('年をまたぐ営業日範囲を正しく計算する (2026-12-31, 開始時刻0時)', () => {
    const { beginTimeJST, endTimeJST } = parseBusinessDayRange({
      date: '2026-12-31',
      startHour: 0,
    });

    expect(beginTimeJST).toBe('2026-12-31T00:00:00+09:00');
    expect(endTimeJST).toBe('2027-01-01T00:00:00+09:00');
  });

  it('うるう年 (2028-02-29) を翌日 2028-03-01 に正しく繰り上げる', () => {
    const { beginTimeJST, endTimeJST } = parseBusinessDayRange({
      date: '2028-02-29',
      startHour: 10,
    });

    expect(beginTimeJST).toBe('2028-02-29T10:00:00+09:00');
    expect(endTimeJST).toBe('2028-03-01T10:00:00+09:00');
  });

  // Codex 発見のゼロ長範囲バグ (旧実装で endTimeJST === beginTimeJST になり
  // daily_sales 全店 0 円上書き + daily_sales_by_category 全消去が発生) の再発防止テスト。
  it('リグレッション: begin と end は一致せず、差分は厳密に 24 時間 (Codex ゼロ長範囲バグ再発防止)', () => {
    const { beginTimeJST, endTimeJST } = parseBusinessDayRange({
      date: '2026-05-20',
      startHour: 10,
    });

    expect(beginTimeJST).not.toBe(endTimeJST);

    const diffMs =
      new Date(endTimeJST).getTime() - new Date(beginTimeJST).getTime();
    expect(diffMs).toBe(24 * 60 * 60 * 1000);
  });
});
