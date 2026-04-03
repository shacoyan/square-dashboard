import { useState, useEffect, useCallback, useRef } from 'react';
import type { OpenOrder } from '../types';

interface UseOpenOrdersArgs {
  token: string;
  locationId: string;
  date: string;
  startHour: number;
  endHour: number;
}

export function useOpenOrders({
  token,
  locationId,
  date,
  startHour,
  endHour,
}: UseOpenOrdersArgs) {
  const [orders, setOrders] = useState<OpenOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    if (!locationId) return;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        location_id: locationId,
        date,
        start_hour: String(startHour),
        end_hour: String(endHour),
      });
      const res = await fetch(`/api/open-orders?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error(`未決済伝票の取得に失敗 (HTTP ${res.status})`);
      }

      const data = await res.json();
      setOrders(data.orders ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '取得エラー');
    } finally {
      setLoading(false);
    }
  }, [token, locationId, date, startHour, endHour]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    if (locationId) {
      intervalRef.current = setInterval(fetchData, 30000);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchData, locationId]);

  return { orders, loading, error, refresh: fetchData };
}
