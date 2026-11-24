const assert = require('node:assert/strict');
const handler = require('../api/song');

function reply() {
  return { headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}

(async () => {
  const res = reply();
  process.env.AI_GATEWAY_API_KEY = 'test-only';
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://ai-gateway.vercel.sh/v1/responses');
    assert.equal(options.headers.Authorization, 'Bearer test-only');
    const request = JSON.parse(options.body);
    assert.equal(request.tools[0].type, 'web_search');
    assert.match(request.input, /Three little bird's/);
    return { ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ title: 'Three Little Birds', artist: 'Bob Marley & The Wailers', source: 'https://ukutabs.com/b/bob-marley/three-little-birds/', sections: [{ name: 'Chorus', chords: ['C', 'F', 'C'] }] }) }] }] }) };
  };
  await handler({ method: 'POST', body: { title: "Three little bird's", artist: 'Bom markey' } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.song.title, 'Three Little Birds');
  assert.equal(res.headers['Cache-Control'], 'no-store');
  console.log('Song lookup contract passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
