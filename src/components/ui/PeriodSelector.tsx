import type { PeriodPreset } from '../../types';

const cn = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(' ');

const PERIOD_TABS: { key: PeriodPreset; label: string }[] = [
  { key: 'today', label: '今日' },
  { key: 'week', label: '週' },
  { key: 'month', label: '今月' },
];

export interface PeriodSelectorProps {
  period: PeriodPreset;
  onPeriodChange: (p: PeriodPreset) => void;
  weekIndex: number;
  onWeekIndexChange: (n: number) => void;
  availableWeeks: number;
  ariaLabel?: string;
  className?: string;
}

const tabBaseClass =
  'px-4 py-2 text-sm font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1';

const weekTabBaseClass =
  'px-3 py-1.5 text-sm font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1';

const selectedClass = 'bg-primary text-white';
const unselectedClass = 'bg-surface-subtle text-text-muted hover:bg-surface-muted';

export function PeriodSelector({
  period,
  onPeriodChange,
  weekIndex,
  onWeekIndexChange,
  availableWeeks,
  ariaLabel = '期間選択',
  className,
}: PeriodSelectorProps) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex space-x-2" role="tablist" aria-label={ariaLabel}>
        {PERIOD_TABS.map((tab) => {
          const isSelected = period === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => onPeriodChange(tab.key)}
              className={cn(tabBaseClass, isSelected ? selectedClass : unselectedClass)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {period === 'week' && availableWeeks > 0 && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="週選択">
          {Array.from({ length: availableWeeks }, (_, i) => i + 1).map((n) => {
            const isSelected = weekIndex === n;
            return (
              <button
                key={n}
                type="button"
                role="tab"
                aria-selected={isSelected}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => onWeekIndexChange(n)}
                className={cn(weekTabBaseClass, isSelected ? selectedClass : unselectedClass)}
              >
                第{n}週
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default PeriodSelector;
