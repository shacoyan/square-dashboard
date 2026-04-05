import { useState } from 'react';
import type { OpenOrder } from '../types';
import { formatYen } from '../utils';

interface Props {
  orders: OpenOrder[];
  loading: boolean;
  error: string | null;
}

export default function OpenOrderList({ orders, loading, error }: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const toggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleCopy = async (e: React.MouseEvent, order: OpenOrder) => {
    e.stopPropagation();
    const text = order.line_items
      .map((item) => `${item.name} × ${item.quantity}`)
      .join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(order.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // clipboard API not available
    }
  };

  return (
    <div className="bg-white rounded-xl shadow overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <h2 className="font-semibold text-gray-800">現在の未決済テーブル</h2>
        {!loading && (
          <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-0.5 rounded-full">
            {orders.length}件
          </span>
        )}
      </div>

      {loading && (
        <div className="p-6 text-center text-gray-400 text-sm">読み込み中...</div>
      )}

      {error && (
        <div className="p-4 text-red-600 text-sm">⚠ {error}</div>
      )}

      {!loading && !error && orders.length === 0 && (
        <div className="p-6 text-center text-gray-400 text-sm">
          現在未決済の注文はありません
        </div>
      )}

      {!loading && orders.length > 0 && (
        <ul className="divide-y divide-gray-100">
          {orders.map((order) => (
            <li
              key={order.id}
              className="px-4 py-3 cursor-pointer hover:bg-amber-50 transition"
              onClick={() => toggle(order.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="text-gray-400 text-xs">
                    {expandedIds.has(order.id) ? '▼' : '▶'}
                  </span>
                  <span>
                    {order.created_at
                      ? new Date(order.created_at).toLocaleString('ja-JP', {
                          month: 'numeric',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '--/-- --:--'}{' '}
                    開始
                  </span>
                  {order.customer_name && (
                    <span className="text-xs text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                      {order.customer_name}
                    </span>
                  )}
                </div>
                <span className="font-semibold text-gray-900">
                  {formatYen(order.total_money)}
                </span>
              </div>

              {expandedIds.has(order.id) && order.line_items.length > 0 && (
                <div className="mt-2 flex items-start gap-2">
                  <div className="flex-1 pl-5">
                    <ul className="space-y-1">
                      {order.line_items.map((item, i) => (
                        <li
                          key={i}
                          className="flex justify-between text-xs text-gray-600"
                        >
                          <span>
                            {item.name} × {item.quantity}
                          </span>
                          <span>
                            {item.amount > 0 ? formatYen(item.amount) : '¥0'}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {order.discounts && order.discounts.length > 0 && (
                      <div className="border-t border-gray-200 mt-1 pt-1 space-y-1">
                        {order.discounts.map((d, i) => (
                          <div key={i} className="flex justify-between text-xs text-red-500">
                            <span>{d.name}</span>
                            <span>-{formatYen(Math.abs(d.amount))}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={(e) => handleCopy(e, order)}
                    className={`text-xs px-2 py-1 rounded border whitespace-nowrap transition-colors flex-shrink-0 ${
                      copiedId === order.id
                        ? 'border-green-400 text-green-600 bg-green-50'
                        : 'border-gray-300 text-gray-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50'
                    }`}
                  >
                    {copiedId === order.id ? '✓ コピー済' : '📋 コピー'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

