import { useState, Fragment } from 'react';
import type { OpenOrder, LineItem, Discount } from '../types';
import { formatYen } from '../utils';
import { Card, Badge, EmptyState, ErrorState, Skeleton } from './ui';

interface Props {
  orders: OpenOrder[];
  loading: boolean;
  error: string | null;
}

const CATEGORY_ORDER = ['客タイプ', 'チャージ', 'シーシャ', 'ドリンク', 'フード'];
function getCategoryRank(category: string | null | undefined): number {
  if (!category) return CATEGORY_ORDER.length;
  const idx = CATEGORY_ORDER.findIndex(c => category.includes(c) || c.includes(category));
  return idx === -1 ? CATEGORY_ORDER.length : idx;
}

function normalizeName(name: string): string {
  return name
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF\u00A0\u3000\u2060]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function mergeLineItems(items: LineItem[]): LineItem[] {
  const map = new Map<string, { quantity: number; amount: number; originalName: string; merged: boolean }>();

  for (const item of items) {
    const key = normalizeName(item.name);
    const qty = parseFloat(item.quantity) || 0;
    if (map.has(key)) {
      const acc = map.get(key)!;
      acc.quantity = Math.round((acc.quantity + qty) * 1e10) / 1e10;
      acc.amount = Math.round((acc.amount + item.amount) * 1e10) / 1e10;
    } else {
      map.set(key, { quantity: qty, amount: item.amount, originalName: item.name.trim(), merged: false });
    }
  }

  return items
    .map((item) => {
      const key = normalizeName(item.name);
      const acc = map.get(key)!;
      if (!acc.merged) {
        acc.merged = true;
        return { ...item, name: acc.originalName, quantity: String(acc.quantity), amount: acc.amount };
      }
      return null;
    })
    .filter(Boolean) as LineItem[];
}

function stripBrackets(name: string): string {
  return name.replace(/[\[［][^\]］]*[\]］]/g, '').trim();
}

function buildCopyText(items: LineItem[], discounts?: Discount[]): string {
  const sorted = mergeLineItems(items)
    .sort((a, b) => getCategoryRank(a.category) - getCategoryRank(b.category));
  const lines = sorted.map(item =>
    `${stripBrackets(item.name)} × ${item.quantity}  ${item.amount > 0 ? formatYen(item.amount) : '¥0'}`
  );
  if (discounts && discounts.length > 0) {
    for (const d of discounts) {
      lines.push(`${d.name}  -${formatYen(Math.abs(d.amount))}`);
    }
  }
  return lines.join('\n');
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
    const text = buildCopyText(order.line_items, order.discounts);

    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(order.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // clipboard API not available
    }
  };

  const cardActions = !loading && !error ? <Badge tone="warning">{orders.length}件</Badge> : undefined;

  return (
    <Card title="未会計伝票" padded={false} actions={cardActions}>
      {loading && (
        <div className="p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} width="100%" height={20} />
          ))}
        </div>
      )}

      {error && (
        <ErrorState title="エラーが発生しました" description={error} />
      )}

      {!loading && !error && orders.length === 0 && (
        <EmptyState title="未会計の伝票はありません" description="営業時間中の未会計データはここに表示されます" />
      )}

      {!loading && !error && orders.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="hidden md:table-header-group bg-surface-muted border-b border-border">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-text-muted">時刻</th>
                <th scope="col" className="px-4 py-3 text-left text-text-muted">顧客</th>
                <th scope="col" className="px-4 py-3 text-right text-text-muted">金額</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <Fragment key={order.id}>
                  <tr
                    className="block md:table-row border-b border-border last:border-0 even:bg-surface-muted hover:bg-primary-subtle/50 transition-colors cursor-pointer"
                    onClick={() => toggle(order.id)}
                  >
                    <td className="block md:table-cell px-2 py-1 md:px-4 md:py-3">
                      <span className="text-text-muted text-xs mr-1">
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
                    </td>
                    <td className="block md:table-cell px-2 py-1 md:px-4 md:py-3">
                      {order.customer_name ? (
                        <Badge tone="warning">{order.customer_name}</Badge>
                      ) : (
                        <span className="text-text-muted">-</span>
                      )}
                    </td>
                    <td className="block md:table-cell px-2 py-1 md:px-4 md:py-3 md:text-right tabular-nums whitespace-nowrap font-semibold text-text">
                      {formatYen(order.total_money)}
                    </td>
                  </tr>

                  {expandedIds.has(order.id) && order.line_items.length > 0 && (
                    <tr className="bg-primary-subtle/40 block md:table-row">
                      <td colSpan={3} className="block md:table-cell px-4 py-2">
                        <div className="space-y-1">
                          {order.line_items.map((item, i) => (
                            <div
                              key={i}
                              className="flex justify-between text-xs text-text-muted"
                            >
                              <span>
                                {item.name} × {item.quantity}
                              </span>
                              <span>
                                {item.amount > 0 ? formatYen(item.amount) : '¥0'}
                              </span>
                            </div>
                          ))}
                        </div>
                        {order.discounts && order.discounts.length > 0 && (
                          <div className="border-t border-border mt-1 pt-1 space-y-1">
                            {order.discounts.map((d, i) => (
                              <div key={i} className="flex justify-between text-xs text-danger">
                                <span>{d.name}</span>
                                <span>-{formatYen(Math.abs(d.amount))}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="mt-2 text-right">
                          <button
                            onClick={(e) => handleCopy(e, order)}
                            className="text-xs text-text-subtle hover:text-text whitespace-nowrap"
                          >
                            {copiedId === order.id ? 'コピー済' : 'コピー'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
