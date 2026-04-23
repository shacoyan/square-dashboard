'use client';

import React from 'react';

export interface SeriesCheckboxItem {
  key: string;
  label: string;
  color: string;
}

export interface SeriesCheckboxGroupProps {
  items: SeriesCheckboxItem[];
  visible: Record<string, boolean>;
  onChange: (key: string, nextVisible: boolean) => void;
  onAllOn?: () => void;
  onAllOff?: () => void;
  className?: string;
}

export const SeriesCheckboxGroup: React.FC<SeriesCheckboxGroupProps> = ({
  items,
  visible,
  onChange,
  onAllOn,
  onAllOff,
  className = '',
}) => {
  return (
    <div className={`flex justify-between items-center gap-2 flex-wrap ${className}`}>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {items.map((item) => {
          const isVisible = visible[item.key] ?? true;

          return (
            <label
              key={item.key}
              className="inline-flex items-center gap-1.5 cursor-pointer text-xs text-gray-700 group"
            >
              <input
                type="checkbox"
                checked={isVisible}
                onChange={(e) => onChange(item.key, e.target.checked)}
                className="sr-only peer"
              />
              <span
                className="relative w-4 h-4 rounded-sm border-2 flex items-center justify-center transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-indigo-500"
                style={{
                  borderColor: item.color,
                  backgroundColor: isVisible ? item.color : 'transparent',
                }}
              >
                {isVisible && (
                  <svg viewBox="0 0 16 16" className="w-3 h-3 text-white" aria-hidden="true">
                    <path d="M3 8l3 3 7-7" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span className={isVisible ? '' : 'text-gray-400 line-through'}>{item.label}</span>
            </label>
          );
        })}
      </div>
      {(onAllOn || onAllOff) && (
        <div className="flex gap-2">
          {onAllOn && (
            <button
              type="button"
              className="text-xs text-indigo-600 hover:underline"
              onClick={onAllOn}
            >
              全て表示
            </button>
          )}
          {onAllOff && (
            <button
              type="button"
              className="text-xs text-indigo-600 hover:underline"
              onClick={onAllOff}
            >
              全て非表示
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default SeriesCheckboxGroup;
