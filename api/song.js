const GATEWAY = 'https://ai-gateway.vercel.sh/v1/responses';
const MODEL = 'openai/gpt-5-mini';
const CHORDS = 'Am, F, C, G, Dm, Em, A7, G7, C7, D, A, E7, D7, Bb, Bm, B';
const { findSong } = require('../lib/chord-source');

function responseText(body) {
  return (body.output || []).flatMap((part) => part.type === 'message' ? part.content || [] : [])
    .filter((part) => part.type === 'output_text').map((part) => part.text).join('\n');
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const title = String(req.body?.title || '').trim().slice(0, 120);
  const artist = String(req.body?.artist || '').trim().slice(0, 100);
  if (!title) return res.status(400).json({ error: 'Song title required' });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    try {
      const sourced = await findSong(title, artist, controller.signal);
      if (sourced) return res.status(200).json({ song: sourced });
    } catch { /* Search site unavailable; try the model with web search. */ }
    if (!process.env.AI_GATEWAY_API_KEY) return res.status(404).json({ error: 'No reliable chord source found' });
    const result = await fetch(GATEWAY, {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        input: `Find a trustworthy, directly linked chord source for the song the learner typed: ${JSON.stringify({ title, artist })}. Search the web. Correct obvious spelling mistakes in the song and artist names. Return ONLY one JSON object, no markdown and no lyrics. Fields: title, artist, source (plain HTTPS URL to the actual chord page, not a search result), key, tempo (number, estimate if unknown), beats (3 or 4), optional strum, sections (array of {name, chords:[...]} in song order). Use only these ukulele chords: ${CHORDS}. Transpose if necessary and say the original key in originalKey. Preserve meaningful verse/chorus differences. Keep sections short. Never invent an arrangement or a source. If no reliable chord source is found, return {"error":"No reliable chord source found"}.`,
        tools: [{ type: 'web_search', search_context_size: 'low' }],
        reasoning: { effort: 'low' },
        max_output_tokens: 1600,
      }),
    });
    if (!result.ok) return res.status(502).json({ error: 'Song search unavailable' });
    const body = await result.json();
    const raw = responseText(body).trim().replace(/^```(?:json)?\s*|\s*```$/gi, '');
    const song = JSON.parse(raw);
    if (song.error || !song.title || !song.source || !Array.isArray(song.sections)) return res.status(404).json({ error: song.error || 'No reliable chord source found' });
    return res.status(200).json({ song });
  } catch {
    return res.status(502).json({ error: 'Song search unavailable' });
  } finally { clearTimeout(timeout); }
};
