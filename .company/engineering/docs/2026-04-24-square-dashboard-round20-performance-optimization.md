# square-dashboard Round 20 パフォーマンス最適化設計書（旧 Round 8 再設計・全店舗比較対応版）

- 作成日: 2026-04-24
- 作成者: Tech Lead
- 対象プロジェクト: `square-dashboard`
- 関連: Round 7（period 初期値=month） / Round 8（旧設計・未実装） / Round 12〜19（全店舗比較タブ追加・強化）
- 参照: `.company/engineering/docs/2026-04-22-square-dashboard-optimization.md`（旧 Round 8 設計）

---

## 0. 旧設計書（2026-04-22）との関係

本設計書は旧 Round 8 を**破棄せず拡張**する。下記方針で上書きする。

| 旧設計の章 | 本設計での扱い |
|------------|----------------|
| §1 概要（案C 遅延ロード + バッチAPI） | **そのまま流用**し、`useMultiLocationSegment` を追加スコープとして含める |
| §3 対象ファイル一覧 | **拡張**（`useMultiLocationSegment.ts` / `LocationComparisonSection.tsx` / `Dashboard.tsx` を追加） |
| §4 サーバーサイド詳細設計（`api/_shared.js` ヘルパー、`transactions-range.js`、`open-orders-range.js`） | **完全流用**（API の仕様は変更なし、`location_id` は単数のまま） |
| §5 クライアント詳細設計 | `useCustomerSegment` 部分はそのまま流用、`useMultiLocationSegment` の書き換えを**新セクション §6 として追加** |
| §7 レビュワー受け入れ条件 | **加筆**（compare タブのケースを追加） |

**旧章番号を引用**する形で記述する。旧設計書を一緒に読むこと前提で記述しているため、一次仕様（ヘルパーの入力・出力・業務日グルーピング挙動など）の詳細はそちらを参照。本書では**差分と拡張箇所のみ詳述**する。

---

## 1. 概要（新スコープ）

### 何を
1. 旧 Round 8 の全内容（遅延ロード + range API）を実装する
2. **加えて `useMultiLocationSegment`**（全店舗比較タブ）も同じ範囲APIに乗せ替え、店舗 × 日次 の N×M 並列発射を **店舗数のみ** に圧縮する
3. **compare タブも遅延ロード**（`hasCompareBeenActive`）し、ダッシュボード初回表示時に 400+ 本の fetch が走る状況を完全に断つ

### なぜ
Round 12 で compare タブが追加され、現状ダッシュボードを開いた瞬間に最悪ケースで以下の並列 fetch が発射される:

| 経路 | 現状並列数（7店舗 × 31日 × 2 API 想定） |
|------|--------------------------------------------|
| `useCustomerSegment`（単店・月次） | 最大 **62** |
| `useMultiLocationSegment`（compare・月次） | 最大 **434** |
| `useSquareData`（daily・単店・単日） | 1 |
| `useOpenOrders`（daily・単店・単日） | 1 |
| 合計 | **約 498** |

Square API rate limit (`429`) / ブラウザ同時接続数（Chrome は host あたり 6）/ Vercel Function 同時実行数のいずれにも深刻な圧迫。

### 目標値（Round 20 実装後）
初期ロード（daily タブで起動した場合）は `useSquareData` + `useOpenOrders` + `/api/locations` の **3本**に収まる。

セグメントタブに切り替え → **2本**追加（`transactions-range` + `open-orders-range`）。compare タブに切り替え → 店舗数 × 2 = **最大14本**に圧縮（従来 434本 → 14本、**96.7% 削減**）。

### 設計方針（全体）
旧設計書 §1 の方針を全て踏襲:
- 既存 `api/transactions.js` / `api/open-orders.js` は **daily タブ用に温存**（差分ゼロ）
- API 側は **`begin_time`/`end_time` レンジ + cursor** で一括取得
- 業務日 (`business_date`) は `start_hour` で区切る
- クライアント契約（戻り値型・Props）は一切変更しない

追加方針:
- **`location_id` は引き続き単数**。Square の `/v2/payments` は `location_id` 複数指定**不可**（単数クエリパラメータ）、`/v2/orders/search` は `location_ids` 配列対応だが、レスポンスを業務日×店舗でクロスグルーピングするとデータ構造が複雑化しレビュー難易度が上がるため、**店舗ごとに range API を呼ぶ**方針を採る（= 7店舗の場合 7並列 × 2API = 14並列）
- これにより API 側（`_shared.js` / `transactions-range.js` / `open-orders-range.js`）の仕様は旧設計書のまま変更不要

---

## 2. 分割戦略

### 並列度とチーム割り当て（A〜E の5チーム）

| チーム | 担当領域 | 依存 | 並列可否 |
|--------|----------|------|----------|
| **A** | `api/_shared.js` 共通ヘルパー追加（旧設計 §4.1） | なし（先行必須） | 単独 |
| **B** | `api/transactions-range.js` 新規実装（旧設計 §4.2） | A 完了 | B/C 並列可 |
| **C** | `api/open-orders-range.js` 新規実装（旧設計 §4.3） | A 完了 | B/C 並列可 |
| **D** | クライアント: `useCustomerSegment.ts` の range 化 + `enabled` フラグ（旧設計 §5.1〜5.6） | B・C 完了 | D/E 並列可（別ファイル） |
| **E** | クライアント: `useMultiLocationSegment.ts` の range 化（店舗ごとに range API を1組、日次ループ廃止）+ `Dashboard.tsx` で `hasSegmentBeenActive` / `hasCompareBeenActive` の **両方** state を追加 | B・C 完了 | D/E 並列可（D と競合なし） |

**統合（F 相当）**: 全チーム完了後、Reviewer レビュー通過 → 統合担当（D チーム担当者が兼務）がローカル `vercel dev` + Playwright で動作検証。

### 依存グラフ
```
A (ヘルパー)
├─ B (transactions-range) ─┐
└─ C (open-orders-range) ──┤
                           ├─ D (useCustomerSegment) ─┐
                           └─ E (useMultiLocationSegment + Dashboard.tsx) ─┴─ 統合検証
```

### 競合リスク
- **`Dashboard.tsx` は E チームのみが触る**（`hasSegmentBeenActive` と `hasCompareBeenActive` を一括で追加する）。D チームは Dashboard.tsx を触らず、`useCustomerSegment.ts` の内部改修と Args の `enabled` 追加のみに集中する。
- 代わりに E チームは `useCustomerSegment` の新シグネチャを前提に `Dashboard.tsx` の呼び出し側を書く必要があるため、**D のシグネチャ確定（Args に `enabled: boolean` 追加）を E 着手前に合意する**こと。これは旧設計書 §5.1 の型定義を踏襲すれば十分。
- `api/_shared.js` は **A チームのみ**が編集。B/C は読み込むだけ。
- `useMultiLocationSegment.ts` は E 専属。D はこのファイルに触らない。

---

## 3. 対象ファイル一覧

### 新規作成
| パス | 種別 | 担当 |
|------|------|------|
| `api/transactions-range.js` | Vercel Function | B |
| `api/open-orders-range.js` | Vercel Function | C |

### 修正
| パス | 修正内容 | 担当 |
|------|---------|------|
| `api/_shared.js` | `parseRangeTimeRange` / `computeBusinessDate` / `fetchAllPayments` / `fetchOrdersBatch` / `fetchCatalogVariationCategoryMap` 追加（旧 §4.1） | A |
| `src/hooks/useCustomerSegment.ts` | `enabled` フラグ追加、range API に乗り換え（旧 §5.1〜5.5） | D |
| `src/hooks/useMultiLocationSegment.ts` | 店舗 × 日次 ループ廃止、店舗ごとに range API を1組呼び出す構造に変更、`enabled` は既存のまま | E |
| `src/components/Dashboard.tsx` | `hasSegmentBeenActive` + `hasCompareBeenActive` state 追加、両フックに `enabled` を束ねて渡す | E |

### 互換維持（修正しない）
- `api/transactions.js`（`useSquareData` 用）
- `api/open-orders.js`（`useOpenOrders` 用）
- `src/components/CustomerSegmentSection.tsx`
- `src/components/LocationComparisonSection.tsx`（`enabled: locations.length > 0` を Dashboard 側から差し替える形にするため、**Props シグネチャは不変**。ただし `Dashboard.tsx` から `enabled` の元値を `hasCompareBeenActive && locations.length > 0` に変えるために、**props として `enabled` を追加で受け取る**形式も許容）

> **E チーム設計判断**: `LocationComparisonSection` に `enabled` prop を1つ追加し、内部の `useMultiLocationSegment({ ..., enabled })` にそのまま渡す形が最小差分。`LocationComparisonSection.tsx` は **L89 の1行** (`enabled: locations.length > 0`) を `enabled: props.enabled ?? (locations.length > 0)` に変える、もしくは prop 必須化の2択。E チームはどちらでもOK（Reviewer 判断）。

---

## 4. サーバーサイド詳細設計

### 4.1 `api/_shared.js`（チームA）

**旧設計書 §4.1 の内容をそのまま実装する。** 追加関数は以下 5 つ:

| 関数 | 役割 |
|------|------|
| `parseRangeTimeRange({ start_date, end_date, start_hour, end_hour })` | 旧 §4.1.1 参照 |
| `computeBusinessDate(createdAtISO, startHour)` | 旧 §4.1.2 参照 |
| `fetchAllPayments({ beginTimeJST, endTimeJST, location_id })` | 旧 §4.1.3 参照（cursor ループで payments 配列返却） |
| `fetchOrdersBatch(orderIds)` | 旧 §4.1.3 参照（100件ずつ batch-retrieve） |
| `fetchCatalogVariationCategoryMap(ordersMap)` | 旧 §4.1.3 参照（catalog 2段階、variationId → categoryName マップ） |

既存 `parseTimeRange` / `fetchCustomers` / `setCors` / `validateToken` / `squareHeaders` / `VALID_LABELS` は**不変**。

**Reviewer チェックポイント**: 既存エクスポートの 6 関数・定数が diff で変更されていないこと。新規5関数は全て `export function` で外部利用可能であること。

### 4.2 `api/transactions-range.js`（チームB）

**旧設計書 §4.2 をそのまま実装する。** 仕様まとめ:

- GET `?start_date&end_date&location_id&start_hour&end_hour`
- レスポンス: `{ byDate: { "YYYY-MM-DD": { transactions: Transaction[] } } }`
- `Transaction` の形は既存 `api/transactions.js` と**完全一致**（`id`, `created_at_jst`, `amount`, `status`, `source`, `customer_name`, `line_items`, `discounts`）
- 取引ゼロの日は `byDate` キーから**除外**
- `allPayments` に対し既存 `transactions.js` と同じ「FAILED/CANCELED除外」「全額返金除外」「部分返金の amount 差し替え」処理を適用
- payments → `computeBusinessDate(payment.created_at, startHour)` で業務日確定 → `byDate[businessDate].transactions` に push

### 4.3 `api/open-orders-range.js`（チームC）

**旧設計書 §4.3 をそのまま実装する。** 仕様まとめ:

- GET `?start_date&end_date&location_id&start_hour&end_hour`
- `/v2/orders/search` を **cursor 対応**でループ（limit=500）
- レスポンス: `{ byDate: { "YYYY-MM-DD": { orders: OpenOrder[] } } }`
- `OpenOrder` の形は既存 `api/open-orders.js` と**完全一致**

### 4.4 業務日グルーピング

旧設計書 §4.4 の表参照。`start_hour=5` のとき 02:30 の payment は前日営業日扱い、など。

### 4.5 Square API 側の `location_id` 制約（本設計新規）

| エンドポイント | 複数店舗指定可否 | Round 20 での扱い |
|----------------|-------------------|-------------------|
| `/v2/payments` (GET) | **不可**（クエリパラメータ `location_id` は単数） | 店舗ごとに個別呼び出し |
| `/v2/orders/search` (POST) | 可（`location_ids: []` 配列） | でも Round 20 では単数（実装統一のため） |

**判断根拠**: `/v2/payments` が単数のため、どちらにせよ transactions 側は店舗ごとに呼ぶ必要がある。open-orders 側だけ複数対応にすると実装分岐が増え Reviewer 負担が増大する。また `byDate × locationId` のクロス構造はクライアント集計を複雑化する。よって**両 API とも `location_id` 単数**で揃える。

結果として compare タブの並列数は `locations.length × 2`（= 7店舗で14並列）。434 → 14 は十分改善。

---

## 5. クライアントサイド詳細設計（単店: チームD）

**旧設計書 §5.1〜5.6 をそのまま実装する。** 要点のみ再掲:

### 5.1 `useCustomerSegment` の Args に `enabled: boolean` を必須追加

旧 §5.1 参照。戻り値の型は一切変更しない。

### 5.2 `enabled` フラグの挙動

旧 §5.2 参照。`enabled === false` の間は `fetchData` 冒頭で早期リターン。`useEffect` 依存配列に `enabled` を含める。一度 true になったら false に戻さない運用（`hasSegmentBeenActive`）。

### 5.3 fetch 置き換えロジック

旧 §5.3 参照。単店 × 期間 = `transactions-range` + `open-orders-range` の **2並列**。

```
start_date = dates[0], end_date = dates[dates.length - 1]
[txResult, openResult] = Promise.allSettled([
  fetch(/api/transactions-range?...),
  fetch(/api/open-orders-range?...),
])
```

### 5.4 集計ロジック

旧 §5.4 参照。`dates.forEach(date => { const transactions = txByDate[date]?.transactions ?? []; ... })` で既存の集計パスに流し込む。`allTransactions.push(...)` / `dailyTrend.push({...})` / `dailySalesTotal` / `dailyCustomersTotal` の計算式は**現行と完全に同じ**。

### 5.5 エラーハンドリング

旧 §5.5 参照（2×2 の組み合わせ表）。Round 6 の `'この週はまだ経過していません'` メッセージは維持。

### 5.6 `Dashboard.tsx` との接続（E チーム作業に移管）

旧 §5.6 では D チームが Dashboard.tsx を触る想定だったが、**Round 20 では E チーム専任**に変更（`hasCompareBeenActive` との競合回避のため）。D は `useCustomerSegment.ts` の内部改修のみ。

---

## 6. クライアントサイド詳細設計（全店舗比較: チームE）※ Round 20 で新規追加

### 6.1 `useMultiLocationSegment` の新構造

現状（L161〜197）は二重ループで `locations.length × dates.length` 個のタスクを積んでいる:

```
for (const loc of locations) {
  for (const date of dates) {
    tasks.push(Promise.allSettled([fetch(tx?date), fetch(open?date)]))
  }
}
```

これを**店舗ごとに range API を1組だけ呼ぶ**構造に置き換える:

```
for (const loc of locations) {
  tasks.push(
    Promise.allSettled([
      fetch(/api/transactions-range?start_date&end_date&location_id=loc.id...),
      fetch(/api/open-orders-range?start_date&end_date&location_id=loc.id...),
    ]).then(([txResult, openResult]) => ({
      locationId: loc.id,
      txByDate: txResult.status === 'fulfilled' ? txResult.value.byDate ?? {} : null,
      openByDate: openResult.status === 'fulfilled' ? openResult.value.byDate ?? {} : null,
      txFailed: txResult.status === 'rejected',
      openFailed: openResult.status === 'rejected',
    }))
  )
}
```

- `tasks.length === locations.length`（7店舗 → 7タスク、各タスクが内部で2 fetch）
- 実 HTTP は `locations.length × 2` = 最大14本

### 6.2 店舗ごとの集計再構築

現状の `locMap`（`Map<locationId, { transactions, dailyTrend, failedDays, totalDays }>`）は**維持**。ただし `failedDays` の計算ロジックが変わる:

| 旧（日次ループ） | 新（範囲） |
|-----------------|------------|
| 1日ぶんの `[tx, open]` が両方 rejected → `failedDays++` | `txFailed && openFailed` → `failedDays = dates.length`（= 全日失敗扱い） |
| 日次で部分失敗の粒度があった | **店舗単位で all-or-nothing** に退化 |

**Reviewer 判断待ち項目**: `partialFailure.failedDays` の意味が変わる点を許容するか。Round 20 では「店舗全体失敗 or 全件取得成功」の二値にする（表示上は `failedDays = dates.length, totalDays = dates.length` で「全日失敗」扱い、partialFailure は null）。

### 6.3 `dailyTrend` の構築

旧は日次ループで `dailyTrend.push({ date, ... })` していた。新では `dates.forEach(date => { ... })` ループを作り、各店舗・各日の `transactions`/`openOrders` を `byDate[date]` から取り出して集計:

```
for (const { locationId, txByDate, openByDate, txFailed, openFailed } of allResults) {
  const entry = locMap.get(locationId)!
  if (txFailed && openFailed) {
    entry.failedDays = dates.length  // 全日失敗
    totalFailedPairs += dates.length
    continue
  }
  for (const date of dates) {
    const transactions = txByDate?.[date]?.transactions ?? []
    const openOrders = openByDate?.[date]?.orders ?? []
    const mappedOpen = openOrders.map(openOrderToTransaction)
    const combined = [...transactions, ...mappedOpen]
    entry.transactions.push(...combined)
    // 既存の n/rp/rg/st/ul カウント、dailyTrend.push({ date, ...}) と同じ
  }
}
```

その後の `rows` 構築、`customersAll`/`salesAll`/`acqAll` 合算、`trendMap` 構築、`setData({...})` は**現行と完全に同じ**。

### 6.4 `enabled` の扱い

既存の `useMultiLocationSegment` は既に `enabled: boolean` を受け取り、`if (!enabled) return` で早期リターンしている（L126）。Dashboard.tsx 側で渡す値を `locations.length > 0` から `hasCompareBeenActive && locations.length > 0` に変更する（E チーム §6.5 で対応）。

フック本体の `enabled` ロジックは**無変更**。

### 6.5 `Dashboard.tsx` に `hasSegmentBeenActive` + `hasCompareBeenActive` を追加

**1 つの PR/コミットで両 state を一括追加する**（E チーム単独で Dashboard.tsx を編集、D チームは触らない）。

```ts
const [hasSegmentBeenActive, setHasSegmentBeenActive] = useState(() => activeTab === 'segment');
const [hasCompareBeenActive, setHasCompareBeenActive] = useState(() => activeTab === 'compare');

useEffect(() => {
  if (activeTab === 'segment' && !hasSegmentBeenActive) setHasSegmentBeenActive(true);
  if (activeTab === 'compare' && !hasCompareBeenActive) setHasCompareBeenActive(true);
}, [activeTab, hasSegmentBeenActive, hasCompareBeenActive]);
```

`useCustomerSegment` 呼び出しに `enabled: hasSegmentBeenActive` を追加。

`LocationComparisonSection` には以下のいずれかで伝える（E 判断、Reviewer 判断）:

**方式A（推奨・Props 最小変更）**: `LocationComparisonSection` に `enabled` prop を1つ追加し、内部の `useMultiLocationSegment` 呼び出しに丸投げ。

```tsx
<LocationComparisonSection
  ...
  enabled={hasCompareBeenActive}
/>
```

LocationComparisonSection 内 L89:
```
enabled: props.enabled && locations.length > 0
```

**方式B**: タブ切替時に compare タブの component 自体を mount/unmount する（`activeTab === 'compare' ? <LocationComparisonSection /> : null` は既存構造のまま）。ただしこの場合タブを離れると state が失われ再計算が必要になる → **方式A推奨**。

### 6.6 localStorage 復元との整合

`activeTab` は localStorage から復元され得る（L70-73）。`hasSegmentBeenActive` / `hasCompareBeenActive` の初期値を `() => activeTab === 'segment'` / `() => activeTab === 'compare'` にすることで、セグメント or compare タブ状態で再読み込みされた場合も即座に fetch が発火する。

旧設計書 §5.6 の原則をそのまま compare にも適用。

---

## 7. 実装順序（推奨タイムライン）

| Step | 担当 | 作業 | 目安 |
|------|------|------|------|
| 1 | A | `_shared.js` に 5ヘルパー追加 | 20〜30分 |
| 2 | B・C（並列） | `transactions-range.js` / `open-orders-range.js` 新規作成 | 各40〜50分 |
| 3 | D・E（並列） | D: `useCustomerSegment.ts` 内部 range 化 / E: `useMultiLocationSegment.ts` range 化 + `Dashboard.tsx` に state 2種追加 + `LocationComparisonSection.tsx` に `enabled` prop | D 40分 / E 60分 |
| 4 | 統合（E 兼務） | `npm run build` → `vercel dev` → Playwright で検証 | 30分 |

---

## 8. レビュワー受け入れ条件

### サーバーサイド（A/B/C）
旧設計書 §7 サーバーサイド項目をそのまま適用。加えて:
- [ ] `api/transactions.js` / `api/open-orders.js` が**完全に無変更**（git diff ゼロ）
- [ ] 新 API のレスポンスが `{ byDate: {...} }` 形式、取引ゼロの日はキー除外

### クライアント（D）
旧設計書 §7 クライアント項目をそのまま適用。`useCustomerSegment` 戻り値型不変、`enabled=false` の間は Network タブに range API が出ない。

### クライアント（E）※ Round 20 新規
- [ ] `useMultiLocationSegment.ts` の戻り値型 (`UseMultiLocationSegmentResult`) が変更されていない
- [ ] `tasks.length === locations.length`（二重ループが消滅している）
- [ ] 店舗数7・月次 period で **compare タブ切替直後の Network に range API が最大 14本**（`locations` 取得や daily タブの fetch を除く）
- [ ] `hasCompareBeenActive === false` の間、Network タブに `/api/transactions-range` も `/api/open-orders-range` も現れない
- [ ] localStorage に `sq_dashboard_tab=compare` がある状態で再読み込みすると、compare タブが初期表示され **即座に range API が14本発射**される
- [ ] `Dashboard.tsx` の `hasSegmentBeenActive` と `hasCompareBeenActive` が **両方**存在する（片方だけではない）
- [ ] セグメントタブ初期表示のデータが Round 19 時点と一致する（Playwright スクショ比較）
- [ ] compare タブの合計値（`totals.totalSales`）が Round 19 時点と一致する

### 性能基準（Round 20 全体）
- [ ] daily タブで起動した場合、初期 Network に range API が0本、total fetch 数 3〜5本以内
- [ ] segment タブに切替えた瞬間、range API が **2本**
- [ ] compare タブに切替えた瞬間、range API が **locations.length × 2 本**（7店舗で14本）
- [ ] compare タブ初期ロードの体感時間が現行比 **70% 以上短縮**（E 体感評価 + Playwright `browser_network_requests` で検証）

---

## 9. 統合時の注意点

1. **タイムゾーン**: 旧 §9-1 参照。`computeBusinessDate` は JST 明示変換。
2. **Cursor 対応**: 旧 §9-2 参照。`open-orders-range.js` は cursor 必須（単店でも31日分は件数多くなる、compare タブなら店舗 × 31日分に跨る可能性）。
3. **`limit` パラメータ**: payments 200 / orders 500。
4. **`location_id` の URL エンコード**: Square の location ID は英数字のみ想定だが、`encodeURIComponent` で必ずエスケープ。
5. **Vercel Function `maxDuration`**: デフォルト（10s Hobby / 60s Pro）で足りるか E チーム検証時に確認。**足りない場合のみ** `vercel.json` に `maxDuration: 60` を追加（ただし追加する場合は `/api/transactions-range.*` / `/api/open-orders-range.*` のみに限定）。
6. **既存 compare タブのバグとの整合**: `useMultiLocationSegment` の `failedDays` の粒度が「日」から「店舗×全期間」に変わる。`partialFailure` prop は基本 null に、`loadError = '期間データ取得失敗'` が店舗全体失敗時に立つ。UI 側 (`LocationComparisonSection`) の表示ロジックがこの変化で崩れないか Reviewer が確認。
7. **エラーメッセージ文言**: Round 6 の `'この週はまだ経過していません'` を両フックで維持。
8. **`enabled=false → true` 遷移の二重発火防止**: `hasSegmentBeenActive` / `hasCompareBeenActive` は一度 true になったら false に戻らないため、二重発火は起きない。ただし `locations.length` が `0 → 7` に変わるタイミング（店舗一覧 fetch 完了時）と `hasCompareBeenActive = true` が同時に成立するケースがあるので、`useEffect` の依存配列に `enabled` を確実に含めておく。
9. **`setData(null)` のタイミング**: `enabled = false` の間は現状の `null` 初期値のまま放置。遷移後に fetch 開始で `setData(null)` → fetch 完了で `setData({...})`。現状挙動と同じ。

---

## 10. 成果物チェックリスト（Tech Lead 最終承認用）

### ファイル差分
- [ ] 新規2ファイル: `api/transactions-range.js` / `api/open-orders-range.js` が存在
- [ ] `api/_shared.js`: 既存6関数・定数が diff ゼロ、新規5関数追加
- [ ] `api/transactions.js` / `api/open-orders.js`: **完全無変更**
- [ ] `src/hooks/useCustomerSegment.ts`: 戻り値型不変、Args に `enabled` 追加、内部 range 化
- [ ] `src/hooks/useMultiLocationSegment.ts`: 戻り値型不変、二重ループ廃止、店舗ごと range API 化
- [ ] `src/components/Dashboard.tsx`: `hasSegmentBeenActive` + `hasCompareBeenActive` 両方追加、両フックに enabled を渡す
- [ ] `src/components/LocationComparisonSection.tsx`: `enabled` prop 追加（方式A 採用時）または Dashboard 側で mount 制御（方式B）

### ビルド・動作
- [ ] `npm run build` 成功
- [ ] `npm run lint` warning 増加なし
- [ ] Playwright: daily → segment → compare の順にタブ切替し、各タブの Network タブをスクショ保存
- [ ] Playwright: localStorage に `sq_dashboard_tab=compare` 保存 → 再読込 → compare タブ即表示・即 fetch 発火を確認
- [ ] Playwright: 実データの合計値が Round 19 時点と一致（segment タブ・compare タブ両方）

### Network 検証（受け入れ基準の数値評価）
- [ ] daily タブのみ表示: range API 0本
- [ ] segment タブ切替直後: range API 2本
- [ ] compare タブ切替直後: range API `locations.length × 2` 本（7店舗なら14本）
- [ ] compare タブの Response Time が現行比で劇的短縮

---

## 11. 参考: 現行コード構造

- `api/_shared.js`（87行） — `setCors`, `validateToken`, `squareHeaders`, `parseTimeRange`, `fetchCustomers`
- `api/transactions.js`（219行） — Square Payments → Orders batch → Catalog 2段階 → Customers、`{transactions}` 返却
- `api/open-orders.js`（73行） — `/v2/orders/search` 単発（cursor なし）、`{orders}` 返却
- `src/hooks/useCustomerSegment.ts`（340行） — 日付配列生成、31日並列 fetch（62本）、集計、dailyTrend 構築
- `src/hooks/useMultiLocationSegment.ts`（402行） — 店舗×日次 並列 fetch（最大434本）、店舗別集計 + 全体集計、現状 `enabled: locations.length > 0`
- `src/components/Dashboard.tsx` — L67 `period='month'` 初期値、L69-77 3タブ (`daily`/`segment`/`compare`) + localStorage 連動、L119-132 `useCustomerSegment` 呼び出し、L274-287 `LocationComparisonSection` 呼び出し
- `src/components/LocationComparisonSection.tsx` — L81-90 `useMultiLocationSegment` 呼び出し、現状 `enabled: locations.length > 0`

---

## 12. 旧設計書との差分サマリ（クイック参照）

| 項目 | 旧 Round 8 | Round 20 |
|------|-----------|----------|
| 対象フック | useCustomerSegment のみ | useCustomerSegment + useMultiLocationSegment |
| 新規 API 本数 | 2 | 2（仕様同一） |
| `_shared.js` 変更 | 5ヘルパー追加 | 同左（変更なし） |
| Dashboard.tsx state | `hasSegmentBeenActive` | `hasSegmentBeenActive` + `hasCompareBeenActive` |
| LocationComparisonSection | 変更なし | `enabled` prop 追加（方式A） |
| チーム数 | A/B/C/D（4） | A/B/C/D/E（5） |
| 最大並列削減 | 62本 → 2本 | 62+434=496本 → 2+14=16本（タブ切替時）/ 初期0本（daily 起動時） |
| 受け入れ基準 | segment の Network 2本 | segment 2本 + compare 14本 + daily 起動時 0本 |
