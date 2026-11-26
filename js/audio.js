/* Recorded FreePats ukulele samples, with an explicit synth fallback, and play-along scheduler. */
(function () {
  const U = window.UKE;
  const PITCHES = [60, 62, 64, 66, 67, 69, 71, 73, 75, 77, 79, 81, 84];
  const FILES = ['C4', 'D4', 'E4', 'F#4', 'G4', 'A4', 'B4', 'C#5', 'D#5', 'F5', 'G5', 'A5', 'C6'];
  const TUNE_CENTS = [-5, -8, -2, -11, -1, 0, 0, 0, 3, 4, 6, 8, 4];
  const Snd = {
    ctx: null, samples: null, loading: null, mode: 'loading',
    ensure() {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.out = this.ctx.createGain();
        this.out.gain.value = 0.9;
        this.out.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },
    load() {
      if (this.loading) return this.loading;
      this.loading = (async () => {
        const c = this.ensure();
        try {
          const names = [...FILES, 'body-tap', 'chuck'];
          const buffers = await Promise.all(names.map(async (name) => {
            const res = await fetch(`audio/ukulele/${encodeURIComponent(name)}.mp3`);
            if (!res.ok) throw Error(`sample ${name}`);
            return c.decodeAudioData(await res.arrayBuffer());
          }));
          this.samples = buffers;
          this.mode = 'recorded';
        } catch (e) { this.mode = 'synth'; }
        return this.mode;
      })();
      return this.loading;
    },
    pluck(midi, t, vel, dur) {
      const c = this.ensure(), f = DSP.midiToFreq(midi);
      t = t || c.currentTime; vel = vel || 0.25; dur = dur || 1.6;
      if (this.samples) {
        const idx = PITCHES.reduce((best, pitch, i) => Math.abs(pitch - midi) < Math.abs(PITCHES[best] - midi) ? i : best, 0);
        const src = c.createBufferSource(), gain = c.createGain();
        src.buffer = this.samples[idx];
        src.playbackRate.value = 2 ** ((midi - PITCHES[idx] - TUNE_CENTS[idx] / 100) / 12);
        gain.gain.setValueAtTime(Math.min(0.9, vel * 2.2), t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(dur, src.buffer.duration / src.playbackRate.value));
        src.connect(gain).connect(this.out); src.start(t);
        return;
      }
      const g = c.createGain(), lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(4200, t); lp.frequency.exponentialRampToValueAtTime(900, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      [[1, 'triangle', 1], [2, 'sine', 0.35], [3, 'sine', 0.12]].forEach(([h, type, a]) => {
        const o = c.createOscillator(), og = c.createGain();
        o.type = type; o.frequency.value = f * h; og.gain.value = a;
        o.connect(og).connect(lp); o.start(t); o.stop(t + dur + 0.05);
      });
      lp.connect(g).connect(this.out);
    },
    strum(midis, t, dir, vel) {
      const c = this.ensure();
      t = t || c.currentTime;
      const order = dir === 'U' ? [3, 2, 1] : [0, 1, 2, 3];
      order.forEach((si, k) => this.pluck(midis[si], t + k * 0.014, (vel || 0.22) * (dir === 'U' ? 0.7 : 1), 1.3));
    },
    noise(t, dur, freq, vel) {
      const c = this.ensure();
      const len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
      src.buffer = buf; bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 1.2; g.gain.value = vel;
      src.connect(bp).connect(g).connect(this.out); src.start(t);
    },
    chuck(t) {
      if (!this.samples) return this.noise(t, 0.06, 1800, 0.5);
      const c = this.ensure(), src = c.createBufferSource(), g = c.createGain();
      src.buffer = this.samples[FILES.length + 1]; g.gain.value = 0.5;
      src.connect(g).connect(this.out); src.start(t || c.currentTime);
    },
    click(t, accent) {
      if (!this.samples) return this.noise(t, 0.03, accent ? 2600 : 1700, accent ? 0.7 : 0.4);
      const c = this.ensure(), src = c.createBufferSource(), g = c.createGain();
      src.buffer = this.samples[FILES.length]; g.gain.value = accent ? 0.32 : 0.18;
      src.connect(g).connect(this.out); src.start(t || c.currentTime);
    },
    chord(id) {
      const ch = U.CHORDS[id];
      this.load().then(() => {
        const t = this.ensure().currentTime + 0.05;
        this.strum(ch.midi, t, 'D');
        ch.midi.forEach((m, i) => this.pluck(m, t + 1.1 + i * 0.5, 0.3, 1.2));
      });
      return ch.midi.map((m, i) => 1100 + i * 500);
    },
    string(idx) {
      const midi = U.OPEN[idx];
      if (midi == null) return Promise.resolve();
      return this.load().then(() => {
        this.pluck(midi, this.ensure().currentTime + 0.02, 0.34, 1.8);
      });
    },
  };

  /* Plays a demo spec in a loop: {seq, pat} (chords with a strum pattern) or {notes}. Half-beat slots. */
  const Player = {
    timer: null, gen: 0, loading: false,
    async start(demo, bpm, opts) {
      this.stop();
      const gen = this.gen;
      this.loading = true;
      await Snd.load();
      if (this.gen !== gen) return;
      this.loading = false;
      const c = Snd.ensure();
      const o = opts || {};
      const slotDur = demo.notes ? 60 / bpm : 60 / bpm / 2;
      let k = 0, next = c.currentTime + 0.12;
      const patLen = demo.pat ? demo.pat.length : 1;
      const total = demo.notes ? demo.notes.length : demo.seq ? demo.seq.length * patLen : patLen;
      const tick = () => {
        while (next < c.currentTime + 0.15) {
          const i = k % total;
          if (demo.notes) {
            if (o.sound !== false) { const [s, f] = demo.notes[i]; Snd.pluck(U.OPEN[s] + f, next, 0.32, 1.2); }
            if (o.click) Snd.click(next, i === 0);
          } else {
            const slot = i % patLen, ci = Math.floor(i / patLen);
            if (demo.seq && o.sound !== false) {
              const ch = U.CHORDS[demo.seq[ci]], a = demo.pat[slot];
              if (a === 'D' || a === 'U') Snd.strum(ch.midi, next, a, slot === 0 ? 0.26 : 0.2);
              else if (a === 'X') Snd.chuck(next);
            }
            if (o.click && slot % 2 === 0) Snd.click(next, slot === 0);
            if (o.onSlot) { const d = (next - c.currentTime) * 1000, s2 = slot, c2 = ci; setTimeout(() => this.gen === gen && o.onSlot(s2, c2), Math.max(0, d)); }
          }
          if (demo.notes && o.onSlot) { const d = (next - c.currentTime) * 1000, n2 = i; setTimeout(() => this.gen === gen && o.onSlot(n2, 0), Math.max(0, d)); }
          k++; next += slotDur;
          if (o.once && k >= total) { clearInterval(this.timer); this.timer = null; if (o.onEnd) setTimeout(o.onEnd, slotDur * 1000 + 400); return; }
        }
      };
      this.timer = setInterval(tick, 25);
      tick();
    },
    stop() { if (this.timer) clearInterval(this.timer); this.timer = null; this.loading = false; this.gen++; },
    get on() { return !!this.timer || this.loading; },
  };

  window.Snd = Snd;
  window.Player = Player;
})();
