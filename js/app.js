/* Ukulele Master — views, game loop and progress. Progress is stored in this browser only (localStorage key below). */
(function () {
  const U = window.UKE, { CHORDS, DOSES, ISLANDS } = U;
  const { icon, toast } = window.UI;
  const VERSION = '3.0.0';
  const KEY = 'uke-master-v1'; // unchanged since v1; older state is archived during migration
  const $ = (q, el) => (el || document).querySelector(q);
  const $$ = (q, el) => [...(el || document).querySelectorAll(q)];

  let S = { lang: null, onboarded: false, doses: {}, log: [], xp: 0, newOn: null, changes: {}, theme: 'auto' };
  try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
  function migrateJourney() {
    if (S.journeyVersion === 3) return;
    if (S.onboarded || S.goal || S.log.length || Object.keys(S.doses).length) {
      (S.previousJourneys ||= []).push({ archivedAt: new Date().toISOString(), goal: S.goal || null, doses: S.doses, log: S.log, xp: S.xp, changes: S.changes });
    }
    S.goal = null; S.onboarded = false; S.doses = {}; S.log = []; S.xp = 0; S.changes = {}; S.newOn = null;
    S.journeyVersion = 3; S.journeyStartedAt = Date.now(); save();
  }
  migrateJourney();
  const T = (en, pt) => (S.lang === 'pt' ? pt : en);
  const L = (o) => (o ? o[S.lang === 'pt' ? 'pt' : 'en'] : '');
  const setLang = (l) => { S.lang = l; U.lang = l; document.documentElement.lang = l === 'pt' ? 'pt-BR' : 'en'; save(); };
  U.lang = S.lang || 'en';
  UI.theme(S.theme);

  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const forced = new URLSearchParams(location.search).get('date');
  const today = () => forced || iso(new Date());
  const locale = () => (S.lang === 'pt' ? 'pt-BR' : 'en-GB');
  const niceDate = (s) => new Date(s + 'T12:00').toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
  const goalAPI = SongGoal.init({ state: () => S, save, render: () => render(), today, lang: () => S.lang, diagrams: DG });

  const FINGERS = () => T('1 index · 2 middle · 3 ring · 4 little. Numbers inside dots are fingers, not frets.', '1 indicador · 2 médio · 3 anelar · 4 mínimo. Os números nas bolinhas são dedos, não casas.');
  const LEVELS = [['Beachcomber', 'Catador de conchas'], ['Strummer', 'Batedor'], ['Island hopper', 'Navegante'], ['Groove keeper', 'Guardião do ritmo'], ['Song carrier', 'Cantador'], ['Melody diver', 'Mergulhador da melodia'], ['Blues sailor', 'Marujo do blues'], ['Ukulele master', 'Mestre do ukulele']];
  const XP_PER_LEVEL = 120;

  // ───────── progress model
  const isDone = (id) => !!S.doses[id];
  function currentDose() { return DOSES.find((d) => !isDone(d.id)) || U.dailyDose(today()); }
  const lockedToday = () => S.newOn === today() && !isDone(currentDose().id);
  const getDose = (id) => DOSES.find((d) => String(d.id) === String(id)) || (String(id).startsWith('daily-') ? U.dailyDose(String(id).slice(6)) : null);
  const playedDays = () => new Set(S.log.map((e) => e.d));
  function streak() {
    const days = playedDays();
    const d = new Date(today() + 'T12:00');
    if (!days.has(iso(d))) d.setDate(d.getDate() - 1);
    let n = 0;
    for (let g = 0; g < 800; g++) {
      if (days.has(iso(d))) n++;
      else if (d.getDay() !== 0 && d.getDay() !== 6) break; // a missed weekend does not break the streak
      else if (!n && g > 3) break;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }
  const level = () => Math.min(LEVELS.length - 1, Math.floor(S.xp / XP_PER_LEVEL));

  // ───────── shared pieces
  function chordCard(id) {
    const ch = CHORDS[id];
    return `<article class="card chord-card"><header><h3>${ch.label}${ch.tag ? ` <small>${L(ch.tag)}</small>` : ''}</h3>
      <button class="btn ghost sm" data-act="hear" data-id="${id}">${icon('play')} ${T('Hear it', 'Ouvir')}</button></header>
      <div class="pair"><figure>${DG.chordChart(ch)}<figcaption>${T('Where the fingers go', 'Onde vão os dedos')}</figcaption></figure>
      <figure class="wide">${DG.chordNeck(ch)}<figcaption>${T('Your view while playing, and the note each string sounds', 'Sua visão ao tocar, e a nota que cada corda soa')}</figcaption></figure></div>
      <p class="sound">${DG.soundLine(ch)}</p></article>`;
  }
  const chordName = (id) => `<b>${CHORDS[id].sym}</b><small>(${CHORDS[id].pt})</small>`;
  const noteAt = ([s, f]) => U.OPEN[s] + f;
  function notePills(seq, attr) {
    return `<div class="pills">${seq.map((p, i) => `<span class="pill" ${attr}="${i}" style="--c:${DG.pcColor(noteAt(p))}"><b>${U.noteName(noteAt(p))}</b><small>${T('string', 'corda')} ${U.STR[p[0]]} · ${p[1] ? T('fret', 'casa') + ' ' + p[1] : T('open', 'solta')}</small></span>`).join('')}</div>`;
  }
  const minis = (ids) => `<div class="mini-row">${ids.map((c) => `<button class="mini" data-act="peek" data-id="${c}" aria-label="${CHORDS[c].label}">${DG.chordChart(CHORDS[c])}<span>${CHORDS[c].label}</span></button>`).join('')}</div>`;
  function renderVis(v) {
    if (v.t === 'chord') return chordCard(v.id);
    if (v.t === 'tuning') {
      const svg = DG.chordNeck({ frets: [0, 0, 0, 0], fingers: [0, 0, 0, 0], midi: U.OPEN, label: 'tuning' });
      return `<article class="card"><h3>${T('The four open strings', 'As quatro cordas soltas')}</h3><figure class="wide">${svg}<figcaption>${T('The G (Sol) string is thin and sounds higher than the C (Dó) string next to it.', 'A corda G (Sol) é fina e soa mais aguda que a corda C (Dó) ao lado.')}</figcaption></figure></article>`;
    }
    if (v.t === 'strum') return `<article class="card"><h3>${T('The strum', 'A batida')}</h3>${DG.strum(v.p, v.beats)}
      <p class="legend">↓ ${T('down', 'para baixo')} · ↑ ${T('up', 'para cima')} · <span class="faint">↓</span> ${T('the hand passes without touching', 'a mão passa sem tocar')}${v.p.includes('X') ? ' · ✕ ' + T('chuck', 'abafado') : ''}</p></article>`;
    if (v.t === 'seq') return `<article class="card"><h3>${T('The loop', 'O ciclo')}</h3><div class="seq">${v.chords.map((c, i) => `<div class="box" data-ci="${i}">${chordName(c)}<i>${v.unit ? `${v.per} ${L(v.unit)}` : '×' + v.per}</i></div>`).join('<span class="arr">→</span>')}</div>
      ${minis([...new Set(v.chords)])}</article>`;
    if (v.t === 'notes') return `<article class="card"><h3>${T('The notes, in order', 'As notas, em ordem')}</h3>${notePills(v.seq, 'data-ni')}
      <figure class="wide">${DG.noteMap(v.seq)}<figcaption>${T('Where each note lives. A dot outside the neck, on the left, is an open string.', 'Onde mora cada nota. Bolinha fora do braço, à esquerda, é corda solta.')}</figcaption></figure></article>`;
    if (v.t === 'song') {
      return `<article class="card"><h3>${T('The song', 'A música')} <small>${v.beats} ${T('strums per box', 'batidas por caixa')}</small></h3>
        <div class="song" style="--cols:${v.cols || 4}">${v.pickup ? `<div class="bar pickup"><em>${L(v.pickup)}</em></div>` : ''}${v.bars.map((b, i) => `<div class="bar${v.half && v.half.includes(i) ? ' half' : ''}" data-ci="${i}">${chordName(b[0])}<em>${L(b[1])}</em></div>`).join('')}</div>
        ${minis([...new Set(v.bars.map((b) => b[0]))])}</article>`;
    }
    return '';
  }
  /* Monday-to-Sunday strip of the current week. */
  function weekStrip() {
    const days = playedDays(), now = new Date(today() + 'T12:00');
    const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    let h = '';
    for (let i = 0; i < 7; i++) {
      const d = new Date(mon); d.setDate(mon.getDate() + i);
      const k = iso(d);
      h += `<div class="${days.has(k) ? 'on' : ''}${k === today() ? ' today' : ''}${k > today() ? ' fut' : ''}">${d.toLocaleDateString(locale(), { weekday: 'narrow' })}<i>${icon('check')}</i></div>`;
    }
    return `<div class="week" role="img" aria-label="${T('Days played this week', 'Dias tocados nesta semana')}">${h}</div>`;
  }

  // ───────── views
  let V = { name: 'home' };
  let chk = null, timerInt = null, timerLeft = 240, bpm = 60, frameN = 0, cg = null;
  function go(v) { stopAll(); V = v; render(); window.scrollTo(0, 0); }
  function stopAll() {
    Player.stop();
    goalAPI.stop();
    if (Mic.on) Mic.stop();
    clearInterval(timerInt); timerInt = null; chk = null;
    if (cg) { clearInterval(cg.int); cg = null; }
  }

  function render() {
    const focus = S.onboarded && V.name === 'dose';
    document.body.classList.toggle('focus-mode', focus);
    UI.wake(focus);
    $('#lang').textContent = S.lang === 'pt' ? 'EN' : 'PT';
    $('#streak').textContent = streak();
    $('#xp').textContent = S.xp;
    const labels = { home: T('Today', 'Hoje'), goal: T('Song', 'Música'), practice: T('Practice', 'Treino'), diary: T('Diary', 'Diário') };
    $$('.tabs button').forEach((b) => {
      const on = b.dataset.view === V.name;
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
      $('span', b).textContent = labels[b.dataset.view];
    });
    $('.tabs').hidden = !S.onboarded;
    const el = $('#view');
    if (!S.onboarded) return (el.innerHTML = onboarding());
    el.innerHTML = V.name === 'dose' ? doseView() : V.name === 'goal' ? goalAPI.view() : V.name === 'practice' ? practiceView() : V.name === 'diary' ? diaryView() : homeView();
    if (V.name === 'diary') loadRecs();
  }

  function onboarding() {
    const logo = '<img class="logo" src="icons/icon.svg" alt="">';
    if (!S.lang) return `<section class="onb">${logo}<h1>Ukulele Master</h1><p class="lead">Choose your language · Escolha o idioma</p>
      <div class="col"><button class="btn big" data-act="lang" data-l="en">English</button><button class="btn big sea" data-act="lang" data-l="pt">Português</button></div></section>`;
    return goalAPI.view();
  }

  function greeting() {
    const h = new Date().getHours();
    return h < 12 ? T('Good morning', 'Bom dia') : h < 18 ? T('Good afternoon', 'Boa tarde') : T('Good evening', 'Boa noite');
  }
  function heroArt(d, isl) {
    const v = d.vis.find((x) => x.t === 'chord' || x.t === 'seq' || x.t === 'song');
    const id = v ? (v.t === 'chord' ? v.id : v.t === 'seq' ? v.chords[0] : v.bars[0][0]) : null;
    return id ? `<div class="art" aria-hidden="true">${DG.chordChart(CHORDS[id])}</div>` : `<div class="art emo" aria-hidden="true">${isl ? isl.emoji : '⭐'}</div>`;
  }

  function homeView() {
    return `${window.PWA ? PWA.banner(T) : ''}${goalAPI.view()}`;
  }
  const escapeHTML = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ───────── the lesson: Look → Play → Prove
  function doseView() {
    const d = getDose(V.id), st = V.stage || 0;
    if (st === 3) return resultPanel();
    const stages = [T('Look', 'Olhar'), T('Play', 'Tocar'), T('Prove', 'Provar')];
    const hasChord = d.vis.some((v) => v.t === 'chord' || v.t === 'seq' || v.t === 'song');
    const vis = `<div class="vis">${d.vis.map(renderVis).join('')}${hasChord ? `<p class="legend">${FINGERS()}</p>` : ''}</div>`;
    let body, dock = '';
    if (st === 0) {
      body = `<p class="idea">${L(d.idea)}</p>${vis}`;
      dock = `<button class="btn big" data-act="stage" data-s="1">${T('Now play', 'Agora toque')} ${icon('right')}</button>`;
    } else if (st === 1) {
      body = `<ol class="steps">${d.steps.map((s) => `<li><span>${L(s)}</span></li>`).join('')}</ol>${vis}
        <p class="hint">${T('Demonstration sound is synthesised. Go slower than you think you need.', 'O som de demonstração é sintetizado. Vá mais devagar do que acha que precisa.')}</p>`;
      dock = `<div class="player">
          <button class="pbtn play" data-act="along" id="along">${alongLabel(false)}</button>
          <button class="pbtn" data-act="metro" id="metro" aria-label="${T('Metronome', 'Metrônomo')}">${icon('drum')}</button>
          <span class="bpm"><button data-act="bpm" data-d="-5" aria-label="${T('Slower', 'Mais lento')}">−</button><b><span id="bpm">${bpm}</span><small>BPM</small></b><button data-act="bpm" data-d="5" aria-label="${T('Faster', 'Mais rápido')}">+</button></span>
          <button class="pbtn" data-act="timer" id="timer" aria-label="${T('Four-minute timer', 'Cronômetro de quatro minutos')}">${icon('clock')} <span>4:00</span></button>
        </div>
        <button class="btn big" data-act="stage" data-s="2">${T('I played it', 'Toquei')} ${icon('right')}</button>`;
    } else body = checkPanel(d);
    return `<div class="focus"><header class="focus-top"><button class="iconbtn" data-act="view" data-v="home" aria-label="${T('Close lesson', 'Fechar aula')}">${icon('x')}</button>
        <div class="segs">${stages.map((s, i) => `<span class="${i === st ? 'on' : i < st ? 'past' : ''}"><i></i>${s}</span>`).join('')}</div></header>
      <div class="focus-body"><p class="eyebrow">${d.daily ? '★ ' + T('Daily challenge', 'Desafio diário') : T('Dose', 'Dose') + ' ' + d.id}${d.must ? ' · ' + T('recorded', 'gravada') : ''}</p><h1>${L(d.title)}</h1>${body}</div>
      ${dock ? `<footer class="dock"><div class="dock-in">${dock}</div></footer>` : ''}</div>`;
  }
  const alongLabel = (on) => (on ? `${icon('stop')} <span class="lbl">${T('Stop', 'Parar')}</span>` : `${icon('play')} <span class="lbl">${T('Play along', 'Tocar junto')}</span>`);
  function syncPlayer(mode) {
    const a = $('#along'), m = $('#metro');
    if (a) { a.innerHTML = alongLabel(mode === 'along'); a.classList.toggle('on', mode === 'along'); }
    if (m) { m.classList.toggle('on', mode === 'metro'); if (m.dataset.full) m.innerHTML = mode === 'metro' ? `${icon('stop')} ${T('Stop', 'Parar')}` : `${icon('play')} ${T('Start', 'Ligar')}`; }
    if (!mode) { hl(-1, -1); const b = $('#beat'); if (b) b.classList.remove('tick'); }
  }

  function checkPanel(d) {
    const self = `<div class="feel"><p>${T('How did it go?', 'Como foi?')}</p><div class="row">
      <button class="feelb" data-act="feel" data-f="easy">😀<small>${T('Easy', 'Fácil')}</small></button>
      <button class="feelb" data-act="feel" data-f="ok">🙂<small>${T('Getting there', 'Quase lá')}</small></button>
      <button class="feelb" data-act="feel" data-f="hard">😬<small>${T('Still hard — repeat tomorrow', 'Ainda difícil — repetir amanhã')}</small></button></div></div>`;
    if (!d.check) return `<section class="panel">${self}</section>`;
    const what = { tune: T('Pluck each open string until all four turn green.', 'Toque cada corda solta até as quatro ficarem verdes.'),
      strings: T('Hold the chord and pluck the strings one at a time, face to floor.', 'Segure o acorde e toque as cordas uma por vez, do rosto ao chão.'),
      notes: T('Play the notes in order. Each one lights up when heard.', 'Toque as notas em ordem. Cada uma acende quando é ouvida.'),
      strum: T(`Strum ${d.check.n} times${d.check.even ? ', evenly spaced' : ''}. Count in your head: only the chord is counted, and a loud voice can hide a strum.`, `Faça ${d.check.n} batidas${d.check.even ? ', com espaço igual' : ''}. Conte de cabeça: só o acorde é contado, e uma voz alta pode esconder uma batida.`),
      chords: T('Play the chords in order, at least one strum each.', 'Toque os acordes em ordem, pelo menos uma batida cada.') }[d.check.k];
    return `<section class="panel check"><p class="idea">${icon('mic')} <span>${what}</span></p><div id="live">${liveHTML(d, makeCheck(d.check))}</div>${levelBar()}
      <button class="btn big" data-act="listen" id="listen">${icon('mic')} ${T('Start listening', 'Começar a ouvir')}</button>
      <p class="hint" id="chkmsg">${T('Put the phone or laptop close to the ukulele. The recording stays on this device.', 'Deixe o celular ou o computador perto do ukulele. A gravação fica neste aparelho.')}</p>
      <div id="after" hidden>${self}</div>
      <button class="link" data-act="nomic">${T('I can’t use the microphone now', 'Não posso usar o microfone agora')}</button></section>`;
  }

  function liveHTML(d, c) {
    const k = d.check.k;
    if (k === 'tune') {
      const cur = c.cur, cents = cur ? Math.max(-50, Math.min(50, cur.cents)) : 0;
      return `<div class="tuner"><div class="strs">${U.OPEN.map((m, i) => `<span class="${c.ok[i] ? 'ok' : ''}${cur && cur.s === i ? ' act' : ''}">${U.noteName(m)}${c.ok[i] ? ' ✓' : ''}</span>`).join('')}</div>
        <div class="gauge"><i class="zone"></i><i class="needle${cur ? '' : ' idle'}" style="left:${50 + cents}%"></i></div>
        <p class="read">${cur ? (Math.abs(cur.cents) <= 10 ? '✓ ' + T('In tune', 'Afinada') : cur.cents < 0 ? T('Too low — tighten', 'Baixa — aperte') : T('Too high — loosen', 'Alta — afrouxe')) : T('Pluck a string…', 'Toque uma corda…')}</p></div>`;
    }
    if (k === 'strings' || k === 'notes') {
      const seq = k === 'strings' ? CHORDS[d.check.chord].frets.map((f, s) => [s, f]) : d.check.seq;
      return `<div class="pills live">${seq.map((p, i) => `<span class="pill${i < c.i ? ' hit' : i === c.i ? ' next' : ''}" style="--c:${DG.pcColor(noteAt(p))}"><b>${U.noteName(noteAt(p))}</b><small>${T('string', 'corda')} ${U.STR[p[0]]}</small></span>`).join('')}</div>
        <p class="read">${c.heard != null ? T('I hear', 'Estou ouvindo') + ' <b>' + U.noteName(c.heard) + '</b>' : '…'}</p>`;
    }
    if (k === 'strum') return `<div class="count-big"><b>${c.times.length}</b> / ${c.n}</div><div class="dots">${Array.from({ length: c.n }, (_, i) => `<i class="${i < c.times.length ? 'on' : ''}"></i>`).join('')}</div>
      <p class="read hint">${c.rejected ? T(`Ignored ${c.rejected} other sound${c.rejected > 1 ? 's' : ''} (voice, taps, or a different chord).`, `${c.rejected} outro${c.rejected > 1 ? 's sons ignorados' : ' som ignorado'} (voz, batidas na mesa ou outro acorde).`) : '&nbsp;'}</p>`;
    return `<div class="seq live">${c.seq.map((id, i) => `<div class="box${i < c.i || (i === c.i && c.done) ? ' hit' : i === c.i ? (c.hits[i] ? ' hit next' : ' next') : ''}">${chordName(id)}</div>`).join('')}</div>
      <p class="read">${c.last ? T('I hear', 'Estou ouvindo') + ' <b>' + CHORDS[c.last].label + '</b>' : '…'}</p>`;
  }

  /* Microphone level: shows that the app hears the room, and when a sound is loud enough to be judged.
     The marker is the room's background level; the bar turns green only when the sound stands out from it. */
  const levelBar = () => `<div class="lvl" aria-hidden="true"><i id="lvl"></i><b id="lvlfloor"></b><span>${T('microphone level', 'nível do microfone')}</span></div>`;
  const dbPct = (x) => Math.max(0, Math.min(100, ((20 * Math.log10(Math.max(x, 1e-5)) + 66) / 60) * 100));
  function showLevel(fr) {
    const bar = $('#lvl'), fl = $('#lvlfloor');
    if (!bar) return;
    bar.style.width = (fr ? dbPct(fr.rms) : 0) + '%';
    bar.classList.toggle('hot', !!fr && fr.rms > Math.max(0.006, 2.5 * (fr.floor || 0)));
    if (fl) fl.style.left = (fr ? dbPct(fr.floor || 0) : 0) + '%';
  }

  const listenLabel = (on) => (on ? `${icon('stop')} ${T('Stop', 'Parar')}` : `${icon('mic')} ${T('Start listening', 'Começar a ouvir')}`);
  async function listen() {
    const d = getDose(V.id), btn = $('#listen'), msg = $('#chkmsg');
    if (Mic.on) { await Mic.stop(); chk = null; btn.innerHTML = listenLabel(false); btn.classList.remove('listening'); return; }
    chk = makeCheck(d.check);
    try {
      await Mic.start((fr) => {
        if (!chk) return;
        chk.feed(fr); showLevel(fr);
        if (chk.done) return finishCheck(d);
        if (++frameN % 3 === 0) { const l = $('#live'); if (l) l.innerHTML = liveHTML(d, chk); }
      }, true);
    } catch (e) {
      chk = null;
      msg.textContent = T('The microphone is blocked. Allow it in the browser, or use the link below.', 'O microfone está bloqueado. Permita no navegador, ou use o link abaixo.');
      return;
    }
    btn.innerHTML = listenLabel(true); btn.classList.add('listening');
    msg.textContent = T('Listening…', 'Ouvindo…');
  }

  async function finishCheck(d) {
    const c = chk; chk = null;
    $('#live').innerHTML = liveHTML(d, c);
    const blob = await Mic.stop();
    const btn = $('#listen'), msg = $('#chkmsg');
    if (!btn) return;
    btn.classList.remove('listening');
    if (!c.pass) {
      btn.innerHTML = `${icon('mic')} ${T('Try again', 'Tentar de novo')}`;
      msg.textContent = T(`I heard ${c.n} strums at about ${Math.round(c.stats.bpm)} per minute, but the spacing was uneven. Try again with the metronome in your head.`,
        `Ouvi ${c.n} batidas a cerca de ${Math.round(c.stats.bpm)} por minuto, mas o espaço entre elas variou. Tente de novo com o metrônomo na cabeça.`);
      return;
    }
    V.mic = { stats: c.stats || null };
    if (blob && blob.size) {
      const id = Date.now();
      V.mic.rec = id;
      try {
        await RecStore.put({ id, d: today(), dose: d.id, title: d.title, blob });
        const all = await RecStore.all();
        for (const r of all.sort((a, b) => b.id - a.id).slice(30)) await RecStore.del(r.id);
      } catch (e) {}
    }
    UI.buzz(30); chime();
    btn.hidden = true; $('.link', $('.check')).hidden = true;
    msg.innerHTML = '✅ <b>' + T('Verified by the microphone.', 'Verificado pelo microfone.') + '</b>' + (c.stats ? ' ' + T(`About ${Math.round(c.stats.bpm)} strums per minute.`, `Cerca de ${Math.round(c.stats.bpm)} batidas por minuto.`) : '');
    $('#after').hidden = false;
  }
  function chime() { try { const t = Snd.ensure().currentTime; [72, 76, 79, 84].forEach((m, i) => Snd.pluck(m, t + 0.05 + i * 0.09, 0.2, 0.9)); } catch (e) {} }

  function complete(feel) {
    const d = getDose(V.id), mic = !!V.mic, was = isDone(d.id);
    const advance = mic || feel !== 'hard';
    const gain = was ? 3 : advance ? 10 + (mic ? 5 : 0) + (d.must ? 10 : 0) : 5;
    const lvBefore = level();
    if (!was && advance) { S.doses[d.id] = { on: today(), level: mic ? 'mic' : 'self' }; S.newOn = today(); }
    else if (was && mic && S.doses[d.id].level !== 'mic') S.doses[d.id].level = 'mic';
    S.xp += gain;
    S.log.push({ d: today(), id: d.id, level: mic ? 'mic' : 'self', feel, rec: mic && V.mic.rec ? V.mic.rec : undefined, bpm: mic && V.mic.stats ? Math.round(V.mic.stats.bpm) : undefined });
    save();
    V.result = { gain, advance, was, mic, feel, levelUp: level() > lvBefore };
    V.stage = 3; render(); window.scrollTo(0, 0);
    if (advance) { UI.confetti(); if (!mic) chime(); UI.buzz([20, 40, 20]); }
  }

  function resultPanel() {
    const r = V.result;
    const head = r.advance ? (r.mic ? '🎤' : '🌺') : '🌱';
    const text = !r.advance ? T('Good work. This dose comes back tomorrow: consolidation is progress.', 'Bom trabalho. Esta dose volta amanhã: consolidar também é progresso.')
      : r.was ? T('Extra practice counted.', 'Treino extra contado.')
      : r.mic ? T('Played and verified. See you tomorrow.', 'Tocada e verificada. Até amanhã.') : T('Dose done. See you tomorrow.', 'Dose feita. Até amanhã.');
    return `<section class="result"><div class="burst">${head}</div><h2>+${r.gain} XP</h2><p class="msg">${text}</p>
      ${r.levelUp ? `<p class="msg"><b>${T('Level up', 'Subiu de nível')}: ${T(...LEVELS[level()])}</b></p>` : ''}
      <span class="stat fire">${icon('flame')} ${streak()} ${T('day streak', 'dias seguidos')}</span>${weekStrip()}
      <button class="btn big" data-act="view" data-v="home">${T('Continue', 'Continuar')}</button></section>`;
  }

  // ───────── practice room
  function practiceView() {
    const sel = V.chord || 'G';
    const known = Object.keys(CHORDS);
    const a = V.cgA || 'C', b = V.cgB || 'G', rec = S.changes[[a, b].sort().join(':')];
    const opts = (cur) => known.filter((id) => id !== 'Chi').map((id) => `<option value="${id}"${id === cur ? ' selected' : ''}>${CHORDS[id].label}</option>`).join('');
    return `<h1 class="page">${T('Practice room', 'Sala de treino')}</h1><p class="page-sub">${T('Free practice. Nothing here is locked.', 'Treino livre. Nada aqui é bloqueado.')}</p>
      <article class="card"><h3>${icon('mic')} ${T('Tuner', 'Afinador')}</h3><div id="live">${liveHTML({ check: { k: 'tune' } }, makeCheck({ k: 'tune' }))}</div>${levelBar()}
        <p style="margin-top:12px"><button class="btn sea" data-act="tuner" id="tunerb">${icon('mic')} ${T('Start tuner', 'Ligar afinador')}</button></p></article>
      <article class="card"><h3>${icon('swap')} ${T('One-minute changes', 'Trocas em um minuto')}</h3>
        <p class="hint">${T('Switch between two chords for 60 seconds. Tap the pad after each clean change. You count: this is self-reported.', 'Troque entre dois acordes por 60 segundos. Toque no botão a cada troca limpa. Você conta: é autodeclarado.')}</p>
        <div class="cg-pick"><select id="cgA" aria-label="${T('First chord', 'Primeiro acorde')}">${opts(a)}</select><span>${icon('swap')}</span><select id="cgB" aria-label="${T('Second chord', 'Segundo acorde')}">${opts(b)}</select></div>
        ${minis([a, b])}
        <p></p><button class="pad" data-act="cgtap" id="cgpad"><span class="left" id="cgleft">60 s</span><b id="cgn">0</b><small id="cglbl">${T('Tap to start', 'Toque para começar')}</small></button>
        <p class="hint" id="cgmsg" style="margin-top:10px">${rec ? `${T('Best', 'Recorde')}: <b>${rec.best}</b> · ${T('Last', 'Última')}: ${rec.last} (${niceDate(rec.on)})` : T('No record yet for this pair.', 'Ainda sem recorde para este par.')}</p></article>
      <article class="card"><h3>${icon('drum')} ${T('Metronome', 'Metrônomo')}</h3><div class="tools"><i class="beat" id="beat"></i>
        <button class="pbtn play" data-act="metro" id="metro" data-full="1">${icon('play')} ${T('Start', 'Ligar')}</button>
        <span class="bpm"><button data-act="bpm" data-d="-5" aria-label="${T('Slower', 'Mais lento')}">−</button><b><span id="bpm">${bpm}</span><small>BPM</small></b><button data-act="bpm" data-d="5" aria-label="${T('Faster', 'Mais rápido')}">+</button></span></div></article>
      <h2 class="sub">${T('Chord library', 'Biblioteca de acordes')}</h2>
      <div class="chips">${known.map((id) => `<button class="chip${id === sel ? ' on' : ''}" data-act="pick" data-id="${id}">${CHORDS[id].sym}${CHORDS[id].tag ? '↑' : ''}</button>`).join('')}</div>
      ${chordCard(sel)}<p class="legend">${FINGERS()}</p>`;
  }
  function cgTap() {
    const pad = $('#cgpad');
    UI.buzz(8);
    if (!cg) {
      Player.stop(); syncPlayer(null);
      cg = { n: 0, left: 60, a: V.cgA || 'C', b: V.cgB || 'G' };
      pad.classList.add('run'); $('#cgn').textContent = '0'; $('#cglbl').textContent = T('Tap after each change', 'Toque a cada troca');
      $$('#cgA,#cgB').forEach((s) => (s.disabled = true));
      cg.int = setInterval(() => {
        cg.left--;
        const l = $('#cgleft'); if (!l) { clearInterval(cg.int); cg = null; return; }
        l.textContent = cg.left + ' s';
        if (cg.left <= 0) cgEnd();
      }, 1000);
      return;
    }
    cg.n++; $('#cgn').textContent = cg.n;
  }
  function cgEnd() {
    clearInterval(cg.int);
    const { n, a, b } = cg, key = [a, b].sort().join(':'), old = S.changes[key];
    cg = null;
    const best = Math.max(n, old ? old.best : 0), isBest = n > 0 && (!old || n > old.best);
    if (n > 0) {
      S.changes[key] = { best, last: n, on: today() };
      S.log.push({ d: today(), k: 'changes', a, b, n, level: 'self' });
      S.xp += 3; save();
    }
    Snd.click(0, true); UI.buzz([30, 60, 30]);
    if (isBest) UI.confetti();
    render();
    toast(n ? (isBest ? T(`New record: ${n} changes!`, `Novo recorde: ${n} trocas!`) : T(`${n} changes. Best: ${best}.`, `${n} trocas. Recorde: ${best}.`)) : T('No changes counted.', 'Nenhuma troca contada.'));
  }

  // ───────── diary
  const logTitle = (e) => { if (e.k === 'changes') return `${CHORDS[e.a].sym} ⇄ ${CHORDS[e.b].sym} · ${e.n} ${T('changes', 'trocas')}`; const d = getDose(e.id); return d ? L(d.title) : e.id; };
  function diaryView() {
    const history = S.goal?.history || [];
    const archived = S.previousJourneys || [];
    const steps = S.goal ? SongGoal.songSteps(S.goal) : [];
    const rows = history.slice().reverse().map((h) => `<li><span>${niceDate(h.date)}</span><b>${escapeHTML(h.id === 'tuning' ? T('Tune GCEA', 'Afinar GCEA') : L(steps.find((s) => s.id === h.id)) || h.title)}</b><span>${h.result === 'tuned' ? T('Tuned', 'Afinado') : T(({ easy: 'Clear', ok: 'Needs practice', hard: 'Still hard' })[h.result], ({ easy: 'Limpo', ok: 'Precisa praticar', hard: 'Ainda difícil' })[h.result])}</span><span>${h.evidence === 'mic' ? T('Mic', 'Microfone') : T('Self', 'Autodeclarado')}</span></li>`).join('');
    return `<h1 class="page">${T('Diary', 'Diário')}</h1>
      <article class="card"><h3>${T('Song check-ins', 'Retornos da música')}</h3><ul class="log">${rows || `<li>${T('Your new journey has no check-ins yet.', 'Sua nova jornada ainda não tem retornos.')}</li>`}</ul></article>
      <article class="card"><h3>${T('Recordings from this journey', 'Gravações desta jornada')}</h3><div id="recs"><p class="hint">…</p></div></article>
      ${archived.length ? `<details class="card"><summary>${T('Previous journeys', 'Jornadas anteriores')} (${archived.length})</summary><p class="hint">${T('Old progress is preserved in this browser and included in your backup.', 'O progresso antigo está guardado neste navegador e incluído na cópia.')}</p>${archived.slice().reverse().map((a) => `<details><summary>${escapeHTML(a.goal?.title || T('Original lessons', 'Aulas originais'))} · ${escapeHTML(a.archivedAt.slice(0, 10))}</summary><ol>${(a.goal?.history || a.log || []).slice(-20).reverse().map((h) => `<li>${escapeHTML(h.date || h.d)} · ${escapeHTML(h.title || h.id)} · ${escapeHTML(h.evidence || h.level || 'self')}</li>`).join('') || `<li>${T('No entries', 'Sem registros')}</li>`}</ol></details>`).join('')}<div id="old-recs"></div></details>` : ''}
      <article class="card"><h3>${T('Back up', 'Cópia de segurança')}</h3><p class="hint">${T('Progress stays in this browser. Export a backup to keep it or move devices.', 'O progresso fica neste navegador. Exporte uma cópia para guardar ou trocar de aparelho.')}</p><div class="row wrap"><button class="btn sm ghost" data-act="export">${icon('download')} ${T('Export backup', 'Exportar cópia')}</button><label class="btn sm ghost">${T('Import backup', 'Importar cópia')}<input type="file" id="imp" accept="application/json" hidden></label></div></article>
      <article class="card"><h3>${T('Appearance', 'Aparência')}</h3><div class="seg3">${[['auto', T('Auto', 'Auto')], ['light', T('Light', 'Claro')], ['dark', T('Dark', 'Escuro')]].map(([k, l]) => `<button data-act="theme" data-t="${k}" class="${S.theme === k ? 'on' : ''}">${l}</button>`).join('')}</div>${window.PWA ? PWA.card(T) : ''}<p class="hint">Ukulele Master ${VERSION}</p></article>`;
  }

  async function loadRecs() {
    let recs = [], old = [];
    try { const all = (await RecStore.all()).sort((a, b) => b.id - a.id); recs = all.filter((r) => r.id >= S.journeyStartedAt); old = all.filter((r) => r.id < S.journeyStartedAt); } catch (e) {}
    const el = $('#recs');
    if (!el) return;
    el.innerHTML = recs.length ? recs.map((r) => `<div class="rec"><div><b>${L(r.title)}</b><small>${niceDate(r.d)}</small></div><audio controls preload="none" src="${URL.createObjectURL(r.blob)}"></audio></div>`).join('')
      : `<p class="hint">${T('Recorded doses appear here, so you can hear your own progress.', 'As doses gravadas aparecem aqui, para você ouvir o próprio progresso.')}</p>`;
    const oldEl = $('#old-recs');
    if (oldEl && old.length) oldEl.innerHTML = `<h3>${T('Earlier recordings', 'Gravações anteriores')}</h3>` + old.map((r) => `<div class="rec"><div><b>${escapeHTML(L(r.title) || r.dose)}</b><small>${niceDate(r.d)}</small></div><audio controls preload="none" src="${URL.createObjectURL(r.blob)}"></audio></div>`).join('');
  }

  function report() {
    const cur = currentDose();
    const lines = [`Ukulele Master — ${T('progress report', 'relatório de progresso')} (${today()})`,
      `${T('Streak', 'Sequência')}: ${streak()} · XP: ${S.xp} · ${T('Next dose', 'Próxima dose')}: ${cur.daily ? L(cur.title) : cur.id + ' — ' + L(cur.title)}`, '',
      T('Completed doses (evidence: mic = verified by microphone, self = self-reported, placement = known before starting):', 'Doses concluídas (evidência: mic = verificada pelo microfone, self = autodeclarada, placement = já sabia antes de começar):')];
    for (const d of DOSES) if (S.doses[d.id]) lines.push(`- ${d.id}. ${L(d.title)} — ${S.doses[d.id].on} — ${S.doses[d.id].level}`);
    lines.push('', T('Last sessions:', 'Últimas sessões:'));
    for (const e of S.log.slice(-10)) lines.push(`- ${e.d}: ${logTitle(e)} — ${e.level}${e.feel ? ', ' + e.feel : ''}${e.bpm ? ', ~' + e.bpm + ' bpm' : ''}`);
    const pairs = Object.entries(S.changes || {});
    if (pairs.length) { lines.push('', T('One-minute chord changes (self-counted):', 'Trocas de acorde em um minuto (contagem própria):')); for (const [k, r] of pairs) lines.push(`- ${k.replace(':', ' ⇄ ')}: ${T('best', 'recorde')} ${r.best}, ${T('last', 'última')} ${r.last} (${r.on})`); }
    const goalReport = goalAPI.report(); if (goalReport) lines.push('', goalReport);
    return lines.join('\n');
  }

  // ───────── actions
  function hl(slot, ci) {
    $$('.slot').forEach((g) => g.classList.toggle('on', +g.dataset.slot === slot));
    $$('.vis .box, .vis .bar').forEach((b) => b.classList.toggle('on', +b.dataset.ci === ci));
    const beat = $('#beat');
    if (beat && slot >= 0 && slot % 2 === 0) { beat.classList.add('tick'); setTimeout(() => beat.classList.remove('tick'), 110); }
  }
  const A = {
    lang(b) { setLang(b.dataset.l); render(); },
    start(b) {
      if (b.dataset.p === '1') [2, 3, 4, 5].forEach((id) => (S.doses[id] = { on: today(), level: 'placement' }));
      S.onboarded = true; save(); render();
    },
    view(b) { go({ name: b.dataset.v }); },
    dose(b) { go({ name: 'dose', id: b.dataset.id, stage: 0 }); },
    stage(b) { stopAll(); V.stage = +b.dataset.s; V.mic = null; render(); window.scrollTo(0, 0); },
    hear(b) {
      const card = b.closest('.card'), delays = Snd.chord(b.dataset.id);
      delays.forEach((ms, i) => setTimeout(() => { const p = $(`[data-pill="${i}"]`, card); if (p) { p.classList.add('ping'); setTimeout(() => p.classList.remove('ping'), 450); } }, ms));
    },
    peek(b) { const dlg = $('#peek'); dlg.innerHTML = chordCard(b.dataset.id) + `<p class="legend">${FINGERS()}</p><button class="btn big ghost" data-act="closepeek">${T('Close', 'Fechar')}</button>`; dlg.showModal(); },
    closepeek() { $('#peek').close(); },
    along() {
      const d = getDose(V.id);
      if (Player.on) { Player.stop(); syncPlayer(null); return; }
      Player.start(d.demo, bpm, { click: true, onSlot: d.demo.notes ? (i) => $$('[data-ni]').forEach((p) => p.classList.toggle('on', +p.dataset.ni === i)) : hl });
      syncPlayer('along');
    },
    metro() {
      if (Player.on) { Player.stop(); syncPlayer(null); return; }
      const d = V.name === 'dose' ? getDose(V.id) : null;
      const pat = d && d.demo && d.demo.pat ? d.demo.pat : 'D.D.D.D.';
      Player.start({ pat, seq: null }, bpm, { click: true, sound: false, onSlot: (s) => hl(s, -1) });
      syncPlayer('metro');
    },
    bpm(b) { bpm = Math.max(40, Math.min(140, bpm + +b.dataset.d)); $('#bpm').textContent = bpm; if (Player.on) { Player.stop(); syncPlayer(null); } },
    timer() {
      const t = $('#timer'), set = (s) => { const el = $('#timer span'); if (el) el.textContent = s; };
      if (timerInt) { clearInterval(timerInt); timerInt = null; t.classList.remove('on'); set('4:00'); return; }
      timerLeft = 240; t.classList.add('on');
      timerInt = setInterval(() => {
        timerLeft--;
        if (!$('#timer')) return clearInterval(timerInt);
        set(`${Math.floor(timerLeft / 60)}:${String(timerLeft % 60).padStart(2, '0')}`);
        if (timerLeft <= 0) { clearInterval(timerInt); timerInt = null; set('✓'); Snd.click(0, true); UI.buzz([40, 80, 40]); toast(T('Four minutes done. Ready to prove it?', 'Quatro minutos feitos. Pronto para provar?')); }
      }, 1000);
    },
    listen,
    nomic() { V.mic = null; $('#after').hidden = false; $('#listen').hidden = true; $('#chkmsg').textContent = T('Recorded as self-reported. You can verify it with the microphone another day.', 'Fica registrado como autodeclarado. Você pode verificar com o microfone outro dia.'); },
    feel(b) { complete(b.dataset.f); },
    pick(b) { V.chord = b.dataset.id; stopAll(); const y = window.scrollY; render(); window.scrollTo(0, y); },
    cgtap: cgTap,
    async tuner() {
      const b = $('#tunerb'), lab = (on) => (on ? `${icon('stop')} ${T('Stop', 'Parar')}` : `${icon('mic')} ${T('Start tuner', 'Ligar afinador')}`);
      if (Mic.on) { await Mic.stop(); chk = null; b.innerHTML = lab(false); return; }
      chk = makeCheck({ k: 'tune' });
      try { await Mic.start((fr) => { if (!chk) return; chk.feed(fr); showLevel(fr); chk.done = false; if (++frameN % 3 === 0) { const l = $('#live'); if (l) l.innerHTML = liveHTML({ check: { k: 'tune' } }, chk); } }, false); b.innerHTML = lab(true); }
      catch (e) { chk = null; toast(T('The microphone is blocked. Allow it in the browser settings.', 'O microfone está bloqueado. Permita nas configurações do navegador.')); }
    },
    theme(b) { S.theme = b.dataset.t; UI.theme(S.theme); save(); render(); },
    install() { if (window.PWA) PWA.install(T); },
    dismissinstall() { if (window.PWA) PWA.dismiss(); render(); },
    async report() { const txt = report(); try { await navigator.clipboard.writeText(txt); toast(T('Report copied.', 'Relatório copiado.')); } catch (e) { $('#shmsg').innerHTML = `<textarea rows="8" readonly>${escapeHTML(txt)}</textarea>`; } },
    export() { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/json' })); a.download = `ukulele-master-${today()}.json`; a.click(); },
    reset() { if (confirm(T('Erase all progress on this device?', 'Apagar todo o progresso neste aparelho?'))) { localStorage.removeItem(KEY); location.reload(); } },
  };

  document.addEventListener('click', (e) => {
    const gb = e.target.closest('[data-goal-act]');
    if (gb) { goalAPI.action(gb); return; }
    const b = e.target.closest('[data-act]');
    if (b && A[b.dataset.act]) A[b.dataset.act](b);
  });
  document.addEventListener('input', (e) => { if (e.target.id === 'song-search') goalAPI.searchInput(e.target); });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'cgA' || e.target.id === 'cgB') {
      V.cgA = $('#cgA').value; V.cgB = $('#cgB').value;
      if (V.cgA === V.cgB) { const other = Object.keys(CHORDS).find((c) => c !== V.cgA && c !== 'Chi'); if (e.target.id === 'cgA') V.cgB = other; else V.cgA = other; }
      const y = window.scrollY; render(); window.scrollTo(0, y); return;
    }
    if (e.target.id !== 'imp' || !e.target.files[0]) return;
    e.target.files[0].text().then((t) => {
      try { const o = JSON.parse(t); if (!o || !o.doses || !o.log) throw Error('shape'); S = Object.assign(S, o); migrateJourney(); save(); setLang(S.lang || 'en'); UI.theme(S.theme); render(); toast(T('Backup imported.', 'Cópia importada.')); }
      catch (err) { toast(T('That file is not a backup.', 'Esse arquivo não é uma cópia.')); }
    });
  });
  document.addEventListener('submit', (e) => {
    if (e.target.id === 'goal-setup') { e.preventDefault(); goalAPI.submit(e.target); }
    if (e.target.id === 'goal-edit') { e.preventDefault(); goalAPI.edit(e.target); }
  });
  $('#lang').addEventListener('click', () => { setLang(S.lang === 'pt' ? 'en' : 'pt'); stopAll(); render(); });
  $$('.tabs button').forEach((b) => b.addEventListener('click', () => S.onboarded && go({ name: b.dataset.view })));
  const net = () => document.body.classList.toggle('is-offline', !navigator.onLine);
  addEventListener('online', net); addEventListener('offline', net); net();
  document.addEventListener('pwa-change', () => { if (V.name === 'home' || V.name === 'diary') render(); });

  // Home-screen shortcuts open a view directly: ./?view=practice
  const startView = new URLSearchParams(location.search).get('view');
  if (['goal', 'practice', 'diary'].includes(startView)) V = { name: startView };

  if (S.lang) setLang(S.lang);
  render();
  window.__uke = { S: () => S, go, version: VERSION };
})();
