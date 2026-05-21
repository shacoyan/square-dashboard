import { setCors, validateToken, parseRangeTimeRange, computeBusinessDate, fetchAllPayments, fetchOrdersBatch, fetchCatalogVariationCategoryMap, fetchCustomers, normalizePaymentsForReporting } from './_shared.js';

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
  if (setCors(req, res)) return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = validateToken(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { start_date, end_date, location_id, start_hour, end_hour } = req.query;
  if (!start_date || !end_date || !location_id) {
    return res.status(400).json({ error: 'start_date, end_date and location_id are required' });
  }

  if (!isValidDateStr(start_date) || !isValidDateStr(end_date)) {
    return res.status(400).json({ error: 'invalid_date', message: 'start_date / end_date must be valid YYYY-MM-DD' });
  }

  if (start_date > end_date) {
    return res.status(400).json({ error: 'invalid_date_range', message: 'start_date must be <= end_date' });
  }

  try {
    const startHour = parseInt(start_hour ?? '0', 10);
    const { beginTimeJST, endTimeJST } = parseRangeTimeRange({ start_date, end_date, start_hour, end_hour });
    const allPayments0 = await fetchAllPayments({ beginTimeJST, endTimeJST, location_id });

    // COMPLETED 抽出 + 返金正規化（Square Web レポート整合）
    const allPayments = normalizePaymentsForReporting(allPayments0);

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
          category: variationCategoryMap[item.catalog_object_id]?.name ?? null
        }));

      const tx = {
        id: payment.id,
        created_at_jst: payment.created_at ?? null,
        order_created_at_jst: order?.created_at ?? null,
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
