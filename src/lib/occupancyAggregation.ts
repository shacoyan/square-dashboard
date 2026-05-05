import type { Transaction } from '../types';
import { countCustomersByTransaction } from './customerSegment';

/**
 * 時間帯別混雑分析（同時滞在組数 + 同時滞在人数）集計ロジック
 */

export const SLOT_COUNT = 48;
export const WEEKDAY_COUNT = 7;
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
  sums: {
    groups: number[][];
    persons: number[][];
  };
  dateCountsPerWeekday: number[];
  skippedCount: number;
  totalSpans: number;
}

function toMondayBased(jsDay: number): number {
  return (jsDay + 6) % 7;
}

function slotIndexFromDate(d: Date): number {
  return d.getHours() * 2 + (d.getMinutes() >= 30 ? 1 : 0);
}

function startOfDayLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function dateKeyLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function buildOccupancyMatrix(transactions: Transaction[]): OccupancyMatrix {
  const groupsAcc: number[][] = Array.from({ length: WEEKDAY_COUNT }, () => Array(SLOT_COUNT).fill(0));
  const personsAcc: number[][] = Array.from({ length: WEEKDAY_COUNT }, () => Array(SLOT_COUNT).fill(0));
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

    const seg = countCustomersByTransaction(tx);
    const persons = seg.new + seg.repeat + seg.regular + seg.staff;

    let cursor = new Date(startMs);
    let safety = 0;
    while (cursor.getTime() < endMs) {
      if (++safety > 31) break;
      const dayStart = startOfDayLocal(cursor);
      const nextDayStart = new Date(dayStart);
      nextDayStart.setDate(nextDayStart.getDate() + 1);

      const segStartMs = Math.max(cursor.getTime(), dayStart.getTime());
      const segEndMs = Math.min(endMs, nextDayStart.getTime());
      const segStart = new Date(segStartMs);
      const segLast = new Date(segEndMs - 1);

      const weekday = toMondayBased(segStart.getDay());
      const dKey = dateKeyLocal(segStart);
      dateSetPerWeekday[weekday].add(dKey);

      const sStart = slotIndexFromDate(segStart);
      const sEnd = slotIndexFromDate(segLast);
      const lo = Math.max(0, Math.min(SLOT_COUNT - 1, sStart));
      const hi = Math.max(0, Math.min(SLOT_COUNT - 1, sEnd));
      for (let slot = lo; slot <= hi; slot++) {
        groupsAcc[weekday][slot] += 1;
        personsAcc[weekday][slot] += persons;
      }
      totalSpans += 1;

      cursor = nextDayStart;
    }
  }

  const dateCountsPerWeekday = dateSetPerWeekday.map((s) => s.size);
  return {
    sums: { groups: groupsAcc, persons: personsAcc },
    dateCountsPerWeekday,
    skippedCount,
    totalSpans,
  };
}

export function getAverages(
  matrix: OccupancyMatrix,
  weekday: number,
  slot: number,
): { groups: number; persons: number } {
  const denom = matrix.dateCountsPerWeekday[weekday] ?? 0;
  if (denom <= 0) return { groups: 0, persons: 0 };
  return {
    groups: matrix.sums.groups[weekday][slot] / denom,
    persons: matrix.sums.persons[weekday][slot] / denom,
  };
}

export interface LineChartPoint {
  slot: number;
  label: string;
  groups: number;
  persons: number;
}

export function getLineChartData(
  matrix: OccupancyMatrix,
  weekdayFilter: boolean[],
  mode: 'average' | 'sum',
  activeSlots?: number[],
): LineChartPoint[] {
  const totalDateCount = weekdayFilter.reduce(
    (acc, on, w) => acc + (on ? matrix.dateCountsPerWeekday[w] : 0),
    0,
  );
  const slots =
    activeSlots && activeSlots.length > 0
      ? activeSlots
      : Array.from({ length: SLOT_COUNT }, (_, i) => i);
  const points: LineChartPoint[] = [];
  for (const slot of slots) {
    let sumGroups = 0;
    let sumPersons = 0;
    for (let w = 0; w < WEEKDAY_COUNT; w++) {
      if (!weekdayFilter[w]) continue;
      sumGroups += matrix.sums.groups[w][slot];
      sumPersons += matrix.sums.persons[w][slot];
    }
    let groups: number;
    let persons: number;
    if (mode === 'sum') {
      groups = sumGroups;
      persons = sumPersons;
    } else {
      groups = totalDateCount > 0 ? sumGroups / totalDateCount : 0;
      persons = totalDateCount > 0 ? sumPersons / totalDateCount : 0;
    }
    points.push({ slot, label: SLOT_LABELS[slot], groups, persons });
  }
  return points;
}

/**
 * 営業開始 startHour 〜 営業終了 endHour に対応する 30 分スロット index 配列を時計順で返す。
 * - endHour >= startHour: [startHour*2 .. (endHour+1)*2 - 1]
 *   例 startHour=11, endHour=23 → 22..47 の 26 個
 * - endHour <  startHour (翌日跨ぎ): [startHour*2..47] ++ [0..(endHour+1)*2 - 1]
 *   例 startHour=17, endHour=2 → 34..47 + 0..5 = 20 個
 * - どちらか/両方 undefined または不正値: 0..47 全 48 個（後方互換）
 * - startHour === endHour: 24h 営業扱いで全 48 個
 *
 * mental check:
 *   getActiveSlots(11, 23) → [22,23,...,47]              (length 26)
 *   getActiveSlots(17, 2)  → [34,...,47,0,1,2,3,4,5]     (length 20)
 *   getActiveSlots()       → [0,1,...,47]                (length 48)
 *   getActiveSlots(0, 23)  → [0,1,...,47]                (length 48)
 */
export function getActiveSlots(startHour?: number, endHour?: number): number[] {
  const all = (): number[] => Array.from({ length: SLOT_COUNT }, (_, i) => i);
  const isValidHour = (h: unknown): h is number =>
    typeof h === 'number' && Number.isFinite(h) && h >= 0 && h <= 23;

  if (!isValidHour(startHour) || !isValidHour(endHour)) return all();
  if (startHour === endHour) return all();

  const startSlot = startHour * 2;
  // endHour:59 までを含むため (endHour+1)*2 - 1 を末尾とする。endHour=23 → 47。
  const endSlot = Math.min(SLOT_COUNT - 1, (endHour + 1) * 2 - 1);

  if (endHour >= startHour) {
    const out: number[] = [];
    for (let s = startSlot; s <= endSlot; s++) out.push(s);
    return out;
  }
  // 翌日跨ぎ
  const out: number[] = [];
  for (let s = startSlot; s < SLOT_COUNT; s++) out.push(s);
  for (let s = 0; s <= endSlot; s++) out.push(s);
  return out;
}
