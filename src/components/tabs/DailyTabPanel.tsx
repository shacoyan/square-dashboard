import SalesSummary from '../SalesSummary';
import OpenOrderList from '../OpenOrderList';
import TransactionList from '../TransactionList';
import type { OpenOrder, Transaction } from '../../types';
import type { SalesRangeYoYResult } from '../../lib/yoy';

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
  /** 前年同期比結果 (null 時は前年比表示なし) */
  yoy?: SalesRangeYoYResult | null;
  /** YoY 表示 ON/OFF (ControlBar トグル連動) */
  showYoy?: boolean;
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
  yoy,
  showYoy,
}: Props) {
  return (
    <div className="space-y-6">
      <SalesSummary
        total={salesTotal}
        count={salesCount}
        openTotal={openTotal}
        openCount={openCount}
        loading={loading}
        yoy={yoy}
        showYoy={showYoy}
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
