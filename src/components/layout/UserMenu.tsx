import React, { useState, useRef, useEffect, useCallback } from 'react';

interface UserMenuProps {
  onLogout: () => void;
}

export const UserMenu: React.FC<UserMenuProps> = ({ onLogout }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        handleClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, handleClose]);

  const handleToggle = () => {
    setOpen((prev) => !prev);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="ユーザーメニュー"
        className="inline-flex items-center gap-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
      >
        <span className="w-8 h-8 rounded-full bg-primary-subtle text-primary inline-flex items-center justify-center font-semibold">
          S
        </span>
        <span className="hidden sm:inline-flex text-text-muted">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>

      {open && (
        <div
          role="menu"
          aria-orientation="vertical"
          className="absolute right-0 mt-2 w-48 bg-surface border border-border rounded-card shadow-cardHover py-1 z-30"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onLogout();
              handleClose();
            }}
            className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-text hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
          >
            ログアウト
          </button>
          <button
            type="button"
            role="menuitem"
            disabled
            className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-text-muted cursor-not-allowed opacity-50"
          >
            営業時間設定（開発中）
          </button>
        </div>
      )}
    </div>
  );
};

export default UserMenu;
