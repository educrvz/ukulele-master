/* Offline stand-in for the browser microphone, for Node tests.
   Loads the app's own dsp.js / data.js / mic.js, turns an array of samples into the same frames the browser
   produces (Blackman-windowed FFT magnitudes like an AnalyserNode, every 30 ms), and feeds them to a check.
   Also synthesises test signals: room noise, a voice-like sound, taps, and plucked-string ukulele strums. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
globalThis.window = globalThis;
for (const f of ['js/dsp.js', 'js/data.js', 'js/mic.js']) vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
const { DSP, UKE, makeCheck } = globalThis;

const SR = 48000, HOP = Math.round(SR * 0.03), N1 = 2048, N2 = 8192;

function fftMag(x, n) {
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) { // Blackman window, as the Web Audio AnalyserNode applies
    const w = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / n) + 0.08 * Math.cos((4 * Math.PI * i) / n);
    re[i] = x[i] * w;
  }
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const t = re[i]; re[i] = re[j]; re[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
  const mag = new Float32Array(n / 2);
  for (let k = 0; k < n / 2; k++) mag[k] = Math.hypot(re[k], im[k]) / n;
  return mag;
}

/* Calls onFrame for every 30 ms of `samples` (Float32Array at 48 kHz), exactly as js/mic.js does live. */
function feed(samples, onFrame) {
  const an = new DSP.FrameAnalyzer(SR, N1);
  for (let end = N2; end <= samples.length; end += HOP) {
    const tbuf = samples.subarray(end - N1, end);
    const mag1 = fftMag(tbuf, N1);
    const t = ((end - N2) / SR) * 1000;
    onFrame(an.frame(tbuf, mag1, t, () => DSP.chroma(fftMag(samples.subarray(end - N2, end), N2), SR, N2)));
  }
}
function runCheck(spec, samples) {
  const c = makeCheck(spec);
  feed(samples, (fr) => { if (!c.done) c.feed(fr); });
  return c;
}

// ───────── signals (all deterministic)
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 - 0.5; };
const reseed = (s) => { seed = s; };
const silence = (sec) => new Float32Array(Math.round(sec * SR));
function noise(sec, rms) { const o = silence(sec), g = rms * Math.sqrt(12); for (let i = 0; i < o.length; i++) o[i] = rnd() * g; return o; }
function mix(...parts) { const n = Math.max(...parts.map((p) => p.length)), o = new Float32Array(n); for (const p of parts) for (let i = 0; i < p.length; i++) o[i] += p[i]; return o; }
function concat(...parts) { const o = new Float32Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { o.set(p, at); at += p.length; } return o; }
const gain = (x, g) => x.map((v) => v * g);

/* One plucked string (Karplus-Strong) written into `out` starting at sample `at`. */
function pluck(out, at, midi, amp, sec) {
  const f = DSP.midiToFreq(midi), len = Math.round(SR / f), line = new Float32Array(len);
  for (let i = 0; i < len; i++) line[i] = rnd() * 2;
  let lp = 0; for (let i = 0; i < len; i++) { lp = 0.5 * lp + 0.5 * line[i]; line[i] = lp; } // soften the pick
  const n = Math.min(out.length - at, Math.round(sec * SR));
  for (let i = 0, p = 0; i < n; i++) {
    const nx = (p + 1) % len, v = line[p];
    line[p] = 0.4985 * (v + line[nx]);
    out[at + i] += v * amp;
    p = nx;
  }
}
/* Strums of the given chords: [{at: seconds, chord: id}], each string 12 ms after the previous one. */
function strums(sec, list, amp) {
  const o = silence(sec), fade = Math.round(0.02 * SR);
  for (const s of list.slice().sort((a, b) => a.at - b.at)) {
    // A new strum re-plucks the strings: whatever was still ringing is stopped by the hand, not added to.
    const at = Math.round(s.at * SR);
    for (let i = 0; i < fade && at + i < o.length; i++) o[at + i] *= 1 - i / fade;
    o.fill(0, Math.min(o.length, at + fade));
    UKE.CHORDS[s.chord].midi.forEach((m, i) => pluck(o, Math.round((s.at + i * 0.012) * SR), m, amp || 0.12, s.ring || 1.2));
  }
  return o;
}
/* Single plucked notes at an exact pitch (harmonics that fade, higher ones faster). Karplus-Strong above is a
   few cents off because its delay is a whole number of samples; fine for chords, not for testing a tuner. */
function pluckedNotes(sec, list, amp) {
  const o = silence(sec);
  for (const s of list) {
    const f = DSP.midiToFreq(s.midi), at = Math.round(s.at * SR), n = Math.min(o.length - at, Math.round((s.ring || 1.5) * SR));
    for (let i = 0; i < n; i++) {
      const t = i / SR; let v = 0;
      for (let h = 1; h <= 6; h++) v += (Math.sin(2 * Math.PI * f * h * t) / h) * Math.exp(-t * (1.6 + 0.9 * h));
      o[at + i] += v * (amp || 0.2) * Math.min(1, i / 96);
    }
  }
  return o;
}
/* Voice-like: a buzzy pulse train with a gliding pitch, two moving resonances and a syllable rhythm. */
/* With `beats` (seconds), it only speaks a short syllable on each beat, like counting "one, two, three, four". */
function voice(sec, rms, beats) {
  const o = silence(sec);
  let ph = 0, y1 = [0, 0], y2 = [0, 0];
  const reson = (x, st, fc, q) => { const w = (2 * Math.PI * fc) / SR, r = Math.exp(-w / (2 * q)); const y = x + 2 * r * Math.cos(w) * st[0] - r * r * st[1]; st[1] = st[0]; st[0] = y; return y; };
  for (let i = 0; i < o.length; i++) {
    const t = i / SR;
    const f0 = 125 + 30 * Math.sin(2 * Math.PI * 0.7 * t) + 12 * Math.sin(2 * Math.PI * 2.3 * t);
    ph += f0 / SR; let src = 0;
    if (ph >= 1) { ph -= 1; src = 1; }
    let env;
    if (beats) { env = 0; for (const b of beats) { const d = t - b; if (d >= 0 && d < 0.25) { env = Math.sin((Math.PI * d) / 0.25) ** 0.5; break; } } }
    else env = Math.max(0, Math.sin(2 * Math.PI * 3.1 * t)) ** 0.6 * (Math.sin(2 * Math.PI * 0.23 * t) > -0.6 ? 1 : 0);
    const v = reson(src, y1, 600 + 250 * Math.sin(2 * Math.PI * 1.3 * t), 6) + 0.6 * reson(src, y2, 1500 + 500 * Math.sin(2 * Math.PI * 0.9 * t), 8);
    o[i] = v * env + rnd() * 0.02 * env;
  }
  const r = DSP.rms(o) || 1;
  return gain(o, rms / r);
}
/* Short broadband clicks (tapping the desk or the phone). */
function taps(sec, times, amp) {
  const o = silence(sec);
  for (const t of times) { const at = Math.round(t * SR); for (let i = 0; i < 0.012 * SR && at + i < o.length; i++) o[at + i] += rnd() * 2 * (amp || 0.3) * Math.exp(-i / (0.002 * SR)); }
  return o;
}
/* Mains hum plus a steady fan tone. */
function hum(sec, amp) { const o = silence(sec); for (let i = 0; i < o.length; i++) o[i] = amp * (Math.sin((2 * Math.PI * 60 * i) / SR) + 0.5 * Math.sin((2 * Math.PI * 180 * i) / SR) + 0.3 * Math.sin((2 * Math.PI * 240 * i) / SR)); return o; }

/* Reads a 16-bit mono WAV and resamples it to 48 kHz (linear interpolation). */
function readWav(file) {
  const b = fs.readFileSync(file);
  let p = 12, rate = 16000, data = null;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4), size = b.readUInt32LE(p + 4);
    if (id === 'fmt ') rate = b.readUInt32LE(p + 12);
    if (id === 'data') { data = b.subarray(p + 8, p + 8 + size); break; }
    p += 8 + size + (size & 1);
  }
  const n = data.length >> 1, src = new Float32Array(n);
  for (let i = 0; i < n; i++) src[i] = data.readInt16LE(i * 2) / 32768;
  const out = new Float32Array(Math.floor((n * SR) / rate));
  for (let i = 0; i < out.length; i++) { const x = (i * rate) / SR, k = Math.floor(x), fr = x - k; out[i] = src[k] * (1 - fr) + (src[Math.min(n - 1, k + 1)] || 0) * fr; }
  return out;
}

module.exports = { DSP, UKE, makeCheck, SR, feed, runCheck, reseed, silence, noise, mix, concat, gain, strums, pluckedNotes, voice, taps, hum, readWav };
