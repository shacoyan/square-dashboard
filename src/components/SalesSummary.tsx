// src/components/SalesSummary.tsx

interface SalesSummaryProps {
  total: number;
  count: number;
  loading: boolean;
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl shadow p-6 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-24 mb-3" />
      <div className="h-8 bg-gray-200 rounded w-32" />
    </div>
  );
}

function formatYen(amount: number): string {
  return `¥${amount.toLocaleString()}`;
}

export default function SalesSummary({
  total,
  count,
  loading,
}: SalesSummaryProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="bg-white rounded-xl shadow p-6">
        <p className="text-sm font-medium text-gray-500 mb-1">本日の売上</p>
        <p className="text-2xl font-bold text-gray-900">{formatYen(total)}</p>
      </div>

      <div className="bg-white rounded-xl shadow p-6">
        <p className="text-sm font-medium text-gray-500 mb-1">取引件数</p>
        <p className="text-2xl font-bold text-gray-900">{count}件</p>
      </div>
    </div>
  );
}
