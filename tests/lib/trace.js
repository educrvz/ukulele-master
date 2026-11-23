/* Diagnostic: shows, for every strum candidate, the numbers the strum check judged it by
   (fit = how closely the sound matches the chord, after = loudness just after the attack relative to the attack).
   Usage: node tests/lib/trace.js [recording.wav] */
const H = require('./audio-harness');
const every = (n, gap) => Array.from({ length: n }, (_, i) => 2 + i * gap);
const beats = every(16, 0.8);
const g = (gap, amp) => H.strums(4 + 16 * gap, every(16, gap).map((at) => ({ at, chord: 'G' })), amp);
const cases = {
  'quiet G, noisy room': H.mix(g(0.8, 0.05), H.noise(18, 0.010)),
  'G + counting on the beat': H.mix(g(0.8), H.voice(18, 0.03, beats.map((b) => b + 0.02)), H.noise(18, 0.003)),
  'talking': H.mix(H.voice(20, 0.05), H.noise(20, 0.003)),
};
if (process.argv[2]) cases.recording = H.readWav(process.argv[2]);
for (const [name, s] of Object.entries(cases)) {
  for (const seed of [777, 4242]) {
    H.reseed(seed);
    const c = H.runCheck({ k: 'strum', n: 999, chords: ['G'] }, s);
    const ok = c.trace.filter((r) => r.ok), no = c.trace.filter((r) => !r.ok);
    const rng = (a, k) => (a.length ? `${Math.min(...a.map((r) => r[k])).toFixed(2)}–${Math.max(...a.map((r) => r[k])).toFixed(2)}` : '—');
    console.log(`${name} [seed ${seed}]: counted ${ok.length} (fit ${rng(ok, 'fit')}, after ${rng(ok, 'after')}) · rejected ${no.length} (fit ${rng(no, 'fit')}, after ${rng(no, 'after')})`);
    if (name.startsWith('G +') || name.startsWith('quiet')) for (const r of no) console.log(`    rejected at ${r.t} ms: fit ${r.fit} after ${r.after}`);
  }
}
