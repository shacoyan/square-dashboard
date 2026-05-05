import type { HTMLAttributes } from 'react';

const cn = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(' ');

const gapMap = {
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
  xl: 'gap-8',
} as const;

const alignMap = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
} as const;

const justifyMap = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
} as const;

interface StackProps extends HTMLAttributes<HTMLDivElement> {
  direction?: 'row' | 'col';
  gap?: keyof typeof gapMap;
  wrap?: boolean;
  align?: keyof typeof alignMap;
  justify?: keyof typeof justifyMap;
}

export function Stack({
  direction = 'col',
  gap = 'md',
  wrap = false,
  align,
  justify,
  className,
  ...rest
}: StackProps) {
  return (
    <div
      className={cn(
        'flex',
        direction === 'col' ? 'flex-col' : 'flex-row',
        gapMap[gap],
        align && alignMap[align],
        justify && justifyMap[justify],
        wrap && 'flex-wrap',
        className
      )}
      {...rest}
    />
  );
}

