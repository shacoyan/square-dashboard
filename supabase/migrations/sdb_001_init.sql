-- Square Dashboard 集計層 schema 初期化
-- 対象 project: kintai prod (zjjbfffhbobwwxyvdszl) に namespace 分離して相乗り
-- 作成: 2026-05-21 (Phase 1 / Engineer A)
-- 参照: .company/engineering/docs/2026-05-21-square-dashboard-aggregation-impl-plan.md

CREATE SCHEMA IF NOT EXISTS square_dashboard;

-- ========================================
-- 1) 日次売上 KPI 集計
-- ========================================
CREATE TABLE square_dashboard.daily_sales (
  business_date date NOT NULL,
  location_id text NOT NULL,
  location_name text NOT NULL,          -- 表示用 denorm
  start_hour smallint NOT NULL DEFAULT 0,

  -- 売上 KPI（決済済み）
  total_amount bigint NOT NULL DEFAULT 0,
  transaction_count integer NOT NULL DEFAULT 0,

  -- 客数（customer_id ユニーク数）
  customer_count integer NOT NULL DEFAULT 0,

  -- セグメント別 ( new / repeat / regular / staff / unlisted )
  new_customer_count integer NOT NULL DEFAULT 0,
  repeat_customer_count integer NOT NULL DEFAULT 0,
  regular_customer_count integer NOT NULL DEFAULT 0,
  staff_customer_count integer NOT NULL DEFAULT 0,
  unlisted_customer_count integer NOT NULL DEFAULT 0,

  new_sales bigint NOT NULL DEFAULT 0,
  repeat_sales bigint NOT NULL DEFAULT 0,
  regular_sales bigint NOT NULL DEFAULT 0,
  staff_sales bigint NOT NULL DEFAULT 0,
  unlisted_sales bigint NOT NULL DEFAULT 0,

  -- 未決済 (open orders) サマリ
  open_total_amount bigint NOT NULL DEFAULT 0,
  open_order_count integer NOT NULL DEFAULT 0,

  -- メタ
  aggregated_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'cron',  -- 'cron' | 'backfill' | 'manual'

  PRIMARY KEY (business_date, location_id, start_hour)
);

CREATE INDEX idx_sdb_daily_sales_loc_date
  ON square_dashboard.daily_sales (location_id, business_date DESC);

CREATE INDEX idx_sdb_daily_sales_date
  ON square_dashboard.daily_sales (business_date DESC);

COMMENT ON TABLE square_dashboard.daily_sales IS
  '日次売上 KPI 集計。range API 高速化と YoY (前年同期比) の元データ。1日1店舗1start_hour=1行。';

-- ========================================
-- 2) 日次カテゴリ別売上集計（recharts のカテゴリ別グラフ向け）
-- ========================================
CREATE TABLE square_dashboard.daily_sales_by_category (
  business_date date NOT NULL,
  location_id text NOT NULL,
  start_hour smallint NOT NULL DEFAULT 0,
  category_id text,                     -- Square catalog category ID (null 許容: 不明カテゴリ)
  category_name text NOT NULL,          -- '不明' fallback あり

  sales bigint NOT NULL DEFAULT 0,
  item_count integer NOT NULL DEFAULT 0,  -- line_items の quantity 合計

  aggregated_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'cron',

  -- category_id が null の場合に PK 衝突回避するため category_name を PK 構成要素にする
  PRIMARY KEY (business_date, location_id, start_hour, category_name)
);

CREATE INDEX idx_sdb_category_loc_date
  ON square_dashboard.daily_sales_by_category (location_id, business_date DESC);

COMMENT ON TABLE square_dashboard.daily_sales_by_category IS
  '日次×店舗×カテゴリ別売上集計。recharts のカテゴリ別グラフ高速化用。';

-- ========================================
-- 3) 集計実行ログ
-- ========================================
CREATE TABLE square_dashboard.aggregation_runs (
  id bigserial PRIMARY KEY,
  run_type text NOT NULL,               -- 'daily_cron' | 'backfill' | 'manual_retry'
  target_date date,                     -- 対象営業日 (null 許容: backfill バッチ等)
  target_location_id text,              -- 対象店舗 (null 許容: 全店一括時)

  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',  -- 'running' | 'success' | 'failed' | 'skipped'

  rows_upserted integer DEFAULT 0,
  square_api_calls integer DEFAULT 0,
  error_message text,                   -- 全文保存（memory ルール: 短縮禁止）
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX idx_sdb_runs_target_date
  ON square_dashboard.aggregation_runs (target_date DESC, target_location_id);

CREATE INDEX idx_sdb_runs_status
  ON square_dashboard.aggregation_runs (status, started_at DESC);

COMMENT ON TABLE square_dashboard.aggregation_runs IS
  '集計 cron / backfill 実行ログ。失敗検知・resume・観測性のため全実行を記録。';

-- ========================================
-- 4) 店舗メタ (location_name など denorm 用、cron で同期)
-- ========================================
CREATE TABLE square_dashboard.locations_meta (
  location_id text PRIMARY KEY,
  location_name text NOT NULL,
  square_start_date date NOT NULL DEFAULT '2024-01-01',  -- backfill 起点 (オーナー回答: 全店 2024 以前)
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE square_dashboard.locations_meta IS
  'Square location メタ情報。backfill 起点日と活性状態を管理。';
