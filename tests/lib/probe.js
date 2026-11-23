/* Diagnostic probe, not a pass/fail test: prints what each listening check hears for a set of sounds.
   Usage: node tests/lib/probe.js [path-to-a-16-bit-mono.wav]   (the WAV is optional, e.g. a recording of talking) */
const H = require('./audio-harness');

function onsets(samples) { let n = 0; const ts = []; H.feed(samples, (fr) => { if (fr.onset) { n++; ts.push(Math.round(fr.t)); } }); return { n, ts }; }
function tuner(samples) {
  const c = H.makeCheck({ k: 'tune' }); let moved = 0, frames = 0;
  H.feed(samples, (fr) => { c.feed(fr); frames++; if (c.cur) moved++; });
  return { needleFrames: moved, frames, stringsOk: c.ok.filter(Boolean).length };
}

const cases = {
  'quiet room (noise rms 0.002)': H.noise(20, 0.002),
  'noisy room (noise rms 0.010)': H.noise(20, 0.010),
  'loud fan (noise rms 0.030)': H.noise(20, 0.030),
  'mains hum': H.mix(H.hum(20, 0.02), H.noise(20, 0.003)),
  'voice-like, talking': H.mix(H.voice(20, 0.05), H.noise(20, 0.003)),
  '12 desk taps': H.mix(H.taps(20, Array.from({ length: 12 }, (_, i) => 2 + i * 1.2), 0.3), H.noise(20, 0.003)),
  '16 real strums of G': H.mix(H.strums(20, Array.from({ length: 16 }, (_, i) => ({ at: 2 + i * 0.8, chord: 'G' }))), H.noise(20, 0.003)),
  '16 quiet strums of G in a noisy room': H.mix(H.strums(20, Array.from({ length: 16 }, (_, i) => ({ at: 2 + i * 0.8, chord: 'G' })), 0.05), H.noise(20, 0.010)),
  '16 strums of G while counting aloud': H.mix(H.strums(20, Array.from({ length: 16 }, (_, i) => ({ at: 2 + i * 0.8, chord: 'G' }))), H.voice(20, 0.03), H.noise(20, 0.003)),
};
if (process.argv[2]) cases['recording: ' + process.argv[2].split('/').pop()] = H.readWav(process.argv[2]);

for (const [name, s] of Object.entries(cases)) {
  H.reseed(777);
  const o = onsets(s), t = tuner(s);
  const strum = H.runCheck({ k: 'strum', n: 16, even: true, chords: ['G'] }, s);
  console.log(`${name.padEnd(42)} onsets ${String(o.n).padStart(3)} | strum check ${String(strum.times.length).padStart(2)}/16 | tuner needle ${String(t.needleFrames).padStart(3)}/${t.frames} frames, strings ok ${t.stringsOk}`);
}
