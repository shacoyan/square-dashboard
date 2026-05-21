# square-dashboard / supabase migrations

## このディレクトリの位置付け

このディレクトリは **square-dashboard 集計層 (`square_dashboard` schema) 専用**の Supabase migration を管理します。

- 対象 Supabase project: **kintai prod** (`zjjbfffhbobwwxyvdszl`, `ap-northeast-1`)
- 対象 schema: **`square_dashboard`** （`public` ではない）
- 物理ルート: `_external/square-dashboard/supabase/migrations/`
- 起案設計書: `.company/engineering/docs/2026-05-21-square-dashboard-aggregation-impl-plan.md`

⛔️ **kintai の migration (`kintai/supabase/migrations/0XX_*.sql`) とは完全に別系統**です。
両者は同じ Supabase project に同居しますが、schema を `public` / `square_dashboard` で分離し、
migration ファイル名 prefix も `sdb_*` と `0XX_*` で衝突を避けています。

## 命名規約

```
sdb_NNN_<short_kebab_name>.sql
```

- `sdb_` prefix: square-dashboard 専用であることを明示（kintai `0XX_*` と衝突回避）
- `NNN`: ゼロ埋め 3 桁の通番（`001`, `002`, ...）
- ファイルは時系列順に並ぶこと
- 1 ファイルにつき 1 つのトピック（DDL / RLS / seed を分離）

## 現在の migration 一覧

| 連番 | ファイル | 目的 |
|---|---|---|
| 001 | `sdb_001_init.sql` | schema 作成 + 4 テーブル DDL (daily_sales / daily_sales_by_category / aggregation_runs / locations_meta) + インデックス |
| 002 | `sdb_002_rls.sql` | RLS 有効化 + authenticated SELECT policy + schema/sequence/table grant + default privileges |
| 003 | `sdb_003_seed_locations.sql` | 店舗メタ seed プレースホルダ（実値は cron で同期、空ファイル） |

## apply 手順

### 鉄則

⛔️ **Engineer は migration を絶対に apply しない**。

- 作成のみ。apply は **オーナー** または **秘書** が実行する。
- apply 前に必ず `mcp__supabase__list_projects` で `name="kintai"` および `id="zjjbfffhbobwwxyvdszl"` を再確認する。
  （kintai と receipt-scanner の project が ap-northeast-1 同 organization で非常に区別困難。
  2026-05-11 に kintai migration を receipt-scanner に誤投入する事故が発生済み。）

### 推奨手順（秘書 / オーナー向け）

1. `mcp__supabase__list_projects` を呼び、`name="kintai"`, `id="zjjbfffhbobwwxyvdszl"` を視認確認
2. `mcp__supabase__list_migrations(project_id="zjjbfffhbobwwxyvdszl")` で既存 migration に `sdb_*` が含まれていないことを確認
3. ファイルを 3 つ順に apply:
   - `mcp__supabase__apply_migration(project_id="zjjbfffhbobwwxyvdszl", name="sdb_001_init", query=<sdb_001_init.sql の内容>)`
   - 同じ要領で `sdb_002_rls`, `sdb_003_seed_locations`
4. apply 後検証:
   - `mcp__supabase__list_tables(project_id="zjjbfffhbobwwxyvdszl", schemas=["square_dashboard"])` で 4 テーブル確認
   - `daily_sales`, `daily_sales_by_category`, `aggregation_runs`, `locations_meta` の RLS が enabled
   - 4 つの policy (`sdb_*_select_auth`) が存在
5. 検収:
   - anon key で `daily_sales` を SELECT → 0 件 / 拒否（RLS で弾かれること）
   - service role key で SELECT → 0 件返却（テーブル存在を確認）

## データ破壊リスクと注意点

- **kintai project に apply** されます。同 project には kintai の `public` schema や receipt-scanner 系の既存テーブルが存在します。
  ファイル名・schema 名・SQL の `square_dashboard.` 修飾を**絶対に**書き換えないこと。
- `DROP SCHEMA square_dashboard CASCADE` 系の破壊的 SQL を**絶対に**追加しない。下流 migration で必要になった場合は別途 Tech Lead レビュー必須。
- migration ファイル名は一度 apply したら**改名禁止**（Supabase の migration table と紐づくため）。修正は新規 `sdb_NNN+1_*.sql` で行う。
- 環境変数 prefix は `SQUARE_DASHBOARD_*` に統一（kintai の `SUPABASE_*` と衝突回避）。Phase 1-B/1-C の Supabase クライアントは必ず `db: { schema: 'square_dashboard' }` を明示する。

## 関連ファイル

- `_external/square-dashboard/api/_supabase.js` （Phase 1-B Engineer B 担当の Supabase クライアント、schema 固定の起点）
- `_external/square-dashboard/api/cron/aggregate-daily.js` （Phase 1-C Engineer C 担当の cron handler）
- `.company/engineering/docs/2026-05-21-square-dashboard-aggregation-impl-plan.md` （上位設計書、Phase 1 / Engineer A の根拠）
