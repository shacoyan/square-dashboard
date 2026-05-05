import { Button } from './Button';
import { getBusinessDate } from '../../lib/businessDate';

export interface DatePickerProps {
  value: string;
  onChange: (date: string) => void;
  startHour?: number;
  max?: string;
  min?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

const cn = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(' ');

export function DatePicker({
  value,
  onChange,
  startHour = 0,
  max,
  min,
  disabled = false,
  ariaLabel = '営業日選択',
  className,
}: DatePickerProps) {
  const todayBiz = getBusinessDate(startHour);
  const effectiveMax = max ?? todayBiz;

  const shift = (deltaDays: number) => {
    if (!value) return;
    const d = new Date(value + 'T12:00:00+09:00');
    d.setDate(d.getDate() + deltaDays);
    const next = d.toLocaleDateString('sv-SE'); // YYYY-MM-DD
    if (effectiveMax && next > effectiveMax) return;
    if (min && next < min) return;
    onChange(next);
  };

  const isAtMax = !!effectiveMax && value >= effectiveMax;
  const isAtMin = !!min && value <= min;
  const isToday = value === todayBiz;

  return (
    <div
      className={cn(
        'inline-flex flex-wrap items-center gap-1',
        className,
      )}
    >
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => shift(-1)}
        disabled={disabled || isAtMin}
        aria-label="前日"
      >
        ‹ 前日
      </Button>
      <input
        type="date"
        value={value}
        max={effectiveMax}
        min={min}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value);
        }}
        className="h-9 px-3 rounded-md border border-border bg-surface text-text text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
      />
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => onChange(todayBiz)}
        disabled={disabled || isToday}
        aria-label="今日"
      >
        今日
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => shift(+1)}
        disabled={disabled || isAtMax}
        aria-label="翌日"
      >
        翌日 ›
      </Button>
    </div>
  );
}

export default DatePicker;
