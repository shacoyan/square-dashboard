import { Skeleton } from '../Skeleton';

const cn = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(' ');

export interface ListSkeletonProps {
  rows?: number;
  rowHeight?: string | number;
  gap?: number;
  className?: string;
}

export function ListSkeleton({
  rows = 5,
  rowHeight = 20,
  gap = 8,
  className,
}: ListSkeletonProps) {
  return (
    <div className={cn('flex flex-col', className)} style={{ gap }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} width="100%" height={rowHeight} />
      ))}
    </div>
  );
}
