// src/components/StoreSwitcher.tsx

interface Location {
  id: string;
  name: string;
}

interface StoreSwitcherProps {
  locations: Location[];
  selectedId: string;
  onChange: (id: string) => void;
}

export default function StoreSwitcher({
  locations,
  selectedId,
  onChange,
}: StoreSwitcherProps) {
  return (
    <div className="inline-flex items-center gap-2">
      <label
        htmlFor="store-select"
        className="text-sm font-medium text-gray-600"
      >
        店舗:
      </label>
      <select
        id="store-select"
        value={selectedId}
        onChange={(e) => onChange(e.target.value)}
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
      >
        {locations.map((loc) => (
          <option key={loc.id} value={loc.id}>
            {loc.name}
          </option>
        ))}
      </select>
    </div>
  );
}
