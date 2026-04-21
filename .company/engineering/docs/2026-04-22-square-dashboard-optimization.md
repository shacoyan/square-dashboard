# square-dashboard Round 8 最適化設計書（案C: 遅延ロード + バッチAPI）

- 作成日: 2026-04-22
- 作成者: Tech Lead
- 対象プロジェクト: `square-dashboard`
- 関連: Round 6 (未経過週エラー) / Round 7 (period 初期値=month, タブ切替+localStorage)

---

## 1. 概要

### 何を
顧客セグメントタブ (`activeTab === 'segment'`) の初期ロードを劇的に高速化するため、以下2軸で最適化する:

- **案Aの遅延ロード**: セグメントタブがアクティブになるまで `useCustomerSegment` を発火しない
- **案Bのバッチ化**: 1日1本 × 2エンドポイント（最大62並列）を、期間丸ごと1本ずつ（2並列）に集約する新APIを導入

### なぜ
Round 7 で `period` 初期値を `'month'` に変更した結果、ダッシュボードを開いた瞬間に `dates.map(date => fetch(tx) + fetch(open))` で最大31日 × 2 = 62 本の HTTP が並列発射される。

- 体感レイテンシが悪化（ブラウザ側の同時接続制限にも触れる）
- Vercel Function の同時実行数を消費
- Square API 側にも不要なクエリを大量発射

### 設計方針（全体）
1. **既存 API (`api/transactions.js` / `api/open-orders.js`) は互換のため残す** — `useSquareData` / `useOpenOrders` が日次で使っている
2. **Square API 自体は `begin_time`/`end_time` でレンジ指定可能** なので、31日を1回のクエリ（+cursor）で取れる
3. 営業日は `start_hour` を区切りとする**業務日（business_date）**で区切る — 深夜営業対応のためクライアント側集計と一致させる必要がある
4. **クライアント契約 (`useCustomerSegment` 戻り値 / `CustomerSegmentSection` Props) は変更しない** — 内部実装だけ差し替える

---

## 2. 分割戦略

### 並列度とチーム割り当て（最大6チーム使用可能、今回は4チーム）

| チーム | 担当領域 | 依存関係 | 並列可否 |
|--------|----------|----------|----------|
| **A** | `api/_shared.js` 共通ヘルパー追加（`parseRangeTimeRange` / `computeBusinessDate` / 補完ユーティリティ抽出） | なし（最初に着手） | 先行必須 |
| **B** | `api/transactions-range.js` 新規実装 | A 完了待ち | B と C は並列可 |
| **C** | `api/open-orders-range.js` 新規実装 | A 完了待ち | B と C は並列可 |
| **D** | クライアント: `useCustomerSegment` に `enabled` フラグ追加 + 新エンドポイント接続、`Dashboard.tsx` に `hasSegmentBeenActive` state | B・C 完了待ち | 単独 |

**統合**: 全チーム完了後に E チーム（統合・レビュー対応）がローカルビルド + Playwright で動作検証。

### 依存グラフ
```
A (ヘルパー)
├─ B (transactions-range) ─┐
└─ C (open-orders-range) ──┴─ D (クライアント) ─ E (統合検証)
```

### 競合リスク
- B と C は共に `api/_shared.js` から import するだけで、A のコミット後に並列作業可能（競合なし）
- D のみ `useCustomerSegment.ts` を大きく書き換える — 他チームとは無関係

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
| `api/_shared.js` | `parseRangeTimeRange` / `computeBusinessDate` / `fetchOrdersBatch` / `fetchCatalogVariationCategoryMap` 追加 | A |
| `src/hooks/useCustomerSegment.ts` | `enabled` フラグ、バッチエンドポイント使用に書き換え | D |
| `src/components/Dashboard.tsx` | `hasSegmentBeenActive` state を追加、`useCustomerSegment({..., enabled})` で呼び出し | D |

### 互換維持（修正しない）
- `api/transactions.js` — `useSquareData` から使用中、そのまま
- `api/open-orders.js` — `useOpenOrders` から使用中、そのまま
- `src/components/CustomerSegmentSection.tsx` — Props 契約不変

---

## 4. サーバーサイド詳細設計

### 4.1 `api/_shared.js` 追加ヘルパー（チームA）

#### 4.1.1 `parseRangeTimeRange({ start_date, end_date, start_hour, end_hour })`
- 戻り値: `{ beginTimeJST: string, endTimeJST: string }`
- 仕様:
  - `startHour = parseInt(start_hour ?? '0', 10)`
  - `endHour = end_hour !== undefined ? parseInt(end_hour, 10) : (startHour > 0 ? startHour - 1 : 23)`
  - `isNextDay = endHour < startHour`
  - `beginTimeJST = ${start_date}T${HH(startHour)}:00:00+09:00`
  - `endTimeJST`:
    - `isNextDay` の場合 `end_date+1` 日の `${HH(endHour)}:59:59.999+09:00`
    - そうでなければ `end_date` 日の `${HH(endHour)}:59:59.999+09:00`
- 既存 `parseTimeRange` のロジックを `start_date` と `end_date` に拡張したもの

#### 4.1.2 `computeBusinessDate(createdAtISO, startHour)`
- 入力: `createdAtISO` (例 `"2026-04-15T02:15:00Z"`) / `startHour` (例 5)
- 処理:
  1. `createdAtISO` を `Asia/Tokyo` の年月日時に変換
  2. JST の時刻の `hour < startHour` の場合は `business_date = JST日付 - 1日`
  3. そうでなければ `business_date = JST日付`
- 戻り値: `"YYYY-MM-DD"`
- 実装ヒント:
  - `toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', ... })` ではパース困難なので、`+09:00` オフセットを明示的に足した `Date` オブジェクトを使って年月日時分を取る方式を推奨
  - もしくは `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', ... })` で `YYYY-MM-DD HH:mm:ss` を得る

#### 4.1.3 既存ロジックのヘルパー抽出（強く推奨）
`api/transactions.js` の以下ブロックを `_shared.js` に関数として切り出す。**ただし既存 `transactions.js` は互換のため残す方針**なので、抽出後に既存ファイルを書き換えるかは A チーム判断（レビューで決定）。
- `fetchAllPayments({ beginTimeJST, endTimeJST, location_id })` → cursor ループで全 payments を配列返却
- `fetchOrdersBatch(orderIds)` → `{ [orderId]: order }` Map 返却
- `fetchCatalogVariationCategoryMap(ordersMap)` → `{ [variationId]: categoryName | null }` Map 返却

**注意**: 既存 `api/transactions.js` を触ると回帰リスクがあるため、**最小構成としては新しい `transactions-range.js` からのみ参照する形で良い**（将来的な DRY 化は別タスク）。

### 4.2 `api/transactions-range.js` 仕様（チームB）

#### リクエスト
```
GET /api/transactions-range
  ?start_date=2026-04-01
  &end_date=2026-04-22
  &location_id=LXXX
  &start_hour=5
  &end_hour=4
```

#### パラメータ検証
- `start_date`, `end_date`, `location_id` 必須。無ければ 400
- Auth: 既存 `validateToken` を利用（401 で弾く）
- CORS: `setCors(req, res)`

#### 処理フロー
1. `parseRangeTimeRange` で `beginTimeJST` / `endTimeJST` を計算
2. Square `/v2/payments` を cursor ループで全件取得（既存 `transactions.js` と同じ）
3. `orders batch-retrieve`（100件ずつ）
4. `customers bulk-retrieve` + `catalog batch-retrieve (2段階)` を並列実行（既存と同じ）
5. **業務日ごとにグルーピング**:
   - 各 `payment` について `computeBusinessDate(payment.created_at, start_hour)` を計算
   - `byDate[businessDate]` が無ければ `{ transactions: [] }` で初期化
   - 既存 `transactions.js` と同じ形に整形した `transaction` を `byDate[businessDate].transactions` に push
6. 各 `byDate[d].transactions` を `created_at_jst desc` ソート

#### レスポンス
```ts
{
  byDate: {
    "2026-04-01": { transactions: Transaction[] },
    "2026-04-02": { transactions: Transaction[] },
    ...
    // ※ 取引ゼロの日はキー自体を含めない（クライアント側で空配列扱い）
  }
}
```

`Transaction` の形は既存 `api/transactions.js` の `transactions[n]` と**完全一致**（`id`, `created_at_jst`, `amount`, `status`, `source`, `customer_name`, `line_items`, `discounts`）。

#### エラーハンドリング
- Square Payments API が non-ok → そのステータスコードで `{ error }` 返却
- orders/catalog/customers の失敗は**既存と同じく握りつぶす**（transactions と同じポリシー）

#### パフォーマンス注意
- Vercel Function デフォルト 300s。31日分の payments + orders (100件バッチ) + catalog (2段階) でも通常 10〜20s 程度のはず
- `vercel.json` での `maxDuration` 設定は**不要**（デフォルトで足りる想定、足りなければ E チーム検証時に調整）

### 4.3 `api/open-orders-range.js` 仕様（チームC）

#### リクエスト
```
GET /api/open-orders-range
  ?start_date=2026-04-01
  &end_date=2026-04-22
  &location_id=LXXX
  &start_hour=5
  &end_hour=4
```

#### 処理フロー
1. `parseRangeTimeRange` で `beginTimeJST` / `endTimeJST` を計算
2. Square `/v2/orders/search` を1回 POST（state_filter=OPEN, date_time_filter）
   - `limit: 500`（十分大きく取る、現状 50 だが range 版は余裕を持たせる）
   - **cursor 対応**: レスポンスに `cursor` があれば継続取得（既存 `open-orders.js` は単発だが、range 版では必須）
3. `customers bulk-retrieve`（customer_id を持つ order のみ）
4. **業務日グルーピング**:
   - 各 `order` について `computeBusinessDate(order.created_at, start_hour)` を計算
   - `byDate[businessDate].orders` に push

#### レスポンス
```ts
{
  byDate: {
    "2026-04-01": { orders: OpenOrder[] },
    ...
  }
}
```

`OpenOrder` の形は既存 `api/open-orders.js` の `orders[n]` と**完全一致**（`id`, `created_at`, `total_money`, `customer_name`, `line_items`, `discounts`）。

#### エラーハンドリング
- Square `/v2/orders/search` が non-ok → そのステータスで返却
- customers 失敗は握りつぶし

### 4.4 業務日グルーピングの図解

例: `start_hour = 5`（5:00〜翌4:59 が1営業日）

| payment.created_at (JST) | 判定 | business_date |
|--------------------------|------|---------------|
| 2026-04-10 05:15         | hour ≥ 5 | 2026-04-10 |
| 2026-04-10 23:50         | hour ≥ 5 | 2026-04-10 |
| 2026-04-11 02:30         | hour < 5 → -1日 | 2026-04-10 |
| 2026-04-11 05:10         | hour ≥ 5 | 2026-04-11 |

`start_hour = 0` の場合は単純な JST日付。この挙動はクライアント側の `calculatePeriodDates` (`useCustomerSegment.ts`) が返す `dates[]` と一致するように実装する。

---

## 5. クライアントサイド詳細設計（チームD）

### 5.1 `useCustomerSegment` Args 拡張

```ts
interface Args {
  token: string;
  locationId: string;
  period: PeriodPreset;
  baseDate: string;
  startHour: number;
  endHour: number;
  weekIndex?: number;
  enabled: boolean;  // 新規追加（必須化）
}
```

**戻り値の型は一切変更しない** (`data`, `loading`, `error`, `refresh`, `availableWeeks`)。

### 5.2 `enabled` フラグの挙動

- `enabled === false` の間:
  - `fetchData` 本体の先頭で早期リターン
  - `data` は現状値のまま（初期は `null`）、`loading = false`、`error = null` を維持
  - `useEffect` 内で `enabled` を依存配列に入れ、false の間は何もしない
- `enabled` が `false → true` に遷移した瞬間:
  - `fetchData()` 実行開始
  - 以降は従来通り（`locationId`/`period`/`baseDate`/`weekIndex`/`startHour`/`endHour` 変更で再 fetch）
- **abort controller**: `enabled` が `true → false` に戻るケースは想定しないが、`hasSegmentBeenActive` は一度 true になったら戻らないので問題ない

### 5.3 fetch 置き換えロジック

置き換え前（31並列）:
```
dates.map(date => {
  fetch(/api/transactions?date=...)
  fetch(/api/open-orders?date=...)
})
```

置き換え後（2並列）:
```
const start_date = dates[0]
const end_date = dates[dates.length - 1]
const txUrl = /api/transactions-range?start_date=...&end_date=...&location_id=...&start_hour=...&end_hour=...
const openUrl = /api/open-orders-range?start_date=...&end_date=...&location_id=...&start_hour=...&end_hour=...

const [txResult, openResult] = await Promise.allSettled([
  fetch(txUrl).then(r => r.json()),  // { byDate }
  fetch(openUrl).then(r => r.json()), // { byDate }
])
```

### 5.4 集計ロジック構築

既存の `allTransactions` / `dailyTrend` / `dailySalesTotal` / `dailyCustomersTotal` を構築するため、`dates` を forEach して `byDate` から取得する:

```
dates.forEach(date => {
  const transactions = txByDate[date]?.transactions ?? []
  const openOrders = openByDate[date]?.orders ?? []
  const mappedOpen = openOrders.map(openOrderToTransaction)
  const combined = [...transactions, ...mappedOpen]

  allTransactions.push(...combined)

  // countCustomersByTransaction, dailyTrend.push(...), dailySalesTotal, dailyCustomersTotal
  // ここの計算式は現行と完全に同じ
})
```

最終的な `setData({...})` の構築も現行と完全に同じ。

### 5.5 エラーハンドリング新仕様

| txResult | openResult | 挙動 |
|----------|------------|------|
| fulfilled | fulfilled | `error = null`, データ表示 |
| fulfilled | rejected  | `error = 'オープンオーダーの取得に失敗しました。'`（警告としてデータは表示） |
| rejected  | fulfilled | `error = '取引データの取得に失敗しました。'`（警告） |
| rejected  | rejected  | `error = '期間データ取得失敗'`, `data = null` |

**Round 6 の `'この週はまだ経過していません'` メッセージは維持**（`dates.length === 0` の早期リターン部分は変更なし）。

### 5.6 `Dashboard.tsx` の `hasSegmentBeenActive`

```ts
const [hasSegmentBeenActive, setHasSegmentBeenActive] = useState(() => activeTab === 'segment');

useEffect(() => {
  if (activeTab === 'segment' && !hasSegmentBeenActive) {
    setHasSegmentBeenActive(true);
  }
}, [activeTab, hasSegmentBeenActive]);

// ...

const { data: segmentData, ... } = useCustomerSegment({
  token,
  locationId: selectedLocationId,
  period,
  baseDate: date,
  startHour,
  endHour,
  weekIndex,
  enabled: hasSegmentBeenActive,
});
```

**重要**: `hasSegmentBeenActive` は一度 true になったら戻さない（セグメントタブを離れても fetch は継続してキャッシュ状態を保つ）。localStorage で `activeTab === 'segment'` が復元されるケースは初期値の `() => activeTab === 'segment'` で自然にカバーされる。

---

## 6. 実装順序（推奨タイムライン）

| Step | 担当 | 作業 | 目安 |
|------|------|------|------|
| 1 | A | `_shared.js` に `parseRangeTimeRange` / `computeBusinessDate` 追加 | 20分 |
| 2 | B・C (並列) | `transactions-range.js` / `open-orders-range.js` 新規作成 | 各40分 |
| 3 | D | `useCustomerSegment` 書き換え + `Dashboard.tsx` 修正 | 40分 |
| 4 | E (統合) | ローカル `vercel dev` で起動 → Playwright で以下確認 | 30分 |
|   |   | - タブ切替で初回セグメント fetch が発火 |  |
|   |   | - Network タブで `/api/transactions-range` + `/api/open-orders-range` が各1本ずつ |  |
|   |   | - 月次表示のデータが Round 7 時と一致 |  |
|   |   | - 週次表示（未経過週のエラー文言維持） |  |

---

## 7. レビュワー受け入れ条件

### サーバーサイド（チームA/B/C）
- [ ] `parseRangeTimeRange`: `start_hour=5, end_hour=4` で翌日4:59 を含む `endTimeJST` を返すこと
- [ ] `computeBusinessDate`: 深夜2時の payment が前日扱いになること（`start_hour=5` のとき）
- [ ] `transactions-range.js`: `byDate` の値の型が既存 `transactions.js` の `{ transactions: Transaction[] }` と完全一致
- [ ] `open-orders-range.js`: `byDate` の値の型が既存 `open-orders.js` の `{ orders: OpenOrder[] }` と完全一致
- [ ] 取引ゼロの日は `byDate` キーから**除外**（= クライアントは `?? []` で空配列補完できること）
- [ ] Auth 失敗 → 401、パラメータ不足 → 400、Square API 失敗 → そのステータス
- [ ] CORS OPTIONS がちゃんと通る
- [ ] 既存 `api/transactions.js` / `api/open-orders.js` の挙動が無変更（git diff でコンテンツ差分ゼロ）

### クライアントサイド（チームD）
- [ ] `useCustomerSegment` の戻り値型 (`CustomerSegmentAnalysis | null`, etc.) が変更されていない
- [ ] `enabled: false` の間は Network タブに `/api/transactions-range` が出ない
- [ ] タブを `daily → segment` に切り替えた瞬間に range API が発火
- [ ] 月次タブで `dates.length = 22`（4/1〜4/22）、実 fetch は2本だけ
- [ ] Round 6 の `'この週はまだ経過していません'` が未経過週で出る
- [ ] Round 7 の localStorage 復元が壊れていない（セグメントタブのまま再読み込み → 即 fetch 発火）
- [ ] `CustomerSegmentSection` Props に変更がない（diff で props 宣言が無変更）

### 性能基準
- [ ] 月次タブ初期ロードで Network の `/api/...` リクエスト数が**2本**（locations を除く）
- [ ] レスポンスが返るまでの時間が現行比で 50% 以上短縮（E チーム体感評価）

---

## 8. 既存 API との関係・将来の整理

### 互換維持
`api/transactions.js` / `api/open-orders.js` は以下から引き続き使用:
- `useSquareData` (daily タブ) → `api/transactions.js`
- `useOpenOrders` (daily タブのオープン会計) → `api/open-orders.js`

これらは1日分しか取らないので最適化対象外。そのまま残す。

### 将来の DRY 化候補（今回の Scope 外）
- `api/transactions.js` の内部処理を `_shared.js` の `fetchAllPayments` / `fetchOrdersBatch` / `fetchCatalogVariationCategoryMap` を使う形にリファクタ
- `api/open-orders.js` の内部処理も range 版のシングルケース呼び出しにまとめる

今回は**回帰リスクを抑えるため両者は触らない**。Round 9 以降で別タスクとして検討。

---

## 9. 統合時の注意点

1. **タイムゾーン**: すべて JST (`Asia/Tokyo`, `+09:00`) で統一。Vercel Function のデフォルト TZ は UTC なので `computeBusinessDate` の実装で明示的に JST 変換する
2. **Cursor 対応**: `open-orders-range.js` では `/v2/orders/search` の `cursor` フィールドを拾ってループする（既存 `open-orders.js` は単発呼び出しだったが、31日分は件数が多くなりうる）
3. **`limit` パラメータ**: payments は現状 200 で十分、orders は 500 に引き上げる
4. **既存バグとの整合**: 現行 `useCustomerSegment` では `aggregateSegments(allTransactions)` に食わせるため、`allTransactions` の順序は気にしない（集計のみ）。よって range 版でも push 順序はそのままで OK
5. **エラーメッセージ文言**: Round 6 の `'この週はまだ経過していません'` / Round 7 の `period='month'` 初期値はそのまま
6. **`setData(null)` のタイミング**: 現行は fetch 開始時に `setData(null)` しているが、`enabled=false` の間は呼ばないので遷移直後に一瞬空になる。これは既存挙動と同じなのでOK

---

## 10. 成果物チェックリスト（Tech Lead 最終承認用）

- [ ] 新規2ファイル (`api/transactions-range.js`, `api/open-orders-range.js`) 存在
- [ ] `api/_shared.js` にヘルパー追加（diff で旧関数に変更なし）
- [ ] `api/transactions.js` / `api/open-orders.js` が**無変更**
- [ ] `src/hooks/useCustomerSegment.ts` の戻り値型が無変更
- [ ] `src/components/CustomerSegmentSection.tsx` が無変更
- [ ] `npm run build` 成功
- [ ] Playwright で月次タブの初期ロードを確認（スクショ付き）
- [ ] Network タブで range API 2本のみを確認（スクショ付き）

---

## 参考: 現行コードの既知の形

- `api/transactions.js` (206行) — Square Payments → Orders → Catalog 2段階 → Customers 補完、`{transactions}` 返却
- `api/open-orders.js` (73行) — `/v2/orders/search` (state=OPEN) → customers 補完、`{orders}` 返却
- `api/_shared.js` (87行) — `setCors`, `validateToken`, `squareHeaders`, `parseTimeRange`, `fetchCustomers`
- `src/hooks/useCustomerSegment.ts` (316行) — 日付配列生成、31日並列 fetch、集計、dailyTrend 構築
- `src/components/Dashboard.tsx` (L66: `period='month'` 初期値、L69-76: タブ切替、L118-131: `useCustomerSegment` 呼び出し)
