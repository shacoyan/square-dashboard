'use client';

import { useMemo } from 'react';
import type { Transaction } from '../../types';
import { buildOccupancyMatrix, getActiveSlots } from '../../lib/occupancyAggregation';
import OccupancyHeatmap from '../charts/OccupancyHeatmap';
import OccupancyLineChart from '../charts/OccupancyLineChart';
import { Card, EmptyState } from '../ui';

interface Props {
  transactions: Transaction[];
  startHour?: number;
  endHour?: number;
}

/**
 * 時間帯別混雑分析セクション。
 * 呼び出し側で flat 化済みの transactions を受け取り `buildOccupancyMatrix` で 7×48 集計。
 * - ヒートマップ: 平均同時滞在人数（曜日 × 時間帯、tooltip で組数も併記）
 * - 折れ線: 平均/合計 + 組数/人数 トグル + 曜日フィルタ
 */
export default function OccupancyAnalysisSection({ transactions, startHour, endHour }: Props) {
  const matrix = useMemo(() => buildOccupancyMatrix(transactions), [transactions]);
  const activeSlots = useMemo(() => getActiveSlots(startHour, endHour), [startHour, endHour]);

  const hasAnyData = matrix.totalSpans > 0;

  return (
    <Card
      title="時間帯別混雑分析"
      description="同時滞在人数・組数（注文開始 〜 決済完了の重なり）を 30 分刻みで集計。"
    >
      <div className="space-y-4">
        {!hasAnyData ? (
          <EmptyState title="データがありません" minHeight={160} />
        ) : (
          <>
            <div className="bg-surface rounded-md border border-border p-3">
              <h3 className="text-sm font-semibold text-text mb-2">
                曜日 × 時間帯ヒートマップ（平均）
              </h3>
              <OccupancyHeatmap matrix={matrix} activeSlots={activeSlots} />
            </div>

            <div className="bg-surface rounded-md border border-border p-1.5 md:p-3">
              <h3 className="text-sm font-semibold text-text mb-2">
                時間帯別推移（折れ線）
              </h3>
              <OccupancyLineChart matrix={matrix} activeSlots={activeSlots} />
            </div>
          </>
        )}

        {matrix.skippedCount > 0 && (
          <div className="text-xs text-text-muted">
            ※ 開始時刻不明 {matrix.skippedCount.toLocaleString()} 件をスキップ
          </div>
        )}
      </div>
    </Card>
  );
}
