import CustomerSegmentSection from '../CustomerSegmentSection';
import type { CustomerSegmentAnalysis, PeriodPreset, Transaction } from '../../types';
import type { SalesRangeYoYResult } from '../../lib/yoy';

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
  // Phase 4 Team C: YoY pass-through (optional)
  yoy?: SalesRangeYoYResult | null;
  showYoY?: boolean;
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
  yoy,
  showYoY,
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
      yoy={yoy}
      showYoY={showYoY}
    />
  );
}
