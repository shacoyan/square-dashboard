export type YoYClassification = 'up' | 'down' | 'flat' | 'no_data';

export interface YoYDelta {
  current: number;
  lastYear: number | null;
  deltaPercent: number | null;
  classification: YoYClassification;
}

export function calculateYoY(current: number, lastYear: number | null): YoYDelta {
  if (lastYear === null || lastYear === 0) {
    return { current, lastYear, deltaPercent: null, classification: 'no_data' };
  }
  const deltaPercent = ((current - lastYear) / lastYear) * 100;
  let classification: YoYClassification;
  if (Math.abs(deltaPercent) <= 2) {
    classification = 'flat';
  } else if (deltaPercent > 0) {
    classification = 'up';
  } else {
    classification = 'down';
  }
  return { current, lastYear, deltaPercent, classification };
}

export function shiftDateOneYearBack(dateStr: string): string {
  const [yStr, mStr, dStr] = dateStr.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);

  if (m === 2 && d === 29) {
    return `${y - 1}-02-28`;
  }

  const utcMs = Date.UTC(y - 1, m - 1, d);
  const date = new Date(utcMs);

  if (date.getUTCMonth() !== m - 1) {
    // overflow が発生した場合 (例: 平年の 2/29 を作ろうとした場合) → 前月末にクランプ
    date.setUTCDate(0);
  }

  const outY = date.getUTCFullYear();
  const outM = String(date.getUTCMonth() + 1).padStart(2, '0');
  const outD = String(date.getUTCDate()).padStart(2, '0');

  return `${outY}-${outM}-${outD}`;
}

export function shiftDateOneYearForward(dateStr: string): string {
  const [yStr, mStr, dStr] = dateStr.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);

  if (m === 2 && d === 29) {
    return `${y + 1}-02-28`;
  }

  const utcMs = Date.UTC(y + 1, m - 1, d);
  const date = new Date(utcMs);

  if (date.getUTCMonth() !== m - 1) {
    date.setUTCDate(0);
  }

  const outY = date.getUTCFullYear();
  const outM = String(date.getUTCMonth() + 1).padStart(2, '0');
  const outD = String(date.getUTCDate()).padStart(2, '0');

  return `${outY}-${outM}-${outD}`;
}

export function shiftRangeOneYearBack(args: { start_date: string; end_date: string }): { start_date: string; end_date: string } {
  return {
    start_date: shiftDateOneYearBack(args.start_date),
    end_date: shiftDateOneYearBack(args.end_date),
  };
}

export function formatYoY(
  delta: YoYDelta,
  opts?: {
    compact?: boolean;
    formatLastYear?: (value: number) => string;
  }
): string {
  const suffix = opts?.compact ? '' : ' vs 前年';
  const lastYearSuffix =
    opts?.formatLastYear && delta.lastYear !== null
      ? ` (前年: ${opts.formatLastYear(delta.lastYear)})`
      : '';

  switch (delta.classification) {
    case 'up':
      return `↑ +${delta.deltaPercent!.toFixed(1)}%${suffix}${lastYearSuffix}`;
    case 'down':
      return `↓ ${delta.deltaPercent!.toFixed(1)}%${suffix}${lastYearSuffix}`;
    case 'flat': {
      const flatSuffix = opts?.compact ? '' : ' 変化なし';
      return `±0.0%${flatSuffix}${lastYearSuffix}`;
    }
    case 'no_data':
      return `前年データなし`;
  }
}

export function yoyClassToColorClass(c: YoYClassification): string {
  switch (c) {
    case 'up':
      return 'text-success';
    case 'down':
      return 'text-danger';
    case 'flat':
      return 'text-text-muted';
    case 'no_data':
      return 'text-text-muted';
  }
}

export interface SalesRangeTotal {
  total_amount: number;
  open_total_amount: number;
  transaction_count: number;
  customer_count: number;
  new_customer_count: number;
  repeat_customer_count: number;
  regular_customer_count: number;
  staff_customer_count: number;
  unlisted_customer_count: number;
}

export function aggregateSalesRangeTotals(
  byDate: Record<string, {
    total_amount: number;
    open_total_amount?: number;
    transaction_count: number;
    customer_count: number;
    new_customer_count?: number;
    repeat_customer_count?: number;
    regular_customer_count?: number;
    staff_customer_count?: number;
    unlisted_customer_count?: number;
  }>
): SalesRangeTotal {
  const result: SalesRangeTotal = {
    total_amount: 0,
    open_total_amount: 0,
    transaction_count: 0,
    customer_count: 0,
    new_customer_count: 0,
    repeat_customer_count: 0,
    regular_customer_count: 0,
    staff_customer_count: 0,
    unlisted_customer_count: 0,
  };
  for (const val of Object.values(byDate)) {
    result.total_amount += val.total_amount;
    result.open_total_amount += val.open_total_amount ?? 0;
    result.transaction_count += val.transaction_count;
    result.customer_count += val.customer_count;
    result.new_customer_count += val.new_customer_count ?? 0;
    result.repeat_customer_count += val.repeat_customer_count ?? 0;
    result.regular_customer_count += val.regular_customer_count ?? 0;
    result.staff_customer_count += val.staff_customer_count ?? 0;
    result.unlisted_customer_count += val.unlisted_customer_count ?? 0;
  }
  return result;
}

/**
 * 前年系列描画用の最小データ型 (設計書 §6.8)。
 * セグメント別フィールドを持たず、合計値のみ保持する。
 *
 * @property date         前年実日付 ('YYYY-MM-DD')。
 * @property total        当該日の前年実績値。
 * @property currentDate  対応する当年日付 ('YYYY-MM-DD')。chart 側で前年→当年軸マッピングに使用。
 *                        うるう年 (2/29) で shiftDateOneYearForward が日付をずらしてしまう
 *                        ケースを避けるため、生成側で当年実日付を渡す。オプショナルで後方互換。
 */
export interface DailyTotalPoint {
  date: string;
  total: number;
  currentDate?: string;
}

/**
 * YoY 計算結果の集約型 (KPI 3 指標 + セグメント別 4 指標 + 日別比較)。
 * Team B (SalesSummary) / Team C (chart) がこの型を受け取って表示する。
 */
export interface SalesRangeYoYResult {
  period: { start: string; end: string };
  lastYearPeriod: { start: string; end: string };
  current: SalesRangeTotal;
  lastYear: SalesRangeTotal | null;
  yoy: {
    total_amount: YoYDelta;
    transaction_count: YoYDelta;
    customer_count: YoYDelta;
    new_customer_count: YoYDelta;
    repeat_customer_count: YoYDelta;
    regular_customer_count: YoYDelta;
    staff_customer_count: YoYDelta;
  };
  /** 期間内 N 日中、前年同日にデータが存在する日数 M を / N */
  dataCoverage: number;
  byDate: Array<{
    business_date: string;
    lastYearDate: string;
    current: { total_amount: number; transaction_count: number; customer_count: number };
    lastYear: { total_amount: number; transaction_count: number; customer_count: number } | null;
  }>;
}
