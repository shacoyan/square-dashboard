# square-dashboard Round 9: 顧客セグメント「スタッフ」追加 設計書

- 作成日: 2026-04-22
- 対象リポジトリ: `square-dashboard`
- 種別: 機能追加（既存ロジック拡張）
- 重要度: 中（分析ダッシュボードの粒度拡張・Round 5/6/7 既存機能への影響注意）
- 実装禁止範囲:
  - Round 8 のパフォーマンス最適化（後回し）
  - 獲得経路（`AcquisitionBreakdown` / `detectAcquisitionChannels` / 新規獲得経路カード）は変更しない
  - Round 5/6/7 の色・週タブ・タブ分割・localStorage 周りは壊さない

---

## 1. 概要

### 何を
顧客セグメント分析に新しいセグメント「スタッフ」を追加する。

- `line_item.name` に `'スタッフ'` が含まれる行を「スタッフセグメント」としてカウント。
- 既存の `新規` / `リピート` / `常連` と完全に同じ `includes` マッチパターン。
- カウント・売上配分・日次推移・売上構成円グラフ・セグメントカード・合計内訳表示に反映。
- 獲得経路は新規客のみを対象とするため、スタッフ追加の影響は受けない（変更なし）。

### なぜ
スタッフ自身による利用（従業員売上・まかない・試験利用など）を、一般顧客（新規/リピート/常連）と分離して可視化するため。既存の3セグメントに混在すると客単価・構成比が歪むため、独立セグメント化する。

### 重要な仕様決定（Owner決定事項の再確認）
- 判定ロジック: `line_item.name.includes('スタッフ')`（既存3セグメントと同じ方式）
- カウント方法: **独立カウント**。複数キーワード該当時は各セグメントにそれぞれ加算（既存挙動と同一）
- 売上配分: `allocateSalesByTransaction` の按分分母に staff を **含める**
- 表示:
  - サマリカード（セグメント別カード）: 3 → 4 枚に拡張
  - 売上構成 Pie: スタッフ追加、色 `#a855f7`
  - 日次推移 Line: スタッフ線追加、色 `#a855f7`
  - 新規獲得経路: 変更なし
  - 合計客数カード内訳: `新規 X / リピート Y / 常連 Z / スタッフ W` に変更
- 色仕様:
  - 新規 `#3b82f6`（青）
  - リピート `#eab308`（黄）
  - 常連 `#ef4444`（赤）
  - スタッフ `#a855f7`（紫） ← 新規追加

---

## 2. 既存仕様との互換性（最重要な意思決定）

### 2-1. `countCustomersByTransaction` のフォールバック（「全ゼロ時は regular:1」）

**現状の挙動**（`src/lib/customerSegment.ts` L20-23）:
```
total = new + repeat + regular
if total === 0 → { new:0, repeat:0, regular:1 } を返す
```
これは「どのセグメントキーワードも line_items に含まれない取引は常連カウント1扱い（ダミー常連）」というビジネスルール。

**スタッフ追加後の方針**:
- `total` の計算には **staff を含める**。
- `total === 0` 判定時に staff もゼロであることを確認した上で、従来通り `{ new:0, repeat:0, regular:1, staff:0 }` を返す（**常連扱いは維持、staff:0 とする**）。
- **意図**: キーワード未記載の取引は従来通り「常連」扱い。スタッフキーワードが1件でもあれば staff が立ち、total > 0 になるためフォールバックには入らない。既存挙動の完全後方互換。

### 2-2. `allocateSalesByTransaction` の按分ロジック

**現状**（L27-44）:
- total (`new + repeat + regular`) が 0 → 全額 regular
- `{0,0,1}` の「ダミー常連」→ 全額 regular
- それ以外は件数比で按分（regular に端数吸収）

**スタッフ追加後の方針**:
- `counts.staff` を **分母・分子共に** 含める。
- フォールバック判定を以下に更新:
  - `total === 0`（`new+repeat+regular+staff === 0`、理論上発生しないが防御）→ 全額 regular
  - `counts.new === 0 && counts.repeat === 0 && counts.regular === 1 && counts.staff === 0`（ダミー常連フォールバック）→ 全額 regular
- 按分実装は以下の順で計算し、端数は **regular** で吸収（既存方針踏襲）:
  ```
  newSales    = floor(amount * counts.new    / total)
  repeatSales = floor(amount * counts.repeat / total)
  staffSales  = floor(amount * counts.staff  / total)
  regularSales = amount - newSales - repeatSales - staffSales
  ```
- **注**: 端数吸収先を regular に固定することで、合計が必ず `tx.amount` と一致する既存保証を維持。

### 2-3. 後方互換性サマリ

| 既存シナリオ | 現状結果 | 新仕様結果 | 互換性 |
|---|---|---|---|
| キーワード無しの取引 | regular:1, 全額 regular | regular:1, staff:0, 全額 regular | OK（変わらず） |
| 新規のみの取引 | 全額 new | 全額 new, staff:0 | OK |
| 新規+リピート混在 | 件数比按分 | 件数比按分, staff:0 | OK（total分母変わらず） |
| スタッフキーワード登場 | 無視されて regular 扱い | staff としてカウント・按分 | 新挙動（意図通り） |

---

## 3. 型定義の変更（旧→新）

### `src/types.ts`

**変更 1: `CustomerSegment` ユニオン型**
```ts
// 旧
export type CustomerSegment = 'new' | 'repeat' | 'regular';
// 新
export type CustomerSegment = 'new' | 'repeat' | 'regular' | 'staff';
```

**変更 2: `SegmentBreakdown`**
```ts
// 旧
export interface SegmentBreakdown {
  new: number;
  repeat: number;
  regular: number;
}
// 新
export interface SegmentBreakdown {
  new: number;
  repeat: number;
  regular: number;
  staff: number;
}
```

**変更 3: `DailySegmentPoint`**
```ts
// 旧
export interface DailySegmentPoint {
  date: string;
  new: number;
  repeat: number;
  regular: number;
}
// 新
export interface DailySegmentPoint {
  date: string;
  new: number;
  repeat: number;
  regular: number;
  staff: number;
}
```

**変更なし**:
- `AcquisitionBreakdown`（獲得経路は新規客のみ対象、スタッフ無関係）
- `CustomerSegmentAnalysis`（内部の `SegmentBreakdown` / `DailySegmentPoint` が拡張されることで自動反映）

---

## 4. 変更対象ファイル一覧（チーム割付込み）

| # | ファイル | 変更種別 | 担当 |
|---|---|---|---|
| 1 | `src/types.ts` | 型拡張 | Team A |
| 2 | `src/lib/customerSegment.ts` | ロジック拡張（count/allocate/aggregate） | Team A |
| 3 | `src/hooks/useCustomerSegment.ts` | dailyTrend 集計 staff 対応 | Team B |
| 4 | `src/components/charts/SegmentPieChart.tsx` | 色・順序・ラベル・データ staff 追加 | Team C |
| 5 | `src/components/charts/SegmentTrendChart.tsx` | SERIES に staff Line 追加 | Team C |
| 6 | `src/components/CustomerSegmentSection.tsx` | カード 4 枚化・色・内訳表示・凡例 | Team D |

**分割戦略**: 型変更（Team A）を起点として Team B/C/D は並列実行可能。ただし Team A の `SegmentBreakdown` 拡張が他チームのビルドに直接影響するため、**Team A を先行マージ、Team B/C/D はその後並列** の2フェーズ構成とする。

---

## 5. チーム別タスク詳細

### Team A（型 + ロジック基盤）【最優先・他チームの土台】

#### 対象ファイル
- `src/types.ts`
- `src/lib/customerSegment.ts`

#### A-1. `src/types.ts`
- 上記「第3章 型定義の変更」に従い、
  - `CustomerSegment` に `'staff'` を追加
  - `SegmentBreakdown` に `staff: number` を追加
  - `DailySegmentPoint` に `staff: number` を追加
- `AcquisitionBreakdown` には **触らない**
- `CustomerSegmentAnalysis` の直接変更は不要（内包型の拡張で自動追従）

#### A-2. `src/lib/customerSegment.ts`

**`countCustomersByTransaction`（L3-25）**
- `initial` を `{ new:0, repeat:0, regular:0, staff:0 }` に拡張
- reduce 内に以下を追加（既存3ブロックと同じ位置に並列追加）:
  ```
  if (name.includes('スタッフ')) {
    acc.staff += quantity;
  }
  ```
- `total = result.new + result.repeat + result.regular + result.staff` に拡張
- フォールバック return を `{ new:0, repeat:0, regular:1, staff:0 }` に変更
  （**仕様**: ダミー常連挙動は維持、staff はゼロ）

**`allocateSalesByTransaction`（L27-44）**
- `counts.staff` を分母 total に含める: `total = counts.new + counts.repeat + counts.regular + counts.staff`
- フォールバック条件1（`total === 0`）: 全額 regular、返却値を `{ new:0, repeat:0, regular: tx.amount, staff:0 }` に
- フォールバック条件2（ダミー常連）: 条件に `&& counts.staff === 0` を追加、返却値も staff:0 付与
- 通常按分:
  - `newSales = floor(tx.amount * counts.new / total)`
  - `repeatSales = floor(tx.amount * counts.repeat / total)`
  - `staffSales = floor(tx.amount * counts.staff / total)`
  - `regularSales = tx.amount - newSales - repeatSales - staffSales`（端数吸収は regular 維持）
  - 返却 `{ new:newSales, repeat:repeatSales, regular:regularSales, staff:staffSales }`

**`detectAcquisitionChannels`（L46-64）**
- **変更なし**（獲得経路は新規客限定）

**`aggregateSegments`（L66-95）**
- `customers` / `sales` 初期値に `staff: 0` を追加
- ループ内に `customers.staff += txCustomers.staff;` / `sales.staff += txSales.staff;` を追加
- `acquisition` は変更なし

#### Team A 受け入れ条件
- `pnpm tsc --noEmit` が通ること（型整合）
- 既存関数シグネチャは維持（破壊的変更なし）
- フォールバック挙動のテスト手順:
  - line_items が空の tx → `{new:0, repeat:0, regular:1, staff:0}` が返り、売上は全額 regular
  - 「スタッフカット」1件の tx → staff:1、売上全額 staff
  - 「新規」1 + 「スタッフ」1 混在の tx 1000円 → new:500, staff:500（端数なし）または new:500/staff:500 に近い値、合計必ず 1000 円一致
  - 「新規」1 + 「常連」1 + 「スタッフ」1 の 1000円 → new:333 + regular:334(端数吸収) + staff:333、合計 1000

---

### Team B（フック層）【Team A 後】

#### 対象ファイル
- `src/hooks/useCustomerSegment.ts`

#### B-1. 変更箇所

**日次集計ループ（L216-232）**
- ループ先頭の `let dayNew = 0; let dayRepeat = 0; let dayRegular = 0;` に `let dayStaff = 0;` を追加
- `forEach` 内で `dayStaff += dayCounts.staff;` を追加
- `dailyTrend.push` の object literal に `staff: dayStaff` を追加

**日次合計客数（L234）**
- `const dayTotalCustomers = dayNew + dayRepeat + dayRegular + dayStaff;` に拡張
- `dailyCustomersTotal` への加算はそのまま（変数経由）
- **意思決定**: `overallAveragePerCustomer`（全体客単価、L269）の分母に staff を含めるか？
  - **方針**: **含める**（既存カードの「合計客数」も staff 込みに変更するため、整合性を取る）
  - `dailyCustomersTotal` 経由で自動的に含まれるので追加対応不要

**`setData` の customersBySegment / salesBySegment（L280-281）**
- 変更不要。`aggregateSegments` 戻り値が型拡張で自動対応。

#### Team B 受け入れ条件
- `pnpm tsc --noEmit` 通過
- `dailyTrend` 各要素に `staff` フィールドが含まれる
- 既存の日次合計が新規+リピート+常連+スタッフに変わること（旧画面の合計表示と差分が出るのは仕様）
- fetch のキャンセル・失敗集計など既存ロジックに手を入れない

---

### Team C（チャート2種）【Team A 後、Team D と並列】

#### 対象ファイル
- `src/components/charts/SegmentPieChart.tsx`
- `src/components/charts/SegmentTrendChart.tsx`

#### C-1. `SegmentPieChart.tsx`

**定数（L10-22）**
- `COLORS` に `staff: '#a855f7'` 追加
- `SEGMENT_ORDER` を `['new', 'repeat', 'regular', 'staff']` に拡張
  - 凡例順は **新規 → リピート → 常連 → スタッフ** 固定（色連想と揃える）
- `LABELS` に `staff: 'スタッフ'` 追加

**`total` 計算（L30）**
- `sales.new + sales.repeat + sales.regular + sales.staff` に拡張

**全ゼロ時 fallback（L32-33）**
- 変更不要（空データ表示は変わらず、1セル `データなし` 表示のまま）
- ただし `segment: 'new' as const` は型整合が取れるため現状維持で OK

#### C-2. `SegmentTrendChart.tsx`

**`SERIES` 定数（L19-23）**
- 4 つ目のエントリを追加:
  ```
  { key: 'staff' as const, color: '#a855f7', label: 'スタッフ' }
  ```
- 並び順は 新規 → リピート → 常連 → スタッフ

**`chartData` 空データ fallback（L28-30）**
- `{ date: '', new: 0, repeat: 0, regular: 0, staff: 0 }` に拡張

**その他（XAxis/YAxis/Tooltip等）変更なし**

#### Team C 受け入れ条件
- `pnpm tsc --noEmit` 通過
- 色が `#a855f7`（紫）であること、新規・リピート・常連の色は不変
- Pie の凡例・Tooltip にスタッフが表示される
- Line の 4 本目がスタッフとして描画される
- 全データ 0 時のフォールバック表示が壊れない

---

### Team D（セクション UI）【Team A 後、Team C と並列】

#### 対象ファイル
- `src/components/CustomerSegmentSection.tsx`

#### D-1. 定数ブロック変更

**`SEGMENT_LABELS`（L59-63）**
- 末尾に `{ key: 'staff', label: 'スタッフ' }` を追加
- 順序: 新規 → リピート → 常連 → スタッフ

**`SALES_COLORS`（L65-69）**
- `staff: '#a855f7'` を追加

#### D-2. セグメントカードのグリッド変更（L198）

**現状**: `<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">`
- 3 枚のカードが横並び

**変更後**: `<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">`
- モバイル: 1列
- sm〜md: 2×2
- lg 以上: 4列横並び
- 上部のサマリ4カード（期間売上等, L164）と同じグリッド仕様に統一し、視覚的な一貫性を持たせる

**マップ処理は変更不要**（`SEGMENT_LABELS.map(...)` なので自動で4枚描画される）

#### D-3. 合計客数カードの内訳テキスト（L189-194）

**現状**:
```
{(new + repeat + regular).toLocaleString()}人
新規 {new} / リピート {repeat} / 常連 {regular}
```

**変更後**:
```
{(new + repeat + regular + staff).toLocaleString()}人
新規 {new} / リピート {repeat} / 常連 {regular} / スタ {staff}
```

- 内訳短縮表記は仕様通り「スタ」（他も 新 / リ / 常 の短縮例が `SegmentTrendChart` 凡例横にあるが、本カードは既に「新規/リピート/常連」とフル表記のため、4つ目だけ 4 文字の「スタッフ」にすると長くなる場合あり → **短縮「スタ」を採用**）

#### D-4. 売上構成セクション（L215-232）

- `SEGMENT_LABELS.map` ベースのため自動で 4 行に拡張される
- `totalSales` から percent を算出するロジックは不変（total に staff 売上も含まれるため整合）
- 変更不要

#### D-5. 日次推移サイド一覧（L241-247）

**現状**:
```
{day.date}: 合計{day.new + day.repeat + day.regular}人（新{day.new}/リ{day.repeat}/常{day.regular}）
```

**変更後**:
```
{day.date}: 合計{day.new + day.repeat + day.regular + day.staff}人（新{day.new}/リ{day.repeat}/常{day.regular}/ス{day.staff}）
```

- 短縮表記は既存の `新/リ/常` に揃えて **「ス」**（1 文字）を採用

#### D-6. 獲得経路セクション（L251-270）

- **変更しない**

#### Team D 受け入れ条件
- `pnpm tsc --noEmit` 通過
- 4 カード表示がモバイル/タブレット/デスクトップで崩れないこと
- スタッフカードの色ドット（Pie 凡例側）が `#a855f7`
- 合計客数カードがスタッフも含めた人数になる
- 日次推移サイド一覧に `ス{}` が追加される
- 獲得経路は変更されない（目視確認）

---

## 6. 並列度と依存関係

```
┌──────────────┐
│ Team A       │  (types.ts + customerSegment.ts)
│ 型＋ロジック │  ※先行マージ必須
└──────┬───────┘
       │ merge
       ▼
┌──────┬──────┬──────┐
│Team B│Team C│Team D│  並列可能
│ hook │chart │ UI   │
└──────┴──────┴──────┘
```

- 推奨進行: Phase 1 = Team A 完了＆Reviewer 承認 → Phase 2 = B/C/D 並列着手
- Team B/C/D は互いにファイル重複なし、依存なし。同時着手で問題なし
- Team A が終わっていない状態で B/C/D を着手すると `SegmentBreakdown.staff` 不在により型エラー多発するので注意

---

## 7. 競合・影響リスク事前チェック

| リスク | 影響先 | 対策 |
|---|---|---|
| `SegmentBreakdown` 利用箇所の型エラー | 他コンポーネント | repo 全体 grep で Team A 完了時に `SegmentBreakdown` 参照を洗い出す |
| `DailySegmentPoint` 利用箇所 | `useCustomerSegment` のみ想定 | Team B の対応で完結 |
| Round 5/6/7 既存機能破壊 | 色（青/黄/赤）・週タブ・タブ分割・localStorage | これらの定数・ロジックには触らない。スタッフ追加のみ |
| 獲得経路への波及 | `detectAcquisitionChannels` / `AcquisitionBreakdown` | 触らないこと（全チーム共通注意） |
| 端数による売上合計不一致 | `allocateSalesByTransaction` | regular で端数吸収維持により必ず tx.amount と一致 |
| フォールバック動作変更 | ダミー常連取引 | total 分母に staff 含めるが、既存取引に staff は立たないため挙動不変 |
| 合計客数の意味変化 | サマリカード | 仕様: staff を含めた合計にする。Reviewer 確認項目 |
| Pie/Line の空データ表示 | 取引ゼロ期間 | fallback オブジェクトに staff:0 を追加済み、崩れない |

---

## 8. Reviewer 受け入れ条件（統括）

### 必須
- [ ] `pnpm tsc --noEmit` エラーゼロ
- [ ] `pnpm lint` エラーゼロ（警告は既存許容範囲に収める）
- [ ] `pnpm build` 成功
- [ ] `src/lib/customerSegment.ts` の3関数いずれも `staff` を含んだ `SegmentBreakdown` を返す
- [ ] `allocateSalesByTransaction` の合計が常に `tx.amount` と一致（端数は regular 吸収）
- [ ] `useCustomerSegment` の `dailyTrend` 各要素に `staff` が含まれる
- [ ] `CustomerSegmentSection` のサマリカードが 4 枚になっている
- [ ] 合計客数カードの内訳に「スタ」が追加されている
- [ ] Pie / Line / 凡例 / Tooltip 全てに「スタッフ」が表示される
- [ ] スタッフ色が `#a855f7`、他色（新規/リピート/常連）は変更なし
- [ ] 新規獲得経路セクションは一切変更されていない

### 動作確認（目視）
- [ ] line_items に「スタッフ」キーワードを含むテストデータで、スタッフ客数・売上が計上される
- [ ] 全セグメント 0 の取引（キーワード未記載）でも既存通り常連 1 扱い・全額 regular 売上
- [ ] 今日 / 週 / 月の各タブ、週タブ切替、localStorage 復元が壊れていない
- [ ] モバイル幅でサマリ 4 カードが崩れない

### 回帰
- [ ] Round 5（色）/ Round 6（週タブ・タブ分割）/ Round 7（localStorage）の振る舞いに変化なし
- [ ] 獲得経路の数値・色・表示が完全に不変

---

## 9. 統合時の注意点（Team D→ Tech Lead 最終チェック向け）

1. **`git diff` で `AcquisitionBreakdown` / `detectAcquisitionChannels` / 獲得経路関連行が一切変更されていないことを確認**
2. **`SEGMENT_ORDER` / `SEGMENT_LABELS` / `SALES_COLORS` / `SERIES` のスタッフ追加位置が必ず末尾**（凡例順序の一貫性）
3. **色ハードコード `#a855f7` は 3 箇所（`CustomerSegmentSection` の `SALES_COLORS`、`SegmentPieChart` の `COLORS`、`SegmentTrendChart` の `SERIES`）に独立して書かれる**
   - 共通化は今回のスコープ外（将来の色定数集約 Round で対応）
   - ただし 3 箇所で値がズレていないか grep で確認
4. **端数吸収が必ず regular に落ちることを `allocateSalesByTransaction` で保証**（合計検算）
5. **`countCustomersByTransaction` のフォールバック `{new:0, repeat:0, regular:1, staff:0}` を変更しないこと**
6. **テストデータが無いため Reviewer は実データもしくはモック取引で手動検証**

---

## 10. 作業外リスト（やらない）

- Round 8 の `useCustomerSegment` パフォーマンス最適化（並列化・キャッシュ等）
- `AcquisitionBreakdown` / 獲得経路のロジック変更
- 色定数の共通モジュール化
- 自動テスト追加
- Storybook 更新
- CSV 出力フォーマット変更
- バックエンド（`/api/transactions` / `/api/open-orders`）の変更

---

## 11. 想定工数

- Team A: 30〜45 分（型＋ロジック、テスト検算含む）
- Team B: 15 分（hook の dailyTrend 集計変更のみ）
- Team C: 20 分（Pie + Line、定数追加）
- Team D: 30 分（グリッド変更・内訳表示・凡例）
- Reviewer 全体: 20 分
- 統合確認（Tech Lead）: 10 分

合計: 約 2 時間〜2.5 時間（Phase 構成で実時間は短縮可能）

---

以上。
