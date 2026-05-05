import { Skeleton } from '../Skeleton';

const cn = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(' ');

export interface TableSkeletonProps {
  rows?: number;
  rowHeight?: string | number;
  columns?: number;
  className?: string;
}

export function TableSkeleton({
  rows = 6,
  rowHeight = 32,
  columns,
  className,
}: TableSkeletonProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: rows }).map((_, r) =>
        columns ? (
          <div key={r} className="flex gap-2">
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton key={c} className="flex-1" height={rowHeight} />
            ))}
          </div>
        ) : (
          <Skeleton key={r} width="100%" height={rowHeight} />
        ),
      )}
    </div>
  );
}
