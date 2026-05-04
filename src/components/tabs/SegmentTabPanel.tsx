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
}

export default function SegmentTabPanel(props: Props) {
  return <CustomerSegmentSection {...props} />;
}
