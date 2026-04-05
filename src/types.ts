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

