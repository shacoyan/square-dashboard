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

interface Props {
  matrix: OccupancyMatrix;
}

/**
 * 7 行（曜日）× 48 列（30min slot）ヒートマップ。
 * - 濃淡は「平均同時滞在人数」固定（要件）。tooltip は組数+人数を両方表示。
 * - 列ヘッダは 3h 刻みの 8 本のみ（slot % 6 === 0）表示。
 * - 0 値: bg-gray-100 / 値あり: bg-blue-500 + opacity (= persons / maxPersons)。
 */
export default function OccupancyHeatmap({ matrix }: Props) {
  const { avgGroups, avgPersons, maxPersons } = useMemo(() => {
    const aG: number[][] = Array.from({ length: WEEKDAY_COUNT }, () => Array(SLOT_COUNT).fill(0));
    const aP: number[][] = Array.from({ length: WEEKDAY_COUNT }, () => Array(SLOT_COUNT).fill(0));
    let mP = 0;
    for (let w = 0; w < WEEKDAY_COUNT; w++) {
      for (let s = 0; s < SLOT_COUNT; s++) {
        const { groups, persons } = getAverages(matrix, w, s);
        aG[w][s] = groups;
        aP[w][s] = persons;
        if (persons > mP) mP = persons;
      }
    }
    return { avgGroups: aG, avgPersons: aP, maxPersons: mP };
  }, [matrix]);

  const hasData = maxPersons > 0;

  const gridTemplate = `40px repeat(${SLOT_COUNT}, minmax(0, 1fr))`;

  return (
    <div className="w-full">
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          {/* 列ヘッダ（3h 刻み 8 本） */}
          <div
            className="grid items-end text-[10px] text-gray-500 mb-1"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <div />
            {Array.from({ length: SLOT_COUNT }, (_, s) => (
              <div key={`h-${s}`} className="text-left">
                {s % 6 === 0 ? SLOT_LABELS[s].slice(0, 2) + '時' : ''}
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
              <div className="text-xs text-gray-700 pr-2 flex items-center justify-end">
                {WEEKDAY_LABELS[w]}
              </div>
              {Array.from({ length: SLOT_COUNT }, (_, s) => {
                const g = avgGroups[w][s];
                const p = avgPersons[w][s];
                const isZero = p <= 0;
                const opacity = hasData && !isZero ? Math.max(0.08, p / maxPersons) : 0;
                const titleText = `${WEEKDAY_LABELS[w]}曜 ${SLOT_LABELS[s]}: 組 ${g.toFixed(1)} 組 / 人 ${p.toFixed(1)} 人`;
                return (
                  <div
                    key={`c-${w}-${s}`}
                    className={`min-h-[20px] border-r border-white ${isZero ? 'bg-gray-100' : 'bg-blue-500'}`}
                    style={{ opacity: isZero ? 1 : opacity }}
                    title={titleText}
                  />
                );
              })}
            </div>
          ))}

          {/* 凡例 */}
          <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-500">
            <span>少</span>
            <div className="flex h-2 w-32">
              {Array.from({ length: 10 }, (_, i) => (
                <div
                  key={`legend-${i}`}
                  className="flex-1 bg-blue-500"
                  style={{ opacity: Math.max(0.08, (i + 1) / 10) }}
                />
              ))}
            </div>
            <span>多</span>
            {hasData ? (
              <span className="ml-2">最大: {maxPersons.toFixed(1)} 人（平均）</span>
            ) : (
              <span className="ml-2 text-gray-400">データなし</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
