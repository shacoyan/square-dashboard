interface Props {
  active: 'daily' | 'segment';
  onChange: (tab: 'daily' | 'segment') => void;
}

const TABS: { key: 'daily' | 'segment'; label: string }[] = [
  { key: 'daily', label: '当日データ' },
  { key: 'segment', label: '顧客セグメント' },
];

function DashboardTabs({ active, onChange }: Props) {
  return (
    <div role="tablist" aria-label="ダッシュボードビュー切替" className="flex gap-2">
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        return (
          <button
            key={tab.key}
            role="tab"
            type="button"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.key)}
            className={
              isActive
                ? 'px-4 py-2 text-sm font-medium rounded-lg transition-colors bg-indigo-600 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1'
                : 'px-4 py-2 text-sm font-medium rounded-lg transition-colors bg-gray-100 text-gray-600 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1'
            }
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export default DashboardTabs;
