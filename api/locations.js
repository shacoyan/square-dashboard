/*** square-dashboard/api/locations.js ***/

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

  const VALID_LABELS = new Set(['ALL', 'Goodbye', 'KITUNE', 'LR', 'moumou', '吸暮', '狛犬', '金魚']);

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const colonIdx = decoded.indexOf(':');
    const storeLabel = colonIdx !== -1 ? decoded.slice(0, colonIdx) : '';

    if (!VALID_LABELS.has(storeLabel)) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const response = await fetch('https://connect.squareup.com/v2/locations', {
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
      return res.status(response.status).json({ error: 'Failed to fetch locations from Square API' });
    }

    const data = await response.json();

    const allLocations = (data.locations || []).map(loc => ({
      id: loc.id,
      name: loc.name
    }));

    const locations = storeLabel === 'ALL'
      ? allLocations
      : allLocations.filter(loc => loc.name.includes(storeLabel));

    return res.status(200).json({ locations });
  } catch (error) {
    console.error('Error fetching locations:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
