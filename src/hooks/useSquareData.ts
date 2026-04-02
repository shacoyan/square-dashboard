import { useState, useEffect, useCallback, useRef } from 'react'

export interface Location {
  id: string
  name: string
  address?: {
    address_line_1?: string
    locality?: string
  }
  status: string
}

export interface SalesSummary {
  date: string
  total_amount: number
  total_count: number
  all_count: number
}

export interface Transaction {
  id: string
  created_at: string
  time_jst: string
  amount: number
  currency: string
  status: string
  payment_method: string
  receipt_number: string | null
  note: string | null
}

interface UseSquareDataReturn {
  locations: Location[]
  selectedLocationId: string
  setSelectedLocationId: (id: string) => void
  selectedDate: string
  setSelectedDate: (date: string) => void
  summary: SalesSummary | null
  transactions: Transaction[]
  loading: boolean
  error: string | null
  lastUpdated: Date | null
  refresh: () => void
}

function getTodayJST(): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date())
    .replace(/\//g, '-')
}

export function useSquareData(token: string): UseSquareDataReturn {
  const [locations, setLocations] = useState<Location[]>([])
  const [selectedLocationId, setSelectedLocationId] = useState<string>('')
  const [selectedDate, setSelectedDate] = useState<string>(getTodayJST())
  const [summary, setSummary] = useState<SalesSummary | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  }

  // 店舗一覧取得
  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const res = await fetch('/api/locations', { headers: authHeaders })
        const data = await res.json()
        if (res.ok && data.locations) {
          setLocations(data.locations)
          if (data.locations.length > 0 && !selectedLocationId) {
            setSelectedLocationId(data.locations[0].id)
          }
        } else {
          setError(data.error || '店舗情報の取得に失敗しました')
        }
      } catch {
        setError('店舗情報の取得中にエラーが発生しました')
      }
    }
    fetchLocations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // 売上データ取得
  const fetchSalesData = useCallback(async () => {
    if (!selectedLocationId || !selectedDate) return

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({ date: selectedDate, location_id: selectedLocationId })

      const [summaryRes, transactionsRes] = await Promise.all([
        fetch(`/api/sales?${params}`, { headers: authHeaders }),
        fetch(`/api/transactions?${params}`, { headers: authHeaders }),
      ])

      const [summaryData, transactionsData] = await Promise.all([
        summaryRes.json(),
        transactionsRes.json(),
      ])

      if (summaryRes.ok && summaryData.summary) {
        setSummary(summaryData.summary)
      } else {
        setError(summaryData.error || '売上データの取得に失敗しました')
      }

      if (transactionsRes.ok && transactionsData.transactions) {
        setTransactions(transactionsData.transactions)
      } else if (!transactionsRes.ok) {
        setError(transactionsData.error || '伝票データの取得に失敗しました')
      }

      setLastUpdated(new Date())
    } catch {
      setError('データの取得中にエラーが発生しました')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocationId, selectedDate, token])

  // 日付・店舗変更時にデータ再取得
  useEffect(() => {
    if (selectedLocationId) {
      fetchSalesData()
    }
  }, [fetchSalesData, selectedLocationId])

  // 60秒ごとの自動更新
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
    }
    if (selectedLocationId) {
      timerRef.current = setInterval(() => {
        fetchSalesData()
      }, 60000)
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [fetchSalesData, selectedLocationId])

  return {
    locations,
    selectedLocationId,
    setSelectedLocationId,
    selectedDate,
    setSelectedDate,
    summary,
    transactions,
    loading,
    error,
    lastUpdated,
    refresh: fetchSalesData,
  }
}
