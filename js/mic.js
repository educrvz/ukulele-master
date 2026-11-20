/* Microphone input, recording, and the listening checks that verify what was actually played. */
(function () {
  const U = window.UKE;

  const Mic = {
    stream: null, timer: null, rec: null, chunks: [],
    async start(onFrame, record) {
      const ctx = Snd.ensure();
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const src = ctx.createMediaStreamSource(this.stream);
      const a1 = ctx.createAnalyser(); a1.fftSize = 2048; a1.smoothingTimeConstant = 0;
      const a2 = ctx.createAnalyser(); a2.fftSize = 8192; a2.smoothingTimeConstant = 0;
      src.connect(a1); src.connect(a2);
      this.src = src;
      const sr = ctx.sampleRate;
      const tbuf = new Float32Array(a1.fftSize), db1 = new Float32Array(a1.frequencyBinCount), mag1 = new Float32Array(a1.frequencyBinCount);
      const db2 = new Float32Array(a2.frequencyBinCount), mag2 = new Float32Array(a2.frequencyBinCount);
      const onset = new DSP.OnsetDetector();
      const binHz = sr / a1.fftSize, k0 = Math.ceil(150 / binHz), k1 = Math.floor(5000 / binHz);
      const t0 = performance.now();
      this.timer = setInterval(() => {
        a1.getFloatTimeDomainData(tbuf);
        a1.getFloatFrequencyData(db1);
        for (let k = k0; k <= k1; k++) mag1[k] = Math.pow(10, db1[k] / 20);
        const p = DSP.detectPitch(tbuf, sr), t = performance.now() - t0;
        onFrame({
          t, rms: p.rms, clarity: p.clarity, freq: p.freq, midi: p.freq ? DSP.freqToMidi(p.freq) : 0,
          onset: onset.process(mag1, p.rms, t, k0, k1),
          chroma() {
            a2.getFloatFrequencyData(db2);
            for (let k = 0; k < mag2.length; k++) mag2[k] = Math.pow(10, db2[k] / 20);
            return DSP.chroma(mag2, sr, a2.fftSize);
          },
        });
      }, 30);
      this.chunks = [];
      if (record && window.MediaRecorder) {
        try {
          this.rec = new MediaRecorder(this.stream);
          this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
          this.rec.start();
        } catch (e) { this.rec = null; }
      }
    },
    /* Stops listening; resolves with the recorded audio Blob (or null). */
    stop() {
      clearInterval(this.timer); this.timer = null;
      return new Promise((res) => {
        const finish = (blob) => {
          if (this.src) { try { this.src.disconnect(); } catch (e) {} this.src = null; }
          if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
          this.stream = null; this.rec = null;
          res(blob);
        };
        if (this.rec && this.rec.state !== 'inactive') {
          this.rec.onstop = () => finish(new Blob(this.chunks, { type: this.rec.mimeType || 'audio/webm' }));
          this.rec.stop();
        } else finish(null);
      });
    },
    get on() { return !!this.timer; },
  };

  const voiced = (fr) => fr.midi && fr.clarity > 0.8 && fr.rms > 0.006;

  /* Tuner: every open string must sit within ±10 cents for about a quarter of a second. */
  function TuneCheck() {
    this.k = 'tune'; this.ok = [false, false, false, false]; this.hold = 0; this.cur = null; this.done = false; this.pass = false;
  }
  TuneCheck.prototype.feed = function (fr) {
    if (!voiced(fr)) { this.hold = 0; return; }
    let s = 0, best = 99;
    U.OPEN.forEach((m, i) => { const d = Math.abs(fr.midi - m); if (d < best) { best = d; s = i; } });
    if (best > 2.5) { this.cur = null; this.hold = 0; return; }
    const cents = (fr.midi - U.OPEN[s]) * 100;
    this.cur = { s, cents };
    if (Math.abs(cents) <= 10) { if (++this.hold >= 8) this.ok[s] = true; } else this.hold = 0;
    if (this.ok.every(Boolean)) this.done = this.pass = true;
  };
  TuneCheck.prototype.progress = function () { return this.ok.filter(Boolean).length / 4; };

  /* A sequence of single notes (also used to hear each string of a held chord). Pitch class must match. */
  function NotesCheck(midis) {
    this.k = 'notes'; this.seq = midis; this.i = 0; this.stable = 0; this.sawOnset = false; this.heard = null; this.done = false; this.pass = false;
  }
  NotesCheck.prototype.feed = function (fr) {
    if (this.done) return;
    if (fr.onset) this.sawOnset = true;
    const ok = voiced(fr);
    this.heard = ok ? Math.round(fr.midi) : null;
    const tgt = this.seq[this.i];
    const match = ok && U.pc(Math.round(fr.midi)) === U.pc(tgt) && Math.abs(fr.midi - Math.round(fr.midi)) < 0.45;
    const repeat = this.i > 0 && U.pc(this.seq[this.i - 1]) === U.pc(tgt);
    if (match && (!repeat || this.sawOnset)) {
      if (++this.stable >= 3) {
        this.i++; this.stable = 0; this.sawOnset = false;
        if (this.i >= this.seq.length) this.done = this.pass = true;
      }
    } else this.stable = 0;
  };
  NotesCheck.prototype.progress = function () { return this.i / this.seq.length; };

  /* Counts strums; optionally requires an even pulse. */
  function StrumCheck(n, even) {
    this.k = 'strum'; this.n = n; this.even = even; this.times = []; this.done = false; this.pass = false; this.stats = null;
  }
  StrumCheck.prototype.feed = function (fr) {
    if (this.done || !fr.onset) return;
    this.times.push(fr.t);
    if (this.times.length >= this.n) {
      this.stats = DSP.pulseStats(this.times);
      this.done = true;
      this.pass = !this.even || this.stats.cv < 0.3;
    }
  };
  StrumCheck.prototype.progress = function () { return Math.min(1, this.times.length / this.n); };

  /* A chord sequence. After each strum the sound is compared with the chords of this exercise. */
  function ChordsCheck(ids) {
    this.k = 'chords'; this.seq = ids; this.i = 0; this.hits = ids.map(() => 0); this.last = null; this.pending = null; this.done = false; this.pass = false;
    this.cands = [...new Set(ids)].map((id) => ({ id, t: DSP.chordTemplate(U.CHORDS[id].midi) }));
  }
  ChordsCheck.prototype.classify = function () {
    const p = this.pending; this.pending = null;
    if (!p || p.n < 2) return;
    let best = null, bs = -1;
    for (const c of this.cands) { const s = DSP.cosine(p.acc, c.t); if (s > bs) { bs = s; best = c.id; } }
    this.last = best;
    if (best === this.seq[this.i]) this.hits[this.i]++;
    else if (this.i + 1 < this.seq.length && best === this.seq[this.i + 1] && this.hits[this.i] > 0) { this.i++; this.hits[this.i] = 1; }
    if (this.i === this.seq.length - 1 && this.hits[this.i] >= 1) this.done = this.pass = true;
  };
  ChordsCheck.prototype.feed = function (fr) {
    if (this.done) return;
    if (fr.onset) { this.classify(); this.pending = { t: fr.t, acc: new Float32Array(12), n: 0 }; return; }
    const p = this.pending;
    if (p && fr.t - p.t >= 170 && fr.rms > 0.004) {
      const c = fr.chroma();
      for (let i = 0; i < 12; i++) p.acc[i] += c[i];
      if (++p.n >= 5) this.classify();
    }
  };
  ChordsCheck.prototype.progress = function () { return (this.i + (this.hits[this.i] > 0 ? 1 : 0)) / this.seq.length; };

  function makeCheck(spec) {
    if (spec.k === 'tune') return new TuneCheck();
    if (spec.k === 'strings') return new NotesCheck(U.CHORDS[spec.chord].midi);
    if (spec.k === 'notes') return new NotesCheck(spec.seq.map(([s, f]) => U.OPEN[s] + f));
    if (spec.k === 'strum') return new StrumCheck(spec.n, spec.even);
    return new ChordsCheck(spec.seq);
  }

  /* Recordings live in IndexedDB on this device only. */
  const Store = {
    db() {
      return new Promise((res, rej) => {
        const r = indexedDB.open('uke-master', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('rec', { keyPath: 'id' });
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
    },
    async put(rec) { const d = await this.db(); return new Promise((res) => { const tx = d.transaction('rec', 'readwrite'); tx.objectStore('rec').put(rec); tx.oncomplete = res; tx.onerror = res; }); },
    async all() { const d = await this.db(); return new Promise((res) => { const q = d.transaction('rec').objectStore('rec').getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); }); },
    async del(id) { const d = await this.db(); return new Promise((res) => { const tx = d.transaction('rec', 'readwrite'); tx.objectStore('rec').delete(id); tx.oncomplete = res; }); },
  };

  window.Mic = Mic;
  window.makeCheck = makeCheck;
  window.RecStore = Store;
})();
