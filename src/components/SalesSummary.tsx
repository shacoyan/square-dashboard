// src/components/SalesSummary.tsx
import { formatYen } from '../utils';

interface SalesSummaryProps {
  total: number;
  count: number;
  loading: boolean;
  openTotal: number;
  openCount: number;
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl shadow p-6 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-24 mb-3" />
      <div className="h-8 bg-gray-200 rounded w-32" />
    </div>
  );
}

export default function SalesSummary({
  total,
  count,
  loading,
  openTotal,
  openCount,
}: SalesSummaryProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  const grandTotal = total + openTotal;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="bg-white rounded-xl shadow p-6">
        <p className="text-sm font-medium text-gray-500 mb-1">合計売上（未決済含む）</p>
        <p className="text-2xl font-bold text-gray-900">{formatYen(grandTotal)}</p>
      </div>

      <div className="bg-white rounded-xl shadow p-6">
        <p className="text-sm font-medium text-gray-500 mb-1">決済済み（{count}件）</p>
        <p className="text-2xl font-bold text-gray-900">{formatYen(total)}</p>
      </div>

      <div className="bg-white rounded-xl shadow p-6">
        <p className="text-sm font-medium text-gray-500 mb-1">未決済（{openCount}件）</p>
        <p className="text-2xl font-bold text-amber-600">{formatYen(openTotal)}</p>
      </div>
    </div>
  );
}

