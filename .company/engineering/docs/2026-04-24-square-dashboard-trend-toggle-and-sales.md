# square-dashboard Round 15 — 日次推移トグル & 全店舗売上推移

作成日: 2026-04-24
ステータス: 設計完了 / 実装待ち
担当: Tech Lead（設計） / GLM Engineer（実装） / Reviewer（レビュー）

---

## 1. 概要（何を・なぜ）

Round 14 で「店舗データ分析タブ」と「全店舗比較タブ」に日次推移グラフ（`SegmentTrendChart`, `LocationTrendChart`）を配置した。今回は下記 2 点を拡張する。

1. **凡例（Legend）クリックによる折れ線トグル機能**
   - `SegmentTrendChart` でセグメント別の表示/非表示を制御
   - `LocationTrendChart` でも店舗別の表示/非表示を制御
2. **全店舗比較タブに「日次推移（売上）」チャート追加**
   - 既存「日次推移（客数）」の下に「日次推移（売上）」を追加
   - 売上フィールド（`newSales` 等）は `DailySegmentPoint` に既存のため、型追加は不要
   - 新チャートも凡例トグル機能を持つ

### 狙い
- **可読性向上**: 複数セグメント・複数店舗の折れ線が密集すると読みにくい。ユーザーが注目したい系列のみ残せるとトレンドが見やすくなる。
- **売上視点の追加**: 客数だけでは客単価の差が把握できない。売上推移も並べることで「客数は減ったが売上は伸びた」等の洞察が得られる。

---

## 2. 変更対象ファイル一覧

### 修正
| ファイル | 変更概要 |
| --- | --- |
| `src/components/charts/SegmentTrendChart.tsx` | Legend クリックでセグメント別 visible state を管理。非表示セグメントは `<Line>` を `hide` にして Tooltip 合計からも除外。 |
| `src/components/charts/LocationTrendChart.tsx` | `metric` prop（`'customers' \| 'sales'`）を追加。Legend クリックで店舗別 visible state を管理。合計行も visible 店舗のみから再計算。 |
| `src/components/LocationComparisonSection.tsx` | 「日次推移（売上）」セクションを追加し、`LocationTrendChart` を `metric="sales"` で再利用。 |
| `src/components/charts/index.ts` | （エクスポート変更があれば追従。実質不要の可能性大） |

### 追加
- 新規ファイルは作らない（`LocationTrendChart` を prop 拡張で再利用する方針）。

### 型定義変更
- `src/types.ts` への変更は**不要**。`DailySegmentPoint` は Round 14 で `newSales` 等を追加済み。

---

## 3. チーム分割案

### 結論: **単一チーム（Aチームのみ）**

**理由**:
- 変更ファイルは 3 つのみで、いずれも近接したレイヤ（charts + 親コンポーネント）
- `LocationTrendChart` の prop 拡張 → `LocationComparisonSection` で消費、という明確な依存関係があるため、並列化してもマージ時の衝突リスクが高い
- 分割による並列化メリットより、文脈共有によるバグ抑止メリットのほうが大きい

### チーム A — 実装一括
- 対象: 上記 3 ファイル全て
- 実装順序: 後述「マージ順序」セクション参照

---

## 4. recharts Legend トグル実装方針

### 4-1. `SegmentTrendChart`

#### state 設計
```ts
type CountKey = 'new' | 'repeat' | 'regular' | 'staff' | 'unlisted';

// 初期状態: 全セグメント visible
const [visibleKeys, setVisibleKeys] = useState<Record<CountKey, boolean>>({
  new: true, repeat: true, regular: true, staff: true, unlisted: true,
});
```

#### Legend onClick ハンドラ
- recharts の `<Legend onClick={handler} />` は `payload.dataKey` または `payload.value`（name）を含む `Payload` 型の引数を受け取る
- `dataKey` で CountKey と照合して該当セグメントの boolean を反転

```ts
const handleLegendClick = (payload: Payload) => {
  const key = payload.dataKey as CountKey;
  if (!key || !(key in visibleKeys)) return;
  setVisibleKeys(prev => ({ ...prev, [key]: !prev[key] }));
};
```

#### `<Line>` 制御
- 各 `<Line>` に `hide={!visibleKeys[s.key]}` を渡す
- Legend のアイコンは recharts が自動で opacity を下げる（`inactive` 判定）ので、凡例見た目は追加 CSS 不要

#### Legend formatter 連携
- 非表示状態は recharts 側で自動的に opacity が下がる仕様（payload.inactive）。追加実装不要。
- どうしても薄く見えにくい場合、`formatter` 内で `payload.inactive ? 'text-gray-300 line-through' : 'text-gray-600'` のように切り替える案を予備として用意。

### 4-2. `LocationTrendChart`

#### prop 拡張
```ts
interface Props {
  locationSeries: { locationId: string; locationName: string; points: DailySegmentPoint[] }[];
  totalsSeries: DailySegmentPoint[];
  allDates: string[];
  metric?: 'customers' | 'sales'; // 追加、デフォルト 'customers'
}
```

#### データ抽出関数
```ts
function getTotalCount(point: DailySegmentPoint): number {
  return (point.new ?? 0) + (point.repeat ?? 0) + (point.regular ?? 0) + (point.staff ?? 0);
  // 注: 客数は従来通り unlisted を除外（Round 14 踏襲）
}

function getTotalSales(point: DailySegmentPoint): number {
  return (point.newSales ?? 0) + (point.repeatSales ?? 0)
       + (point.regularSales ?? 0) + (point.staffSales ?? 0) + (point.unlistedSales ?? 0);
  // 注: 売上は unlisted も含める（店舗総売上としての意味を持たせる）
}

const getValue = metric === 'sales' ? getTotalSales : getTotalCount;
```

#### visible state
```ts
const [visibleLocations, setVisibleLocations] = useState<Record<string, boolean>>(() =>
  Object.fromEntries(locationSeries.map(l => [l.locationId, true]))
);
const [totalVisible, setTotalVisible] = useState(true);
```

- 親が locationSeries を再構築するケース（店舗追加/削除）に備え、`useEffect` で `locationSeries.map(l => l.id).join(',')` の変化を検知して state を再初期化する

#### 合計行の挙動
- 合計行は「visible 店舗のみから再計算」
- `chartData` 生成時に totals を固定せず、毎レンダリングで `visibleLocations` を参照して再計算
- `visibleLocations` 変更時の合計再計算は `useMemo` で最適化

```ts
const chartData = useMemo(() => allDates.map((date) => {
  const row: Record<string, string | number> = { date };
  let visibleTotal = 0;
  for (const loc of locationSeries) {
    const v = locationPointsByDate.get(date)?.get(loc.locationId) ?? 0;
    row[loc.locationId] = v;
    if (visibleLocations[loc.locationId]) visibleTotal += v;
  }
  row['__total__'] = visibleTotal;
  return row;
}), [allDates, locationSeries, visibleLocations, locationPointsByDate]);
```

- 合計ラインの凡例ラベルは `visibleLocations` の全値が true のときは「合計」、一部 false のときは「合計（選択中）」と動的に切り替える（視認性向上）
- 合計ラインも `hide={!totalVisible}` でトグル可能にする

#### LabelList
- 合計ラインの `LabelList` は「客数」では意味があるが、「売上」ではラベルが大きすぎて重なるリスクあり
- `metric === 'sales'` の場合は `LabelList` を描画しない、または `formatYen` で桁圧縮したラベルとする
- **決定: 売上モードでは LabelList を描画しない**（UI 乱れ防止のため）

#### YAxis
- 売上モードでは `tickFormatter={(v) => formatYen(v)}` を設定し、軸ラベルを「¥」付きで表示
- ただし formatYen は `¥10,000` など長文字列になるので、`tick={{ fontSize: 10 }}` で縮小するか、K/M 圧縮関数を導入する
- **決定: 売上モードでは Y 軸は `v.toLocaleString()` のみ（プレーン数値）とし、Tooltip 側で `formatYen` による ¥ 表示を担保する**。軸はシンプルに保つ。

#### Tooltip
- 既存 Tooltip は `contentStyle` + `labelFormatter` で最小限。売上モードでは `formatter={(v) => formatYen(v as number)}` を追加し、各行の値を ¥ 表示にする
- 非表示店舗は Tooltip の行自体が消える（recharts が `hide` の系列を自動除外）ため、別途除外ロジックは不要

### 4-3. `LocationComparisonSection`

#### 日次推移セクションの追加
既存「日次推移（客数）」セクションの直下に追加:

```tsx
<div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
  <h3 className="text-md font-bold text-gray-900 mb-4">日次推移（売上）</h3>
  <LocationTrendChart
    locationSeries={data.rows.map((r) => ({
      locationId: r.locationId,
      locationName: r.locationName,
      points: r.dailyTrend,
    }))}
    totalsSeries={data.totals.dailyTrend}
    allDates={data.allDates}
    metric="sales"
  />
</div>
```

既存「日次推移（客数）」には `metric="customers"` を明示的に渡す（デフォルト挙動と同じだが可読性のため）。

---

## 5. Tooltip が選択状態と連動する実装方針

### 5-1. `SegmentTrendChart` の Tooltip

**現状の Tooltip**:
- 全セグメント常時表示
- 合計人数・合計売上を固定ロジックで計算

**改修方針**:
- `CustomTooltip` に `visibleKeys` を props 経由で渡す（クロージャ利用）
- 渡し方: `<Tooltip content={<CustomTooltip visibleKeys={visibleKeys} />} />` とし、コンポーネント内で受け取る

```tsx
interface CustomTooltipProps extends TooltipProps<number, string> {
  visibleKeys?: Record<CountKey, boolean>;
}

function CustomTooltip({ active, payload, label, visibleKeys }: CustomTooltipProps) {
  // ...
  const effectiveKeys = visibleKeys ?? { new: true, repeat: true, regular: true, staff: true, unlisted: true };

  // 非表示セグメントの行は出さない
  const visibleSeries = SERIES.filter(s => effectiveKeys[s.key]);

  // 合計も visible のみから計算
  const totalCustomers = visibleSeries.reduce((sum, s) => sum + ((point[s.key] as number) ?? 0), 0);

  // 合計売上の「unlisted 除外」ルールは維持。visible な unlisted 以外のみ合計
  const totalSalesExcludingUnlisted = visibleSeries
    .filter(s => s.key !== 'unlisted')
    .reduce((sum, s) => sum + ((point[s.salesKey] as number) ?? 0), 0);
  // ...
}
```

**注意**:
- recharts は Tooltip `content` に渡された React 要素を cloneElement する実装のため、props にクロージャ変数を渡しても正しく更新される（state 変更時に再描画される）
- ただし recharts バージョンによっては注意が必要。`content={(props) => <CustomTooltip {...props} visibleKeys={visibleKeys} />}` の関数コンポーネント形式のほうが確実

**推奨**: 関数形式で渡す
```tsx
<Tooltip content={(tipProps) => <CustomTooltip {...tipProps} visibleKeys={visibleKeys} />} />
```

### 5-2. `LocationTrendChart` の Tooltip

- recharts 既製 Tooltip を使用（カスタム未実装）
- `hide` された Line は recharts が自動的に payload から除外するため、Tooltip 側の追加実装は**基本不要**
- 売上モードでは前述 `formatter` のみ追加
- 合計ラインが「visible 店舗のみの合計」となるため、Tooltip の「合計」値も連動して変化する（`chartData.__total__` が再計算されているため自動）

---

## 6. マージ順序と依存関係

```
Step 1: SegmentTrendChart.tsx 改修 (Legend トグル + Tooltip 連動)
  └─ 独立作業。他ファイルに依存しない。

Step 2: LocationTrendChart.tsx 改修 (metric prop + Legend トグル)
  └─ 独立作業。ただし Step 3 で消費されるので先に完了要。

Step 3: LocationComparisonSection.tsx 改修 (売上セクション追加)
  └─ Step 2 の完了後に着手。既存「日次推移（客数）」には metric="customers" を明示。
```

### 単一 PR（単一ブランチ）で統合
- 3 ファイルを 1 コミットまたは step ごとの小コミット → 1 PR
- ブランチ名案: `feat/trend-toggle-and-sales-chart`

---

## 7. テスト観点

### 7-1. 型チェック（必須）
- `npm run build` または `npx tsc --noEmit` で型エラー 0 件
- recharts の Legend `Payload` 型（`recharts` 型定義）を正しく import
- TooltipProps ジェネリクスの型整合

### 7-2. 動作確認（Playwright または手動）

#### SegmentTrendChart
- [ ] 初期状態で 5 セグメント全表示
- [ ] 「新規」凡例クリック → 新規ラインが消える、凡例アイコンが薄くなる
- [ ] 同凡例再クリック → 復活
- [ ] 複数セグメント OFF で Tooltip 合計人数・合計売上が visible 分のみに連動
- [ ] 「記載なし」OFF 時も「合計売上は記載なしを除く」注釈は維持（unlisted は元から除外ロジック）
- [ ] 全セグメント OFF 時もチャートがクラッシュしない

#### LocationTrendChart（客数モード）
- [ ] `metric` 未指定 or `"customers"` で従来通りの客数推移
- [ ] 店舗凡例クリックで店舗ラインが消え、合計ラインが visible 店舗のみの合計に更新
- [ ] 合計凡例クリックで合計ラインも非表示
- [ ] 一部店舗 OFF 時、凡例ラベルが「合計（選択中）」に変化

#### LocationTrendChart（売上モード）
- [ ] 全店舗比較タブに「日次推移（売上）」が表示
- [ ] 数値が売上スケール（数千〜数十万）で Y 軸が適切にスケール
- [ ] Tooltip の値が `formatYen` で ¥ 付き表示
- [ ] LabelList が表示されない（売上モードのレイアウト乱れ回避）
- [ ] 店舗凡例クリックで折れ線トグル & 合計再計算
- [ ] `metric="sales"` 時に売上合計は unlisted を含む

### 7-3. エッジケース
- [ ] `locationSeries` が空配列 → 既存「推移データなし」メッセージ表示を維持
- [ ] `allDates` が空 → 同上
- [ ] 期間切替（today / week / month）で state が適切にリセット（`useEffect` で初期化される）
- [ ] データ再取得中（loading）の挙動が既存と同一
- [ ] 既存機能（店舗別 売上・客数 BarChart、セグメント構成 StackChart 等）に影響なし

### 7-4. 既存テスト
- 既存のユニットテストがあれば全てパス（`npm test` があれば実行）

---

## 8. 実装時の注意事項（Engineer 向け）

### DO
- 既存の色（`LOCATION_COLORS`, セグメント色）は変更しない
- 既存の「空データ時メッセージ」挙動を維持
- 既存 Tooltip のスタイル（`contentStyle`）を売上モードでも流用
- Round 14 の「客数: unlisted 除外 / 売上: unlisted 含む」ルールは堅持
- recharts の型は `import type { LegendProps, TooltipProps } from 'recharts'` から取得

### DON'T
- `src/types.ts` は変更しない（`DailySegmentPoint` は既に売上フィールドを持つ）
- `useMultiLocationSegment` は変更しない（データは揃っている）
- 新規ファイル（`LocationSalesTrendChart.tsx`）を作らない（prop 拡張で対応）
- `any` 型の使用禁止（`unknown` + 型ガード or 明示的型付け）
- 外部ライブラリ追加禁止

### GLM へのプロンプト要点
- 「既存ファイルを `cat` で読んだ上で、差分のみを適用すること」
- 「`hide` prop は recharts `<Line>` の標準 prop である」
- 「Legend onClick の型は `(data: Payload, index: number, event: React.MouseEvent) => void`」
- 「`visibleKeys` state は React 18 の `useState` を使う」

---

## 9. 受け入れ基準（Tech Lead 承認条件）

- [ ] `npm run build` 成功（エラー・警告なし）
- [ ] Reviewer 判定が approved
- [ ] 手動動作確認で上記「7. テスト観点」の全項目 OK
- [ ] `git diff` で変更ファイルが上記 3 ファイルのみであること
- [ ] 既存レイアウト・既存チャートの挙動に退行なし

---

## 10. 参照

- 前 Round 設計書: `.company/engineering/docs/2026-04-24-square-dashboard-store-data-analysis.md`
- recharts Legend onClick: https://recharts.org/en-US/api/Legend
- recharts Line hide: https://recharts.org/en-US/api/Line#hide
