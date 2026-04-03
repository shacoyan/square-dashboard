import { setCors, validateToken, squareHeaders } from './_shared.js';

export default async (req, res) => {
  if (setCors(req, res)) {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authResult = validateToken(req);
    if (!authResult) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { storeLabel } = authResult;

    const response = await fetch('https://connect.squareup.com/v2/locations', {
      method: 'GET',
      headers: squareHeaders()
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
