/* Synthesised demonstration sound (not a recording of a real ukulele) + play-along scheduler. */
(function () {
  const U = window.UKE;
  const Snd = {
    ctx: null,
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
    pluck(midi, t, vel, dur) {
      const c = this.ensure(), f = DSP.midiToFreq(midi);
      t = t || c.currentTime; vel = vel || 0.25; dur = dur || 1.6;
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
    chuck(t) { this.noise(t, 0.06, 1800, 0.5); },
    click(t, accent) { this.noise(t, 0.03, accent ? 2600 : 1700, accent ? 0.7 : 0.4); },
    chord(id) {
      const ch = U.CHORDS[id], c = this.ensure(), t = c.currentTime + 0.05;
      this.strum(ch.midi, t, 'D');
      ch.midi.forEach((m, i) => this.pluck(m, t + 1.1 + i * 0.5, 0.3, 1.2));
      return ch.midi.map((m, i) => 1100 + i * 500);
    },
  };

  /* Plays a demo spec in a loop: {seq, pat} (chords with a strum pattern) or {notes}. Half-beat slots. */
  const Player = {
    timer: null, gen: 0,
    start(demo, bpm, opts) {
      this.stop();
      const gen = this.gen;
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
    stop() { if (this.timer) clearInterval(this.timer); this.timer = null; this.gen++; },
    get on() { return !!this.timer; },
  };

  window.Snd = Snd;
  window.Player = Player;
})();
