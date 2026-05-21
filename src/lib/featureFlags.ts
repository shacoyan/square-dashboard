/**
 * localStorage feature flag — sales-range 切替制御。
 *
 * 設計書 §4.2 参照。
 *
 * - default true (Phase 3 Team B 投入後はデフォルト有効)
 * - オーナーが console から `localStorage.setItem('sq_use_sales_range', '0')` で即時ロールバック可能
 * - SSR / private mode で localStorage 不可の環境では default (true) を返す
 */

export const FF_USE_SALES_RANGE = 'sq_use_sales_range';

/**
 * localStorage への参照を取得する。
 * SSR / private mode で localStorage が存在しない場合は null。
 */
function getStorage(): Storage | null {
  try {
    const g = globalThis as { localStorage?: Storage };
    if (g.localStorage) return g.localStorage;
  } catch {
    /* noop */
  }
  return null;
}

/**
 * sales-range を使うかどうか。
 *
 * 値の解釈:
 *   '0' / 'false' → false
 *   '1' / 'true'  → true
 *   それ以外 / 未設定 / 例外 → true (default)
 */
export function getUseSalesRange(): boolean {
  try {
    const storage = getStorage();
    if (!storage) return true;
    const v = storage.getItem(FF_USE_SALES_RANGE);
    if (v === '0' || v === 'false') return false;
    if (v === '1' || v === 'true') return true;
  } catch {
    /* private mode 等で localStorage アクセス例外 → default */
  }
  return true;
}

/**
 * sales-range 利用フラグを保存する。
 * SSR / private mode セーフ (失敗時は無視)。
 */
export function setUseSalesRange(value: boolean): void {
  try {
    const storage = getStorage();
    if (!storage) return;
    storage.setItem(FF_USE_SALES_RANGE, value ? '1' : '0');
  } catch {
    /* noop */
  }
}

/**
 * sales-range フラグ取得用の公開エイリアス。
 *
 * `use*` の名前は React Hook 規約 (react-hooks/rules-of-hooks) に紛らわしいため、
 * Phase 3.5 で `getSalesRangeFlag` にリネーム。中身は単なる localStorage 読み出し。
 * State 連動が必要になったら useSyncExternalStore 化する。
 */
export function getSalesRangeFlag(): boolean {
  return getUseSalesRange();
}
