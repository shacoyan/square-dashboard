import type { ReactNode } from 'react';

export type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
};

const defaultIcon = (
  <svg
    className="w-12 h-12"
    stroke="currentColor"
    strokeWidth={1.5}
    fill="none"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path d="M20 13V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6" />
    <path d="M4 13l3.5 3.5a2 2 0 0 0 1.414.586h6.172a2 2 0 0 0 1.414-.586L20 13" />
    <path d="M4 13v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
  </svg>
);

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center gap-3 text-text-muted">
      <div className="text-text-subtle">{icon ?? defaultIcon}</div>
      <h3 className="text-base font-semibold text-text">{title}</h3>
      {description && <p className="text-sm">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
