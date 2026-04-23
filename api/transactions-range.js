import { setCors, validateToken, parseRangeTimeRange, computeBusinessDate, fetchAllPayments, fetchOrdersBatch, fetchCatalogVariationCategoryMap, fetchCustomers } from './_shared.js';

export default async (req, res) => {
  if (setCors(req, res)) return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = validateToken(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { start_date, end_date, location_id, start_hour, end_hour } = req.query;
  if (!start_date || !end_date || !location_id) {
    return res.status(400).json({ error: 'start_date, end_date and location_id are required' });
  }

  try {
    const startHour = parseInt(start_hour ?? '0', 10);
    const { beginTimeJST, endTimeJST } = parseRangeTimeRange({ start_date, end_date, start_hour, end_hour });
    const allPayments0 = await fetchAllPayments({ beginTimeJST, endTimeJST, location_id });

    const completedPayments = allPayments0.filter(p => p.status === 'COMPLETED');

    const allPayments = completedPayments.flatMap(p => {
      const gross = p.amount_money?.amount ?? 0;
      const refunded = p.refunded_money?.amount ?? 0;
      if (refunded <= 0) return [p];
      if (refunded >= gross) return [];
      return [{ ...p, amount_money: { ...p.amount_money, amount: gross - refunded } }];
    });

    const orderIds = [...new Set(allPayments.filter(p => p.order_id).map(p => p.order_id))];
    const ordersMap = await fetchOrdersBatch(orderIds);

    const customerIds = allPayments.filter(p => p.customer_id).map(p => p.customer_id);

    const [customersMap, variationCategoryMap] = await Promise.all([
      fetchCustomers(customerIds),
      fetchCatalogVariationCategoryMap(ordersMap)
    ]);

    const byDate = {};

    for (const payment of allPayments) {
      const order = payment.order_id ? ordersMap[payment.order_id] : null;
      const lineItems = (order?.line_items ?? [])
        .filter(item => parseFloat(item.quantity) > 0)
        .map(item => ({
          name: item.name ?? '不明',
          quantity: item.quantity,
          amount: item.gross_sales_money?.amount ?? 0,
          category: variationCategoryMap[item.catalog_object_id] ?? null
        }));

      const tx = {
        id: payment.id,
        created_at_jst: payment.created_at ?? null,
        amount: payment.amount_money?.amount ?? 0,
        status: payment.status,
        source: payment.source_type ?? 'CARD',
        customer_name: payment.customer_id ? (customersMap[payment.customer_id] ?? null) : null,
        line_items: lineItems,
        discounts: (order?.discounts ?? []).map(d => ({ name: d.name ?? '割引', amount: d.applied_money?.amount ?? 0 }))
      };

      if (!payment.created_at) continue;

      const businessDate = computeBusinessDate(payment.created_at, startHour);
      if (!byDate[businessDate]) {
        byDate[businessDate] = { transactions: [] };
      }
      byDate[businessDate].transactions.push(tx);
    }

    for (const dateKey of Object.keys(byDate)) {
      byDate[dateKey].transactions.sort((a, b) => {
        if (!a.created_at_jst) return 1;
        if (!b.created_at_jst) return -1;
        return new Date(b.created_at_jst).getTime() - new Date(a.created_at_jst).getTime();
      });
    }

    return res.status(200).json({ byDate });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
