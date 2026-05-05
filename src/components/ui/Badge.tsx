import type { HTMLAttributes } from 'react';

const cn = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(' ');

export type Tone = 'neutral' | 'primary' | 'danger' | 'warning' | 'success' | 'info';

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone;
  size?: 'sm' | 'md';
};

const toneMap: Record<Tone, string> = {
  neutral: 'bg-surface-subtle text-text-muted',
  primary: 'bg-primary-subtle text-primary',
  danger: 'bg-danger-subtle text-danger',
  warning: 'bg-warning-subtle text-warning',
  success: 'bg-success-subtle text-success',
  info: 'bg-info-subtle text-info',
};

const sizeMap: Record<'sm' | 'md', string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
};

const base = 'inline-flex items-center rounded-full font-medium';

export function Badge({ tone = 'neutral', size = 'md', className, ...rest }: BadgeProps) {
  return (
    <span className={cn(base, toneMap[tone], sizeMap[size], className)} {...rest} />
  );
}
