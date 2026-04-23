# square-dashboard Round 16 — チェックボックスUI & 店舗固有カラー

作成日: 2026-04-24
ステータス: 設計完了 / 実装待ち
担当: Tech Lead（設計） / GLM Engineer（実装） / Reviewer（レビュー）
前 Round: `.company/engineering/docs/2026-04-24-square-dashboard-trend-toggle-and-sales.md`

---

## 1. 概要（何を・なぜ）

Round 15 で日次推移グラフに「凡例クリックでの表示/非表示トグル」機能を実装した。しかし凡例クリックは UI として分かりにくく、ユーザーは「もっと明示的なコントロールが欲しい」と要望している。加えて、全店舗比較の日次推移チャートでは固定 6 色の循環パレットを使っており、店舗が 7 店舗（Goodbye, KITUNE, LR, moumou, 吸暮, 狛犬, 金魚）ある現状では既に 1 色目と 7 店舗目が衝突している。

Round 16 では以下 2 点を同時に対応する:

1. **チェックボックス UI への置換**
   - `SegmentTrendChart` と `LocationTrendChart` の凡例クリックトグルを廃止し、チャート上部に明示的なチェックボックス群を配置
   - 各チェックボックスには系列色のカラーチップを付ける
   - 「全て ON / 全て OFF」の一括ボタンを併設

2. **店舗固有カラーパレットの共通化**
   - `src/lib/locationColors.ts` を新設し、10 色程度の色被りしにくいパレットを定義
   - `locationId` → パレットインデックスの決定ロジックを **安定的（deterministic）** に行う
   - 合計ラインは別系統の「ダークグレー系」に固定
   - `LocationTrendChart`（折れ線）と `LocationStackChart`（積み上げ横棒・将来的な「店舗別」用途）で同パレットを共有できる API を公開

### 狙い
- **UX 明示性向上**: 凡例クリックはリッチなユーザーしか気づかない。チェックボックスなら一目で「切り替えられる」と伝わる
- **色の一意性**: 店舗数 7〜10 の範囲で色被りなし
- **拡張性**: 新店舗追加時に自動で次の色が割り当たる（再 hash 不要）
- **保守性**: 色定義を 1 箇所に集約、テストしやすい純関数

---

## 2. 変更対象ファイル一覧

### 追加
| ファイル | 役割 |
| --- | --- |
| `src/lib/locationColors.ts` | 色パレット定数 `LOCATION_COLOR_PALETTE`、合計色 `TOTAL_LINE_COLOR`、`getLocationColor(locationId, index)` 関数を export |
| `src/components/charts/SeriesCheckboxGroup.tsx` | 汎用チェックボックス UI（カラーチップ + ラベル + 一括ボタン）。`SegmentTrendChart` と `LocationTrendChart` の両方から再利用 |

### 修正
| ファイル | 変更概要 |
| --- | --- |
| `src/components/charts/SegmentTrendChart.tsx` | Legend onClick ハンドラ削除、チャート上部に `SeriesCheckboxGroup` を配置。Legend は表示用のみ（クリック無効）。 |
| `src/components/charts/LocationTrendChart.tsx` | `LOCATION_COLORS` ローカル定数を削除して `getLocationColor` を使用、Legend onClick 削除、`SeriesCheckboxGroup` を配置。合計行も同グループ内に独立チップとして含める。 |
| `src/components/charts/index.ts` | `SeriesCheckboxGroup` を export（テスト・再利用を考慮）。必須ではないので省略可。 |

### 修正（パレット統一の範囲に関する決定）
| ファイル | 変更概要 |
| --- | --- |
| `src/components/LocationComparisonSection.tsx` | **変更なし**。`SEGMENT_SERIES` / `ACQUISITION_SERIES` は店舗色ではなくセグメント色・獲得経路色のため、Round 16 の対象外。 |
| `src/components/charts/LocationStackChart.tsx` | **変更なし**。色は props 経由で series から受け取っており、現在は「セグメント／獲得経路」の積み上げに使われている。将来「店舗別」積み上げに転用する場合のみ `getLocationColor` を呼ぶ形になるが、今回はその用途がないため対象外。 |
| `src/components/charts/LocationBarChart.tsx` | **変更なし**。このチャートは「売上（青）」「客数（オレンジ）」の 2 系列を固定色で描画しているだけで、店舗別色は使っていない。 |

#### パレット統一の方針決定
- **Round 16 の `locationColors.ts` は `LocationTrendChart` の店舗別折れ線でのみ使用する**。
- 将来、`LocationStackChart` を「店舗を横軸・指標を積み上げ」のような用途に転用する場合は、その Round で改めて `getLocationColor` を呼ぶ改修を入れる。
- 現状の `LocationStackChart` は「1 店舗を 1 行として、セグメント（＝色）で積み上げ」なので、色の意味合いが異なる（色＝セグメント意味論）。無理に統一すると可読性が落ちる。

---

## 3. チーム分割案

### 結論: **単一チーム（A チームのみ）**

**理由**:
- ファイル数は実質 4 つ（新規 2 + 修正 2）
- `SeriesCheckboxGroup` と `locationColors.ts` は他ファイルからの import で消費されるため、先に作る → 後で使う、の直列依存が明確
- 並列化してもマージ時のコンフリクト（`index.ts` 等）で損失のほうが大きい
- Round 15 と同じ単一チーム方針で統一

### チーム A — 実装一括
- 実装順序は後述「マージ順序」参照

---

## 4. チェックボックス UI の実装方針

### 4-1. 共通コンポーネント `SeriesCheckboxGroup`

#### API 設計
```ts
// src/components/charts/SeriesCheckboxGroup.tsx

export interface SeriesCheckboxItem {
  key: string;           // state key（CountKey または locationId または '__total__'）
  label: string;         // 表示名
  color: string;         // カラーチップ色
}

export interface SeriesCheckboxGroupProps {
  items: SeriesCheckboxItem[];
  visible: Record<string, boolean>;
  onChange: (key: string, nextVisible: boolean) => void;
  onAllOn?: () => void;
  onAllOff?: () => void;
  className?: string;
}
```

#### レイアウト
- 水平フレックスで折り返し対応 (`flex flex-wrap gap-x-4 gap-y-2`)
- 各チェックボックス: `<label className="inline-flex items-center gap-1.5 cursor-pointer text-xs text-gray-700">`
  - `<input type="checkbox" className="w-3.5 h-3.5 accent-[color]" />` — `accent-color` で色同期するが CSS カスタムプロパティで渡す
  - カラーチップ: `<span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />`
  - ラベル文字列
- 一括ボタン（右端）:
  - 「全て表示」「全て非表示」の 2 ボタンを `text-xs text-indigo-600 hover:underline` で配置
  - `onAllOn` / `onAllOff` が省略された場合は非表示

#### 配置場所
- チャート本体（`<ResponsiveContainer>`）の **上** に配置
- 理由: 操作 → 結果（グラフ）の視線の流れが自然
- コンテナ: `<div className="mb-2 flex justify-between items-center flex-wrap">` 内に `SeriesCheckboxGroup` + 一括ボタン

#### アクセシビリティ
- `<input type="checkbox">` を正規に使う（独自 div ではない）ため、キーボード操作・スクリーンリーダー対応は自動担保
- `id` と `htmlFor` で `<label>` と紐付け（group 内で一意な prefix を受け取る、または `useId` で生成）

### 4-2. `SegmentTrendChart` への統合

#### 差分
- Round 15 で追加した `handleLegendClick`、`<Legend onClick={...}>` を削除
- `<Legend>` は `onClick` なしの表示専用として残す（recharts のデフォルト凡例は下部にあると識別しやすいので残す。冗長だが削除しても良い）
- **決定: Legend は表示のみ残す**（グラフ下部、クリック不可）。理由: 初見ユーザーが「何の色か」を下部凡例で確認する動線を維持。チェックボックスは「操作用」、Legend は「凡例用」と役割分離。
- チャート上部に `SeriesCheckboxGroup` を追加:

```tsx
const items = SERIES.map(s => ({ key: s.key, label: s.label, color: s.color }));
const handleVisibleChange = (key: string, next: boolean) => {
  if (COUNT_KEYS.has(key)) {
    setVisibleKeys(prev => ({ ...prev, [key as CountKey]: next }));
  }
};
const handleAllOn = () => setVisibleKeys({ new: true, repeat: true, regular: true, staff: true, unlisted: true });
const handleAllOff = () => setVisibleKeys({ new: false, repeat: false, regular: false, staff: false, unlisted: false });

// JSX
<div className="w-full">
  <SeriesCheckboxGroup
    items={items}
    visible={visibleKeys as Record<string, boolean>}
    onChange={handleVisibleChange}
    onAllOn={handleAllOn}
    onAllOff={handleAllOff}
    className="mb-2"
  />
  <div className="w-full h-[300px]">
    <ResponsiveContainer>...</ResponsiveContainer>
  </div>
</div>
```

- Tooltip の `visibleKeys` 連動ロジック（Round 15 導入）は **そのまま維持**

### 4-3. `LocationTrendChart` への統合

#### state の整理
Round 15 では `visibleLocations` と `totalVisible` を別 state で管理していた。Round 16 ではチェックボックスで統一扱いするため、`__total__` キーを `visibleLocations` に含める形に統合する:

```ts
// 改修後
const [visibility, setVisibility] = useState<Record<string, boolean>>(() => {
  const init: Record<string, boolean> = { __total__: true };
  for (const loc of locationSeries) init[loc.locationId] = true;
  return init;
});
```

- `useEffect` での再初期化も `__total__: prev.__total__ ?? true` を明示的に保持する

#### items 構築
```ts
const items: SeriesCheckboxItem[] = [
  ...locationSeries.map((loc, i) => ({
    key: loc.locationId,
    label: loc.locationName,
    color: getLocationColor(loc.locationId, i),
  })),
  { key: '__total__', label: '合計', color: TOTAL_LINE_COLOR },
];
```

#### 一括 ON/OFF
```ts
const handleAllOn = () => {
  const next: Record<string, boolean> = { __total__: true };
  for (const loc of locationSeries) next[loc.locationId] = true;
  setVisibility(next);
};
const handleAllOff = () => {
  const next: Record<string, boolean> = { __total__: false };
  for (const loc of locationSeries) next[loc.locationId] = false;
  setVisibility(next);
};
```

#### `<Line>` への反映
- `stroke` / `dot.fill` を `getLocationColor(loc.locationId, i)` に置換
- `hide={!visibility[loc.locationId]}` / `hide={!visibility.__total__}`

#### Legend
- onClick ハンドラを削除
- 合計ラインの名前動的切り替え（`isAllVisible ? '合計' : '合計（選択中）'`）は **維持**

---

## 5. 店舗固有カラーのパレット定義と割当ロジック

### 5-1. パレット定義

```ts
// src/lib/locationColors.ts

// 被りづらい 10 色（Tailwind-inspired, 色相を均等分散）
export const LOCATION_COLOR_PALETTE: readonly string[] = [
  '#6366f1', // indigo-500
  '#f59e0b', // amber-500
  '#10b981', // emerald-500
  '#f43f5e', // rose-500
  '#06b6d4', // cyan-500
  '#a855f7', // purple-500
  '#84cc16', // lime-500
  '#f97316', // orange-500
  '#0ea5e9', // sky-500
  '#d946ef', // fuchsia-500
] as const;

// 合計ライン専用（他とは色相系統が異なる濃いグレー）
export const TOTAL_LINE_COLOR = '#111827'; // gray-900

// 未知店舗用フォールバック
export const FALLBACK_LOCATION_COLOR = '#6b7280'; // gray-500
```

### 5-2. 割当ロジック（決定ロジック）

#### 要件
- **同じ `locationId` は毎回同じ色** になるべき（F5 更新やコンポーネント再マウントで色が変わらない）
- ただし **「配列内の位置」で決まる** のではなく、**「locationId の内容」** で決めたい（データ順序が変わっても安定）
- パレット数 < 店舗数 になった場合もできるだけ衝突回避

#### 決定: **ハッシュベース + index フォールバック** の 2 段階

```ts
/**
 * locationId から安定的にカラーを割り当てる。
 * 同じ locationId には常に同じ色が返る（djb2 ハッシュ）。
 * パレットサイズを超える衝突が起きた場合は、呼び出し側が渡す index をフォールバックとして利用する。
 */
export function getLocationColor(locationId: string, index: number = 0): string {
  if (!locationId) return FALLBACK_LOCATION_COLOR;

  // djb2 hash
  let hash = 5381;
  for (let i = 0; i < locationId.length; i++) {
    hash = ((hash << 5) + hash) + locationId.charCodeAt(i);
    hash = hash & 0xffffffff; // 32bit
  }
  const h = Math.abs(hash);
  const paletteIndex = h % LOCATION_COLOR_PALETTE.length;
  return LOCATION_COLOR_PALETTE[paletteIndex];
}
```

#### 引数 `index` の位置づけ
- 本来はハッシュだけで決定できる
- しかし「ハッシュ衝突が複数起きた場合」に index で後処理する余地を残しておく設計
- 最初の実装では index は使わない。将来の拡張用の未使用引数
- **決定: 引数 `index` は残すがシグネチャのみ。実装では使わない（未使用警告回避のため `void index` するか引数名を `_index` にする）**

#### ハッシュ衝突時の現実的リスク
- 店舗数 7（現在）、パレット 10 色 → 衝突確率は誕生日問題で約 24%（7 店舗で 1 組以上の衝突）
- 衝突しても「似た色が 2 つ」ではなく「同じ色が 2 つ」になるため、ユーザーから見て区別不能になる可能性あり
- **対策（Phase 2 としての改修余地）**: 衝突検知関数 `getLocationColors(locationIds: string[]): Record<string, string>` を追加し、呼び出し側で一括取得。衝突する場合は使っていない色を優先選択

#### 今回の実装スコープ
- **まずはハッシュ単独で実装**（シンプル優先）
- 実運用で衝突が見られた場合は次 Round で「一括取得関数 + 衝突回避」を追加
- Reviewer 評価基準: ハッシュ実装が純関数であること、同じ locationId で同じ色が返ることの確認

### 5-3. 合計ラインと店舗色の「別系統」担保

- `TOTAL_LINE_COLOR = '#111827'` はパレットに含めない
- パレットは彩度高めのカラー、合計は無彩色の濃いグレー → 視覚的に明確に別格
- Round 15 で使っていた `'#111827'` をそのまま継承（値変更なし）

---

## 6. 既存 LocationStackChart / LocationBarChart との統一性

### 決定: **今回は統一しない**

#### 理由
1. **意味論の違い**:
   - `LocationTrendChart`: 色 = 店舗
   - `LocationStackChart`（現状）: 色 = セグメント or 獲得経路（＝指標の種類）
   - `LocationBarChart`: 色 = 「売上」「客数」（＝メトリクスの種類）
2. **現状の props 設計**:
   - `LocationStackChart` は `series: { color: string }[]` を呼び出し側から受け取る設計で、店舗色に差し替えるなら呼び出し側（`LocationComparisonSection`）のマッピングが大幅に変わる
   - 今回の要望は「日次推移の店舗色が被らないように」なので、`LocationTrendChart` に集中させる
3. **将来の拡張余地**:
   - `LocationStackChart` の将来の用途が「店舗別に横並びで積み上げ」に変わる場合、その Round で `getLocationColor` を呼ぶ
   - 今の段階で統一すると、意味論が混乱する

#### ただし公開 API は統一可能に
- `getLocationColor` は `src/lib/locationColors.ts` で export されるため、将来どのコンポーネントからも import 可能
- そのためパレットを直書きするアンチパターンは回避

---

## 7. マージ順序と依存関係

```
Step 1: src/lib/locationColors.ts を新規作成
  └─ 純関数・定数のみ。依存なし。

Step 2: src/components/charts/SeriesCheckboxGroup.tsx を新規作成
  └─ 純 UI コンポーネント。Step 1 に依存なし。

Step 3: src/components/charts/LocationTrendChart.tsx を改修
  └─ Step 1（getLocationColor） + Step 2（SeriesCheckboxGroup）に依存。
     既存の LOCATION_COLORS を削除、Legend onClick を削除、state 統合。

Step 4: src/components/charts/SegmentTrendChart.tsx を改修
  └─ Step 2（SeriesCheckboxGroup）に依存。
     Legend onClick を削除、チェックボックス UI を追加。
     Tooltip の visibleKeys 連動は維持。

Step 5: src/components/charts/index.ts を更新（任意）
  └─ SeriesCheckboxGroup の export 追加（他で再利用する可能性）。
```

### 単一 PR / 単一ブランチ
- ブランチ名案: `feat/checkbox-ui-and-location-colors`
- 1 コミットまたは Step ごとの小コミットで 1 PR
- 破壊的変更: `LocationTrendChart` の内部 state 形状が変わるが、外部 props は変えない（後方互換）

---

## 8. テスト観点

### 8-1. 型チェック / ビルド（必須）
- [ ] `npm run build` 成功（エラー・警告なし）
- [ ] `npx tsc --noEmit` 成功
- [ ] `any` 未使用の確認（`unknown` + 型ガード or 明示的型付け）

### 8-2. 純関数テスト（`getLocationColor`）
- [ ] 同じ `locationId` を渡すと同じ色が返る（決定性）
- [ ] 異なる 7 店舗の ID（Goodbye, KITUNE, LR, moumou, 吸暮, 狛犬, 金魚）を渡したとき、返り値が全て `LOCATION_COLOR_PALETTE` の要素であること
- [ ] 空文字列 → `FALLBACK_LOCATION_COLOR`
- [ ] 実運用 ID での色分布を確認（衝突数を目視記録 → 設計書へフィードバック）

> 注: 本プロジェクトに既存テスト基盤が無ければ、Reviewer が手動で動作確認で代替。テストファイル新規追加は今回のスコープ外。

### 8-3. UI 動作確認（手動 or Playwright）

#### SegmentTrendChart
- [ ] チェックボックス 5 個（新規/リピート/常連/スタッフ/記載なし）が表示される
- [ ] 各チェックボックスの左にカラーチップ、色が既存の SERIES 色と一致
- [ ] チェック外すと折れ線が消える、Legend の該当アイコンも消える（or 薄くなる）
- [ ] Tooltip の合計人数・合計売上がチェック状態に連動（Round 15 機能維持）
- [ ] 「全て表示」ボタン → 全チェック ON、「全て非表示」ボタン → 全 OFF
- [ ] 全 OFF でチャートがクラッシュしない
- [ ] Legend クリックで **トグルしない**（凡例は表示専用）

#### LocationTrendChart（客数モード）
- [ ] チェックボックス（店舗数 + 合計の 1 個）が表示される
- [ ] 各店舗チップの色が `getLocationColor` の結果と一致
- [ ] 合計チップの色が `TOTAL_LINE_COLOR`（#111827）
- [ ] チェック外すと該当店舗のラインが消え、合計ラインが「選択中合計」に再計算
- [ ] 合計チェック外すと合計ラインが消える
- [ ] 「全て表示」「全て非表示」が合計も含めて一括切り替え
- [ ] Legend クリックで **トグルしない**

#### LocationTrendChart（売上モード）
- [ ] 同上の動作が売上でも機能
- [ ] Tooltip の値が `formatYen` 表示（Round 15 機能維持）
- [ ] LabelList が売上モードで非表示（Round 15 機能維持）

#### 店舗固有カラー
- [ ] 7 店舗で色被りが視覚的に確認できない（理想: 全て異なる色）
- [ ] 万が一色被りがあっても、色系統が完全一致しているのは 1 組以下
- [ ] リロードで色が変わらない（ハッシュ決定性）
- [ ] 期間切替（today/week/month）で色が変わらない

### 8-4. エッジケース
- [ ] `locationSeries` が空配列 → チェックボックス群が「合計」のみ表示 or 非表示（UI 乱れチェック）
- [ ] 期間変更で store が増減しても、既存店舗の色は変わらない（決定性）
- [ ] `SegmentTrendChart` データ空 → チェックボックスは描画されるが折れ線は既存の空メッセージ

### 8-5. 非退行
- [ ] 既存の店舗別 売上・客数 BarChart、セグメント構成 StackChart、獲得経路 StackChart に変更なし
- [ ] Round 15 で追加した「日次推移（売上）」セクションの配置・Tooltip・スタイルに変更なし
- [ ] `LocationComparisonSection.tsx` に差分が入っていないこと（`git diff` で確認）

---

## 9. 実装時の注意事項（Engineer 向け）

### DO
- `src/lib/locationColors.ts` は純関数・純定数のみ（副作用なし）
- `SeriesCheckboxGroup` は汎用化し、`SegmentTrendChart` と `LocationTrendChart` の両方から使える API に
- チェックボックスは `<input type="checkbox">` を正規に使う（アクセシビリティ）
- カラーチップは `<span style={{ backgroundColor }}>` で OK（Tailwind 動的色は生成できないため）
- Round 15 で追加した Tooltip の `visibleKeys` / `visibleLocations` 連動ロジックは **維持**
- 合計ライン動的ラベル（「合計」↔「合計（選択中）」）は維持

### DON'T
- Legend の onClick ハンドラを残してはいけない（UI が二重になる）
- `LOCATION_COLORS` というローカル定数を残してはいけない（`getLocationColor` に完全置換）
- `LocationStackChart` / `LocationBarChart` / `LocationComparisonSection` を改修してはいけない（スコープ外）
- 新規ライブラリ導入禁止（`clsx` 等も不要。Tailwind のみ）
- `any` 禁止
- Tailwind の動的クラス名生成（`bg-${color}` 等）禁止 → style inline で

### GLM へのプロンプト要点
- 「`LOCATION_COLORS` 配列は削除し、`getLocationColor(locationId, index)` に置換」
- 「`<Legend onClick={...}>` の onClick プロパティを削除」
- 「チェックボックスは `<input type="checkbox">` + `<label>` + カラーチップ `<span>` で構成」
- 「`visibility` state のキーには `__total__` も含める」
- 「`useEffect` 再初期化時に `__total__: prev.__total__ ?? true` を明示的に保持」
- 「djb2 ハッシュは `hash = ((hash << 5) + hash) + charCode` で実装」

---

## 10. 受け入れ基準（Tech Lead 承認条件）

- [ ] `npm run build` 成功
- [ ] Reviewer 判定が approved
- [ ] 手動動作確認で「8. テスト観点」全項目 OK
- [ ] `git diff` で変更ファイルが以下のみ:
  - 追加: `src/lib/locationColors.ts`, `src/components/charts/SeriesCheckboxGroup.tsx`
  - 修正: `src/components/charts/SegmentTrendChart.tsx`, `src/components/charts/LocationTrendChart.tsx`
  - 任意: `src/components/charts/index.ts`
- [ ] `LocationComparisonSection.tsx` / `LocationStackChart.tsx` / `LocationBarChart.tsx` に差分が入っていない（非退行）
- [ ] 既存レイアウト・既存チャートの挙動に退行なし
- [ ] 7 店舗の色被りが視覚的に許容範囲（同色ペアは 0 〜 1 組が目標）

---

## 11. 将来改修余地（Round 17+ 候補、今回は対象外）

1. **色衝突回避の一括割当関数**:
   - `getLocationColors(locationIds: string[]): Record<string, string>` を追加し、衝突した店舗には空いている色を優先割当
2. **`LocationStackChart` の「店舗別」転用時のパレット統一**:
   - 「店舗を横軸・指標を積み上げ」用途になったら `getLocationColor` を呼ぶ
3. **チェックボックスの永続化**:
   - `localStorage` に選択状態を保存し、リロードでも復元
4. **色覚多様性対応**:
   - カラーパレットを ColorBrewer や Okabe-Ito の色覚バリアフリーパレットに差し替え

---

## 12. 参照

- 前 Round: `.company/engineering/docs/2026-04-24-square-dashboard-trend-toggle-and-sales.md`
- 店舗一覧: Goodbye, KITUNE, LR, moumou, 吸暮, 狛犬, 金魚（2026-04-24 時点）
- Tailwind パレット: https://tailwindcss.com/docs/customizing-colors
- djb2 hash: http://www.cse.yorku.ca/~oz/hash.html
