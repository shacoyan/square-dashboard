# square-dashboard Round 7 + Round 6 統合設計書

- 作成日: 2026-04-22
- Tech Lead 発行
- 対象リポジトリ: `/Users/usr0103301/Documents/個人仕事/newWorld/square-dashboard/`
- 対象ブランチ: `master`

---

## 1. 概要

Dashboard の情報密度を下げ、UX を改善するため以下 2 つを同時施行する。

### Round 7（タブ分割）
Dashboard.tsx のメインコンテンツを「当日データ」「顧客セグメント」の 2 タブに分割。
共通ヘッダー（日付・営業時間・店舗・更新ボタン・最終更新・エラー）は常時表示。
タブ選択は `localStorage` に保存し、デフォルトは `daily`（当日データ）。

### Round 6（顧客セグメントUX改善）
- 期間タブ（今日/週/今月）と週サブタブは loading/error/!data 時でも必ず表示
- `calculatePeriodDates` が空配列を返す未経過週の場合、専用エラー文言を返す
- Dashboard.tsx の `period` 初期値を `'today'` → `'month'` に変更

---

## 2. 対象ファイル一覧

### 2-1. 既存ファイル修正
| Path | 役割 | 主な変更 |
|---|---|---|
| `src/components/Dashboard.tsx` | 画面ルート | 共通ヘッダー + タブ UI + タブ別コンテンツ切替。`period` 初期値を `'month'` に変更 |
| `src/components/CustomerSegmentSection.tsx` | 顧客セグメント表示 | 期間タブ/週タブをヘッダー部として常時表示し、中身のみ loading/error/!data で切替 |
| `src/hooks/useCustomerSegment.ts` | セグメントデータ取得 | `calculatePeriodDates` が空配列 ⇒ 専用エラー `'この週はまだ経過していません'` を `setError` |

### 2-2. 新規作成ファイル
| Path | 役割 |
|---|---|
| `src/components/DashboardTabs.tsx` | タブ切替 UI 本体（Presentation） |
| `src/components/tabs/DailyTabPanel.tsx` | 「当日データ」タブ本体（SalesSummary + OpenOrderList + TransactionList） |
| `src/components/tabs/SegmentTabPanel.tsx` | 「顧客セグメント」タブ本体（CustomerSegmentSection ラッパ） |

**方針**: Dashboard.tsx の肥大化を避けるため、タブパネルは別ファイルに分離する。ただし状態（date/period/weekIndex 等）は Dashboard が保持し Props で下す単方向データフローとする。hook の useSquareData / useOpenOrders / useCustomerSegment の呼び出しは Dashboard に残す（タブ非表示でも裏で更新される仕様を維持）。

---

## 3. ファイル単位の変更方針

### 3-1. `src/components/Dashboard.tsx`
- L67 `useState<PeriodPreset>('today')` → `useState<PeriodPreset>('month')`
- 新たに `activeTab` state を追加
  ```ts
  type DashboardTab = 'daily' | 'segment';
  const [activeTab, setActiveTab] = useState<DashboardTab>(() => {
    const saved = localStorage.getItem('sq_dashboard_tab');
    return saved === 'segment' ? 'segment' : 'daily';
  });
  const handleTabChange = (t: DashboardTab) => {
    setActiveTab(t);
    localStorage.setItem('sq_dashboard_tab', t);
  };
  ```
- `<main>` 内構造を以下に再編:
  1. 共通ヘッダーカード（DatePicker / 営業時間 / StoreSwitcher / 更新ボタン / 最終更新 / locationsError）
  2. 共通エラーバナー（error / 店舗未登録警告）
  3. タブ切替 UI（`<DashboardTabs active={activeTab} onChange={handleTabChange} />`）
  4. `activeTab === 'daily'` のとき `<DailyTabPanel … />`
  5. `activeTab === 'segment'` のとき `<SegmentTabPanel … />`
- hooks（useSquareData / useOpenOrders / useCustomerSegment）の呼び出しは現状のまま残す

### 3-2. `src/components/DashboardTabs.tsx`（新規）
- Props:
  ```ts
  interface Props {
    active: 'daily' | 'segment';
    onChange: (tab: 'daily' | 'segment') => void;
  }
  ```
- `role="tablist"` `aria-label="ダッシュボードビュー切替"` を付けた `<div>` に 2 つの `<button role="tab">` を配置
- スタイルは既存の期間タブ（CustomerSegmentSection の PERIOD_TABS）に倣って `bg-indigo-600 text-white` / `bg-gray-100 text-gray-600` を使用
- 選択中は `aria-selected={true}` `tabIndex={0}`、非選択は `aria-selected={false}` `tabIndex={-1}`

### 3-3. `src/components/tabs/DailyTabPanel.tsx`（新規）
- Props:
  ```ts
  interface Props {
    sales: Sales | null;
    loading: boolean;
    openTotal: number;
    openCount: number;
    openOrders: OpenOrder[];
    openOrdersLoading: boolean;
    openOrdersError: string | null;
    transactions: Transaction[];
  }
  ```
- 実体は `SalesSummary` → `OpenOrderList` → `TransactionList` を `space-y-6` で縦積み
- 型は `src/types` から import

### 3-4. `src/components/tabs/SegmentTabPanel.tsx`（新規）
- Props:
  ```ts
  interface Props {
    data: CustomerSegmentAnalysis | null;
    loading: boolean;
    error: string | null;
    period: PeriodPreset;
    onPeriodChange: (p: PeriodPreset) => void;
    weekIndex: number;
    onWeekIndexChange: (n: number) => void;
    availableWeeks: number;
  }
  ```
- 内部で `<CustomerSegmentSection {...props} />` をそのまま通す薄いラッパ
- 将来的に追加サマリやグラフを入れる拡張ポイントとしても機能する

### 3-5. `src/components/CustomerSegmentSection.tsx`
- 現在の早期 return（loading / error / !data）を撤廃する
- タイトル + 期間タブ（PERIOD_TABS）+ 週サブタブをヘッダー部として常時レンダー
- ヘッダー直下の「本体」だけを条件分岐:
  - `loading` → `<SkeletonSection />`（ただし SkeletonSection 内の期間タブスケルトンは削除）
  - `error` → 既存の赤ボックスをタイトルとタブの「下」に描画
  - `!data` → 「データがありません。」メッセージ
  - それ以外 → 既存のサマリカード / 売上構成 / 日次推移 / 新規獲得経路ブロック
- 期間タブと週サブタブは**常時操作可能**。loading 中でも `onPeriodChange` / `onWeekIndexChange` は発火する
- `SkeletonSection` 内の期間タブスケルトン（L34-38）は不要になるため削除

### 3-6. `src/hooks/useCustomerSegment.ts`
- `fetchData` の冒頭、`calculatePeriodDates` の戻り値を見て空配列なら専用エラー:
  ```ts
  const dates = calculatePeriodDates(period, baseDate, weekIndex);
  if (dates.length === 0) {
    setLoading(false);
    setData(null);
    setError('この週はまだ経過していません');
    return;
  }
  ```
- 既存の `bothFailures === dates.length` 判定は `dates.length > 0` のケースのみに効くよう、上記 early return より後のまま維持
- その他ロジックは不変

---

## 4. インターフェース / 型の変更点

### 4-1. 新規型定義
- `DashboardTab = 'daily' | 'segment'`: `Dashboard.tsx` 内にローカル定義。共通化不要。
- `localStorage` キー: `sq_dashboard_tab`（値は `'daily' | 'segment'`）

### 4-2. 既存 Props 変更
- `CustomerSegmentSection` の Props 型（`interface Props`）は**変更なし**。内部レンダリングロジックのみ変更。
- `useCustomerSegment` の戻り値型は**変更なし**。`error` に新文言が乗るだけ。

### 4-3. 破壊的変更
なし。既存の Round 5 で入れた `weekIndex` / `availableWeeks` 連携は維持。

---

## 5. 実装順序 / チーム分割

本タスクは依存関係が明確で粒度が小さいため **3 チーム並列** で進める。

### チーム A — Round 6 Hook 層
**対象**: `src/hooks/useCustomerSegment.ts`
**タスク**: 空配列時の専用エラー文言追加（3-6 参照）
**依存**: なし（並列スタート可）

### チーム B — Round 6 Section 層
**対象**: `src/components/CustomerSegmentSection.tsx`
**タスク**: ヘッダー部（タイトル + 期間タブ + 週タブ）を常時表示にリファクタ。SkeletonSection から期間タブスケルトンを除去（3-5 参照）
**依存**: なし（並列スタート可）。チーム A の変更は新エラー文言を表示するだけなので Props 契約は変わらず独立して実装可能。

### チーム C — Round 7 タブ分割
**対象**:
- `src/components/DashboardTabs.tsx`（新規）
- `src/components/tabs/DailyTabPanel.tsx`（新規）
- `src/components/tabs/SegmentTabPanel.tsx`（新規）
- `src/components/Dashboard.tsx`（修正: タブ state + JSX 再編 + `period` 初期値を `'month'` に変更）
**依存**: なし（CustomerSegmentSection の Props 契約は不変なので B の完了を待たなくてよい）

### 統合チーム D
- 3 チーム完了後、`git diff` 確認 → `npm run build` / `npm run lint` / 型チェック → 画面起動確認

---

## 6. レビュワー受け入れ条件

### Round 7（Dashboard.tsx + 新規 3 ファイル）
- [ ] `localStorage.getItem('sq_dashboard_tab')` が未設定の初回ロードで「当日データ」タブがアクティブ
- [ ] タブを「顧客セグメント」に切替後にリロードしても「顧客セグメント」のまま
- [ ] 共通ヘッダー（日付・営業時間・店舗・更新ボタン・最終更新・locationsError）は両タブで同一位置に常時表示される
- [ ] 共通エラー（`error` と店舗未登録警告）もヘッダー直下に常時表示
- [ ] 「当日データ」タブに SalesSummary / OpenOrderList / TransactionList が順に表示
- [ ] 「顧客セグメント」タブに CustomerSegmentSection が表示
- [ ] タブ UI は `role="tablist"` `role="tab"` `aria-selected` を正しく付与
- [ ] DashboardTabs / DailyTabPanel / SegmentTabPanel は Props 経由のみで状態を受け取り内部 state を持たない
- [ ] `period` 初期値が `'month'`（非選択状態での初回アクセスで今月が選ばれている）

### Round 6（CustomerSegmentSection.tsx + useCustomerSegment.ts）
- [ ] loading 中でも期間タブ（今日/週/今月）が表示され、クリックで `onPeriodChange` が発火
- [ ] error 表示中でも期間タブが表示され、他期間へ切替できる
- [ ] `!data` 状態でも期間タブが表示される
- [ ] 期間が `'week'` で `availableWeeks > 0` のとき、loading/error/!data でも週サブタブが表示される
- [ ] 未来の週（例: 今月の第 5 週で今日が第 3 週）を選択したとき、エラーメッセージが `'この週はまだ経過していません'` になる（`'期間データ取得失敗'` ではない）
- [ ] `'期間データ取得失敗'` は引き続き全日フェッチ失敗時のみ出る
- [ ] Round 5 の `weekIndex` / `availableWeeks` 連動は回帰なし（週切替でデータが再取得される）

### 共通
- [ ] `npm run build` 成功
- [ ] `npm run lint` 警告なし
- [ ] TypeScript エラーなし（tsc --noEmit）
- [ ] Console にエラー/警告が出ない
- [ ] レスポンシブ（sm 未満）で共通ヘッダーとタブが破綻しない

---

## 7. 統合時の注意点

1. **hook の継続実行**: タブを非表示にしても useSquareData / useCustomerSegment / useOpenOrders は Dashboard に残すため、裏で更新が走り続ける。これは意図通り（タブ切替時にロードを待たせないため）。パフォーマンス懸念があれば将来別タスクで最適化する。
2. **`period = 'month'` デフォルト化の影響**: 初回ロード時に月次セグメント取得 = 最大 31 日分の `/api/transactions` + `/api/open-orders` が並列で走る。既存仕様で同じ挙動が可能な構造のため機能リスクはないが、初回待ち時間が体感的に長くなる可能性がある。
3. **`localStorage` キー命名**: 既存の `sq_start_hour` / `sq_end_hour` に揃えて `sq_dashboard_tab` とする。
4. **Round 5 回帰防止**: weekIndex の useEffect 連動（Dashboard.tsx L71-73）は**絶対に削除しない**。タブ state とは独立。
5. **Props ドリル**: 3 階層（Dashboard → TabPanel → SalesSummary 等）の Props バケツリレーになるが、React Context 導入は本タスクのスコープ外。
6. **エラー文言の一貫性**: 新エラー `'この週はまだ経過していません'` は既存の「データの取得に失敗しました」スタイルの赤ボックスで表示される（Section 側の error 分岐を通るため）。タイトル "データの取得に失敗しました" との文脈矛盾が気になる場合は、Section 側で error 文言に応じてタイトルも切替える拡張を検討（本タスクでは対象外、別チケット）。

---

## 8. 想定される差し戻し条件

- タブ切替 UI のアクセシビリティ属性（role / aria-selected / tabIndex）が欠けている
- localStorage 保存が動かない / デフォルトが `'segment'` になってしまっている
- 期間タブが loading 中に disabled / 非表示になっている
- Section の Props 契約が変わってしまい Dashboard 側の呼び出しがコンパイルエラー
- 新規ファイルの import パスが壊れている
- 未経過週エラーが `'期間データ取得失敗'` と混同されている

以上。
