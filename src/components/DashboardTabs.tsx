import { MOTION } from '../lib/motion';

interface Props {
  active: 'daily' | 'segment' | 'compare';
  onChange: (tab: 'daily' | 'segment' | 'compare') => void;
}

const TABS: { key: 'daily' | 'segment' | 'compare'; label: string }[] = [
  { key: 'daily', label: '当日データ' },
  { key: 'segment', label: '店舗データ分析' },
  { key: 'compare', label: '全店舗比較' },
];

function DashboardTabs({ active, onChange }: Props) {
  return (
    <div role="tablist" aria-label="ダッシュボードビュー切替" className="flex gap-2">
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        return (
          <button
            key={tab.key}
            id={`tab-${tab.key}`}
            role="tab"
            type="button"
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.key}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.key)}
            className={
              isActive
                ? `px-4 py-2 text-sm font-medium rounded-lg ${MOTION.fast} bg-primary text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1`
                : `px-4 py-2 text-sm font-medium rounded-lg ${MOTION.fast} bg-surface-subtle text-text-muted hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1`
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
