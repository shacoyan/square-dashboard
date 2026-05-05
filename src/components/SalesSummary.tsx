import { Card, Skeleton } from './ui';
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
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Card dense>
        <p className="text-xs text-text-muted font-medium tracking-wide uppercase">決済済み売上</p>
        {loading ? (
          <Skeleton width="100%" height={32} />
        ) : (
          <p className="text-2xl sm:text-3xl font-bold text-text tabular-nums mt-1">{formatYen(total)}</p>
        )}
      </Card>

      <Card dense>
        <p className="text-xs text-text-muted font-medium tracking-wide uppercase">決済済み件数</p>
        {loading ? (
          <Skeleton width="100%" height={32} />
        ) : (
          <p className="text-2xl sm:text-3xl font-bold text-text tabular-nums mt-1">
            <span className="tabular-nums">{count}</span> 件
          </p>
        )}
      </Card>

      <Card dense>
        <p className="text-xs text-text-muted font-medium tracking-wide uppercase">未会計合計</p>
        {loading ? (
          <Skeleton width="100%" height={32} />
        ) : (
          <p className="text-2xl sm:text-3xl font-bold text-warning tabular-nums mt-1">{formatYen(openTotal)}</p>
        )}
      </Card>

      <Card dense>
        <p className="text-xs text-text-muted font-medium tracking-wide uppercase">未会計件数</p>
        {loading ? (
          <Skeleton width="100%" height={32} />
        ) : (
          <p className="text-2xl sm:text-3xl font-bold text-text tabular-nums mt-1">
            <span className="tabular-nums">{openCount}</span> 件
          </p>
        )}
      </Card>
    </div>
  );
}
