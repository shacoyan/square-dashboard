import { useState, Fragment } from 'react';
import type { LineItem, Transaction, Discount } from '../types';
import { formatYen } from '../utils';
import { Card, EmptyState, Skeleton } from './ui';

interface TransactionListProps {
  transactions: Transaction[];
  loading: boolean;
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

function formatHHMM(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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

function StatusBadge({ status }: { status: string }) {
  let bgColor: string;
  let textColor: string;
  let label: string;

  switch (status) {
    case "COMPLETED":
      bgColor = "bg-green-100";
      textColor = "text-green-700";
      label = "成功";
      break;
    case "FAILED":
      bgColor = "bg-red-100";
      textColor = "text-red-700";
      label = "失敗";
      break;
    default:
      bgColor = "bg-gray-100";
      textColor = "text-gray-600";
      label = status;
  }

  return (
    <span
      className={`inline-block px-2.5 py-0.5 text-xs font-semibold rounded-full ${bgColor} ${textColor}`}
    >
      {label}
    </span>
  );
}

export default function TransactionList({
  transactions,
  loading,
}: TransactionListProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCopy = async (e: React.MouseEvent, tx: Transaction) => {
    e.stopPropagation();
    const text = buildCopyText(tx.line_items, tx.discounts);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(tx.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // clipboard API not available (e.g. non-HTTPS)
    }
  };

  if (loading) {
    return (
      <Card title="決済済み伝票" padded={false}>
        <div className="p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} width="100%" height={20} />
          ))}
        </div>
      </Card>
    );
  }

  if (transactions.length === 0) {
    return (
      <Card title="決済済み伝票" padded={false}>
        <EmptyState title="決済済み伝票はありません" />
      </Card>
    );
  }

  return (
    <Card title="決済済み伝票" padded={false}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="hidden md:table-header-group bg-surface-muted border-b border-border">
            <tr>
              <th scope="col" className="text-left px-4 py-3 font-medium text-text-muted">時刻</th>
              <th scope="col" className="text-right px-4 py-3 font-medium text-text-muted">金額</th>
              <th scope="col" className="text-left px-4 py-3 font-medium text-text-muted">支払い方法</th>
              <th scope="col" className="text-left px-4 py-3 font-medium text-text-muted">顧客</th>
              <th scope="col" className="text-left px-4 py-3 font-medium text-text-muted">ステータス</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => (
              <Fragment key={tx.id}>
                <tr
                  className={`block md:table-row border-b border-border md:border-t-0 md:border-b last:border-0 even:bg-surface-muted hover:bg-primary-subtle/50 transition-colors ${tx.line_items.length > 0 ? 'cursor-pointer' : ''}`}
                  onClick={() => tx.line_items.length > 0 && toggleExpand(tx.id)}
                >
                  <td className="block md:table-cell px-2 py-1 md:px-4 md:py-3 text-text-subtle whitespace-nowrap">
                    <span className="inline-flex items-start gap-1">
                      {tx.line_items.length > 0 && (
                        <span className="text-text-muted mt-0.5">
                          {expandedIds.has(tx.id) ? '▼' : '▶'}
                        </span>
                      )}
                      <span className="flex flex-col leading-tight">
                        {tx.order_created_at_jst &&
                          formatHHMM(tx.order_created_at_jst) !== formatHHMM(tx.created_at_jst) && (
                          <span className="text-[10px] text-text-muted">
                            開始 {formatHHMM(tx.order_created_at_jst)}
                          </span>
                        )}
                        <span>
                          {tx.created_at_jst ? new Date(tx.created_at_jst).toLocaleTimeString('ja-JP') : '-'}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="block md:table-cell px-2 py-1 md:px-4 md:py-3 text-text font-semibold md:text-right whitespace-nowrap tabular-nums">
                    {formatYen(tx.amount)}
                  </td>
                  <td className="block md:table-cell px-2 py-1 md:px-4 md:py-3 text-text-subtle whitespace-nowrap">
                    {tx.source}
                  </td>
                  <td className="block md:table-cell px-2 py-1 md:px-4 md:py-3 text-text-subtle whitespace-nowrap">
                    {tx.customer_name ?? '-'}
                  </td>
                  <td className="block md:table-cell px-2 py-1 md:px-4 md:py-3 whitespace-nowrap">
                    <StatusBadge status={tx.status} />
                  </td>
                </tr>
                {expandedIds.has(tx.id) && tx.line_items.length > 0 && (
                  <tr className="block md:table-row bg-primary-subtle/40 border-b border-border last:border-0">
                    <td colSpan={5} className="block md:table-cell px-6 py-2 border-border">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <ul className="space-y-1">
                            {mergeLineItems(tx.line_items)
                              .sort((a, b) => getCategoryRank(a.category) - getCategoryRank(b.category))
                              .map((item, i) => (
                              <li key={i} className="flex justify-between text-xs text-text-subtle">
                                <span className="flex items-center gap-1.5">
                                  <span>{stripBrackets(item.name)} × {item.quantity}</span>
                                </span>
                                <span className="font-medium">{item.amount > 0 ? formatYen(item.amount) : '¥0'}</span>
                              </li>
                            ))}
                          </ul>
                          {tx.discounts && tx.discounts.length > 0 && (
                            <div className="border-t border-border mt-1 pt-1 space-y-1">
                              {tx.discounts.map((d, i) => (
                                <div key={i} className="flex justify-between text-xs text-danger">
                                  <span>{d.name}</span>
                                  <span>-{formatYen(Math.abs(d.amount))}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={(e) => handleCopy(e, tx)}
                          className="ml-4 text-xs text-text-subtle hover:text-text whitespace-nowrap"
                        >
                          {copiedId === tx.id ? '✓ コピー済' : 'コピー'}
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
    </Card>
  );
}
