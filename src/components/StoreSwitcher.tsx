// src/components/StoreSwitcher.tsx
import type { Location } from '../types';

interface StoreSwitcherProps {
  locations: Location[];
  selectedId: string;
  onChange: (id: string) => void;
}

export default function StoreSwitcher({ locations, selectedId, onChange }: StoreSwitcherProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {locations.map((loc) => (
        <button
          key={loc.id}
          onClick={() => onChange(loc.id)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            selectedId === loc.id
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {loc.name}
        </button>
      ))}
    </div>
  );
}
