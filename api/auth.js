export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'パスワードが必要です' });
  }

  if (password === process.env.APP_PASSWORD) {
    const token = Buffer.from(`${password}:${Date.now()}`).toString('base64');
    return res.json({ token });
  } else {
    return res.status(401).json({ error: 'パスワードが正しくありません' });
  }
}
