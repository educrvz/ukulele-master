const { searchSongs } = require('../lib/chord-source');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, max-age=120');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const query = String(req.query?.q || '').trim().slice(0, 100);
  if (query.length < 2) return res.status(400).json({ error: 'Enter at least two characters' });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try { return res.status(200).json({ songs: await searchSongs(query, controller.signal) }); }
  catch { return res.status(502).json({ error: 'Song suggestions unavailable' }); }
  finally { clearTimeout(timeout); }
};
