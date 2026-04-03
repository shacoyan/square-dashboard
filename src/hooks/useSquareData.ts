// src/hooks/useSquareData.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import type { Transaction, SalesData } from '../types';

interface UseSquareDataArgs {
  token: string;
  date: string;
  locationId: string;
  startHour: number;
  endHour: number;
}

interface SquareData {
  sales: SalesData | null;
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
}

export function useSquareData({ token, date, locationId, startHour, endHour }: UseSquareDataArgs): SquareData {
  const [sales, setSales] = useState<SalesData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    if (!locationId) return;

    setLoading(true);
    setError(null);

    try {
      const headers: HeadersInit = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      const params = new URLSearchParams({ date, location_id: locationId, start_hour: String(startHour), end_hour: String(endHour) });

      const [salesRes, transactionsRes] = await Promise.all([
        fetch(`/api/sales?${params}`, { headers }),
        fetch(`/api/transactions?${params}`, { headers }),
      ]);

      if (!salesRes.ok) {
        throw new Error(`売上データの取得に失敗しました (HTTP ${salesRes.status})`);
      }
      if (!transactionsRes.ok) {
        throw new Error(`取引データの取得に失敗しました (HTTP ${transactionsRes.status})`);
      }

      const salesData: SalesData = await salesRes.json();
      const transactionsData: { transactions: Transaction[] } = await transactionsRes.json();

      setSales(salesData);
      setTransactions(transactionsData.transactions ?? []);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [token, date, locationId, startHour, endHour]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    if (locationId) {
      intervalRef.current = setInterval(fetchData, 60000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [fetchData, locationId]);

  return {
    sales,
    transactions,
    loading,
    error,
    lastUpdated,
    refresh: fetchData,
  };
}
