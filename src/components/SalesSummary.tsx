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
  const grandTotal = total + openTotal;

  return (
    <div className="space-y-3">
      {/* ── 主役: 本日の売上見込み合計 ── */}
      <Card aria-label="本日の売上見込み合計">
        <p className="text-xs text-text-muted font-medium tracking-wide uppercase">
          本日の売上見込み合計
        </p>
        {loading ? (
          <div className="mt-1 space-y-2">
            <KpiSkeleton showLabel={false} valueHeight={44} />
            <KpiSkeleton showLabel={false} valueHeight={16} />
          </div>
        ) : (
          <>
            <p
              className="text-3xl sm:text-4xl font-bold text-text tabular-nums mt-1"
              aria-label={`本日の売上見込み合計 ${formatYen(grandTotal)}`}
            >
              {formatYen(grandTotal)}
            </p>
            <p className="text-sm text-text-muted tabular-nums mt-2">
              <span>決済済 {formatYen(total)}</span>
              <span aria-hidden="true" className="mx-1">＋</span>
              <span>未会計 {formatYen(openTotal)}</span>
            </p>
          </>
        )}
      </Card>

      {/* ── 既存 4 カード（変更なし） ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card dense>
          <p className="text-xs text-text-muted font-medium tracking-wide uppercase">決済済み売上</p>
          {loading ? (
            <KpiSkeleton showLabel={false} />
          ) : (
            <p className="text-2xl sm:text-3xl font-bold text-text tabular-nums mt-1">{formatYen(total)}</p>
          )}
        </Card>

        <Card dense>
          <p className="text-xs text-text-muted font-medium tracking-wide uppercase">決済済み件数</p>
          {loading ? (
            <KpiSkeleton showLabel={false} />
          ) : (
            <p className="text-2xl sm:text-3xl font-bold text-text tabular-nums mt-1">
              <span className="tabular-nums">{count}</span> 件
            </p>
          )}
        </Card>

        <Card dense>
          <p className="text-xs text-text-muted font-medium tracking-wide uppercase">未会計合計</p>
          {loading ? (
            <KpiSkeleton showLabel={false} />
          ) : (
            <p className="text-2xl sm:text-3xl font-bold text-warning tabular-nums mt-1">{formatYen(openTotal)}</p>
          )}
        </Card>

        <Card dense>
          <p className="text-xs text-text-muted font-medium tracking-wide uppercase">未会計件数</p>
          {loading ? (
            <KpiSkeleton showLabel={false} />
          ) : (
            <p className="text-2xl sm:text-3xl font-bold text-text tabular-nums mt-1">
              <span className="tabular-nums">{openCount}</span> 件
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
