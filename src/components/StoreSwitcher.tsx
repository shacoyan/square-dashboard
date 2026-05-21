import { useRef } from 'react';
import type { Location } from '../types';
import { getLocationColor } from '../lib/locationColors';
import { MOTION } from '../lib/motion';

interface StoreSwitcherProps {
  locations: Location[];
  selectedId: string;
  onChange: (id: string) => void;
}

export default function StoreSwitcher({ locations, selectedId, onChange }: StoreSwitcherProps) {
  const pillRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex = index;

    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        nextIndex = (index + 1) % locations.length;
        break;
      case 'ArrowLeft':
        e.preventDefault();
        nextIndex = (index - 1 + locations.length) % locations.length;
        break;
      case 'Home':
        e.preventDefault();
        nextIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        nextIndex = locations.length - 1;
        break;
      default:
        return;
    }

    onChange(locations[nextIndex].id);
    pillRefs.current[nextIndex]?.focus();
  };

  return (
    <div role="radiogroup" aria-label="店舗切替" className="flex flex-wrap gap-2">
      {locations.map((loc, index) => {
        const isActive = selectedId === loc.id;

        return (
          <button
            key={loc.id}
            ref={(el) => {
              pillRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(loc.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${MOTION.fast} focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus:outline-none ${
              isActive
                ? 'bg-primary text-white'
                : 'bg-surface-subtle text-text hover:bg-surface-muted border border-border'
            }`}
          >
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: getLocationColor(loc.id) }}
              aria-hidden="true"
            />
            {loc.name}
          </button>
        );
      })}
    </div>
  );
}
