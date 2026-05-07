# square-dashboard

## L20 で完了したもの (2026-05-07)
- 残課題 token sweep (gray/amber/indigo 計 60+ 箇所)
- manualChunks 関数化 (react-vendor 4KB → 約 150KB、jsx-runtime/scheduler を集約)
- messages.ts に warning カテゴリ追加 (部分失敗時の文言句点統一)
- print stylesheet (sticky/tablist 印刷時非表示)
- ChartTooltip dark surface トークン化 (surface.inverse 追加)

## L1-L20 改善メトリクス
- main bundle: 677 KB → 約 52 KB (-92%)
- gzip 後 main: 187 KB → 約 16 KB (-91.5%)
- token 違反 (生 Tailwind 色): 80+ → 0
- a11y skip link / focus-visible / aria-* / ChartFigure 全実装
- マイクロコピー集約 (MSG / MOTION 定数、35 箇所統一)

## バックログ (L21+)
- dark mode 全面対応
- recharts 完全 lazy 化 (modulepreload 抑止)
- TransactionList 印刷専用テーブル
- Suspense fallback subtle fade-in
- icon プリミティブ化
- token lint 自動化 (eslint plugin)
- TransactionList 新着 highlight
