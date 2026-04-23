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
        {items.map((item) => (
          <label
            key={item.key}
            className="inline-flex items-center gap-1.5 cursor-pointer text-xs text-gray-700"
          >
            <input
              type="checkbox"
              checked={visible[item.key] ?? true}
              onChange={(e) => onChange(item.key, e.target.checked)}
              className="w-3.5 h-3.5"
              style={{ accentColor: item.color }}
            />
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ backgroundColor: item.color }}
            />
            <span>{item.label}</span>
          </label>
        ))}
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
