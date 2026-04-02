const SQUARE_BASE_URL = 'https://connect.squareup.com';

function toJSTDateRange(dateStr) {
  // dateStr: "YYYY-MM-DD" (JST)
  // Square APIはRFC3339形式のUTC時刻を受け付ける
  // JST = UTC+9なので、JSTの00:00はUTCの前日15:00
  const [year, month, day] = dateStr.split('-').map(Number);

  // 日付の開始 (JST 00:00:00 = UTC 前日 15:00:00)
  const startJST = new Date(Date.UTC(year, month - 1, day, -9, 0, 0));
  // 日付の終了 (JST 23:59:59 = UTC 当日 14:59:59)
  const endJST = new Date(Date.UTC(year, month - 1, day, 14, 59, 59));

  return {
    begin_time: startJST.toISOString(),
    end_time: endJST.toISOString(),
  };
}

async function fetchAllPayments(accessToken, locationId, beginTime, endTime) {
  const payments = [];
  let cursor = null;

  do {
    const params = new URLSearchParams({
      location_id: locationId,
      begin_time: beginTime,
      end_time: endTime,
      limit: '100',
    });
    if (cursor) {
      params.set('cursor', cursor);
    }

    const response = await fetch(`${SQUARE_BASE_URL}/v2/payments?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Square-Version': '2024-01-18',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw { status: response.status, details: errorData };
    }

    const data = await response.json();
    if (data.payments) {
      payments.push(...data.payments);
    }
    cursor = data.cursor || null;
  } while (cursor);

  return payments;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: '認証が必要です' });
  }

  const { date, location_id } = req.query;

  if (!date || !location_id) {
    return res.status(400).json({ error: 'date と location_id は必須です' });
  }

  const accessToken = process.env.SQUARE_ACCESS_TOKEN;
  if (!accessToken) {
    return res.status(500).json({ error: 'Square APIトークンが設定されていません' });
  }

  try {
    const { begin_time, end_time } = toJSTDateRange(date);
    const payments = await fetchAllPayments(accessToken, location_id, begin_time, end_time);

    // 完了した支払いのみ集計
    const completedPayments = payments.filter((p) => p.status === 'COMPLETED');

    const totalAmount = completedPayments.reduce((sum, p) => {
      return sum + (p.total_money?.amount || 0);
    }, 0);

    const summary = {
      date,
      total_amount: totalAmount, // 単位: 円（JPYは100で割らない）
      total_count: completedPayments.length,
      all_count: payments.length,
    };

    return res.json({ summary });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: 'Square APIエラー', details: error.details });
    }
    console.error('sales error:', error);
    return res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
}
