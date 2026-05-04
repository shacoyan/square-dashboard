import type { Transaction } from '../types';

/**
 * 時間帯別混雑分析（同時滞在組数）集計ロジック
 *
 * 定義:
 *   任意の時刻 t において order_created_at_jst <= t < created_at_jst を満たす伝票数。
 *
 * 粒度:
 *   30 分刻み（48 slot / 24h）。
 *
 * JST 解釈:
 *   `order_created_at_jst` / `created_at_jst` は Square API から得られる ISO 8601 文字列。
 *   ブラウザの実行環境タイムゾーンが JST であることを前提に、
 *   `new Date(iso).getHours()/getMinutes()/getDay()` で JST の壁時計値を取得する。
 *   既存 TransactionList.tsx (formatHHMM) と同方式。
 */

export const SLOT_COUNT = 48; // 30min × 48 = 24h
export const WEEKDAY_COUNT = 7; // 月=0 ... 日=6（weekdayAggregation.ts と同様の Monday-based）
export const SLOT_LABELS: string[] = (() => {
  const labels: string[] = [];
  for (let s = 0; s < SLOT_COUNT; s++) {
    const h = Math.floor(s / 2);
    const m = s % 2 === 0 ? '00' : '30';
    labels.push(`${String(h).padStart(2, '0')}:${m}`);
  }
  return labels;
})();
export const WEEKDAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'] as const;

export interface OccupancyMatrix {
  /** [weekday][slot] = sum of concurrent groups across all dates that hit this (weekday, slot) */
  sums: number[][]; // 7×48
  /** [weekday] = number of distinct dates observed for this weekday in input range */
  dateCountsPerWeekday: number[]; // length 7
  /** order_created_at_jst null / created_at_jst null / endMs <= startMs でスキップした件数 */
  skippedCount: number;
  /** 集計対象になった span 数（日跨ぎは複数 span） */
  totalSpans: number;
}

/** Sunday=0..Saturday=6 を Monday=0..Sunday=6 に変換 */
function toMondayBased(jsDay: number): number {
  return (jsDay + 6) % 7;
}

/** JST 壁時計の slot index (0-47) */
function slotIndexFromDate(d: Date): number {
  return d.getHours() * 2 + (d.getMinutes() >= 30 ? 1 : 0);
}

/** Date を「JST 壁時計でその日 00:00」を表す Date に丸める（getFullYear 系で取得） */
function startOfDayLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/** Date を「YYYY-MM-DD」(JST 壁時計) に */
function dateKeyLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 主集計関数。
 * order_created_at_jst が null / created_at_jst が空 / endMs <= startMs はスキップ。
 * 日跨ぎは当日 24:00 で打ち切り、翌日 00:00 から別 span として加算。
 */
export function buildOccupancyMatrix(transactions: Transaction[]): OccupancyMatrix {
  const sums: number[][] = Array.from({ length: WEEKDAY_COUNT }, () => Array(SLOT_COUNT).fill(0));
  const dateSetPerWeekday: Set<string>[] = Array.from({ length: WEEKDAY_COUNT }, () => new Set<string>());
  let skippedCount = 0;
  let totalSpans = 0;

  for (const tx of transactions) {
    if (!tx.order_created_at_jst || !tx.created_at_jst) {
      skippedCount += 1;
      continue;
    }
    const startDate = new Date(tx.order_created_at_jst);
    const endDate = new Date(tx.created_at_jst);
    const startMs = startDate.getTime();
    const endMs = endDate.getTime();
    if (!isFinite(startMs) || !isFinite(endMs) || endMs <= startMs) {
      skippedCount += 1;
      continue;
    }

    // 日跨ぎ対応: 当日内に clip しつつ、必要なら翌日以降にまたがって加算
    let cursor = new Date(startMs);
    let safety = 0;
    while (cursor.getTime() < endMs) {
      if (++safety > 31) break; // 異常データ保険（30 日跨ぎを超えたら停止）
      const dayStart = startOfDayLocal(cursor);
      const nextDayStart = new Date(dayStart);
      nextDayStart.setDate(nextDayStart.getDate() + 1);

      const segStartMs = Math.max(cursor.getTime(), dayStart.getTime());
      const segEndMs = Math.min(endMs, nextDayStart.getTime());
      // end-exclusive: 区間 [segStartMs, segEndMs) の slot を加算
      const segStart = new Date(segStartMs);
      const segLast = new Date(segEndMs - 1); // -1ms で最終 slot を確定

      const weekday = toMondayBased(segStart.getDay());
      const dKey = dateKeyLocal(segStart);
      dateSetPerWeekday[weekday].add(dKey);

      const sStart = slotIndexFromDate(segStart);
      const sEnd = slotIndexFromDate(segLast);
      const lo = Math.max(0, Math.min(SLOT_COUNT - 1, sStart));
      const hi = Math.max(0, Math.min(SLOT_COUNT - 1, sEnd));
      for (let slot = lo; slot <= hi; slot++) {
        sums[weekday][slot] += 1;
      }
      totalSpans += 1;

      cursor = nextDayStart;
    }
  }

  const dateCountsPerWeekday = dateSetPerWeekday.map((s) => s.size);
  return { sums, dateCountsPerWeekday, skippedCount, totalSpans };
}

/** 平均 = sums[w][s] / max(dateCountsPerWeekday[w], 1)。0 日なら 0 */
export function getAverage(matrix: OccupancyMatrix, weekday: number, slot: number): number {
  const denom = matrix.dateCountsPerWeekday[weekday] ?? 0;
  if (denom <= 0) return 0;
  return matrix.sums[weekday][slot] / denom;
}

export interface LineChartPoint {
  slot: number;
  label: string;
  value: number;
}

/**
 * 折れ線データ。
 * mode='average':  Σ(sums[w][s] for w∈filter) / Σ(dateCountsPerWeekday[w] for w∈filter)
 * mode='sum':      Σ(sums[w][s] for w∈filter)
 */
export function getLineChartData(
  matrix: OccupancyMatrix,
  weekdayFilter: boolean[],
  mode: 'average' | 'sum',
): LineChartPoint[] {
  const totalDateCount = weekdayFilter.reduce((acc, on, w) => acc + (on ? matrix.dateCountsPerWeekday[w] : 0), 0);
  const points: LineChartPoint[] = [];
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    let sum = 0;
    for (let w = 0; w < WEEKDAY_COUNT; w++) {
      if (!weekdayFilter[w]) continue;
      sum += matrix.sums[w][slot];
    }
    let value: number;
    if (mode === 'sum') {
      value = sum;
    } else {
      value = totalDateCount > 0 ? sum / totalDateCount : 0;
    }
    points.push({ slot, label: SLOT_LABELS[slot], value });
  }
  return points;
}
