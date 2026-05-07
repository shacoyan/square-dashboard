import type { ReactNode } from 'react';

export interface ChartFigureProps {
  label: string;
  className?: string;
  children: ReactNode;
}

export function ChartFigure({ label, className, children }: ChartFigureProps) {
  const cls = className ? `m-0 ${className}` : 'm-0';
  return (
    <figure role="img" aria-label={label} className={cls}>
      {children}
    </figure>
  );
}
