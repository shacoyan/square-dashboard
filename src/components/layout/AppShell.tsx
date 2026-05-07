import type { ReactNode } from 'react';

interface AppShellProps {
  header: ReactNode;
  children: ReactNode;
}

export default function AppShell({ header, children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-surface-muted">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-primary focus:text-white focus:px-3 focus:py-2 focus:rounded-md focus-visible:ring-2 focus-visible:ring-primary-hover focus-visible:ring-offset-2"
      >
        メインコンテンツへ
      </a>
      {header}
      <main id="main-content" tabIndex={-1} aria-label="ダッシュボード本体">
        {children}
      </main>
    </div>
  );
}
