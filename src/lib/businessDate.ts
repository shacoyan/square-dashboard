/**
 * 営業日基準の日付を返す純関数。
 *
 * startHour > 0 のとき、現在 JST 時刻が startHour 未満なら前日扱い (深夜営業対応)。
 * startHour = 0 (default) のとき、暦日 (JST) と等価。
 *
 * 戻り値は 'YYYY-MM-DD' 形式の文字列。
 */
export function getBusinessDate(startHour: number = 0): string {
  const now = new Date();
  const jstHour = (now.getUTCHours() + 9) % 24;
  if (startHour > 0 && jstHour < startHour) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  }
  return now.toISOString().split('T')[0];
}
