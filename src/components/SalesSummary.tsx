import { Card, KpiSkeleton } from './ui';
import { formatYen } from '../utils';
import {
  yoyClassToColorClass,
  formatYoY,
  type SalesRangeYoYResult,
  type YoYDelta,
  type YoYClassification,
} from '../lib/yoy';

interface SalesSummaryProps {
  total: number;
  count: number;
  loading: boolean;
  openTotal: number;
  openCount: number;
  /** YoY 結果 (null 時は前年比表示なし) */
  yoy?: SalesRangeYoYResult | null;
  /** YoY 表示 ON/OFF (ControlBar トグル連動、false 時は yoy を渡されても表示しない) */
  showYoy?: boolean;
}

function getYoYAriaLabel(
  classification: YoYClassification,
  deltaPercent: number | null
): string {
  switch (classification) {
    case 'up':
      return `前年同期比 プラス ${Math.abs(deltaPercent ?? 0).toFixed(1)} パーセント、上昇`;
    case 'down':
      return `前年同期比 マイナス ${Math.abs(deltaPercent ?? 0).toFixed(1)} パーセント、下降`;
    case 'flat':
      return '前年同期比 プラスマイナス 0 パーセント、変化なし';
    case 'no_data':
    default:
      return '前年同期比データなし';
  }
}

function YoYRow({ delta, yoy }: { delta: YoYDelta; yoy: SalesRangeYoYResult }) {
  const text = formatYoY(delta);
  const colorClass = yoyClassToColorClass(delta.classification);
  const baseAriaLabel = getYoYAriaLabel(delta.classification, delta.deltaPercent);

  let partialBadge = '';
  let titleAttr: string | undefined = undefined;

  if (yoy.dataCoverage < 0.8) {
    const totalDays = yoy.byDate.length;
    const comparableDays = yoy.byDate.filter((d) => d.lastYear).length;
    partialBadge = ' (部分)';
    titleAttr = `期間内 ${totalDays} 日中 ${comparableDays} 日のみ前年比較可`;
  }

  const ariaLabel = partialBadge ? `${baseAriaLabel}（部分データ）` : baseAriaLabel;

  return (
    <p
      className={`text-xs mt-1 ${colorClass}`}
      aria-label={ariaLabel}
      title={titleAttr}
    >
      <span aria-hidden="true">{text}</span>
      {partialBadge && <span aria-hidden="true">{partialBadge}</span>}
    </p>
  );
}

function NoDataYoYRow() {
  return (
    <p
      className="text-xs mt-1 text-text-muted"
      aria-label="前年同期比データなし"
    >
      <span aria-hidden="true">—</span>
    </p>
  );
}

export default function SalesSummary({
  total,
  count,
  loading,
  openTotal,
  openCount,
  yoy,
  showYoy,
}: SalesSummaryProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <KpiSkeleton showLabel={false} />
        </Card>
        <Card>
          <KpiSkeleton showLabel={false} />
        </Card>
        <Card>
          <KpiSkeleton showLabel={false} />
        </Card>
      </div>
    );
  }

  const grandTotal = total + openTotal;
  const showYoYRow = showYoy !== false && yoy != null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <Card aria-label="合計売上（未決済含む）">
        <p className="text-xs text-text-muted font-medium tracking-wide uppercase">
          合計売上（未決済含む）
        </p>
        <p className="text-2xl sm:text-3xl font-bold text-text tabular-nums mt-1">
          {formatYen(grandTotal)}
        </p>
        {showYoYRow && yoy && (
          <YoYRow delta={yoy.yoy.total_amount} yoy={yoy} />
        )}
      </Card>

      <Card aria-label="決済済み売上">
        <p className="text-xs text-text-muted font-medium tracking-wide uppercase">
          決済済み（{count}件）
        </p>
        <p className="text-2xl sm:text-3xl font-bold text-text tabular-nums mt-1">
          {formatYen(total)}
        </p>
        {showYoYRow && yoy && (
          <YoYRow delta={yoy.yoy.total_amount} yoy={yoy} />
        )}
      </Card>

      <Card aria-label="未決済売上">
        <p className="text-xs text-text-muted font-medium tracking-wide uppercase">
          未決済（{openCount}件）
        </p>
        <p className="text-2xl sm:text-3xl font-bold text-warning tabular-nums mt-1">
          {formatYen(openTotal)}
        </p>
        {showYoYRow && <NoDataYoYRow />}
      </Card>
    </div>
  );
}
