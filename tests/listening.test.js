/* Regression tests for the microphone listening checks. No browser, no microphone: synthetic sound is pushed
   through the app's real dsp.js and mic.js. Run:  node tests/listening.test.js

   The bug these guard against (2026-11-23): the strum counter reached 16/16 with nobody playing, because steady
   room noise and talking were counted as strums; the tuner needle moved for a voice. */
const H = require('./lib/audio-harness');
let fails = 0;
function check(name, ok, detail) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || detail === undefined ? '' : ` — ${detail}`)); if (!ok) fails++; }

const every = (n, gap, start) => Array.from({ length: n }, (_, i) => (start || 2) + i * gap);
const gStrums = (n, gap, amp) => H.strums(4 + n * gap, every(n, gap).map((at) => ({ at, chord: 'G' })), amp);
const strumSpec = { k: 'strum', n: 16, even: true, chords: ['G'] };
const run = (spec, s) => { H.reseed(4242); return H.runCheck(spec, s); };
function needle(samples) { const c = H.makeCheck({ k: 'tune' }); let moved = 0; H.reseed(4242); H.feed(samples, (fr) => { c.feed(fr); if (c.cur) moved++; }); return { moved, ok: c.ok.filter(Boolean).length, pass: c.pass }; }

// ── nothing is playing: nothing may be counted
for (const [name, s] of [
  ['a quiet room', H.noise(20, 0.002)], ['a noisy room', H.noise(20, 0.010)], ['a loud fan', H.noise(20, 0.030)],
  ['mains hum', H.mix(H.hum(20, 0.02), H.noise(20, 0.003))],
  ['a room that gets louder', H.concat(H.noise(8, 0.004), H.noise(12, 0.02))],
  ['tapping on the desk', H.mix(H.taps(20, every(12, 1.2), 0.3), H.noise(20, 0.003))],
]) {
  const c = run(strumSpec, s);
  check(`strum counter stays at 0 in ${name}`, c.times.length === 0, `counted ${c.times.length}`);
  const t = needle(s);
  check(`tuner needle stays still in ${name}`, t.moved === 0 && t.ok === 0, `moved in ${t.moved} frames, ${t.ok} strings accepted`);
}

// ── talking: must not complete the exercise, must not tune a string
{
  const talk = H.mix(H.voice(20, 0.05), H.noise(20, 0.003));
  const c = run(strumSpec, talk);
  check('20 s of talking does not complete 16 strums', !c.done && c.times.length <= 3, `counted ${c.times.length}`);
  const t = needle(talk);
  check('talking does not move the tuner needle', t.moved === 0 && t.ok === 0, `moved in ${t.moved} frames`);
  const ch = run({ k: 'chords', seq: ['C', 'G', 'C', 'G'] }, talk);
  check('talking does not pass a chord-change check', !ch.pass);
}

// ── real playing must still be heard
{
  let c = run(strumSpec, H.mix(gStrums(16, 0.8), H.noise(18, 0.003)));
  check('16 even strums of G are counted and pass', c.pass && c.times.length === 16, `counted ${c.times.length}, pass ${c.pass}`);
  check('tempo is measured (about 75 per minute)', c.stats && Math.abs(c.stats.bpm - 75) < 3, c.stats && c.stats.bpm);

  c = run(strumSpec, H.mix(gStrums(16, 0.8, 0.05), H.noise(18, 0.010)));
  check('quiet strums in a noisy room are counted', c.times.length === 16, `counted ${c.times.length}`);

  c = run({ k: 'strum', n: 24, even: true, chords: ['C'] }, H.mix(H.strums(12, every(24, 0.3).map((at) => ({ at, chord: 'C' }))), H.noise(12, 0.003)));
  check('fast strums (0.3 s apart) are counted', c.times.length === 24, `counted ${c.times.length}`);

  // Counting "one, two, three, four" aloud, quietly, on the beat: every strum is still counted once.
  const beats = every(16, 0.8);
  const quietCount = H.mix(gStrums(16, 0.8), H.voice(18, 0.008, beats.map((b) => b + 0.02)), H.noise(18, 0.003));
  c = run({ k: 'strum', n: 40, chords: ['G'] }, quietCount);
  check('strumming while counting quietly on the beat: 16 strums, none extra', c.times.length === 16, `counted ${c.times.length}`);

  // Known limits, printed so they stay visible. A voice as loud as the ukulele, on top of the strum, blurs the
  // chord and hides some strums; non-stop talking over ringing strings can also add a few. The app therefore
  // asks the player to count in their head during a recorded strum check.
  c = run({ k: 'strum', n: 40, chords: ['G'] }, H.mix(gStrums(16, 0.8), H.voice(18, 0.03, beats.map((b) => b + 0.02)), H.noise(18, 0.003)));
  console.log(`INFO loud counting on the beat over 16 strums: counted ${c.times.length} (ideal 16)`);
  check('loud counting on the beat never adds strums', c.times.length <= 16, `counted ${c.times.length}`);
  c = run({ k: 'strum', n: 40, chords: ['G'] }, H.mix(gStrums(16, 0.8), H.voice(18, 0.03), H.noise(18, 0.003)));
  console.log(`INFO non-stop talking over 16 strums: counted ${c.times.length} (ideal 16)`);

  const uneven = [2, 2.5, 3.6, 4.0, 5.3, 5.8, 6.2, 7.5, 8.0, 9.4, 9.8, 10.3, 11.6, 12.0, 13.2, 13.7];
  c = run(strumSpec, H.mix(H.strums(18, uneven.map((at) => ({ at, chord: 'G' }))), H.noise(18, 0.003)));
  check('uneven strums are counted but do not pass the evenness test', c.done && !c.pass);

  c = run(strumSpec, H.mix(H.strums(18, every(16, 0.8).map((at) => ({ at, chord: 'Am' }))), H.noise(18, 0.003)));
  check('strumming the wrong chord (Am instead of G) does not complete it', !c.done, `counted ${c.times.length}`);
}

// ── every chord in the library is recognised as itself, so no lesson can become impossible
{
  const weak = [];
  for (const id of Object.keys(H.UKE.CHORDS)) {
    const c = run({ k: 'strum', n: 4, chords: [id] }, H.mix(H.strums(6, every(4, 0.8, 1.5).map((at) => ({ at, chord: id }))), H.noise(6, 0.003)));
    if (c.times.length !== 4) weak.push(`${id}:${c.times.length}`);
  }
  check('each of the 17 chords is counted when strummed', weak.length === 0, weak.join(' '));

  const bad = [];
  for (const d of H.UKE.DOSES) {
    if (!d.check || d.check.k !== 'chords') continue;
    const seq = d.check.seq, s = H.mix(H.strums(3 + seq.length * 1.2, seq.flatMap((ch, i) => [{ at: 1.5 + i * 1.2, chord: ch }, { at: 2.1 + i * 1.2, chord: ch }])), H.noise(3 + seq.length * 1.2, 0.003));
    if (!run(d.check, s).pass) bad.push(d.id);
  }
  check('every chord-sequence lesson passes when played correctly', bad.length === 0, 'doses ' + bad.join(' '));
  check('every strum lesson knows its chords', H.UKE.DOSES.filter((d) => d.check && d.check.k === 'strum').every((d) => d.check.chords && d.check.chords.length));
}

// ── tuner and single notes
{
  const open = H.UKE.OPEN;
  let t = needle(H.mix(H.pluckedNotes(14, open.map((midi, i) => ({ at: 1.5 + i * 3, midi, ring: 2.8 }))), H.noise(14, 0.003)));
  check('four in-tune open strings pass the tuner', t.pass, `${t.ok} strings accepted`);
  t = needle(H.mix(H.pluckedNotes(14, open.map((midi, i) => ({ at: 1.5 + i * 3, midi: midi - 0.4, ring: 2.8 }))), H.noise(14, 0.003)));
  check('strings 40 cents flat move the needle but are not accepted', t.moved > 20 && t.ok === 0, `moved ${t.moved}, accepted ${t.ok}`);
  t = needle(H.mix(H.pluckedNotes(14, open.map((midi, i) => ({ at: 1.5 + i * 3, midi, ring: 2.8 })), 0.06), H.noise(14, 0.010)));
  check('the tuner still works in a noisy room', t.pass, `${t.ok} strings accepted`);

  const g = H.UKE.CHORDS.G.midi;
  let c = run({ k: 'strings', chord: 'G' }, H.mix(H.pluckedNotes(10, g.map((midi, i) => ({ at: 1.5 + i * 1.5, midi }))), H.noise(10, 0.003)));
  check('plucking the four strings of G in order passes', c.pass, `reached ${c.i}/4`);
  c = run({ k: 'strings', chord: 'G' }, H.mix(H.voice(15, 0.05), H.noise(15, 0.003)));
  check('talking does not pass a single-note check', !c.pass, `reached ${c.i}/4`);
}

console.log(fails ? `\n${fails} failure(s)` : '\nAll listening checks passed.');
process.exit(fails ? 1 : 0);
