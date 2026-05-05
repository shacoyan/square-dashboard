#!/usr/bin/env bash
# square-dashboard direct-color sweep (L1)
# 直接色 (indigo-/red-/amber-/yellow-/green-/blue-/orange- 数字付き) の使用箇所を検出。
# レポート出力のみで CI ブロックしない (always exit 0)。
# Usage: bash scripts/check-direct-colors.sh
# Opt-out: 行末コメントに `// l1-allow` を付けると検出から除外。

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$ROOT_DIR/src"

if [ ! -d "$SRC_DIR" ]; then
  echo "[check-direct-colors] src/ not found: $SRC_DIR"
  exit 0
fi

# Tailwind デフォルト色 + 数字 (50/100/.../900) を検出
PATTERN='(indigo|red|amber|yellow|green|blue|orange|rose|emerald|sky|cyan|teal|lime|fuchsia|pink|purple|violet|slate|gray|zinc|neutral|stone)-(50|100|200|300|400|500|600|700|800|900|950)'

# bg-/text-/border-/ring-/from-/to-/via-/fill-/stroke-/divide-/outline-/shadow- などのプレフィクス想定
# ただし grep は色名そのものをマッチさせ、後段で l1-allow を除外
RAW=$(grep -RInE "$PATTERN" "$SRC_DIR" \
  --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' \
  2>/dev/null | grep -v 'l1-allow' || true)

if [ -z "$RAW" ]; then
  echo "[check-direct-colors] OK: no direct color usages detected."
  exit 0
fi

COUNT=$(printf '%s\n' "$RAW" | wc -l | tr -d ' ')
echo "[check-direct-colors] direct color usages: $COUNT (report only, not blocking)"
echo "----------------------------------------"
printf '%s\n' "$RAW"
echo "----------------------------------------"
echo "[check-direct-colors] semantic token への置換は L2+ で順次実施。opt-out したい行には末尾に '// l1-allow' を付与。"

exit 0
