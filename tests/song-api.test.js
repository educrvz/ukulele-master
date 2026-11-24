const assert = require('node:assert/strict');
const handler = require('../api/song');

function reply() {
  return { headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}
const html = (data) => `<div data-content="${JSON.stringify({ store: { page: { data } } }).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></div>`;

(async () => {
  const source = 'https://tabs.ultimate-guitar.com/tab/bob-marley/three-little-birds-chords-166605';
  global.fetch = async (url) => {
    if (String(url).includes('/search.php')) return { ok: true, text: async () => html({ results: [{ type: 'Chords', tab_url: source, song_name: 'Three Little Birds', artist_name: 'Bob Marley', votes: 8000 }] }) };
    assert.equal(url, source);
    return { ok: true, text: async () => html({ tab: { song_name: 'Three Little Birds', artist_name: 'Bob Marley', tonality_name: 'A' }, tab_view: { wiki_tab: { content: '[Chorus][ch]A[/ch] [ch]D[/ch] [ch]A[/ch][Verse][ch]A[/ch] [ch]E[/ch] [ch]D[/ch] [ch]A[/ch]' } } }) };
  };
  const res = reply();
  await handler({ method: 'POST', body: { title: "Three little bird's", artist: 'Bom markey' } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.song.title, 'Three Little Birds');
  assert.equal(res.body.song.source, source);
  assert.deepEqual(res.body.song.sections[0].chords, ['C', 'F', 'C']);
  assert.deepEqual(res.body.song.sections[1].chords, ['C', 'G', 'F', 'C']);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  process.env.AI_GATEWAY_API_KEY = 'test-only';
  global.fetch = async (url, options) => {
    if (String(url).includes('/search.php')) throw Error('Source unavailable');
    assert.equal(url, 'https://ai-gateway.vercel.sh/v1/responses');
    assert.equal(options.headers.Authorization, 'Bearer test-only');
    const request = JSON.parse(options.body);
    assert.equal(request.model, 'openai/gpt-5-mini');
    assert.equal(request.tools[0].type, 'web_search');
    assert.equal(request.reasoning.effort, 'low');
    return { ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ title: 'Rainbow Connection', artist: 'Kermit the Frog', source: 'https://example.org/rainbow-connection', sections: [{ name: 'Verse', chords: ['C', 'F', 'G'] }] }) }] }] }) };
  };
  const fallback = reply();
  await handler({ method: 'POST', body: { title: 'Rainbow Connection', artist: 'Kermit the Frog' } }, fallback);
  assert.equal(fallback.code, 200);
  assert.equal(fallback.body.song.title, 'Rainbow Connection');
  console.log('Sourced song lookup and model fallback contracts passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
