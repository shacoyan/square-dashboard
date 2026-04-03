import { setCors, validateToken, squareHeaders, parseTimeRange, fetchCustomers } from './_shared.js';

export default async (req, res) => {
  if (setCors(req, res)) {
    return res.status(200).end();
  }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const authResult = validateToken(req);
    if (!authResult) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { location_id, date, start_hour, end_hour } = req.query;
    if (!location_id) return res.status(400).json({ error: 'location_id is required' });
    if (!date) return res.status(400).json({ error: 'date is required' });

    const { beginTimeJST, endTimeJST } = parseTimeRange({ date, start_hour, end_hour });

    const response = await fetch('https://connect.squareup.com/v2/orders/search', {
      method: 'POST',
      headers: squareHeaders(),
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
    const customerIds = rawOrders.filter(o => o.customer_id).map(o => o.customer_id);
    const customersMap = await fetchCustomers(customerIds);

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
