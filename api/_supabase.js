import { createClient } from "@supabase/supabase-js";

const SCHEMA = "square_dashboard";
export { SCHEMA };

function envOrThrow(key) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing environment variable: ${key}`);
  return value;
}

const CLIENT_OPTIONS = {
  db: { schema: SCHEMA },
  auth: { persistSession: false, autoRefreshToken: false },
};

let anonClient = null;
let serviceClient = null;

/**
 * 設計書準拠の主 API。
 *   - serviceRole=true: SUPABASE_SERVICE_ROLE_KEY を用いる (cron / backfill / RLS bypass)
 *   - serviceRole=false: SUPABASE_ANON_KEY を用いる (API endpoint, RLS 効く)
 * いずれの場合も db.schema を 'square_dashboard' に固定し、kintai 既存テーブルへの
 * 誤書き込みを物理的に防止する。
 */
export function getSdbClient({ serviceRole = false } = {}) {
  if (serviceRole) {
    if (!serviceClient) {
      serviceClient = createClient(
        envOrThrow("SQUARE_DASHBOARD_SUPABASE_URL"),
        envOrThrow("SQUARE_DASHBOARD_SUPABASE_SERVICE_ROLE_KEY"),
        CLIENT_OPTIONS
      );
    }
    return serviceClient;
  }

  if (!anonClient) {
    anonClient = createClient(
      envOrThrow("SQUARE_DASHBOARD_SUPABASE_URL"),
      envOrThrow("SQUARE_DASHBOARD_SUPABASE_ANON_KEY"),
      CLIENT_OPTIONS
    );
  }
  return anonClient;
}

// 互換 alias (タスク指示の API シグネチャ)
export function getServiceClient() {
  return getSdbClient({ serviceRole: true });
}

export function getAnonClient() {
  return getSdbClient({ serviceRole: false });
}

// テスト用: モジュール内 singleton をリセットする (production では呼ばないこと)
export function __resetClientCacheForTest() {
  anonClient = null;
  serviceClient = null;
}
