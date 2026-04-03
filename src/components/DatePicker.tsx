import { useState } from 'react';

interface Props {
  value: string;
  onChange: (date: string) => void;
}

const DAYS = ['日', '月', '火', '水', '木', '金', '土'];

function toYMD(d: Date): string {
  return d.toLocaleDateString('sv-SE');
}

export default function DatePicker({ value, onChange }: Props) {
  const today = toYMD(new Date());
  const [viewYear, setViewYear] = useState(() => parseInt(value.slice(0, 4)));
  const [viewMonth, setViewMonth] = useState(
    () => parseInt(value.slice(5, 7)) - 1,
  );

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-3 w-64">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={prevMonth}
          className="p-1 hover:bg-gray-100 rounded text-gray-600 text-lg leading-none"
        >
          ‹
        </button>
        <span className="text-sm font-semibold text-gray-800">
          {viewYear}年 {viewMonth + 1}月
        </span>
        <button
          onClick={nextMonth}
          className="p-1 hover:bg-gray-100 rounded text-gray-600 text-lg leading-none"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {DAYS.map((d, i) => (
          <div
            key={d}
            className={`text-center text-xs font-medium py-1 ${
              i === 0
                ? 'text-red-400'
                : i === 6
                  ? 'text-blue-400'
                  : 'text-gray-500'
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;

          const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isSelected = dateStr === value;
          const isToday = dateStr === today;
          const isFuture = dateStr > today;
          const dow = i % 7;

          return (
            <button
              key={i}
              disabled={isFuture}
              onClick={() => onChange(dateStr)}
              className={[
                'text-xs py-1.5 rounded transition text-center w-full',
                isSelected ? 'bg-indigo-600 text-white font-semibold' : '',
                !isSelected && isToday
                  ? 'underline font-semibold text-indigo-600'
                  : '',
                !isSelected && !isFuture ? 'hover:bg-gray-100' : '',
                isFuture ? 'text-gray-300 cursor-not-allowed' : '',
                !isSelected && !isFuture && dow === 0 ? 'text-red-400' : '',
                !isSelected && !isFuture && dow === 6 ? 'text-blue-400' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
