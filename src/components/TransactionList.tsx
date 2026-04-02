// src/components/TransactionList.tsx

interface Transaction {
  id: string;
  created_at_jst: string;
  amount: number;
  status: string;
  source: string;
}

interface TransactionListProps {
  transactions: Transaction[];
  loading: boolean;
}

function formatYen(amount: number): string {
  return `¥${amount.toLocaleString()}`;
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
              <th className="text-left px-4 py-3 font-medium text-gray-500">ステータス</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => (
              <tr
                key={tx.id}
                className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition"
              >
                <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                  {tx.created_at_jst ? new Date(tx.created_at_jst).toLocaleTimeString('ja-JP') : '-'}
                </td>
                <td className="px-4 py-3 text-gray-900 font-semibold text-right whitespace-nowrap">
                  {formatYen(tx.amount)}
                </td>
                <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                  {tx.source}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <StatusBadge status={tx.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
