import type { ReactNode } from 'react';

interface AppShellProps {
  header: ReactNode;
  children: ReactNode;
}

export default function AppShell({ header, children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-surface-muted">
      {header}
      <main>{children}</main>
    </div>
  );
}
