import { setCors, validateToken, squareHeaders, parseTimeRange } from './_shared.js';

export default async (req, res) => {
  if (setCors(req, res)) {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!validateToken(req)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { date, location_id, start_hour, end_hour } = req.query;

    if (!date || !location_id) {
      return res.status(400).json({ error: 'date and location_id are required' });
    }

    const { beginTimeJST, endTimeJST } = parseTimeRange({ date, start_hour, end_hour });

    let allPayments = [];
    let cursor = undefined;

    do {
      let url = `https://connect.squareup.com/v2/payments?begin_time=${encodeURIComponent(beginTimeJST)}&end_time=${encodeURIComponent(endTimeJST)}&location_id=${encodeURIComponent(location_id)}&limit=200`;

      if (cursor) {
        url += `&cursor=${encodeURIComponent(cursor)}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: squareHeaders()
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

    let totalAmount = 0;
    let transactionCount = 0;

    for (const payment of allPayments) {
      if (payment.status === 'COMPLETED') {
        totalAmount += payment.amount_money?.amount ?? 0;
        transactionCount++;
      }
    }

    return res.status(200).json({
      total_amount: totalAmount,
      transaction_count: transactionCount,
      currency: 'JPY'
    });
  } catch (error) {
    console.error('Error fetching sales:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
