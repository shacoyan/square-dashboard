const SQUARE_BASE_URL = 'https://connect.squareup.com';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: '認証が必要です' });
  }

  const accessToken = process.env.SQUARE_ACCESS_TOKEN;
  if (!accessToken) {
    return res.status(500).json({ error: 'Square APIトークンが設定されていません' });
  }

  try {
    const response = await fetch(`${SQUARE_BASE_URL}/v2/locations`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Square-Version': '2024-01-18',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      return res.status(response.status).json({
        error: 'Square APIエラー',
        details: errorData,
      });
    }

    const data = await response.json();
    const locations = (data.locations || []).map((loc) => ({
      id: loc.id,
      name: loc.name,
      address: loc.address,
      status: loc.status,
    }));

    return res.json({ locations });
  } catch (error) {
    console.error('locations error:', error);
    return res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
}
