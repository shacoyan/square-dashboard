import type { SelectHTMLAttributes } from 'react';
import { forwardRef, useId } from 'react';

const cn = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(' ');

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> & {
  label?: string;
  hint?: string;
  size?: 'sm' | 'md';
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, hint, size: _size = 'md', className, id: propId, ...rest }, ref) => {
    const autoId = useId();
    const id = propId ?? autoId;

    const sizeClass = _size === 'sm' ? 'h-8 text-xs' : 'h-9 text-sm';

    return (
      <div className="inline-flex flex-col gap-1">
        {label && (
          <label htmlFor={id} className="text-xs font-medium text-text-muted">
            {label}
          </label>
        )}
        <div className="relative inline-block">
          <select
            ref={ref}
            id={id}
            className={cn(
              'appearance-none w-full pr-8 pl-3 rounded-md border border-border bg-surface text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors hover:border-border-strong',
              sizeClass,
              className,
            )}
            {...rest}
          />
          <svg
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
        {hint && <p className="text-xs text-text-subtle">{hint}</p>}
      </div>
    );
  },
);

Select.displayName = 'Select';
