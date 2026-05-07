import type { WeekdayAggregate } from '../lib/weekdayAggregation';
import { formatYen } from '../utils';

interface Props {
  data: WeekdayAggregate[];
  metric: 'customers' | 'sales';
}

type SegmentKeys = 'new' | 'repeat' | 'regular' | 'staff' | 'unlisted';

export default function WeekdayTable({ data, metric }: Props) {
  const segmentKeys: SegmentKeys[] = ['new', 'repeat', 'regular', 'staff', 'unlisted'];

  const weekdayLabels = ['月', '火', '水', '木', '金', '土', '日'];

  const totals: Record<string, number> = {
    new: 0,
    repeat: 0,
    regular: 0,
    staff: 0,
    unlisted: 0,
    total: 0,
    sampleCount: 0,
  };

  if (metric === 'customers') {
    for (const d of data) {
      totals.new += d.new;
      totals.repeat += d.repeat;
      totals.regular += d.regular;
      totals.staff += d.staff;
      totals.unlisted += d.unlisted;
      totals.total += d.totalCustomers;
      totals.sampleCount += d.sampleCount;
    }
  } else {
    for (const d of data) {
      totals.new += d.newSales;
      totals.repeat += d.repeatSales;
      totals.regular += d.regularSales;
      totals.staff += d.staffSales;
      totals.unlisted += d.unlistedSales;
      totals.total += d.totalSales;
      totals.sampleCount += d.sampleCount;
    }
  }

  function getVal(d: WeekdayAggregate, seg: SegmentKeys): number {
    if (metric === 'customers') {
      return d[seg];
    }
    return d[seg === 'new' ? 'newSales' : seg === 'repeat' ? 'repeatSales' : seg === 'regular' ? 'regularSales' : seg === 'staff' ? 'staffSales' : 'unlistedSales'];
  }

  function getTotal(d: WeekdayAggregate): number {
    return metric === 'customers' ? d.totalCustomers : d.totalSales;
  }

  function formatVal(v: number): string {
    if (metric === 'customers') {
      return `${(Math.round(v * 10) / 10).toFixed(1)}人`;
    }
    return formatYen(Math.round(v));
  }

  function calcPct(numerator: number, denominator: number): string {
    if (denominator === 0) return '(--)';
    return `(${Math.round((numerator / denominator) * 100)}%)`;
  }

  function getPctDisplay(seg: SegmentKeys, val: number, denominator: number, isZeroSample: boolean): string {
    if (isZeroSample) return '(--)';
    if (metric === 'customers' && seg === 'unlisted') return '(--)';
    return calcPct(val, denominator);
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-xs sm:text-sm">
        <thead>
          <tr className="bg-surface-muted">
            <th className="border border-border px-3 py-2 text-left font-medium text-text-muted">曜日</th>
            <th className="border border-border px-3 py-2 text-right font-medium text-text-muted">新規</th>
            <th className="border border-border px-3 py-2 text-right font-medium text-text-muted">リピート</th>
            <th className="border border-border px-3 py-2 text-right font-medium text-text-muted">常連</th>
            <th className="border border-border px-3 py-2 text-right font-medium text-text-muted">スタッフ</th>
            <th className="border border-border px-3 py-2 text-right font-medium text-text-muted">記載なし</th>
            <th className="border border-border px-3 py-2 text-right font-medium text-text-muted">合計</th>
            <th className="border border-border px-3 py-2 text-right font-medium text-text-muted">サンプル(日数)</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => {
            const isZeroSample = d.sampleCount === 0;
            const rowTotal = getTotal(d);

            return (
              <tr key={weekdayLabels[i]} className={isZeroSample ? 'text-text-subtle' : ''}>
                <td className="border border-border px-3 py-2 font-medium">{weekdayLabels[i]}</td>
                {segmentKeys.map((seg) => {
                  const val = getVal(d, seg);
                  return (
                    <td key={seg} className="border border-border px-3 py-2 text-right tabular-nums">
                      <span>{isZeroSample ? '--' : formatVal(val)}</span>
                      <span className="ml-1 text-[0.65rem] opacity-70">
                        {getPctDisplay(seg, val, rowTotal, isZeroSample)}
                      </span>
                    </td>
                  );
                })}
                <td className="border border-border px-3 py-2 text-right tabular-nums">
                  {isZeroSample ? '--' : formatVal(rowTotal)}
                </td>
                <td className="border border-border px-3 py-2 text-right tabular-nums">
                  {isZeroSample ? '--' : d.sampleCount}
                </td>
              </tr>
            );
          })}

          <tr className="bg-surface-muted font-medium">
            <td className="border border-border px-3 py-2">合計</td>
            {segmentKeys.map((seg) => {
              const val = totals[seg];
              return (
                <td key={seg} className="border border-border px-3 py-2 text-right tabular-nums">
                  <span>{formatVal(val)}</span>
                  <span className="ml-1 text-[0.65rem] opacity-70">
                    {getPctDisplay(seg, val, totals.total, false)}
                  </span>
                </td>
              );
            })}
            <td className="border border-border px-3 py-2 text-right tabular-nums">{formatVal(totals.total)}</td>
            <td className="border border-border px-3 py-2 text-right tabular-nums">{totals.sampleCount}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
