import { Container } from '../ui';
import UserMenu from './UserMenu';

interface TopBarProps {
  onLogout: () => void;
}

export default function TopBar({ onLogout }: TopBarProps) {
  return (
    <header className="bg-surface border-b border-border sticky top-0 z-20 backdrop-blur-sm bg-surface/95">
      <Container className="h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="block w-1 h-6 bg-primary rounded-full" aria-hidden="true" />
          <h1 className="text-sm sm:text-base font-bold text-text">SABABA 売上ダッシュボード</h1>
        </div>
        <UserMenu onLogout={onLogout} />
      </Container>
    </header>
  );
}
