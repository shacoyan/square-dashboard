function toJSTString(utcDateString) {
  return utcDateString; // ブラウザのtoLocaleTimeString('ja-JP')がJSTに変換する
}

export default async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const VALID_LABELS = new Set(['ALL', 'Goodbye', 'KITUNE', 'LR', 'moumou', '吸暮', '狛犬', '金魚']);
    const token = authHeader.split(' ')[1];
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const colonIdx = decoded.indexOf(':');
    const storeLabel = colonIdx !== -1 ? decoded.slice(0, colonIdx) : '';

    if (!VALID_LABELS.has(storeLabel)) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { date, location_id, start_hour, end_hour } = req.query;

    if (!date || !location_id) {
      return res.status(400).json({ error: 'date and location_id are required' });
    }

    const startHour = parseInt(start_hour ?? '0', 10);
    const endHour = end_hour !== undefined ? parseInt(end_hour, 10) : (startHour > 0 ? startHour - 1 : 23);
    const isNextDay = endHour < startHour;
    const endDate = isNextDay ? (() => {
      const d = new Date(date + 'T12:00:00+09:00');
      d.setDate(d.getDate() + 1);
      return d.toISOString().split('T')[0];
    })() : date;

    const beginTimeJST = `${date}T${String(startHour).padStart(2, '0')}:00:00+09:00`;
    const endTimeJST = `${endDate}T${String(endHour).padStart(2, '0')}:59:59.999+09:00`;

    let allPayments = [];
    let cursor = undefined;

    do {
      let url = `https://connect.squareup.com/v2/payments?begin_time=${encodeURIComponent(beginTimeJST)}&end_time=${encodeURIComponent(endTimeJST)}&location_id=${encodeURIComponent(location_id)}&limit=200`;

      if (cursor) {
        url += `&cursor=${encodeURIComponent(cursor)}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
          'Square-Version': '2024-01-18'
        }
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error('Square API error:', response.status, errorBody);
        return res.status(response.status).json({ error: 'Failed to fetch payments from Square API' });
      }

      const data = await response.json();

      if (data.payments) {
        allPayments = allPayments.concat(data.payments);
      }

      cursor = data.cursor || undefined;
    } while (cursor);

    // orders batch-retrieve
    const orderIds = [...new Set(
      allPayments.filter(p => p.order_id).map(p => p.order_id)
    )];

    const ordersMap = {};
    for (let i = 0; i < orderIds.length; i += 100) {
      const batch = orderIds.slice(i, i + 100);
      try {
        const orderRes = await fetch('https://connect.squareup.com/v2/orders/batch-retrieve', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
            'Square-Version': '2024-01-18'
          },
          body: JSON.stringify({ order_ids: batch })
        });
        if (orderRes.ok) {
          const orderData = await orderRes.json();
          for (const order of (orderData.orders ?? [])) {
            ordersMap[order.id] = order;
          }
        }
      } catch (e) {
        // batch失敗しても続行
      }
    }

    // customers bulk-retrieve
    const customerIds = [...new Set(
      allPayments.filter(p => p.customer_id).map(p => p.customer_id)
    )];
    const customersMap = {};
    for (let i = 0; i < customerIds.length; i += 100) {
      const batch = customerIds.slice(i, i + 100);
      try {
        const custRes = await fetch('https://connect.squareup.com/v2/customers/bulk-retrieve', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
            'Square-Version': '2024-01-18'
          },
          body: JSON.stringify({ customer_ids: batch })
        });
        if (custRes.ok) {
          const custData = await custRes.json();
          for (const [id, entry] of Object.entries(custData.responses ?? {})) {
            const c = entry.customer ?? entry;
            const given = c.given_name ?? '';
            const family = c.family_name ?? '';
            customersMap[id] = [family, given].filter(Boolean).join(' ') || null;
          }
        }
      } catch (e) { /* 失敗しても続行 */ }
    }

    const transactions = allPayments.map(payment => {
      const order = payment.order_id ? ordersMap[payment.order_id] : null;
      const lineItems = (order?.line_items ?? [])
        .filter(item => parseFloat(item.quantity) > 0)
        .map(item => ({
          name: item.name ?? '不明',
          quantity: item.quantity,
          amount: item.gross_sales_money?.amount ?? 0
        }));
      return {
        id: payment.id,
        created_at_jst: payment.created_at ? toJSTString(payment.created_at) : null,
        amount: payment.amount_money?.amount ?? 0,
        status: payment.status,
        source: payment.source_type ?? 'CARD',
        customer_name: payment.customer_id ? (customersMap[payment.customer_id] ?? null) : null,
        line_items: lineItems
      };
    });

    transactions.sort((a, b) => {
      if (!a.created_at_jst) return 1;
      if (!b.created_at_jst) return -1;
      return new Date(b.created_at_jst).getTime() - new Date(a.created_at_jst).getTime();
    });

    return res.status(200).json({ transactions });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
