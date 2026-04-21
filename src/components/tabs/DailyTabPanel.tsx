import SalesSummary from '../SalesSummary';
import OpenOrderList from '../OpenOrderList';
import TransactionList from '../TransactionList';
import type { OpenOrder, Transaction } from '../../types';

interface Props {
  salesTotal: number;
  salesCount: number;
  openTotal: number;
  openCount: number;
  loading: boolean;
  openOrders: OpenOrder[];
  openOrdersLoading: boolean;
  openOrdersError: string | null;
  transactions: Transaction[];
}

export default function DailyTabPanel({
  salesTotal,
  salesCount,
  openTotal,
  openCount,
  loading,
  openOrders,
  openOrdersLoading,
  openOrdersError,
  transactions,
}: Props) {
  return (
    <div className="space-y-6">
      <SalesSummary
        total={salesTotal}
        count={salesCount}
        openTotal={openTotal}
        openCount={openCount}
        loading={loading}
      />
      <OpenOrderList
        orders={openOrders}
        loading={openOrdersLoading}
        error={openOrdersError}
      />
      <TransactionList transactions={transactions} loading={loading} />
    </div>
  );
}
