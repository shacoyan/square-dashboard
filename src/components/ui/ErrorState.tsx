import { Button } from './Button';

export type ErrorStateProps = {
  title?: string;
  description?: string;
  onRetry?: () => void;
  minHeight?: number | string;
  variant?: 'centered' | 'inline';
  tone?: 'neutral' | 'warning' | 'danger';
  role?: string;
  className?: string;
};

const centeredIcon = (
  <svg
    className="w-12 h-12"
    stroke="currentColor"
    strokeWidth={1.5}
    fill="none"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
  </svg>
);

const inlineIcon = (
  <svg
    className="w-5 h-5"
    stroke="currentColor"
    strokeWidth={1.5}
    fill="none"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
  </svg>
);

const toneStyles: Record<string, string> = {
  neutral: 'bg-surface-subtle border-border text-text',
  warning: 'bg-warning-50 border-warning-300 text-warning-800',
  danger: 'bg-danger-50 border-danger-300 text-danger-800',
};

export function ErrorState({
  title = 'エラーが発生しました',
  description,
  onRetry,
  minHeight,
  variant = 'centered',
  tone = 'danger',
  role: roleProp = 'alert',
  className = '',
}: ErrorStateProps) {
  const ariaLive = roleProp === 'alert' ? 'assertive' : 'polite';

  if (variant === 'inline') {
    return (
      <div
        role={roleProp}
        aria-live={ariaLive}
        className={`flex items-start gap-3 rounded-md border p-4 ${toneStyles[tone] ?? toneStyles.danger} ${className}`}
      >
        <div className="flex-shrink-0 mt-0.5" aria-hidden="true">
          {inlineIcon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium">{title}</p>
          {description && <p className="text-sm mt-1 opacity-90">{description}</p>}
        </div>
        {onRetry && (
          <div className="flex-shrink-0 ml-2">
            <Button variant="secondary" onClick={onRetry}>
              再試行
            </Button>
          </div>
        )}
      </div>
    );
  }

  const pyClass = minHeight != null ? 'py-6' : 'py-12';

  return (
    <div
      role={roleProp}
      aria-live={ariaLive}
      className={`flex flex-col items-center justify-center text-center gap-3 text-text-muted ${pyClass} ${className}`}
      style={minHeight != null ? { minHeight } : undefined}
    >
      <div className="text-danger">{centeredIcon}</div>
      <h3 className="text-base font-semibold text-danger">{title}</h3>
      {description && <p className="text-sm">{description}</p>}
      {onRetry && (
        <div className="mt-2">
          <Button variant="secondary" onClick={onRetry}>
            再試行
          </Button>
        </div>
      )}
    </div>
  );
}
