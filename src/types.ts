export interface Discount {
  name: string;
  amount: number;
}

export interface Location {
  id: string;
  name: string;
}

export interface LineItem {
  name: string;
  quantity: string;
  amount: number;
  category?: string | null;
}

export interface Transaction {
  id: string;
  customer_name: string | null;
  created_at_jst: string;
  amount: number;
  status: string;
  source: string;
  line_items: LineItem[];
  discounts: Discount[];
}

export interface OpenOrder {
  id: string;
  created_at: string | null;
  total_money: number;
  customer_name: string | null;
  line_items: LineItem[];
  discounts: Discount[];
}

export interface SalesData {
  total_amount: number;
  transaction_count: number;
  currency: string;
}

export type CustomerSegment = 'new' | 'repeat' | 'regular';
export type AcquisitionChannel = 'google' | 'review' | 'signboard' | 'sns' | 'unknown';

export interface SegmentBreakdown {
  new: number;
  repeat: number;
  regular: number;
}

export interface AcquisitionBreakdown {
  google: number;
  review: number;
  signboard: number;
  sns: number;
  unknown: number; // 打ち漏れ
}

export interface DailySegmentPoint {
  date: string; // YYYY-MM-DD (JST)
  new: number;
  repeat: number;
  regular: number;
}

export type PeriodPreset = 'today' | 'week' | 'month';

export interface CustomerSegmentAnalysis {
  period: PeriodPreset;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;   // YYYY-MM-DD
  elapsedDays: number;
  totalSales: number;
  totalCustomers: number;
  averageDailySales: number | null; // today のとき null
  overallAveragePerCustomer: number | null;
  customersBySegment: SegmentBreakdown;
  salesBySegment: SegmentBreakdown;
  acquisitionBreakdown: AcquisitionBreakdown; // 新規客のみ
  dailyTrend: DailySegmentPoint[];
}
