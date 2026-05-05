const cn = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(' ');

export type SkeletonProps = {
  width?: string | number;
  height?: string | number;
  circle?: boolean;
  className?: string;
};

export function Skeleton({ width, height, circle, className }: SkeletonProps) {
  const toCssValue = (n: string | number | undefined): string | undefined => {
    if (n === undefined) return undefined;
    return typeof n === 'number' ? `${n}px` : n;
  };

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="読み込み中"
      className={cn(
        'animate-pulse bg-surface-subtle',
        circle ? 'rounded-full' : 'rounded',
        className,
      )}
      style={{ width: toCssValue(width), height: toCssValue(height) }}
    />
  );
}
