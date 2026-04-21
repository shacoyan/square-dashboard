# square-dashboard 顧客セグメント分析 修正設計書

- 起票日: 2026-04-22
- 起案: Tech Lead
- 対象プロジェクト: `square-dashboard`
- 対象ブランチ: `master`
- リポジトリルート: `/Users/usr0103301/Documents/個人仕事/newWorld/square-dashboard`

---

## 1. 概要（何を・なぜ）

顧客セグメント分析セクション（`CustomerSegmentSection`）の以下を修正する。

1. 期間集計に**未決済テーブル（OpenOrder）を含める**（現状は決済済み `Transaction` のみで、営業中の卓が売上・客数に反映されない）。
2. **営業時間フィルタの整合性**を再確認（`api/transactions.js` / `api/open-orders.js` は `parseTimeRange` で絞込み済み。`useCustomerSegment` の各日 fetch に `start_hour` / `end_hour` が渡っていることを検証し、未決済側にも同様の結線を担保する）。
3. **合計客数 KPI** を追加（新規 + リピート + 常連）。
4. 3 チャート（円・折線・円）に**常時ラベル**（金額・件数・%）を表示。
5. **文字色を視認可能な濃度**（ダーク系カード内の `text-gray-300` 以下 → `text-gray-200/100` 等）へ統一。
6. 日本語表記統一: **「クチコミ」→「口コミ」**（集計判定キーワードとラベル表示の両面）。
7. **未決済テーブル位置変更**: `TransactionList` の直上 → 既に `OpenOrderList` が `SalesSummary` より上にあるが、「売上集計（SalesSummary）/ セグメント分析（CustomerSegmentSection）/ 決済済み取引（TransactionList）の直上」にもう一度配置し直し、営業中の伝票をすぐ見られるようにする。

### 背景
- 現場は「営業中の卓が客数・売上に反映されず、リアルタイムで把握できない」という苦情。
- ダーク系カードでラベルが薄く読みにくい。
- 「口コミ」表記揺れ。

---

## 2. 分割戦略（並列度・使用チーム・依存関係）

6 チーム並列。依存関係は以下のとおり薄い：

```
E (types)  ─┐
             ├──► A (lib/customerSegment) ─┐
             │                              ├──► B (hooks/useCustomerSegment)
             │                              │
             └──► D (charts)                │
                                            ├──► C (CustomerSegmentSection)
                                            │
                                            └──► F (Dashboard)
```

- **E** は型の微修正のみ（`AcquisitionChannel` は `'review'` のまま維持、`AcquisitionBreakdown` も同じ。表示ラベルの日本語化は A/C/D 側の責務）。`OpenOrder` は `line_items` に `category?` を任意追加しても良いが今回は不要（`mergeOpenOrderIntoTransactionShape` は B 側のアダプタで吸収）。
- **A** は `customerSegment.ts` の文字列マッチ（`'クチコミ'` → `'口コミ'`）、および OpenOrder を透過的に集計できるよう「Transaction 互換 shape」に適合する関数シグネチャを維持する（引数を既存の `Transaction` のまま。B 側で OpenOrder → Transaction 互換にアダプトしてから A に投げる）。
- **B** は OpenOrder を期間分ループ取得し、Transaction 互換にアダプト（`amount = total_money`, `discounts` を同梱）してから既存集計パイプラインに流す。
- **C** は KPI / 色 / ラベル。
- **D** は 3 チャートの常時ラベル / 色 / 口コミ表記。
- **F** は `Dashboard.tsx` の `OpenOrderList` 配置のみ。

### 合流点
- **A のシグネチャは変えない** → B は OpenOrder を `Transaction` 型に合わせて渡せば OK。
- **D のラベル表記** と **C の KPI ラベル** は「口コミ」で統一（E の型コメントにも明記）。
- **F と他** は UI 配置のみ。論理的な競合なし。

### 並列リスク
- `CustomerSegmentSection.tsx`（C）と チャートコンポーネント（D）はファイル別。
- `useCustomerSegment.ts`（B）は A の関数シグネチャに依存（変更なし想定）。
- 型（E）は A・B が参照するが、今回は `AcquisitionChannel` 不変・`OpenOrder` 不変のため破壊変更なし。

---

## 3. チーム別タスク

### Engineer A — `src/lib/customerSegment.ts`

- **担当ファイル**: `/Users/usr0103301/Documents/個人仕事/newWorld/square-dashboard/src/lib/customerSegment.ts`
- **修正する関数**: `detectAcquisitionChannels(tx: Transaction)` の内部文字列マッチのみ。
- **変更内容**:
  - L58 `if (name.includes('クチコミ')) result.review += 1;` → `if (name.includes('口コミ') || name.includes('クチコミ')) result.review += 1;`
    - 既存 Square カタログに 'クチコミ' 表記が残っていても誤集計しないように、**両方許容**する（後方互換）。
    - 新規に登録される商品は '口コミ' 表記を前提とする（店舗運用で書き換え予定）。
  - 他は変更不要。シグネチャ変更なし。
- **OpenOrder 対応**: 型上は `Transaction` を受ける関数のまま変更なし（B 側でアダプトする）。
- **依存**: なし。
- **差分方針**: L58 のみ部分修正（1 行）。
- **完了条件**: `countCustomersByTransaction` / `allocateSalesByTransaction` / `detectAcquisitionChannels` / `aggregateSegments` の型・シグネチャが一切変わっていないこと。

### Engineer B — `src/hooks/useCustomerSegment.ts`

- **担当ファイル**: `/Users/usr0103301/Documents/個人仕事/newWorld/square-dashboard/src/hooks/useCustomerSegment.ts`
- **修正する関数**: `fetchData` 内部のみ。外部 API（戻り値の `CustomerSegmentAnalysis`）は不変。
- **変更内容**:

  1. **営業時間フィルタ整合性確認**:
     - 既に `/api/transactions?date=${date}&location_id=...&start_hour=${startHour}&end_hour=${endHour}` として渡している（L117）。
     - `api/transactions.js` は `parseTimeRange({date,start_hour,end_hour})` で JST ベースに絞り込み済み。→ **問題なし。検証のみ。**
     - 不具合があった場合（例: `startHour=13, endHour=12` の夜跨ぎで空配列が返る等）は別タスクとして Tech Lead へ報告。本タスクでは既存挙動に倣う。

  2. **OpenOrder を期間分ループ取得**:
     - `dates` 配列の各日に対し、`fetch('/api/open-orders?date=...&location_id=...&start_hour=${startHour}&end_hour=${endHour}', { headers, signal })` を並列実行する 2 本目の `Promise.all` を追加。
     - 取得した `OpenOrder[]` を Transaction 互換 shape にアダプトする内部関数 `openOrderToTransaction(o: OpenOrder): Transaction` を実装:
       ```ts
       function openOrderToTransaction(o: OpenOrder): Transaction {
         return {
           id: o.id,
           customer_name: o.customer_name,
           created_at_jst: o.created_at ?? '',
           amount: o.total_money,         // OPEN 伝票の想定合計
           status: 'OPEN',
           source: 'OPEN_TICKET',
           line_items: o.line_items,      // 同じ LineItem 型
           discounts: o.discounts,
         };
       }
       ```
     - アダプト後の配列を `allTransactions` に `push(...)` し、`dailyTrend` の日別集計にも同様に反映（`countCustomersByTransaction` を呼ぶ既存ループに追加投入）。
     - `dailySalesTotal` には `sum of total_money` を加算、`dailyCustomersTotal` にはセグメント判定後の客数を加算する（決済済み側と同じパス）。

  3. **失敗制御**:
     - 既存 `failures` カウンタは「トランザクション API の失敗」を数えている。Open Orders API の失敗は**同じ日付けの扱い**として 1 つの失敗にまとめる（tx 失敗 or open 失敗のどちらか一方が NG ならその日失敗、両方成功なら成功）。
     - 実装は `Promise.allSettled` を使って両方の結果を同時に受け、日ごとに判定する形に書き換えるのが最もシンプル。→ **書き換え可**（`fetchPromises` の構造を「1 日ごとに tx + open を Promise.all」→ 全日を `Promise.allSettled`）。

  4. **型**: 追加 import: `OpenOrder` を `../types` から。

- **依存**: A（シグネチャ不変を確認）、E（型不変を確認）。
- **差分方針**: `fetchData` 内部の URL 生成〜日別集計ブロックを中心に書き換え。`setData` 以降は変更なし。
- **完了条件**:
  - `useCustomerSegment` の引数・戻り値型が変わらない。
  - Network タブで各日に対し `transactions` と `open-orders` が並列で飛ぶ。
  - OPEN 伝票の卓が `customersBySegment` / `salesBySegment` / `dailyTrend` / `totalSales` / `totalCustomers` に加算されている。

### Engineer C — `src/components/CustomerSegmentSection.tsx`

- **担当ファイル**: `/Users/usr0103301/Documents/個人仕事/newWorld/square-dashboard/src/components/CustomerSegmentSection.tsx`
- **変更内容**:

  1. **合計客数 KPI カード追加**:
     - 現状 KPI は 3 枚（期間売上 / 平均日売上 / 全体客単価）。
     - 1 列増やして 4 枚にする（`grid-cols-1 sm:grid-cols-3` → `sm:grid-cols-2 lg:grid-cols-4` 程度）。
     - 追加カード:
       - ラベル: `合計客数`
       - 値: `${(data.customersBySegment.new + data.customersBySegment.repeat + data.customersBySegment.regular).toLocaleString()}人`
       - 補足: 小さく `新規 X / リピート Y / 常連 Z`（テキスト色は後述）

  2. **文字色改善**:
     - 現状このセクションの最上位コンテナは `bg-white` だが、ダッシュボード全体のテーマが暗色 UI に寄っている（Dashboard 上位で決まる）。
     - カード内の `text-gray-500` / `text-gray-400` / `text-gray-300` はダーク系背景だと視認性が低い。
     - 本セクションでは**カード背景自体をダーク基調（`bg-gray-800`）に統一**し、以下へ変更:
       - ラベル（`text-sm font-medium text-gray-500`）→ `text-gray-200`
       - 値（`text-2xl font-bold text-gray-900`）→ `text-white`
       - 補足（`text-xs text-gray-400`）→ `text-gray-400` のまま（小さい補助情報）
       - エラー: 変更なし（赤系）
     - 外枠 `bg-white rounded-xl shadow` → `bg-gray-800 rounded-xl shadow-lg` に統一。
     - 内部 KPI の `bg-gray-50 border-gray-200` → `bg-gray-900 border-gray-700`。
     - 期間タブ: 非選択を `bg-gray-100 text-gray-600` → `bg-gray-700 text-gray-200 hover:bg-gray-600`。選択は `bg-indigo-600 text-white` のまま。
     - 見出し `text-lg font-bold text-gray-900` → `text-white`。
     - `text-gray-500` の「データなし」メッセージ → `text-gray-300`。
     - **SkeletonCard / SkeletonSection 内の `bg-gray-200` も `bg-gray-700` に変更**。

  3. **口コミラベル反映**:
     - このファイル内に「クチコミ」リテラルは存在しない（ラベル生成はチャート側）。**変更箇所なし**を確認するのみ。

- **依存**: D と同じ「口コミ」用語で統一することを確認。E の型不変を確認。
- **差分方針**: 主に Tailwind クラス置換（`replace_all` 可）+ KPI カード 1 枚追加。
- **完了条件**:
  - ダーク系 4 KPI が視認可能。
  - 合計客数が `customersBySegment` の合計と一致。
  - 既存の「新規 / リピート / 常連」3 枚は残しつつ配色更新。

### Engineer D — `src/components/charts/*.tsx`

- **担当ファイル**:
  - `/Users/usr0103301/Documents/個人仕事/newWorld/square-dashboard/src/components/charts/SegmentPieChart.tsx`
  - `/Users/usr0103301/Documents/個人仕事/newWorld/square-dashboard/src/components/charts/SegmentTrendChart.tsx`
  - `/Users/usr0103301/Documents/個人仕事/newWorld/square-dashboard/src/components/charts/AcquisitionChart.tsx`
- **変更内容**:

  1. **SegmentPieChart**:
     - `<Pie>` に `label` prop を追加して Cell 上に「`{LABELS[segment]} ¥xxx (xx%)`」を常時表示。
     - 実装方針: recharts の `label={(entry) => ...}` を関数で指定、もしくは `<Pie label={renderCustomLabel} ...>` のカスタム SVG label。
     - サンプル:
       ```ts
       const renderLabel = (props: { cx: number; cy: number; midAngle: number; outerRadius: number; percent: number; payload: {name: string; value: number} }) => {
         const RADIAN = Math.PI / 180;
         const r = props.outerRadius + 18;
         const x = props.cx + r * Math.cos(-props.midAngle * RADIAN);
         const y = props.cy + r * Math.sin(-props.midAngle * RADIAN);
         return (
           <text x={x} y={y} fill="#e5e7eb" textAnchor={x > props.cx ? 'start' : 'end'} dominantBaseline="central" fontSize={11}>
             {`${props.payload.name} ¥${props.payload.value.toLocaleString()} (${(props.percent*100).toFixed(1)}%)`}
           </text>
         );
       };
       ```
     - Legend テキスト色 `text-gray-300` → `text-gray-200` へ濃度アップ。
     - 「データなし」`text-gray-500` → `text-gray-400`。

  2. **SegmentTrendChart**:
     - 各 `<Line>` に `<LabelList dataKey="..." position="top" fill="#e5e7eb" fontSize={10} />` を追加して各データ点の数値を常時表示。
     - `recharts` から `LabelList` を import。
     - `XAxis`/`YAxis` の `tick.fill` `#9ca3af` → `#d1d5db`（薄すぎ対策）。
     - Legend `text-gray-300` → `text-gray-200`。

  3. **AcquisitionChart**:
     - **「クチコミ」→「口コミ」**: `CHANNEL_CONFIG[1].label` を `'口コミ'` に変更。
     - Pie に常時ラベル追加（SegmentPieChart と同様のカスタム関数）。フォーマットは `${name} ${value}人 (${percent}%)`。
     - 「新規客なし」の `text-gray-500` → `text-gray-400`。
     - Legend テキスト `text-gray-300` → `text-gray-200`。

- **依存**: A (`detectAcquisitionChannels` のキー `review` は変わらない)、E（型不変）。
- **差分方針**: 3 ファイルそれぞれ部分修正。全書き換え不要。
- **完了条件**:
  - 3 チャートすべてで数値ラベルが常時表示される。
  - 「口コミ」で表示される。
  - ダーク背景で文字が読める。

### Engineer E — `src/types.ts`

- **担当ファイル**: `/Users/usr0103301/Documents/個人仕事/newWorld/square-dashboard/src/types.ts`
- **変更内容**:

  1. **型名は変更しない**:
     - `AcquisitionChannel = 'google' | 'review' | 'signboard' | 'sns' | 'unknown'` はそのまま（キー `review` は内部 ID、表示は「口コミ」に統一される旨のコメントのみ追記）。
     - `AcquisitionBreakdown` も不変。
     - `OpenOrder` も不変（B 側がアダプタで吸収）。
  2. **コメント追記**:
     - `AcquisitionChannel` 行末に:
       ```ts
       // 'review' は「口コミ」（旧表記「クチコミ」）の内部キー。UI 表示は「口コミ」。
       ```
     - `AcquisitionBreakdown.review` 行末に同趣旨のコメント。
     - `LineItem.category` のままで OK（OpenOrder.line_items も同じ LineItem 型を使っているので、将来 open-orders API がカテゴリを返せばそのまま使える）。

- **依存**: なし（全員が後方互換）。
- **差分方針**: 2〜3 行のコメント追加のみ。ロジック/型の破壊変更なし。
- **完了条件**:
  - 既存 import 箇所すべてがそのまま動作する（型エラーゼロ）。
  - `review` キーに「口コミ」コメントが付いている。

### Engineer F — `src/components/Dashboard.tsx`

- **担当ファイル**: `/Users/usr0103301/Documents/個人仕事/newWorld/square-dashboard/src/components/Dashboard.tsx`
- **変更内容**:

  1. **現状の JSX 順序（L220〜L238）**:
     ```
     <OpenOrderList ... />
     <SalesSummary ... />
     <CustomerSegmentSection ... />
     <TransactionList ... />
     ```

  2. **修正後**:
     ```
     <SalesSummary ... />
     <CustomerSegmentSection ... />
     <OpenOrderList ... />        ← ここに移動（TransactionList の直上）
     <TransactionList ... />
     ```
     - 要件「TransactionList の上に OpenOrder テーブル」に厳密対応。
     - 重複しないよう、従来の位置（SalesSummary の上）からは削除する。

  3. **その他**: ロジック変更なし。props も変更なし。

- **依存**: なし（他チームと独立）。
- **差分方針**: JSX ブロックの 1 要素移動のみ。
- **完了条件**:
  - 画面上、`SalesSummary` → `CustomerSegmentSection` → `OpenOrderList` → `TransactionList` の順序で描画。
  - `OpenOrderList` は 1 箇所のみ（重複配置しない）。

---

## 4. 統合時の注意点

### 4.1 レビュアー確認ポイント
- **型整合**: `npm run build`（tsc）がエラーゼロ。
- **B の非同期制御**: `AbortController` が tx / open 両方に効いていること（使い回し）。
- **B の失敗制御**: 1 日のうち tx 成功 + open 失敗のときに、その日のトランザクション分は集計に含まれるか / open 分だけが欠落になっているか（= 部分的な欠落の扱いを明文化したメッセージになるか）。最低限「両方失敗した日数 === dates.length なら全体 error、それ以外は warning」という既存挙動を壊さないこと。
- **D のラベル**: 小さいデータ（0 人 / 0 円）のセグメントでラベルが重ならないこと。必要なら `percent < 0.02` のセグメントはラベル非表示にする分岐を入れてよい。
- **C の 4 KPI**: モバイル（sm 未満）で縦 1 列になること、sm〜lg で 2 列、lg 以上で 4 列。
- **F**: `OpenOrderList` の 2 箇所配置になっていないこと（diff で確認）。

### 4.2 回帰確認
- 既存の `AcquisitionBreakdown.review` を使っている箇所がないか全文検索（`grep -rn "acquisitionBreakdown.review\|\.review"`）。
- `'クチコミ'` という文字列が型・テストに残存していないか確認（A は両方許容のため残って OK、D は `'口コミ'` 一本化）。

### 4.3 手動動作確認（Tech Lead 最終承認前）
- 今日 / 今週 / 今月で:
  - 合計客数 KPI = 新規 + リピート + 常連
  - 合計客数に**営業中の卓の人数**が含まれる
  - 売上 KPI に**営業中の卓の total_money**が含まれる
- 円グラフ / 折線グラフ / 獲得経路グラフに数値ラベルが常時表示
- 「口コミ」の表記統一
- 画面順序: SalesSummary → CustomerSegmentSection → OpenOrderList → TransactionList
- ダーク基調で文字が読める

### 4.4 スコープ外（今回は触らない）
- `OpenOrderList` コンポーネント自身のスタイル改修
- `SalesSummary` の数値に OPEN 伝票を含めるか（要件外。別チケット）
- Square カタログ側の商品名「クチコミ」→「口コミ」書き換え運用（店舗作業）

---

## 5. 並列実行コマンド（Tech Lead 用メモ）

- Engineer A〜F を GLM 経由で同時キック。
- 各 Engineer は担当ファイル以外を編集しない。
- Reviewer は上記「統合時の注意点」をもとに判定。
- D チーム（統合）は最終的に `git diff master` と `npm run build` の結果を Tech Lead に報告。

---

以上。
