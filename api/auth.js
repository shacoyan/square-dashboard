/*** square-dashboard/api/auth.js ***/

const STORE_MAP = {
  'sababa_gb': 'Goodbye',
  'sababa_kitune': 'KITUNE',
  'sababa_lr': 'LR',
  'sababa_moumou': 'moumou',
  'sababa_souq': '吸暮',
  'sababa_komainu': '狛犬',
  'sababa_kingyo': '金魚',
};

export default async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { password } = req.body || {};

    let storeLabel = null;
    if (password && password === process.env.APP_PASSWORD) {
      storeLabel = 'ALL';
    } else if (password) {
      storeLabel = STORE_MAP[password] ?? null;
    }

    if (!storeLabel) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const token = Buffer.from(storeLabel + ':' + Date.now()).toString('base64');

    return res.status(200).json({ token });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
};
