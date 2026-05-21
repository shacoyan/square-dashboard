import { parseRangeTimeRange, computeBusinessDate, fetchCustomers, setCors, validateToken, squareHeaders } from './_shared.js';

/**
 * 'YYYY-MM-DD' 形式かつ実在する日付か判定。
 *   '2026-02-31' のような Date round-trip で別日に化けるケースを弾く。
 *   (sales-range.js と同一実装)
 */
function isValidDateStr(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return false;
  const roundtrip = d.toISOString().slice(0, 10);
  return roundtrip === s;
}

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

    const { start_date, end_date, location_id, start_hour, end_hour } = req.query;
    if (!location_id) return res.status(400).json({ error: 'location_id is required' });
    if (!start_date) return res.status(400).json({ error: 'start_date is required' });
    if (!end_date) return res.status(400).json({ error: 'end_date is required' });

    if (!isValidDateStr(start_date) || !isValidDateStr(end_date)) {
      return res.status(400).json({ error: 'invalid_date', message: 'start_date / end_date must be valid YYYY-MM-DD' });
    }

    if (start_date > end_date) {
      return res.status(400).json({ error: 'invalid_date_range', message: 'start_date must be <= end_date' });
    }

    const startHourNum = parseInt(start_hour ?? '0', 10);

    const { beginTimeJST, endTimeJST } = parseRangeTimeRange({ start_date, end_date, start_hour, end_hour });

    let rawOrders = [];
    let cursor = undefined;

    do {
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
          limit: 500,
          cursor: cursor
        })
      });

      if (!response.ok) {
        const err = await response.text();
        return res.status(response.status).json({ error: 'Square API error', detail: err });
      }

      const data = await response.json();
      rawOrders = rawOrders.concat(data.orders ?? []);
      cursor = data.cursor ?? undefined;
    } while (cursor);

    // customers bulk-retrieve
    const customerIds = rawOrders.filter(o => o.customer_id).map(o => o.customer_id);
    const customersMap = await fetchCustomers(customerIds);

    // Business Date Grouping
    const byDate = {};

    rawOrders.forEach(order => {
      const businessDate = computeBusinessDate(order.created_at, startHourNum);

      const formattedOrder = {
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
          })),
        discounts: (order.discounts ?? []).map(d => ({
          name: d.name ?? '割引',
          amount: d.applied_money?.amount ?? 0
        }))
      };

      if (!byDate[businessDate]) {
        byDate[businessDate] = { orders: [] };
      }
      byDate[businessDate].orders.push(formattedOrder);
    });

    return res.status(200).json({ byDate });
  } catch (error) {
    console.error('Error fetching open orders range:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
