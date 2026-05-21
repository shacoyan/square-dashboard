import { useSyncExternalStore, useCallback } from 'react';
import { getShowYoY, setShowYoY, FF_SHOW_YOY } from '../lib/featureFlags';

/**
 * localStorage `sq_show_yoy` を購読する React Hook。
 *
 * - default true (Phase 4 設計書 §6.2)
 * - 他タブで変更されると storage event 経由で再レンダー
 * - 同タブで setter を呼ぶと featureFlags.setShowYoY が dispatchEvent('storage') して同期
 * - SSR 中は default (true) を返す
 *
 * 戻り値: `[showYoY, setShowYoY]` 形式 (useState 風)
 */
function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: StorageEvent) => {
    if (e.key === FF_SHOW_YOY || e.key === null) {
      callback();
    }
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

function getSnapshot(): boolean {
  return getShowYoY();
}

function getServerSnapshot(): boolean {
  // SSR 既定値は true (Phase 4 default ON)
  return true;
}

export function useShowYoYFlag(): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setter = useCallback((v: boolean) => {
    setShowYoY(v);
  }, []);
  return [value, setter];
}
