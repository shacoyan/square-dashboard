-- Square Dashboard 集計層 RLS 設定（kintai 既存ポリシーと完全独立）
-- 対象 project: kintai prod (zjjbfffhbobwwxyvdszl) の square_dashboard schema 専用
-- 作成: 2026-05-21 (Phase 1 / Engineer A)

ALTER TABLE square_dashboard.daily_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE square_dashboard.daily_sales_by_category ENABLE ROW LEVEL SECURITY;
ALTER TABLE square_dashboard.aggregation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE square_dashboard.locations_meta ENABLE ROW LEVEL SECURITY;

-- authenticated は全テーブル SELECT 可
CREATE POLICY sdb_daily_sales_select_auth ON square_dashboard.daily_sales
  FOR SELECT TO authenticated USING (true);
CREATE POLICY sdb_daily_category_select_auth ON square_dashboard.daily_sales_by_category
  FOR SELECT TO authenticated USING (true);
CREATE POLICY sdb_runs_select_auth ON square_dashboard.aggregation_runs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY sdb_locations_meta_select_auth ON square_dashboard.locations_meta
  FOR SELECT TO authenticated USING (true);

-- INSERT/UPDATE/DELETE は service_role のみ（policy 未定義 = 拒否）
-- service_role は RLS bypass 権限を持つため明示policy 不要

-- anon は schema usage も拒否
REVOKE ALL ON SCHEMA square_dashboard FROM anon, PUBLIC;
GRANT USAGE ON SCHEMA square_dashboard TO authenticated, service_role;

GRANT SELECT ON ALL TABLES IN SCHEMA square_dashboard TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA square_dashboard TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA square_dashboard TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA square_dashboard
  GRANT SELECT ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA square_dashboard
  GRANT ALL ON TABLES TO service_role;
