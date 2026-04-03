/**
 * api/_shared.js
 * Square Dashboard API 共通ユーティリティ
 */

const VALID_LABELS = new Set(['ALL', 'Goodbye', 'KITUNE', 'LR', 'moumou', '吸暮', '狛犬', '金魚']);

export function setCors(req, res, methods = 'GET, OPTIONS') {
  const origin = process.env.ALLOWED_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return req.method === 'OPTIONS';
}

export function validateToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  try {
    const token = authHeader.split(' ')[1];
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const colonIdx = decoded.indexOf(':');
    if (colonIdx === -1) return null;

    const storeLabel = decoded.slice(0, colonIdx);
    if (!VALID_LABELS.has(storeLabel)) return null;

    const timestamp = parseInt(decoded.slice(colonIdx + 1), 10);
    if (isNaN(timestamp) || Date.now() - timestamp > 24 * 60 * 60 * 1000) return null;

    return { storeLabel };
  } catch {
    return null;
  }
}

export function squareHeaders() {
  return {
    'Authorization': `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
    'Square-Version': '2024-01-18'
  };
}

export function parseTimeRange({ date, start_hour, end_hour }) {
  const startHour = parseInt(start_hour ?? '0', 10);
  const endHour = end_hour !== undefined ? parseInt(end_hour, 10) : (startHour > 0 ? startHour - 1 : 23);
  const isNextDay = endHour < startHour;
  const endDate = isNextDay ? (() => {
    const d = new Date(date + 'T12:00:00+09:00');
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  })() : date;

  return {
    beginTimeJST: `${date}T${String(startHour).padStart(2, '0')}:00:00+09:00`,
    endTimeJST: `${endDate}T${String(endHour).padStart(2, '0')}:59:59.999+09:00`
  };
}

export async function fetchCustomers(customerIds) {
  const customersMap = {};
  const uniqueIds = [...new Set(customerIds.filter(Boolean))];

  for (let i = 0; i < uniqueIds.length; i += 100) {
    const batch = uniqueIds.slice(i, i + 100);
    try {
      const res = await fetch('https://connect.squareup.com/v2/customers/bulk-retrieve', {
        method: 'POST',
        headers: squareHeaders(),
        body: JSON.stringify({ customer_ids: batch })
      });
      if (res.ok) {
        const data = await res.json();
        for (const [id, entry] of Object.entries(data.responses ?? {})) {
          const c = entry.customer ?? entry;
          const given = c.given_name ?? '';
          const family = c.family_name ?? '';
          customersMap[id] = [family, given].filter(Boolean).join(' ') || null;
        }
      }
    } catch { /* 失敗しても続行 */ }
  }

  return customersMap;
}
