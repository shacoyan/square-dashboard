# Round 14: 店舗データ分析 ＆ 全店舗比較の強化

- 作成日: 2026-04-24
- プロジェクト: square-dashboard
- 対応 TODO: #23 Round 14: 店舗データ分析＆全店舗比較の強化
- Tech Lead: 💻
- 担当: GLM Engineer (実装) → Reviewer (検証) → D チーム (統合) → Tech Lead (最終承認)

---

## 1. 概要（何を・なぜ）

### 何を
Round 12 で実装した「全店舗比較」、Round 13 でタブ化した「顧客セグメント / 全店舗比較」画面を、以下の3方向で強化する。

1. **命名整理**: 「顧客セグメント」タブを「店舗データ分析」にリネーム（上位概念化）。
2. **日次推移グラフ強化**: 店舗データ分析タブの SegmentTrendChart の Tooltip に「各セグメント売上 + 合計人数 + 合計売上（unlisted 除外）」を追加し、グラフ1枚で意思決定できる情報密度へ引き上げる。
3. **全店舗比較タブ強化**: ヘッダー行 sticky、チャート常時1カラム、「獲得経路」→「新規獲得経路」リネーム、各チャート下に詳細テーブルを追加、recharts LabelList でグラフ内常時ラベル表示。

### なぜ
- 「顧客セグメント」という命名は本タブが実質「単一店舗の全指標パネル」になっているため実態と乖離。店舗単位の経営指標全体を包含する「店舗データ分析」にリネームする。
- 折れ線グラフは人数のみ表示で、金額感・合計人数が見えず意思決定に 2 ステップ（下部リストへの視線移動）必要。Tooltip に集約することで 1 ステップに。
- 全店舗比較のカードが lg で 2 列になると 1 カードあたりの横幅が狭くなり、棒グラフの店舗名が潰れる。常時 1 列化。
- グラフ内の数値が Tooltip ホバー時しか見えないため、プレゼン・スクショ用途で不便。LabelList で常時表示。
- テーブルが長くなるとヘッダーがスクロールアウトし、列名が不明に。sticky top-0 で固定。

---

## 2. 変更対象ファイル一覧

### 型 / ロジック
- `src/types.ts` — `DailySegmentPoint` に売上フィールド追加
- `src/hooks/useCustomerSegment.ts` — 日次集計に `allocateSalesByTransaction` を組み込み売上内訳を保持
- `src/hooks/useMultiLocationSegment.ts` — 同上（dailyTrend の売上内訳保持）
  ※ LocationTrendChart は現状 dailyTrend の人数しか参照しないため、売上フィールド追加による型互換性のみ確認すればよい。

### UI — 店舗データ分析タブ関連
- `src/components/DashboardTabs.tsx` — ラベル「顧客セグメント」→「店舗データ分析」
- `src/components/CustomerSegmentSection.tsx` L111 — 見出し「顧客セグメント分析」→「店舗データ分析」
- `src/components/charts/SegmentTrendChart.tsx` — カスタム Tooltip 実装（売上表示 + 合計人数 + 合計売上）

### UI — 全店舗比較タブ関連
- `src/components/LocationComparisonSection.tsx`
  - テーブル `<thead>` に `sticky top-0 z-10` 追加 & 親の `overflow-x-auto` を `overflow-auto max-h-[70vh]` 等に変更して縦スクロール対応
  - チャートグリッド `grid-cols-1 lg:grid-cols-2` → `grid-cols-1`
  - 「店舗別 獲得経路」→「店舗別 新規獲得経路」
  - 各チャートカード内に `LocationSegmentDetailTable`（新規コンポーネント）または inline テーブルを追加
- `src/components/charts/LocationStackChart.tsx` — 各 Bar に `<LabelList dataKey={...} position="insideRight" />` または各セグメント合計を出す形で常時ラベル表示
- `src/components/charts/LocationBarChart.tsx` — Bar に LabelList（売上 / 客数を棒の上部 `position="top"`）
- `src/components/charts/LocationTrendChart.tsx` — Line に LabelList（合計線のみ）、他の店舗線はラベル過多になるため合計系列にのみ LabelList を当てる

### （互換性維持）
- `src/App.tsx` もしくはタブ永続化をしている箇所（localStorage key: `sq_dashboard_tab`）
  - 保存値 `'segment'` はそのまま残す（ラベルのみ変更、タブキーは `'segment'` を維持）。

---

## 3. 型定義の変更内容

`src/types.ts`

```ts
export interface DailySegmentPoint {
  date: string; // YYYY-MM-DD (JST)
  // 人数（既存）
  new: number;
  repeat: number;
  regular: number;
  staff: number;
  unlisted: number;
  // 売上（新規・今回追加）
  newSales: number;
  repeatSales: number;
  regularSales: number;
  staffSales: number;
  unlistedSales: number;
}
```

### 互換性メモ
- `LocationSegmentRow.dailyTrend: DailySegmentPoint[]` もこの型を共用しているため、`useMultiLocationSegment` 側でも売上を日毎に集計する必要がある（必須）。
- `LocationTrendChart` は `point.new + point.repeat + ...` のみ参照 → そのまま動く。
- `SegmentTrendChart` は `dataKey="new"` 等で人数のみ描画 → 売上フィールドは Tooltip 内でのみ使用、線は増やさない。

---

## 4. 集計ロジックの変更内容

### `useCustomerSegment.ts` の日次ループ
既存:
```ts
let dayNew=0, dayRepeat=0, dayRegular=0, dayStaff=0, dayUnlisted=0;
combinedTransactions.forEach(tx => {
  const dayCounts = countCustomersByTransaction(tx);
  dayNew += dayCounts.new; /* ... */
});
dailyTrend.push({ date, new:dayNew, ... });
```

追加:
```ts
import { allocateSalesByTransaction, countCustomersByTransaction } from '../lib/customerSegment';

let dayNewSales=0, dayRepeatSales=0, dayRegularSales=0, dayStaffSales=0, dayUnlistedSales=0;
combinedTransactions.forEach(tx => {
  const dayCounts = countCustomersByTransaction(tx);
  // 既存 人数集計
  ...
  const daySales = allocateSalesByTransaction(tx);
  dayNewSales += daySales.new;
  dayRepeatSales += daySales.repeat;
  dayRegularSales += daySales.regular;
  dayStaffSales += daySales.staff;
  dayUnlistedSales += daySales.unlisted;
});
dailyTrend.push({
  date, new:dayNew, repeat:dayRepeat, regular:dayRegular, staff:dayStaff, unlisted:dayUnlisted,
  newSales:dayNewSales, repeatSales:dayRepeatSales, regularSales:dayRegularSales,
  staffSales:dayStaffSales, unlistedSales:dayUnlistedSales,
});
```

**重要**: `aggregateSegments` と同じ `allocateSalesByTransaction` を流用するため、既存の期間売上（`result.sales`）と日次売上を単純和算した値は完全一致する。端数寄せも既存仕様のまま温存。

### `useMultiLocationSegment.ts` の日次ループ
L218-L227 の `n, rp, rg, st, ul` 集計直下に `allocateSalesByTransaction` を用いた売上集計を追加し、`entry.dailyTrend.push({...})` にフィールドを足す。

### 全店舗合計 `totalsDailyTrend`
L299-L311 の trendMap reducer に `newSales / repeatSales / regularSales / staffSales / unlistedSales` の合算を追加。

---

## 5. UI 変更の詳細

### 5.1 SegmentTrendChart カスタム Tooltip
Recharts の `<Tooltip content={<CustomTooltip />} />` 方式で実装。

表示内容（1日分）:
```
2026-04-18
新規 12人 (¥48,000)
リピート 8人 (¥32,000)
常連 5人 (¥25,000)
スタッフ 2人 (¥4,000)
記載なし 1 (¥3,500)
─────────────
合計人数 27人
合計売上 ¥109,000   ← unlisted を除外
```

`allocateSalesByTransaction` は unlisted は `counts.total===0` のときだけ tx.amount 全額を unlisted 売上に寄せる仕様。合計売上から unlisted を外せば、セグメント特定できた売上のみの合計となる。

### 5.2 LocationComparisonSection のレイアウト変更

1. **テーブル sticky header**
   ```tsx
   <div className="overflow-auto -mx-6 px-6 max-h-[70vh]">
     <table>
       <thead className="bg-gray-100 sticky top-0 z-10">
   ```
   - 横スクロールと縦 sticky を両立。min-w-[1100px] は維持。
   - store 名セル `sticky left-0` は既存のまま維持（列×行の交差 sticky は z-index 調整で両立可能だが、交差セルは既存実装のまま維持で十分。問題発生したら z-index 再調整）。

2. **チャートグリッド**
   ```tsx
   <div className="grid grid-cols-1 gap-6">  // 旧: grid-cols-1 lg:grid-cols-2
   ```

3. **見出しリネーム**
   - 「店舗別 獲得経路」→「店舗別 新規獲得経路」

4. **チャート下の数値詳細テーブル**
   各チャートカードの下部に以下を追加:

   - 「店舗別 売上・客数」下: `店舗名 / 売上 / 客数 / 客単価` テーブル（現状のテーブルからその列だけ抽出でも可）
   - 「店舗別 セグメント構成（客数）」下: `店舗名 / 新規 / リピート / 常連 / スタッフ / 記載なし / 合計` テーブル
   - 「店舗別 新規獲得経路」下: `店舗名 / Google / 口コミ / 看板 / SNS / 不明 / 合計新規` テーブル
   - 「日次推移（客数）」下: スキップ（現状の総合テーブルと冗長のため）

   実装は新規コンポーネント化しても inline でもよい（Engineer 判断）。recharts と同じ色の凡例 dot を先頭列に付けると読みやすい。

### 5.3 LabelList 導入

- **LocationStackChart**: Bar ごとに `<LabelList dataKey={s.key} position="insideRight" fill="#fff" fontSize={10} formatter={(v) => v > 0 ? v : ''} />` を付与。ゼロは空文字で非表示。
- **LocationBarChart**: 両 Bar に `<LabelList position="top" formatter={...} fontSize={10} />`。売上は `formatYen`、客数は `${v}人`。
- **LocationTrendChart**: 合計線（stroke #111827）にのみ `<LabelList dataKey="__total__" position="top" fontSize={10} />`。各店舗線には付けない（錯綜防止）。

---

## 6. チーム分割案

2 チーム並列。命名リネームと UI 拡張はチーム A、型拡張＋集計ロジックはチーム B で独立実装可能。チャート側の Tooltip は型拡張に依存するため B → A の順で合流。

### チーム A （UI リネーム & 全店舗比較強化）
担当ファイル:
- `src/components/DashboardTabs.tsx`
- `src/components/CustomerSegmentSection.tsx` L111 見出しのみ
- `src/components/LocationComparisonSection.tsx`
- `src/components/charts/LocationStackChart.tsx`
- `src/components/charts/LocationBarChart.tsx`
- `src/components/charts/LocationTrendChart.tsx`

成果物:
- タブラベル「店舗データ分析」
- 見出し「店舗データ分析」
- テーブル sticky header
- チャート grid-cols-1
- 「店舗別 新規獲得経路」リネーム
- 各チャート下詳細テーブル
- 3 チャートに LabelList 導入

### チーム B （型 & 集計ロジック & Tooltip）
担当ファイル:
- `src/types.ts`
- `src/hooks/useCustomerSegment.ts`
- `src/hooks/useMultiLocationSegment.ts`
- `src/components/charts/SegmentTrendChart.tsx`

成果物:
- `DailySegmentPoint` に売上 5 フィールド追加
- `useCustomerSegment` 日次売上集計追加
- `useMultiLocationSegment` 日次売上集計追加（各店舗 + 合計）
- `SegmentTrendChart` カスタム Tooltip 実装（人数 + 売上 + 合計人数 + 合計売上 unlisted 除外）

### 依存関係とマージ順序
1. **チーム B 先行マージ**（型拡張は破壊的互換なので、これ先に入れないとチーム A のカスタム Tooltip が動かない）
2. **チーム A 後行マージ**

実運用: 両チームを並列で実装 → Reviewer B → B を master へ → Reviewer A → A を master へ。

---

## 7. 互換性・制約

- **localStorage 互換**: タブキー `'segment'` は維持（ラベルのみ変更）。保存済みユーザーの状態を壊さない。
- **既存ロジック温存**: `allocateSalesByTransaction` は変更しない（日次・全期間で同じ関数を呼ぶため整合性が取れる）。
- **tsc / build 合格**: 型拡張は必須フィールド追加。既存のオブジェクトリテラル生成箇所（`useCustomerSegment` L231-238, `useMultiLocationSegment` L227, L242-243, L302）すべてに 5 フィールド追加必須。漏れると tsc が落ちる。
- **CI**: `npm run typecheck` / `npm run build` が通ること。
- **期間売上との整合**: 日次推移売上合計 = 期間総売上（`salesBySegment` の合計）が完全一致すること。`allocateSalesByTransaction` の端数処理は決定的なので成立する。

---

## 8. テスト観点

### 手動確認
1. 「店舗データ分析」タブに切替、タブ名と見出しが「店舗データ分析」になっている
2. 日次推移グラフにホバー → Tooltip に 5 セグメント人数・売上、合計人数、合計売上が表示される
3. 「今日」→「週」→「今月」切替でデータ更新
4. 「全店舗比較」タブでテーブル縦スクロール時にヘッダーが固定
5. チャート 4 種が縦 1 列で表示（lg でも 1 列）
6. 「店舗別 新規獲得経路」の見出しになっている
7. 各チャート下に数値詳細テーブルが表示
8. 棒グラフ・積み上げ棒グラフ上に数値ラベル常時表示
9. 合計線上に合計値ラベル常時表示

### 数値整合確認
- Tooltip 表示の合計売上（unlisted 除外）+ 記載なし売上 = `dailyTrend` の日売上合計
- `dailyTrend` 全日の `newSales + repeatSales + regularSales + staffSales + unlistedSales` の和 = `totalSales`
- 全店舗比較 totals の dailyTrend 各日の人数 = 全店舗の当該日人数の和

### 回帰確認
- localStorage に `'segment'` があるユーザーでもタブが正しく復元される
- 「今日」で日次推移 1 点のみでもグラフ描画エラーなし
- 全失敗店舗（`loadError`）があっても UI が壊れない

### Playwright 簡易シナリオ（任意）
- `/` → 店舗データ分析タブクリック → 「店舗データ分析」表示確認
- 折れ線ポイントにホバー → Tooltip 「合計売上」テキスト表示確認
- 全店舗比較タブクリック → テーブル縦スクロール → ヘッダー sticky 確認

---

## 9. 注意事項

- チーム B は `DailySegmentPoint` 生成箇所をすべて洗い出すこと（下記 grep 必須）:
  ```
  grep -rn "DailySegmentPoint" src/
  grep -rn "dailyTrend" src/
  ```
- recharts `LabelList` の import 忘れに注意（`import { LabelList } from 'recharts'`）
- カスタム Tooltip は既存 `LocationBarChart` を参考に TooltipProps, ValueType, NameType 型を使うと型安全

---

## 10. 受け入れ基準（Tech Lead 承認項目）

- [ ] `npm run build` / `npm run typecheck` 成功
- [ ] 上記「手動確認」9 項目すべて通過
- [ ] 数値整合 3 項目すべて通過
- [ ] localStorage 互換維持
- [ ] 既存 Round 12/13 機能の回帰なし

承認後、newWorld リポジトリおよび square-dashboard リポジトリ両方に push。
