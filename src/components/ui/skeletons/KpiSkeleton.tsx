import { Skeleton } from '../Skeleton';

const cn = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(' ');

export interface KpiSkeletonProps {
  showLabel?: boolean;
  labelWidth?: string | number;
  valueHeight?: string | number;
  className?: string;
}

export function KpiSkeleton({
  showLabel = true,
  labelWidth = 80,
  valueHeight = 32,
  className,
}: KpiSkeletonProps) {
  return (
    <div
      className={cn('space-y-2', className)}
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label="読み込み中"
    >
      {showLabel && <Skeleton width={labelWidth} height={12} ariaHidden />}
      <Skeleton width="100%" height={valueHeight} ariaHidden />
    </div>
  );
}
