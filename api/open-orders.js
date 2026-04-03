
export default async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    const VALID_LABELS = new Set(['ALL', 'Goodbye', 'KITUNE', 'LR', 'moumou', '吸暮', '狛犬', '金魚']);
    const token = authHeader.split(' ')[1];
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const colonIdx = decoded.indexOf(':');
    const storeLabel = colonIdx !== -1 ? decoded.slice(0, colonIdx) : '';
    if (!VALID_LABELS.has(storeLabel)) return res.status(401).json({ error: 'Invalid token' });

    const { location_id, date, start_hour, end_hour } = req.query;
    if (!location_id) return res.status(400).json({ error: 'location_id is required' });
    if (!date) return res.status(400).json({ error: 'date is required' });

    const startHour = parseInt(start_hour ?? '0', 10);
    const endHour = end_hour !== undefined ? parseInt(end_hour, 10) : (startHour > 0 ? startHour - 1 : 23);
    const isNextDay = endHour < startHour;
    const endDate = isNextDay ? (() => { const d = new Date(date + 'T12:00:00+09:00'); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; })() : date;
    const beginTimeJST = `${date}T${String(startHour).padStart(2, '0')}:00:00+09:00`;
    const endTimeJST = `${endDate}T${String(endHour).padStart(2, '0')}:59:59.999+09:00`;

    const response = await fetch('https://connect.squareup.com/v2/orders/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'Square-Version': '2024-01-18'
      },
      body: JSON.stringify({
        location_ids: [location_id],
        query: {
          filter: {
            state_filter: { states: ['OPEN'] },
            date_time_filter: { created_at: { start_at: beginTimeJST, end_at: endTimeJST } }
          },
          sort: { sort_field: 'CREATED_AT', sort_order: 'DESC' }
        },
        limit: 50
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: 'Square API error', detail: err });
    }

    const data = await response.json();
    const rawOrders = data.orders ?? [];

    // customers bulk-retrieve
    const customerIds = [...new Set(
      rawOrders.filter(o => o.customer_id).map(o => o.customer_id)
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

    const orders = rawOrders.map(order => ({
      id: order.id,
      created_at: order.created_at ?? null,
      total_money: order.total_money?.amount ?? 0,
      customer_name: order.customer_id ? (customersMap[order.customer_id] ?? null) : null,
      line_items: (order.line_items ?? [])
        .filter(item => parseFloat(item.quantity) > 0)
        .map(item => ({
          name: item.name ?? '不明',
          quantity: item.quantity,
          amount: item.gross_sales_money?.amount ?? 0
        }))
    }));

    return res.status(200).json({ orders });
  } catch (error) {
    console.error('Error fetching open orders:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

