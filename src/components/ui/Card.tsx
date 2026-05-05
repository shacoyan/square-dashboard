import type { ReactNode, HTMLAttributes } from 'react';

const cn = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(' ');

type As = 'section' | 'div' | 'article';

interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  as?: As;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  padded?: boolean;
  dense?: boolean;
}

export function Card({
  as: Tag = 'section',
  title,
  description,
  actions,
  padded = true,
  dense = false,
  className,
  children,
  ...rest
}: CardProps) {
  const showHeader = !!title || !!description || !!actions;
  const paddingClass = padded ? (dense ? 'p-3' : 'p-5') : 'p-0';

  return (
    <Tag
      className={cn(
        'bg-surface rounded-card shadow-card border border-border',
        className
      )}
      {...rest}
    >
      {showHeader && (
        <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-border">
          <div>
            {title && (
              <h2 className="text-base font-semibold text-text">{title}</h2>
            )}
            {description && (
              <p className="text-xs text-text-muted">{description}</p>
            )}
          </div>
          {actions && <div>{actions}</div>}
        </header>
      )}
      <div className={paddingClass}>{children}</div>
    </Tag>
  );
}
