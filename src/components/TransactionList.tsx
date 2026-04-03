import { useState, Fragment } from 'react';

interface LineItem {
  name: string;
  quantity: string;
  amount: number;
  category?: string | null;
}

interface Transaction {
  id: string;
  customer_name: string | null;
  created_at_jst: string;
  amount: number;
  status: string;
  source: string;
  line_items: LineItem[];
}

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

function formatYen(amount: number): string {
  return `¥${amount.toLocaleString()}`;
}

function buildCopyText(items: LineItem[]): string {
  const sorted = mergeLineItems(items)
    .sort((a, b) => getCategoryRank(a.category) - getCategoryRank(b.category));
  const lines = sorted.map(item =>
    `${item.name} × ${item.quantity}  ${item.amount > 0 ? formatYen(item.amount) : '¥0'}`
  );
  const total = sorted.reduce((sum, item) => sum + item.amount, 0);
  return lines.join('\n') + '\n---\n合計: ' + formatYen(total);
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
    const text = buildCopyText(tx.line_items);
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
      <div className="bg-white rounded-xl shadow p-6 text-center text-gray-400">
        読み込み中...
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow p-6 text-center text-gray-400">
        取引がありません
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-medium text-gray-500">時刻</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500">金額</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">支払い方法</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">顧客</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">ステータス</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => (
              <Fragment key={tx.id}>
                <tr
                  className={`border-b border-gray-100 last:border-0 hover:bg-gray-50 transition ${tx.line_items.length > 0 ? 'cursor-pointer' : ''}`}
                  onClick={() => tx.line_items.length > 0 && toggleExpand(tx.id)}
                >
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      {tx.line_items.length > 0 && (
                        <span className="text-gray-400">
                          {expandedIds.has(tx.id) ? '▼' : '▶'}
                        </span>
                      )}
                      {tx.created_at_jst ? new Date(tx.created_at_jst).toLocaleTimeString('ja-JP') : '-'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-900 font-semibold text-right whitespace-nowrap">
                    {formatYen(tx.amount)}
                  </td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                    {tx.source}
                  </td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                    {tx.customer_name ?? '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusBadge status={tx.status} />
                  </td>
                </tr>
                {expandedIds.has(tx.id) && tx.line_items.length > 0 && (
                  <tr className="bg-indigo-50">
                    <td colSpan={5} className="px-6 py-2">
                      <div className="flex justify-between items-start">
                        <ul className="space-y-1 flex-1">
                          {mergeLineItems(tx.line_items)
                            .sort((a, b) => getCategoryRank(a.category) - getCategoryRank(b.category))
                            .map((item, i) => (
                            <li key={i} className="flex justify-between text-xs text-gray-700">
                              <span className="flex items-center gap-1.5">
                                <span className="text-gray-400">[{item.category ?? '未分類'}]</span>
                                <span>{item.name} × {item.quantity}</span>
                              </span>
                              <span className="font-medium">{item.amount > 0 ? formatYen(item.amount) : '¥0'}</span>
                            </li>
                          ))}
                        </ul>
                        <button
                          onClick={(e) => handleCopy(e, tx)}
                          className="ml-4 text-xs text-gray-400 hover:text-gray-600 whitespace-nowrap"
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
    </div>
  );
}
