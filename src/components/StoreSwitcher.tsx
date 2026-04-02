import { Location } from '../hooks/useSquareData'

interface StoreSwitcherProps {
  locations: Location[]
  selectedId: string
  onChange: (id: string) => void
}

export default function StoreSwitcher({ locations, selectedId, onChange }: StoreSwitcherProps) {
  if (locations.length === 0) {
    return (
      <div className="text-sm text-gray-400 py-2">店舗を読み込み中...</div>
    )
  }

  if (locations.length === 1) {
    return (
      <div className="text-sm font-medium text-gray-700 py-1">
        {locations[0].name}
      </div>
    )
  }

  return (
    <select
      value={selectedId}
      onChange={(e) => onChange(e.target.value)}
      className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
    >
      {locations.map((loc) => (
        <option key={loc.id} value={loc.id}>
          {loc.name}
        </option>
      ))}
    </select>
  )
}
