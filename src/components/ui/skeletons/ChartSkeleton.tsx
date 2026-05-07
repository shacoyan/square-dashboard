import { Skeleton } from '../Skeleton';
import type { ChartHeightPreset } from '../../../lib/chartTheme';
import { chartTheme } from '../../../lib/chartTheme';

const cn = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(' ');

export interface ChartSkeletonProps {
  heightPreset?: ChartHeightPreset;
  withLegend?: boolean;
  className?: string;
}

export function ChartSkeleton({
  heightPreset = 'standard',
  withLegend = false,
  className,
}: ChartSkeletonProps) {
  return (
    <div
      className={cn('w-full', className)}
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label="読み込み中"
    >
      <Skeleton width="100%" height={chartTheme.heightPreset[heightPreset ?? 'standard']} ariaHidden />
      {withLegend && (
        <div className="flex gap-3 mt-3">
          <Skeleton width={64} height={12} ariaHidden />
          <Skeleton width={64} height={12} ariaHidden />
          <Skeleton width={64} height={12} ariaHidden />
        </div>
      )}
    </div>
  );
}
