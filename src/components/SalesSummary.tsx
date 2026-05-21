import { Card, KpiSkeleton } from './ui';
import { formatYen } from '../utils';

interface SalesSummaryProps {
  total: number;
  count: number;
  loading: boolean;
  openTotal: number;
  openCount: number;
}

export default function SalesSummary({
  total,
  count,
  loading,
  openTotal,
  openCount,
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

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <Card aria-label="合計売上（未決済含む）">
        <p className="text-xs text-text-muted font-medium tracking-wide uppercase">
          合計売上（未決済含む）
        </p>
        <p className="text-2xl sm:text-3xl font-bold text-text tabular-nums mt-1">
          {formatYen(grandTotal)}
        </p>
      </Card>

      <Card aria-label="決済済み売上">
        <p className="text-xs text-text-muted font-medium tracking-wide uppercase">
          決済済み（{count}件）
        </p>
        <p className="text-2xl sm:text-3xl font-bold text-text tabular-nums mt-1">
          {formatYen(total)}
        </p>
      </Card>

      <Card aria-label="未決済売上">
        <p className="text-xs text-text-muted font-medium tracking-wide uppercase">
          未決済（{openCount}件）
        </p>
        <p className="text-2xl sm:text-3xl font-bold text-warning tabular-nums mt-1">
          {formatYen(openTotal)}
        </p>
      </Card>
    </div>
  );
}
