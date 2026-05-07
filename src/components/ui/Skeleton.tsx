const cn = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(' ');

export type SkeletonProps = {
  width?: string | number;
  height?: string | number;
  circle?: boolean;
  className?: string;
  ariaHidden?: boolean;
};

export function Skeleton({ width, height, circle, className, ariaHidden }: SkeletonProps) {
  const toCssValue = (n: string | number | undefined): string | undefined => {
    if (n === undefined) return undefined;
    return typeof n === 'number' ? `${n}px` : n;
  };

  const ariaAttributes = ariaHidden
    ? { 'aria-hidden': true as const }
    : {
        role: 'status' as const,
        'aria-busy': true as const,
        'aria-label': '読み込み中',
      };

  return (
    <div
      {...ariaAttributes}
      className={cn(
        'animate-pulse bg-surface-subtle',
        circle ? 'rounded-full' : 'rounded',
        className,
      )}
      style={{ width: toCssValue(width), height: toCssValue(height) }}
    />
  );
}
