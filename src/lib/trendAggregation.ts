import type { DailySegmentPoint, PeriodPreset } from '../types';

/**
 * 集計粒度。`hourly` は今後の今日タブ拡張用に予約。
 */
export type Granularity = 'hourly' | 'daily' | 'weekly' | 'monthly';

/**
 * PeriodPreset に対応する trend 集計粒度を返す。
 * - year:    monthly（12 ポイント）
 * - quarter: weekly（約 13 ポイント）
 * - month / week / today: daily（既存挙動）
 */
export function granularityFor(period: PeriodPreset): Granularity {
  switch (period) {
    case 'year':
      return 'monthly';
    case 'quarter':
      return 'weekly';
    case 'month':
    case 'week':
    case 'today':
    default:
      return 'daily';
  }
}

/**
 * dailyTrend を granularity 単位に集約する。
 *
 * - daily / hourly: 入力をそのまま返す（参照透過）
 * - weekly: ISO 週（月曜始まり）に集約。bucket key は週初日 `YYYY-MM-DD`
 * - monthly: bucket key は月初日 `YYYY-MM-01`
 *
 * 集計方法: 件数系列 (new/repeat/regular/staff/unlisted) と
 * 売上系列 (newSales/repeatSales/regularSales/staffSales/unlistedSales) を SUM。
 *
 * 入力にデータが無い日付は欠落のまま（補完しない）。
 * 戻り値は date 昇順でソート。
 */
export function aggregateTrendByGranularity(
  daily: DailySegmentPoint[],
  granularity: Granularity,
): DailySegmentPoint[] {
  if (granularity === 'daily' || granularity === 'hourly') return daily;

  const buckets = new Map<string, DailySegmentPoint>();

  for (const p of daily) {
    const key = bucketKey(p.date, granularity);
    const cur = buckets.get(key);
    if (!cur) {
      // 新規 bucket: 入力をシャローコピーして date を bucket key に置換
      buckets.set(key, {
        date: key,
        new: p.new,
        repeat: p.repeat,
        regular: p.regular,
        staff: p.staff,
        unlisted: p.unlisted,
        newSales: p.newSales,
        repeatSales: p.repeatSales,
        regularSales: p.regularSales,
        staffSales: p.staffSales,
        unlistedSales: p.unlistedSales,
      });
    } else {
      cur.new += p.new;
      cur.repeat += p.repeat;
      cur.regular += p.regular;
      cur.staff += p.staff;
      cur.unlisted += p.unlisted;
      cur.newSales += p.newSales;
      cur.repeatSales += p.repeatSales;
      cur.regularSales += p.regularSales;
      cur.staffSales += p.staffSales;
      cur.unlistedSales += p.unlistedSales;
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 日付文字列 (YYYY-MM-DD) を granularity の bucket key に変換する。
 */
function bucketKey(dateStr: string, granularity: Granularity): string {
  const parts = dateStr.split('-').map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];

  if (granularity === 'monthly') {
    return `${y}-${String(m).padStart(2, '0')}-01`;
  }

  // weekly: ISO 週初日（月曜）
  const utc = new Date(Date.UTC(y, m - 1, d));
  const dow = utc.getUTCDay(); // 0=Sun ... 6=Sat
  const monOffset = (dow + 6) % 7; // Mon=0, Sun=6
  utc.setUTCDate(utc.getUTCDate() - monOffset);
  return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, '0')}-${String(utc.getUTCDate()).padStart(2, '0')}`;
}
