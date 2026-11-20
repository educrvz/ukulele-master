/* Pure signal-processing helpers (no browser APIs) so they can be tested in Node. */
(function (root) {
  const DSP = {};

  DSP.rms = function (buf) {
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    return Math.sqrt(s / buf.length);
  };

  DSP.freqToMidi = (f) => 69 + 12 * Math.log2(f / 440);
  DSP.midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  /* McLeod-style pitch detection (normalised square difference). Range ~180–1200 Hz. */
  DSP.detectPitch = function (buf, sr) {
    const n = buf.length;
    const rms = DSP.rms(buf);
    if (rms < 0.003) return { freq: 0, clarity: 0, rms };
    const minLag = Math.max(2, Math.floor(sr / 1200));
    const maxLag = Math.min(Math.floor(sr / 180), (n >> 1) - 1);
    const nsdf = new Float32Array(maxLag + 2);
    for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
      let acf = 0, m = 0;
      for (let i = 0; i < n - lag; i++) {
        const a = buf[i], b = buf[i + lag];
        acf += a * b;
        m += a * a + b * b;
      }
      nsdf[lag] = m > 0 ? (2 * acf) / m : 0;
    }
    const peaks = [];
    let best = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      const v = nsdf[lag];
      if (v > 0 && v > nsdf[lag - 1] && v >= nsdf[lag + 1]) {
        peaks.push(lag);
        if (v > best) best = v;
      }
    }
    if (!peaks.length) return { freq: 0, clarity: 0, rms };
    const thr = best * 0.9;
    let lag = peaks[0];
    for (const p of peaks) if (nsdf[p] >= thr) { lag = p; break; }
    const a = nsdf[lag - 1], b = nsdf[lag], c = nsdf[lag + 1];
    const den = a - 2 * b + c;
    const shift = den !== 0 ? (0.5 * (a - c)) / den : 0;
    return { freq: sr / (lag + shift), clarity: b, rms };
  };

  /* 12-bin chroma from a linear magnitude spectrum. */
  DSP.chroma = function (mag, sr, fftSize) {
    const c = new Float32Array(12);
    const binHz = sr / fftSize;
    const k0 = Math.ceil(190 / binHz), k1 = Math.min(mag.length - 1, Math.floor(2200 / binHz));
    for (let k = k0; k <= k1; k++) {
      const midi = DSP.freqToMidi(k * binHz);
      const r = Math.round(midi);
      if (Math.abs(midi - r) < 0.38) c[((r % 12) + 12) % 12] += mag[k];
    }
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += c[i];
    if (sum > 0) for (let i = 0; i < 12; i++) c[i] /= sum;
    return c;
  };

  /* Expected chroma for a set of sounding MIDI notes (fundamental + 2nd, 3rd, 5th harmonics). */
  DSP.chordTemplate = function (midis) {
    const t = new Float32Array(12);
    for (const m of midis) {
      const pc = ((m % 12) + 12) % 12;
      t[pc] += 1;
      t[(pc + 7) % 12] += 0.22;
      t[(pc + 4) % 12] += 0.08;
    }
    return t;
  };

  DSP.cosine = function (a, b) {
    let ab = 0, aa = 0, bb = 0;
    for (let i = 0; i < a.length; i++) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
    return aa && bb ? ab / Math.sqrt(aa * bb) : 0;
  };

  /* Onset (strum / pluck) detector based on spectral flux of successive magnitude frames. */
  DSP.OnsetDetector = function (opts) {
    this.prev = null;
    this.lastT = -1e9;
    this.ratio = (opts && opts.ratio) || 0.3;
    this.refractory = (opts && opts.refractory) || 140;
    this.gate = (opts && opts.gate) || 0.006;
  };
  DSP.OnsetDetector.prototype.process = function (mag, rms, tMs, k0, k1) {
    let flux = 0, prevE = 0;
    if (this.prev) {
      for (let k = k0; k <= k1; k++) {
        const d = mag[k] - this.prev[k];
        if (d > 0) flux += d;
        prevE += this.prev[k];
      }
    } else {
      this.prev = new Float32Array(mag.length);
    }
    this.prev.set(mag);
    if (rms < this.gate) return false;
    if (tMs - this.lastT < this.refractory) return false;
    if (flux > this.ratio * prevE + 1e-4) { this.lastT = tMs; return true; }
    return false;
  };

  /* Evenness of a list of onset times (ms): returns {bpm, cv}. */
  DSP.pulseStats = function (times) {
    if (times.length < 3) return { bpm: 0, cv: 1 };
    const iv = [];
    for (let i = 1; i < times.length; i++) iv.push(times[i] - times[i - 1]);
    const mean = iv.reduce((a, b) => a + b, 0) / iv.length;
    const sd = Math.sqrt(iv.reduce((a, b) => a + (b - mean) * (b - mean), 0) / iv.length);
    return { bpm: 60000 / mean, cv: sd / mean };
  };

  root.DSP = DSP;
  if (typeof module !== 'undefined') module.exports = DSP;
})(typeof window !== 'undefined' ? window : globalThis);
