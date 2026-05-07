'use client';

import { useMemo } from 'react';
import {
  SLOT_COUNT,
  WEEKDAY_COUNT,
  WEEKDAY_LABELS,
  SLOT_LABELS,
  getAverages,
  type OccupancyMatrix,
} from '../../lib/occupancyAggregation';
import { ChartFigure } from '../ui';
import { MSG } from '../../lib/messages';

const OCCUPANCY_HEATMAP_FULL_PERSONS = 10;

const HEATMAP_BUCKET_CLASSES = [
  'bg-surface-subtle border border-border', // 0
  'bg-accent-heat-50', // 1
  'bg-accent-heat-100', // 2
  'bg-accent-heat-300', // 3
  'bg-accent-heat-500', // 4
  'bg-accent-heat-700', // 5
  'bg-accent-heat-900', // 6
] as const;

function getHeatBucket(persons: number): number {
  if (persons <= 0) return 0;
  if (persons <= OCCUPANCY_HEATMAP_FULL_PERSONS * 0.15) return 1;
  if (persons <= OCCUPANCY_HEATMAP_FULL_PERSONS * 0.30) return 2;
  if (persons <= OCCUPANCY_HEATMAP_FULL_PERSONS * 0.50) return 3;
  if (persons <= OCCUPANCY_HEATMAP_FULL_PERSONS * 0.75) return 4;
  if (persons < OCCUPANCY_HEATMAP_FULL_PERSONS) return 5;
  return 6;
}

interface Props {
  matrix: OccupancyMatrix;
  activeSlots: number[];
}

/**
 * 7 行（曜日）× 48 列（30min slot）ヒートマップ。
 * - 濃淡は「平均同時滞在人数」を 6 段階バケットで表現（getHeatBucket）。
 * - bucket 0 は zero セル。凡例は bucket 1–6 の 6 stop を flex-1 で並べる。
 * - 列ヘッダは 3h 刻みの 8 本のみ（slot % 6 === 0）表示。
 */
export default function OccupancyHeatmap({ matrix, activeSlots }: Props) {
  const { avgGroups, avgPersons, maxPersons } = useMemo(() => {
    const aG: number[][] = Array.from({ length: WEEKDAY_COUNT }, () => Array(SLOT_COUNT).fill(0));
    const aP: number[][] = Array.from({ length: WEEKDAY_COUNT }, () => Array(SLOT_COUNT).fill(0));
    let mP = 0;
    for (let w = 0; w < WEEKDAY_COUNT; w++) {
      for (let s = 0; s < SLOT_COUNT; s++) {
        const { groups, persons } = getAverages(matrix, w, s);
        aG[w][s] = groups;
        aP[w][s] = persons;
      }
    }
    for (const s of activeSlots) {
      for (let w = 0; w < WEEKDAY_COUNT; w++) {
        if (aP[w][s] > mP) mP = aP[w][s];
      }
    }
    return { avgGroups: aG, avgPersons: aP, maxPersons: mP };
  }, [matrix, activeSlots]);

  const hasData = maxPersons > 0;

  const gridTemplate = `40px repeat(${activeSlots.length}, minmax(0, 1fr))`;

  return (
    <ChartFigure label="ヒートマップ：曜日 × 時間帯 平均同時滞在人数 (7×48 マス)。濃いほど混雑。" className="w-full">
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          {/* 列ヘッダ（3h 刻み 8 本） */}
          <div
            className="grid items-end text-[10px] text-text-muted mb-1"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <div aria-hidden="true" />
            {activeSlots.map((s, i) => (
              <div key={`h-${i}-${s}`} className="text-left">
                {i % 6 === 0 ? SLOT_LABELS[s].slice(0, 2) + '時' : ''}
              </div>
            ))}
          </div>

          {/* 各曜日行 */}
          {Array.from({ length: WEEKDAY_COUNT }, (_, w) => (
            <div
              key={`row-${w}`}
              className="grid items-stretch mb-[2px]"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              <div className="text-xs text-text-muted pr-2 flex items-center justify-end">
                {WEEKDAY_LABELS[w]}
              </div>
              {activeSlots.map((s, i) => {
                const g = avgGroups[w][s];
                const p = avgPersons[w][s];
                const bucket = getHeatBucket(p);
                const titleText = `${WEEKDAY_LABELS[w]}曜 ${SLOT_LABELS[s]}: 組 ${g.toFixed(1)} 組 / 人 ${p.toFixed(1)} 人`;
                return (
                  <div
                    key={`c-${w}-${i}-${s}`}
                    className={`min-h-[20px] border-r border-white ${HEATMAP_BUCKET_CLASSES[bucket]}`}
                    title={titleText}
                    aria-hidden="true"
                  />
                );
              })}
            </div>
          ))}

          {/* 凡例 */}
          <div className="mt-2 flex items-center gap-2 text-[11px] text-text-muted">
            <span>少</span>
            <div className="flex h-2 w-32">
              {HEATMAP_BUCKET_CLASSES.slice(1).map((cls, i) => (
                <div
                  key={`legend-${i}`}
                  className={`flex-1 ${cls}`}
                  aria-hidden="true"
                />
              ))}
            </div>
            <span>多</span>
            {hasData ? (
              <span className="ml-2 tabular-nums">最濃 10 人 / 実測ピーク {maxPersons.toFixed(1)} 人（平均）</span>
            ) : (
              <span className="ml-2 text-text-subtle">{MSG.empty.generic}</span>
            )}
          </div>
        </div>
      </div>
    </ChartFigure>
  );
}
