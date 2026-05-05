'use client';

import { useMemo } from 'react';
import type { Transaction } from '../../types';
import { buildOccupancyMatrix } from '../../lib/occupancyAggregation';
import OccupancyHeatmap from '../charts/OccupancyHeatmap';
import OccupancyLineChart from '../charts/OccupancyLineChart';

interface Props {
  transactions: Transaction[];
}

/**
 * 時間帯別混雑分析セクション。
 * 呼び出し側で flat 化済みの transactions を受け取り `buildOccupancyMatrix` で 7×48 集計。
 * - ヒートマップ: 平均同時滞在人数（曜日 × 時間帯、tooltip で組数も併記）
 * - 折れ線: 平均/合計 + 組数/人数 トグル + 曜日フィルタ
 */
export default function OccupancyAnalysisSection({ transactions }: Props) {
  const matrix = useMemo(() => buildOccupancyMatrix(transactions), [transactions]);

  const hasAnyData = matrix.totalSpans > 0;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-md font-bold text-gray-900">時間帯別混雑分析</h3>
        <p className="text-xs text-gray-500 mt-1">
          同時滞在人数・組数（注文開始 〜 決済完了の重なり）を 30 分刻みで集計。
        </p>
      </div>

      {!hasAnyData ? (
        <div className="flex items-center justify-center h-[160px] text-gray-400 text-sm border border-dashed border-gray-200 rounded-md bg-white">
          データがありません
        </div>
      ) : (
        <>
          <div className="bg-white rounded-md border border-gray-200 p-3">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">
              曜日 × 時間帯ヒートマップ（平均）
            </h4>
            <OccupancyHeatmap matrix={matrix} />
          </div>

          <div className="bg-white rounded-md border border-gray-200 p-3">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">
              時間帯別推移（折れ線）
            </h4>
            <OccupancyLineChart matrix={matrix} />
          </div>
        </>
      )}

      {matrix.skippedCount > 0 && (
        <div className="text-xs text-gray-500">
          ※ 開始時刻不明 {matrix.skippedCount.toLocaleString()} 件をスキップ
        </div>
      )}
    </div>
  );
}
