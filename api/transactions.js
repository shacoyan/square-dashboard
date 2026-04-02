/*** square-dashboard/api/transactions.js ***/

function toJSTString(utcDateString) {
  return utcDateString; // ブラウザのtoLocaleTimeString('ja-JP')がJSTに変換する
}

module.exports = async (req, res) => {
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

    const token = authHeader.split(' ')[1];
    const decoded = Buffer.from(token, 'base64').toString('utf-8');

    if (!decoded.startsWith(process.env.APP_PASSWORD + ':')) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { date, location_id } = req.query;

    if (!date || !location_id) {
      return res.status(400).json({ error: 'date and location_id are required' });
    }

    const beginTimeJST = date + 'T00:00:00+09:00';
    const endTimeJST = date + 'T23:59:59.999+09:00';

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

    const transactions = allPayments.map(payment => ({
      id: payment.id,
      created_at_jst: payment.created_at ? toJSTString(payment.created_at) : null,
      amount: payment.amount_money?.amount ?? 0,
      status: payment.status,
      source: payment.source_type ?? 'CARD'
    }));

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
