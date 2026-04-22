# Round 12: 全店舗比較タブ 実装設計書

- 日付: 2026-04-22
- プロジェクト: square-dashboard
- 担当 Tech Lead: Claude (Opus 4)
- 実装: Engineer (GLM 経由) → Reviewer → D チーム統合 → Tech Lead 承認

---

## 1. 概要（何を・なぜ）

### 何を
Square Dashboard の画面上部に「全店舗比較」アコーディオンセクションを新設する。デフォルトは折りたたみ状態で、展開時に「比較テーブル」「店舗別 売上・客数 棒グラフ」「店舗別 セグメント別 スタック横棒グラフ」「店舗別 獲得経路 スタック横棒グラフ」「日次推移 折れ線グラフ」を表示する。期間/週選択は既存 `CustomerSegmentSection` と完全に同じ state (`period`/`weekIndex`) を共有する。

### なぜ
現状は店舗ドロップダウンで 1 店舗ずつしか確認できない。複数店舗を束ねる SABABA グループ管理者が、横並びで売上・客層構成・獲得経路の優劣を即時比較したいニーズに応える。

### やらないこと（スコープ外）
- 既存 `DailyTabPanel` / `SegmentTabPanel` / `CustomerSegmentSection` の UI 変更
- 新規 API エンドポイント追加（既存 `/api/transactions` を店舗数分並列コール）
- 日別・時間帯別のドリルダウン（比較セクションは期間集計のみ）
- URL 永続化（`weekIndex`/`period` は既存ロジックを踏襲するのみ）

---

## 2. 分割戦略

### 並列度と依存関係

| チーム | 担当 | 前段依存 | 並列可否 |
| --- | --- | --- | --- |
| A | `types.ts` 拡張（型定義追加） | なし | 先行（必須）|
| B | `src/hooks/useMultiLocationSegment.ts` 新規 | A 完了後 | B〜E は A 完了後に並列実行可 |
| C | `src/components/charts/LocationBarChart.tsx` 新規 | A 完了後 | 〃 |
| D | `src/components/charts/LocationStackChart.tsx` 新規 | A 完了後 | 〃 |
| E | `src/components/charts/LocationTrendChart.tsx` 新規 | A 完了後 | 〃 |
| F | `src/components/LocationComparisonSection.tsx` 新規 + `Dashboard.tsx` 組み込み + `charts/index.ts` 追記 | A〜E すべて完了後 | 統合のため最後 |

### 依存関係図

```
A (types) ──┬── B (useMultiLocationSegment)
            ├── C (LocationBarChart)        ┐
            ├── D (LocationStackChart)      ├── F (LocationComparisonSection + Dashboard 組み込み)
            └── E (LocationTrendChart)      ┘
```

### チーム数
最大 6 分割のうち **A〜F の 6 チーム** を使用。B〜E は A 完了後に **4 並列**で実行できる。

---

## 3. ファイルごとの責務とインターフェース

### 3.1 `src/types.ts` 追加（チーム A）

既存型は一切変更しない。下記を末尾に追記する。

```ts
// 全店舗比較 — 店舗 1 行分の集計
export interface LocationSegmentRow {
  locationId: string;
  locationName: string;
  totalSales: number;                  // 期間売上
  averageDailySales: number | null;    // 平均日売上 (today は null)
  overallAveragePerCustomer: number | null; // 客単価 (分母 0 のとき null)
  totalCustomers: number;              // 合計客数 (new+repeat+regular+staff のみ。unlisted は除外)
  customersBySegment: SegmentBreakdown;
  salesBySegment: SegmentBreakdown;    // 「記載なし売上」は unlisted
  acquisitionBreakdown: AcquisitionBreakdown;
  dailyTrend: DailySegmentPoint[];     // 店舗別 日次推移
  loadError: string | null;            // 店舗単位での失敗メッセージ（成功時 null）
}

// 全店舗比較 — セクション全体のデータ
export interface LocationComparisonData {
  period: PeriodPreset;
  periodStart: string;
  periodEnd: string;
  elapsedDays: number;
  rows: LocationSegmentRow[];          // 入力 locations と同じ順序を維持
  totals: Omit<LocationSegmentRow, 'locationId' | 'locationName' | 'loadError'>; // 合計行
  allDates: string[];                  // 日次推移 X 軸統合（昇順・重複排除）
}
```

- `totals` の `dailyTrend` は全店舗 `dailyTrend` を日付キーで合算したもの。
- `averageDailySales`: `today` のとき `totalSales` そのまま / それ以外は `totalSales / elapsedDays`（`elapsedDays>0`）。
- `overallAveragePerCustomer`: `totalCustomers > 0 ? totalSales / totalCustomers : null`。

### 3.2 `src/hooks/useMultiLocationSegment.ts` 新規（チーム B）

#### 入力
```ts
interface UseMultiLocationSegmentArgs {
  token: string;
  locations: Location[];        // Dashboard state
  period: PeriodPreset;
  baseDate: string;             // YYYY-MM-DD
  startHour: number;
  endHour: number;
  weekIndex?: number;
  enabled: boolean;             // アコーディオン展開時のみ true
}
```

#### 返り値
```ts
interface UseMultiLocationSegmentResult {
  data: LocationComparisonData | null;
  loading: boolean;
  error: string | null;         // 警告メッセージ
  refresh: () => void;
}
```

#### 実装方針
1. **日付配列生成**: `useCustomerSegment.ts` の `calculatePeriodDates` を **lib/periodDates.ts に切り出さず、ヘルパー関数としてこのファイル内に同一実装をコピー**する（既存ファイル無改造の方針優先。Tech Lead 判断: 将来的なリファクタは Round 13 以降）。
   - 実装の重複コードを完全一致させる。引数・出力・週フィルタ含めて 1 文字違わず複製。
   - 関数名は `calculatePeriodDates` をそのまま使用しエクスポートしない。
2. **fetch ループ**:
   - `locations` × `dates` の 2 次元で `/api/transactions` と `/api/open-orders` を並列呼び出し。
   - 構造は `locations.map(loc => dates.map(date => Promise.allSettled([tx, open])))` をフラット化し **全件を 1 つの `Promise.all` で投げる**（最大並列。各店舗内で逐次化しない）。
   - 既存 `useCustomerSegment` と同じ `AbortController` パターンを踏襲し、`abortControllerRef` で前回リクエストをキャンセル。
   - `openOrderToTransaction` は `useCustomerSegment.ts` の実装を **同一コピー**（ファイル内関数として）。
3. **集計**:
   - 店舗ごとに `aggregateSegments` / `countCustomersByTransaction` を使って `LocationSegmentRow` を構築。
   - `totals.dailyTrend` は Map<date, DailySegmentPoint> で合算 → 昇順配列化。
   - `allDates` は `dates` 配列（集計後の共通軸）。
4. **失敗処理**:
   - 店舗単位で **全日失敗** → `row.loadError = '期間データ取得失敗'`, その店舗の値は 0 埋め。
   - 部分失敗 → `setError('N店舗×M日で取得失敗')` のような警告メッセージを付ける。
   - 全店舗全日失敗 → `data = null`, `error` 設定。
5. **キャッシュ / 再 fetch トリガ**:
   - `useEffect` 依存配列: `[token, period, baseDate, startHour, endHour, weekIndex, enabled, locations.map(l=>l.id).join(',')]`。
   - **`locationId` は含めない**（そもそも props にない）。選択店舗が変わっても再 fetch しない。
   - `enabled === false` のときは fetch せず `data` は前回値を保持（再展開時に再利用）。ただし period/date 依存のどれかが変われば古いデータを捨てるため `setData(null)` → 新規 fetch。
6. **初回ロード時の挙動**: `enabled=false` で初期化 → `data=null`, `loading=false`, `error=null`。展開初回に fetch 走る。

#### エラーハンドリング
- `AbortError` は無視（既存 hook と同じ）。
- `locations.length === 0` の間は fetch しない。

### 3.3 `src/components/charts/LocationBarChart.tsx` 新規（チーム C）

#### Props
```ts
interface Props {
  rows: { locationName: string; totalSales: number; totalCustomers: number }[];
}
```

#### recharts 構成
- `ComposedChart`（売上バー + 客数バーの縦並び 2 列）。二軸。
  - 左 Y 軸: 売上（円）
  - 右 Y 軸: 客数（人）
  - X 軸: 店舗名
  - Bar dataKey=`totalSales` yAxisId=`left` fill=`#6366f1`（indigo-500）
  - Bar dataKey=`totalCustomers` yAxisId=`right` fill=`#f59e0b`（amber-500）
- `height: 320`, ResponsiveContainer `width="100%"`
- Tooltip は円記号付き `formatYen` 整形、客数は `○○人`
- Legend 表示、店舗数が多い時は `angle={-20} textAnchor="end"` で回転
- 空データ（`rows.length===0`）は `「店舗データなし」` と中央表示

### 3.4 `src/components/charts/LocationStackChart.tsx` 新規（チーム D）

#### Props（セグメント/獲得経路を兼用）
```ts
interface Props {
  rows: Array<{ locationName: string } & Record<string, number>>;
  series: { key: string; label: string; color: string }[];
  valueUnit?: '人' | '件';
  emptyMessage?: string;
}
```

- `series` で `SALES_COLORS`（セグメント）または `ACQUISITION_CONFIG`（獲得経路）を差し替え可能な汎用チャート。

#### recharts 構成
- `BarChart` layout=`vertical`
  - X 軸: `type="number"`
  - Y 軸: `type="category"`, dataKey=`locationName`, width=`140`
  - 各 `series` ごとに `<Bar dataKey={key} stackId="a" fill={color} />`
- 高さは `Math.max(240, rows.length * 48 + 80)` をコンポーネント内で計算（親から渡さない）。
- Tooltip: 各値を `${value}${valueUnit ?? '人'}` 表示。合計行も含む場合は凡例で区別。
- Legend 表示（上部）。
- `rows` 空 or 全ての値が 0 の場合は `emptyMessage ?? 'データなし'` を中央表示。

### 3.5 `src/components/charts/LocationTrendChart.tsx` 新規（チーム E）

#### Props
```ts
interface Props {
  locationSeries: { locationId: string; locationName: string; points: DailySegmentPoint[] }[];
  totalsSeries: DailySegmentPoint[];
  allDates: string[];
}
```

- **表示する数値**: 各店舗の「合計客数」= `new + repeat + regular + staff`（unlisted 除外）。`totalsSeries` も同じロジック。
- 売上ではなく客数のみ表示（要件「日次推移 折れ線グラフ（店舗ごとに1本、合計線を太線で追加）」を素直に解釈）。

#### recharts 構成
- `LineChart`:
  - データ変換: `allDates.map(date => { [locName]: points.find(p=>p.date===date)?.totalCustomers ?? 0, 合計: totalsSeries.find(p=>p.date===date)?.totalCustomers ?? 0, date })`
  - 店舗ごとの Line は各々異なる色（後述 `LOCATION_COLORS` パレット 6 色）。
  - 「合計」Line は `strokeWidth={4}`, `stroke="#111827"`, `dot={{ r: 4 }}`（太線・黒系で強調）。
  - 店舗 Line は `strokeWidth={2}`, `dot={{ r: 3 }}`。
  - XAxis は `CustomerSegmentSection.tsx` の日付フォーマット `MM/DD` と同等。
- 高さ `320`。
- `locationSeries` が 7 店舗を超える場合は `LOCATION_COLORS` を HSL 回転で自動生成（または当面は 6 店舗固定と仮定しパレット配列を `LOCATION_COLORS` に定義、超過時は mod ループ）。

#### `LOCATION_COLORS` パレット（新規定義）
```
#6366f1 (indigo-500)
#10b981 (emerald-500)
#f59e0b (amber-500)
#ec4899 (pink-500)
#14b8a6 (teal-500)
#8b5cf6 (violet-500)
```

### 3.6 `src/components/LocationComparisonSection.tsx` 新規（チーム F）

#### Props
```ts
interface Props {
  token: string;
  locations: Location[];
  period: PeriodPreset;
  onPeriodChange: (p: PeriodPreset) => void;
  weekIndex: number;
  onWeekIndexChange: (n: number) => void;
  availableWeeks: number;
  baseDate: string;
  startHour: number;
  endHour: number;
}
```

#### 内部 state
- `expanded: boolean`（アコーディオン開閉。デフォルト `false`）
- localStorage キー `sq_location_compare_expanded` で永続化。値は `"1"` / `"0"`。

#### hook 呼び出し
```
const { data, loading, error } = useMultiLocationSegment({
  token, locations, period, baseDate, startHour, endHour, weekIndex,
  enabled: expanded && locations.length > 0,
});
```

#### レイアウト
1. **ヘッダー**（常時表示）:
   - 背景 `bg-white rounded-xl shadow`
   - クリック可能な行: タイトル「全店舗比較」 + 右端に展開/折りたたみアイコン（`▼` / `▶` テキスト矢印で統一、絵文字禁止）
   - `aria-expanded`, `aria-controls` 付与
2. **展開時のみ** 下記を順に描画:
   - 期間タブ（today/week/month）+ 週選択。実装は `CustomerSegmentSection.tsx` の PERIOD_TABS / 週タブと **完全一致の構造・クラス名**にする（コピーで良い。共通化は Round 13 以降）。
   - ローディング中: `<SkeletonCompareSection />`（ローカル関数で全体スケルトン。既存 `SkeletonSection` を参考にテーブル行 + 3 カード風）
   - エラー: `CustomerSegmentSection` と同じ赤枠アラート
   - データなし: `「店舗データがありません。」`
   - データあり:
     - 比較テーブル
     - 店舗別 売上・客数 棒グラフ（`LocationBarChart`）
     - セグメント別 スタック横棒グラフ（`LocationStackChart`, series=SEGMENT）
     - 獲得経路 スタック横棒グラフ（`LocationStackChart`, series=ACQUISITION）
     - 日次推移 折れ線グラフ（`LocationTrendChart`）

#### 比較テーブル仕様

**テーブル列（要件どおり）**:
1. 店舗名 (sticky 左端)
2. 期間売上（円）
3. 平均日売上（円、`--` 可）
4. 客単価（円、`--` 可）
5. 合計客数（人）
6. 新規（人）
7. リピート（人）
8. 常連（人）
9. スタッフ（人）
10. 記載なし売上（円）
11. Google（件）
12. 口コミ（件）
13. 看板（件）
14. SNS（件）
15. 不明（件）

- 最下行「合計」は `font-bold bg-gray-50`。
- ヘッダー `bg-gray-100 sticky top-0`（同一セクション内のスクロールコンテキスト）。
- **レスポンシブ**:
  - 1 本のテーブルにまとめ、親を `overflow-x-auto` でラップ。
  - `min-w-[1100px]` を付与し SP 幅では横スクロール発生。
  - 列分割（セグメント別テーブル / 経路別テーブル）は **行わない**（店舗同士の比較可読性を優先。要件どおり横スクロール単一テーブルで確定）。
- セル内パディング `px-3 py-2`, 数値は `text-right tabular-nums`, 店舗名のみ `text-left whitespace-nowrap sticky left-0 bg-white`（合計行は `bg-gray-50`）。
- `formatYen`（既存 `src/utils.ts`）と `.toLocaleString()` を適切に使い分ける。

#### アコーディオン開閉アニメーション
- 凝ったアニメはしない。`expanded` 切替で条件レンダリング。
- 矢印だけ回転 (`transition-transform rotate-90`)。

### 3.7 `src/components/Dashboard.tsx` 修正（チーム F）

#### 変更ポイント（最小限）
1. import 追加:
   ```ts
   import LocationComparisonSection from './LocationComparisonSection';
   ```
2. `<StoreSwitcher />` を含むブロック（`<div className="bg-white rounded-lg shadow p-4 space-y-4">` 全体）直後・`{error && ...}` の **前** に、下記を挿入:
   ```tsx
   <LocationComparisonSection
     token={token}
     locations={locations}
     period={period}
     onPeriodChange={setPeriod}
     weekIndex={weekIndex}
     onWeekIndexChange={setWeekIndex}
     availableWeeks={segmentAvailableWeeks}
     baseDate={date}
     startHour={startHour}
     endHour={endHour}
   />
   ```
3. 既存の `period` / `weekIndex` state / `segmentAvailableWeeks` をそのまま共有する。`CustomerSegmentSection` 側との **同一 state** 共有により「片方のタブで期間変更→もう片方も連動」が自動達成される。
4. それ以外の既存コード（`activeTab` タブ切替、`DailyTabPanel`/`SegmentTabPanel` 条件分岐）は **一切変更しない**。

### 3.8 `src/components/charts/index.ts` 追記（チーム F）

```ts
export { default as LocationBarChart } from './LocationBarChart';
export { default as LocationStackChart } from './LocationStackChart';
export { default as LocationTrendChart } from './LocationTrendChart';
```

---

## 4. アコーディオン state 管理設計

- **配置**: `LocationComparisonSection` **内部**の `useState`（`Dashboard` に持たせない）。
  - 理由: 開閉状態は比較セクション固有の関心事。Dashboard を肥大化させない。
  - `period`/`weekIndex`/`date`/`locations` などグローバルに必要な値だけ props で渡す。
- **永続化**: `localStorage.getItem('sq_location_compare_expanded')` で初期化、`onChange` 時に `setItem`。
- **`enabled` フラグ**: `expanded && locations.length > 0`。展開前は fetch しないことでコスト抑制。

---

## 5. レスポンシブ・スタイル指針

### カラー定数の所属
- `SALES_COLORS` と `ACQUISITION_CONFIG` は **`CustomerSegmentSection.tsx` 内で宣言されているがエクスポートされていない**。
- **再利用方針**: 重複定義を許可する（Tech Lead 判断）。
  - `LocationComparisonSection.tsx` 内でも同じ値を再宣言する。
  - 将来的に `src/lib/segmentColors.ts` へ切り出すのは Round 13 以降。本 Round では既存ファイルに触らない方針を厳守。
- 新規 `LOCATION_COLORS` は `LocationTrendChart.tsx` 内にローカル定義。

### Tailwind
- セクションカード: `bg-white rounded-xl shadow p-6`
- テーブルラッパ: `overflow-x-auto -mx-6 px-6`（カード外側まで引き伸ばして横スクロールしやすく）
- タイトル: `text-lg font-bold text-gray-900`
- サブタイトル: `text-md font-bold text-gray-900 mb-4`

### 絵文字
一切使用しない。矢印もテキスト `▶ / ▼` のみ（Unicode のジオメトリ記号）。ログアウトの `⚠` などは **既存箇所のみ**許容、新規追加では使わない。

---

## 6. 実装順序（Engineer GLM 向け）

### Step 1: チーム A（types）
- `src/types.ts` に `LocationSegmentRow`, `LocationComparisonData` を追記。
- `tsc --noEmit` 通過を確認。

### Step 2: チーム B〜E（4 並列）
- B: `useMultiLocationSegment.ts` 作成。
- C: `LocationBarChart.tsx` 作成。
- D: `LocationStackChart.tsx` 作成。
- E: `LocationTrendChart.tsx` 作成。
- 各チームは独立ファイルで完結するため完全並列可能。
- 各ファイル単体で `tsc --noEmit` に通ること。

### Step 3: チーム F（統合）
- `LocationComparisonSection.tsx` 作成（B〜E を import）。
- `charts/index.ts` に 3 チャートの export を追記。
- `Dashboard.tsx` に `LocationComparisonSection` を組み込む（上記指定位置）。
- `npm run build` / `tsc --noEmit` がクリーン通過すること。

### Step 4: Reviewer レビュー
- 型整合、ESLint、既存 UI 非破壊、アコーディオン折りたたみデフォルト、期間 state 共有を確認。

### Step 5: Tech Lead 最終承認
- `git diff` 検査、実機ビルド確認、approve。

---

## 7. 統合時の注意点・リスク

| リスク | 対策 |
| --- | --- |
| `calculatePeriodDates` の重複コピー | 既存ファイルを絶対に変更しない。将来の Round 13 で `src/lib/periodDates.ts` に切り出す TODO を設計書に明記済み。 |
| 同時 fetch 過多（店舗5×31日×2API = 310リクエスト） | **初回警告のみ**。展開時のみ発火する `enabled` フラグで日常コストは抑制。必要なら Round 13 で `/api/transactions-batch` 新設を検討（別チケット）。 |
| `CustomerSegmentSection` 側で `period` 変更 → 比較セクション側も追従するが、`enabled=false`（折りたたみ中）のとき fetch しない | 折りたたみ中は `data=null` にリセットし、次回展開で最新 `period` で再 fetch する。古いキャッシュは残さない。 |
| レイアウト崩れ（店舗名長い） | テーブルは `whitespace-nowrap` + 横スクロール、チャートは Y 軸 width=140 で店舗名切れを防ぐ。 |
| 合計行の ky/acquisition の `averageDailySales` | 合計の平均日売上は「全店舗合計売上 / `elapsedDays`」で計算（店舗別平均の単純和ではない）。 |
| 合計行の「客単価」 | `totals.totalSales / totals.totalCustomers`（分母 0 は `--`）。 |
| 既存画面の非破壊 | `Dashboard.tsx` 差分は import 1 行 + JSX 1 ブロック挿入のみ。それ以外はゼロ変更。Reviewer は `git diff` で既存行の変更がないことを必ず確認。 |
| CI のビルド崩壊 | Step 3 完了時点で Engineer 自身が `npm run build` を走らせ、赤い場合は自己修正してから Reviewer に回す。 |

---

## 8. 受け入れ基準（DoD）

1. 画面リロード後、全店舗比較セクションは **折りたたまれた状態**で表示される（localStorage に値がない初期状態）。
2. 展開するとローディング → データ表示の遷移が見える。
3. 既存「顧客セグメント分析」の期間タブを変更 → 全店舗比較側の期間も即座に同期（state 共有）。
4. 比較テーブルに店舗数 + 1（合計行）の行数が表示される。
5. 獲得経路列（Google/口コミ/看板/SNS/不明）の合計が `totalCustomers.new`（新規客数）と **一致する**（`unknown = max(0, new - 他4チャネル合計)` の既存定義に従う）。
6. SP 幅（390px）で比較テーブルは横スクロールし、チャートはレスポンシブに縮小される。
7. 既存の「顧客セグメント分析」「売上」「注文中」タブの UI / 挙動に**一切の退行がない**（Reviewer が視覚確認）。
8. TypeScript ビルドエラー 0 / ESLint エラー 0。
9. `localStorage['sq_location_compare_expanded']` で開閉状態が記憶される。

---

## 9. 将来 Round への申し送り（本 Round ではやらない）

- Round 13 候補:
  - `calculatePeriodDates` / `openOrderToTransaction` / `SALES_COLORS` / `ACQUISITION_CONFIG` を共通モジュール化。
  - `/api/transactions-batch`（店舗 × 日付を 1 コールで返す）を新設し、並列数を圧縮。
  - 全店舗比較セクションの CSV エクスポート。
  - 比較テーブルの列ソート機能。

---

## 10. Round 12 修正方針（Tech Lead 判断: 2026-04-22）

Reviewer A の第 1 次レビューで Major 1 件・Minor 5 件の指摘を受領。Tech Lead として下記の通り確定する。Engineer はこの節の指示に従って修正を実施すること。

### 10.1 Major M-1: `averageDailySales` の部分失敗時の扱い

**採択: 選択肢 (c) — 計算式は `totalSales / elapsedDays` を維持（設計書 3.1 準拠）、加えて部分失敗店舗には UI 上の明示的な警告表記を追加する。**

#### 判断根拠
- この機能は店舗オーナーが店舗同士の優劣を判断するための意思決定ツール。数値が不当に低く見えることも、失敗を数値に溶かし込んでユーザに気付かせないことも、どちらも経営判断ミスを誘発する。
- (a) 単体は「低く見える」問題、(b) 単体は「失敗が隠蔽される」問題をそれぞれ抱える。
- 設計書 3.1 との整合性を保ちつつユーザに失敗の存在を認識させるには、計算式は (a) を堅持し、UI で「このデータは一部失敗を含む」ことを視覚的に告知する (c) が最適。
- 実装工数は Minor な追加のみで吸収可能。

#### Engineer への具体指示

1. **`useMultiLocationSegment.ts`**（L252 周辺）
   - `LocationSegmentRow.averageDailySales` の計算式は **現行どおり `totalSales / elapsedDays`（`today` のときは `totalSales` そのまま）を維持**。変更しない。
   - ただし、型 `LocationSegmentRow` に **`partialFailure: { failedDays: number; totalDays: number } | null`** を新規フィールド追加する（`src/types.ts` も同時に更新。型拡張のみで既存コンシューマに影響なし）。
     - 全日成功 → `null`
     - 1 日以上失敗し、かつ全日失敗ではない（= `loadError === null` かつ一部日付が取れなかった）場合 → `{ failedDays, totalDays }`
     - 全日失敗 → `null`（このケースは `loadError` で表現）
   - これまで「全日失敗以外は loadError = null」で潰していた情報を保持するため、店舗ごとの fetch ループで成功/失敗日数をカウントしておく。

2. **`LocationComparisonSection.tsx` 比較テーブル**
   - `partialFailure !== null` の店舗行は、「店舗名」セルの直後または同セル内に注記アイコン `※` を付け、行全体の背景を `bg-amber-50` で薄く色付け。
   - 同じ行の「平均日売上」セル横に小さな注釈テキスト `（N日失敗）` を `text-xs text-amber-700` で添える。
   - テーブル下部に凡例として `※ 一部日付のデータ取得に失敗した店舗です。平均日売上は全期間日数で按分しているため実績より低く表示されている可能性があります。` を 1 行表示（`partialFailure` を持つ行が 1 件でもあれば表示、なければ非表示）。
   - 合計行には注記しない（合計自体の意味が変わらないため）。

3. **`LocationBarChart` / `LocationStackChart` / `LocationTrendChart`**
   - 既存実装のまま。注記は比較テーブル側に集約する（チャートに情報を足すとノイズになる）。

4. **`setError` との整合**
   - 既存の「N店舗×M日で取得失敗」警告メッセージ（赤帯）は現行どおり出し続ける。UI 注記は店舗個別のフォローアップとして併存。

#### 追加される受け入れ基準（DoD 追補）
- 10. `partialFailure !== null` の行がある場合、その行は背景 `bg-amber-50` で強調され、「平均日売上」セル横に `（N日失敗）` が表示される。
- 11. 部分失敗行が存在するときのみ、テーブル下部に凡例テキストが表示される。

### 10.2 Minor 5 件の仕分け

| ID | 内容 | 判断 | 理由 |
| --- | --- | --- | --- |
| m-1 | `as unknown as` 二重キャスト簡略化 (LocationComparisonSection.tsx L273, L290) | **今回対応** | 型安全性に直結。正しい型パラメータで `LocationStackChart` を呼ぶよう `Props` を Generic 化 or 行データ型を union で正しく宣言し、二重キャストを排除。 |
| m-2 | TooltipProps 型化 (LocationBarChart.tsx L26, L41 の any 除去) | **今回対応** | recharts が提供する `TooltipProps<ValueType, NameType>` を import して適用。lint/型整合の観点で簡単かつ今後の保守に効く。 |
| m-3 | LocationTrendChart 空データ時描画分岐整理 | **今回対応** | 直前の `partialFailure` 対応と合わせて見通しを良くする。`locationSeries.length === 0 \|\| allDates.length === 0` の早期 return に統一。 |
| m-4 | TD_NAME に `bg-white` デフォルト付与 | **今回対応** | 合計行だけ `bg-gray-50` で上書きする設計。sticky 列の背景欠落による透け対策。Amber 行では `bg-amber-50` を上書き適用するため優先順位だけ注意。 |
| m-5 | `React.memo` 付与（任意） | **見送り** | 現状のレンダ回数では恩恵が薄く、メモ化によるデバッグ難化の方がコスト。Round 13 以降にパフォーマンス計測してから判断。 |

### 10.3 Engineer に渡す修正タスク（最終サマリ）

次ラウンド（Round 12-fix）で Engineer が実施する作業は以下。設計書本体と本節を合わせて参照すること。

- **T-1（必須）** `src/types.ts`: `LocationSegmentRow` に `partialFailure: { failedDays: number; totalDays: number } | null` を追加。
- **T-2（必須）** `src/hooks/useMultiLocationSegment.ts`:
  - 店舗ごとの fetch ループで `failedDays` をカウントし、行生成時に `partialFailure` を設定。
  - `averageDailySales` の計算式は **変更しない**（`totalSales / elapsedDays`）。
- **T-3（必須）** `src/components/LocationComparisonSection.tsx`:
  - 部分失敗行の背景 `bg-amber-50`、`※` アイコン、`（N日失敗）` の注釈を追加。
  - テーブル下部に条件付き凡例行を追加。
  - m-1 の `as unknown as` 二重キャストを排除（`LocationStackChart` の Props 型を Generic 化 もしくはローカル型を整理）。
  - m-4 の `TD_NAME` に `bg-white` デフォルトを付与。
- **T-4（必須）** `src/components/charts/LocationBarChart.tsx`: recharts の `TooltipProps<ValueType, NameType>` を import して `any` を除去（m-2）。
- **T-5（必須）** `src/components/charts/LocationTrendChart.tsx`: 空データ時の早期 return を単一分岐に統一（m-3）。
- **T-6（見送り）** `React.memo` は付与しない（m-5）。
- **完了条件**: `npm run build` / `tsc --noEmit` / ESLint が全てクリーン。追補 DoD 10・11 を満たす。

Reviewer は再レビュー時、本節 10.1・10.2 の内容と実装の一致を確認すること。

---

以上。
