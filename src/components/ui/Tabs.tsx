import type { ReactNode, KeyboardEvent } from 'react';
import { useRef } from 'react';
import { MOTION } from '../../lib/motion';

const cn = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(' ');

export type TabItem = {
  key: string;
  label: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
};

export type TabsProps = {
  items: TabItem[];
  active: string;
  onChange: (key: string) => void;
  ariaLabel?: string;
  size?: 'sm' | 'md';
};

export function Tabs({ items, active, onChange, ariaLabel, size = 'md' }: TabsProps) {
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const sizeClass = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm';
  const base =
    `inline-flex items-center gap-2 rounded-md font-medium ${MOTION.fast} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 disabled:opacity-40 disabled:cursor-not-allowed`;

  const focusTab = (key: string) => {
    tabRefs.current[key]?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const enabledItems = items.filter((item) => !item.disabled);
    const enabledKeys = enabledItems.map((item) => item.key);
    const enabledIndex = enabledKeys.indexOf(items[index].key);
    if (enabledIndex === -1) return;

    let nextKey: string | undefined;

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = (enabledIndex + 1) % enabledKeys.length;
      nextKey = enabledKeys[next];
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = (enabledIndex - 1 + enabledKeys.length) % enabledKeys.length;
      nextKey = enabledKeys[prev];
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextKey = enabledKeys[0];
    } else if (e.key === 'End') {
      e.preventDefault();
      nextKey = enabledKeys[enabledKeys.length - 1];
    }

    if (nextKey) {
      onChange(nextKey);
      focusTab(nextKey);
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-1 p-1 bg-surface-subtle rounded-lg"
    >
      {items.map((item, index) => {
        const isActive = item.key === active;
        const activeClass = isActive
          ? 'bg-primary text-white shadow-card'
          : 'bg-transparent text-text-muted hover:bg-surface-muted hover:text-text';

        return (
          <button
            key={item.key}
            ref={(el) => {
              tabRefs.current[item.key] = el;
            }}
            role="tab"
            aria-selected={isActive}
            aria-controls={`tabpanel-${item.key}`}
            id={`tab-${item.key}`}
            tabIndex={isActive ? 0 : -1}
            disabled={item.disabled}
            className={cn(base, sizeClass, activeClass)}
            onClick={() => onChange(item.key)}
            onKeyDown={(e) => handleKeyDown(e, index)}
          >
            {item.label}
            {item.badge && <span className="ml-1">{item.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}
