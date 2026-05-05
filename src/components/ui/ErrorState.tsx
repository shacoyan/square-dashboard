import { Button } from './Button';

export type ErrorStateProps = {
  title?: string;
  description?: string;
  onRetry?: () => void;
};

const icon = (
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

export function ErrorState({ title = 'エラーが発生しました', description, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center gap-3 text-text-muted">
      <div className="text-danger">{icon}</div>
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
