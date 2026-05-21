import CustomerSegmentSection from '../CustomerSegmentSection';
import type { CustomerSegmentAnalysis, PeriodPreset, Transaction } from '../../types';

interface Props {
  data: CustomerSegmentAnalysis | null;
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
  period: PeriodPreset;
  onPeriodChange: (p: PeriodPreset) => void;
  weekIndex: number;
  onWeekIndexChange: (n: number) => void;
  availableWeeks: number;
  quarterIndex: number;
  onQuarterIndexChange: (n: number) => void;
  startHour?: number;
  endHour?: number;
  // Phase 3 Team B: 2 段階ロード対応 (optional pass-through)
  detailAvailable?: boolean;
  detailLoading?: boolean;
  detailError?: string | null;
}

export default function SegmentTabPanel({
  data,
  transactions,
  loading,
  error,
  period,
  onPeriodChange,
  weekIndex,
  onWeekIndexChange,
  availableWeeks,
  quarterIndex,
  onQuarterIndexChange,
  startHour,
  endHour,
  detailAvailable,
  detailLoading,
  detailError,
}: Props) {
  return (
    <CustomerSegmentSection
      data={data}
      transactions={transactions}
      loading={loading}
      error={error}
      period={period}
      onPeriodChange={onPeriodChange}
      weekIndex={weekIndex}
      onWeekIndexChange={onWeekIndexChange}
      availableWeeks={availableWeeks}
      quarterIndex={quarterIndex}
      onQuarterIndexChange={onQuarterIndexChange}
      startHour={startHour}
      endHour={endHour}
      detailAvailable={detailAvailable}
      detailLoading={detailLoading}
      detailError={detailError}
    />
  );
}
