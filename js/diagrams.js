/* SVG diagrams. Two views for every chord: the conventional chart and the player's view with sounded notes. */
(function () {
  const U = window.UKE;
  const FC = { 1: '#0f7b83', 2: '#e8553d', 3: '#c98600', 4: '#7a4fb5' };
  const T = (en, pt) => (U.lang === 'pt' ? pt : en);
  const pcColor = (m) => `hsl(${(U.pc(m) * 30 + 200) % 360} 48% 36%)`;

  /* Conventional upright chart: strings G C E A left to right, nut on top. */
  function chordChart(ch) {
    const X = [44, 84, 124, 164], nut = 66, fh = 32, rows = 5;
    let s = `<svg viewBox="0 0 208 240" class="dg chart" role="img" aria-label="${ch.label}">`;
    for (let i = 0; i < 4; i++) {
      s += `<text x="${X[i]}" y="20" class="dg-str">${U.STR[i]}</text><text x="${X[i]}" y="33" class="dg-pt">${U.notePt(U.OPEN[i])}</text>`;
      if (ch.frets[i] === 0) s += `<circle cx="${X[i]}" cy="50" r="6.5" class="dg-open"/>`;
      s += `<line x1="${X[i]}" y1="${nut}" x2="${X[i]}" y2="${nut + fh * rows}" class="dg-line"/>`;
    }
    s += `<rect x="${X[0] - 2}" y="${nut - 5}" width="${X[3] - X[0] + 4}" height="6" rx="2" class="dg-nut"/>`;
    for (let f = 1; f <= rows; f++) {
      const y = nut + fh * f;
      s += `<line x1="${X[0]}" y1="${y}" x2="${X[3]}" y2="${y}" class="dg-fret"/><text x="20" y="${y - fh / 2 + 4}" class="dg-fnum">${f}</text>`;
    }
    const b = ch.barre;
    if (b) {
      const y = nut + fh * (b.fret - 0.5);
      s += `<rect x="${X[b.from] - 13}" y="${y - 13}" width="${X[b.to] - X[b.from] + 26}" height="26" rx="13" fill="${FC[1]}"/><text x="${X[b.to]}" y="${y + 5}" class="dg-fing">1</text>`;
    }
    for (let i = 0; i < 4; i++) {
      const f = ch.frets[i];
      if (!f) continue;
      if (b && f === b.fret && i >= b.from && i <= b.to) continue;
      const y = nut + fh * (f - 0.5), fg = ch.fingers[i];
      s += `<circle cx="${X[i]}" cy="${y}" r="13" fill="${FC[fg]}"/><text x="${X[i]}" y="${y + 5}" class="dg-fing">${fg}</text>`;
    }
    return s + '</svg>';
  }

  /* Player's view: G string on top (nearest the face), nut on the left. dots: [{s,f,fill,text}], pills: [{text,color,mark}] */
  function neck(o) {
    const Y = [34, 68, 102, 136], nut = 84, fw = 44, frets = 5, right = nut + fw * frets;
    const W = o.pills ? 446 : right + 14;
    let s = `<svg viewBox="0 0 ${W} 184" class="dg neck" role="img" aria-label="${o.label || ''}">`;
    s += `<text x="${nut}" y="12" class="dg-cap">↑ ${T('nearest your face', 'perto do rosto')}</text><text x="${nut}" y="180" class="dg-cap">↓ ${T('nearest the floor', 'perto do chão')}</text>`;
    s += `<rect x="${nut}" y="${Y[0] - 12}" width="${fw * frets}" height="${Y[3] - Y[0] + 24}" class="dg-board"/>`;
    for (let f = 1; f <= frets; f++) {
      const x = nut + fw * f;
      s += `<line x1="${x}" y1="${Y[0] - 12}" x2="${x}" y2="${Y[3] + 12}" class="dg-fret"/><text x="${x - fw / 2}" y="${Y[3] + 26}" class="dg-fnum">${f}</text>`;
    }
    s += `<rect x="${nut - 5}" y="${Y[0] - 13}" width="6" height="${Y[3] - Y[0] + 26}" rx="2" class="dg-nut"/>`;
    for (let i = 0; i < 4; i++) {
      s += `<line x1="${nut}" y1="${Y[i]}" x2="${right}" y2="${Y[i]}" class="dg-line"/>`;
      s += `<text x="4" y="${Y[i] + 5}" class="dg-lbl"><tspan class="b">${U.STR[i]}</tspan> (${U.notePt(U.OPEN[i])})</text>`;
    }
    for (const d of o.dots || []) {
      const x = d.f === 0 ? nut - 14 : nut + fw * (d.f - 0.5);
      if (d.open) s += `<circle cx="${x}" cy="${Y[d.s]}" r="6.5" class="dg-open"/>`;
      else s += `<circle cx="${x}" cy="${Y[d.s]}" r="13" fill="${d.fill}" ${d.cls ? `class="${d.cls}"` : ''}/><text x="${x}" y="${Y[d.s] + 5}" class="dg-fing">${d.text}</text>`;
    }
    if (o.barre) {
      const x = nut + fw * (o.barre.fret - 0.5);
      s += `<rect x="${x - 13}" y="${Y[o.barre.from] - 13}" width="26" height="${Y[o.barre.to] - Y[o.barre.from] + 26}" rx="13" fill="${FC[1]}"/><text x="${x}" y="${Y[o.barre.to] + 5}" class="dg-fing">1</text>`;
    }
    if (o.pills) {
      s += `<text x="${right + 66}" y="12" class="dg-cap mid">${T('you hear', 'você ouve')}</text>`;
      o.pills.forEach((p, i) => {
        s += `<path d="M${right + 4} ${Y[i]} h10" class="dg-arrow"/><rect x="${right + 16}" y="${Y[i] - 13}" width="100" height="26" rx="13" fill="${p.color}" data-pill="${i}"/><text x="${right + 66}" y="${Y[i] + 5}" class="dg-pill">${p.text}</text>`;
        if (p.mark) s += `<text x="${right + 122}" y="${Y[i] + 5}" class="dg-mark">${p.mark}</text>`;
      });
    }
    return s + '</svg>';
  }

  function chordNeck(ch) {
    const dots = [], b = ch.barre;
    ch.frets.forEach((f, i) => {
      if (f === 0) dots.push({ s: i, f: 0, open: true });
      else if (!(b && f === b.fret && i >= b.from && i <= b.to)) dots.push({ s: i, f, fill: FC[ch.fingers[i]], text: ch.fingers[i] });
    });
    const pills = ch.midi.map((m, i) => {
      let mark = '';
      const twin = ch.midi.findIndex((x, j) => j < i && U.pc(x) === U.pc(m));
      if (twin >= 0) mark = ch.midi[twin] === m ? '=' : m > ch.midi[twin] ? '8ª↑' : '8ª↓';
      return { text: U.noteName(m, ch.flat), color: pcColor(m), mark };
    });
    return neck({ dots, pills, barre: b, label: ch.label });
  }

  /* Sentence that explains repeated notes: same pitch vs an octave apart. */
  function soundLine(ch) {
    const names = ch.midi.map((m) => U.noteName(m, ch.flat));
    const distinct = [...new Set(ch.midi.map(U.pc))].length;
    let extra = '';
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      if (U.pc(ch.midi[i]) !== U.pc(ch.midi[j])) continue;
      const n = U.noteName(ch.midi[i], ch.flat);
      extra += ch.midi[i] === ch.midi[j]
        ? T(` The two ${n} are the same pitch (=).`, ` Os dois ${n} têm a mesma altura (=).`)
        : T(` The two ${n} are one octave apart (8ª).`, ` Os dois ${n} estão a uma oitava de distância (8ª).`);
    }
    return T(`Face to floor you hear <b>${names.join(' · ')}</b> — ${distinct} different note names.`,
      `Do rosto ao chão você ouve <b>${names.join(' · ')}</b> — ${distinct} nomes de nota diferentes.`) + extra;
  }

  /* Strum pattern: D down, U up, . the hand passes without touching, X chuck. One slot = half a beat. */
  function strum(p, beats) {
    const w = 42, n = p.length;
    let s = `<svg viewBox="0 0 ${n * w + 8} 108" class="dg strum" role="img" aria-label="${p}">`;
    for (let i = 0; i < n; i++) {
      const x = 4 + i * w + w / 2, ch = p[i], down = i % 2 === 0;
      const ghost = ch === '.';
      const dir = ch === 'U' || (ghost && !down) ? 'U' : 'D';
      s += `<g class="slot${ghost ? ' ghost' : ''}" data-slot="${i}">`;
      s += `<rect x="${4 + i * w + 2}" y="2" width="${w - 4}" height="78" rx="10" class="slot-bg"/>`;
      if (ch === 'X') s += `<path d="M${x - 11} 26 l22 30 M${x + 11} 26 l-22 30" class="chuck"/>`;
      else if (dir === 'D') s += `<path d="M${x} 14 V62 M${x - 10} 50 L${x} 64 L${x + 10} 50" class="arrow"/>`;
      else s += `<path d="M${x} 66 V18 M${x - 8} 30 L${x} 16 L${x + 8} 30" class="arrow up"/>`;
      const cnt = down ? String(i / 2 + 1) : T('&', 'e');
      s += `<text x="${x}" y="100" class="${down ? 'cnt' : 'cnt and'}">${cnt}</text></g>`;
    }
    return s + '</svg>';
  }

  /* Map of single notes on the neck, numbered in playing order where a spot is first used. */
  function noteMap(seq) {
    const seen = {}, dots = [];
    seq.forEach(([s, f]) => {
      const k = s + '-' + f;
      if (seen[k]) return;
      seen[k] = 1;
      const m = U.OPEN[s] + f;
      dots.push({ s, f, fill: pcColor(m), text: U.noteShort(m), cls: 'nm-' + k });
    });
    return neck({ dots, label: 'notes' });
  }

  window.DG = { FC, chordChart, chordNeck, soundLine, strum, noteMap, pcColor };
})();
