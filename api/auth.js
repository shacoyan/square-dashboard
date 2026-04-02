/*** square-dashboard/api/auth.js ***/

module.exports = async (req, res) => {
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

    if (!password || password !== process.env.APP_PASSWORD) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const token = Buffer.from(password + ':' + Date.now()).toString('base64');

    return res.status(200).json({ token });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
};
