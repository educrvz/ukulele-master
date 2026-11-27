/* Song Goal Mode v4 — single-screen focus: daily GCEA tuner → one-screen lesson → quiet gamification. */
(function () {
  const catalog = window.SONG_CATALOG || [];
  const U = window.UKE;
  const CHORDS = U.CHORDS;
  const WEEKLY_TARGET = 4;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00') - Date.parse(a + 'T12:00:00')) / 86400000);
  const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); };
  const validUrl = (s) => {
    const candidate = String(s || '').replace(/\\([:()])/g, '$1').match(/https:\/\/[^\s\])]+/i)?.[0];
    try { const u = new URL(candidate); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; }
  };
  const sameTitle = (a, b) => norm(a).replace(/ /g, '') === norm(b).replace(/ /g, '');

  function parseSong(raw) {
    if (!raw || typeof raw !== 'object') throw Error('song');
    const title = String(raw.title || '').trim().slice(0, 120);
    if (!title) throw Error('title');
    const inputSections = Array.isArray(raw.sections) ? raw.sections : [];
    let truncated = Boolean(raw.truncated) || inputSections.length > 12;
    const sections = inputSections.slice(0, 12).map((s) => {
      if ((s.bars || s.chords || []).length > 64) truncated = true;
      const bars = (s.bars || s.chords?.map((c) => [c]) || []).slice(0, 64).map((bar) => {
        const names = (Array.isArray(bar) ? bar : [bar]).filter(Boolean).map((x) => String(x).replace(/♭/g, 'b').trim());
        if (!names.length || names.some((c) => !CHORDS[c])) throw Error('chord');
        return names.slice(0, 8);
      });
      if (!bars.length) throw Error('section');
      return { name: String(s.name || 'Section').trim().slice(0, 40), repeats: Math.max(1, Math.min(4, Number(s.repeats) || 1)), bars };
    });
    if (!sections.length) throw Error('sections');
    return {
      title,
      artist: String(raw.artist || '').trim().slice(0, 100),
      source: validUrl(raw.source),
      key: String(raw.key || '').slice(0, 12),
      originalKey: String(raw.originalKey || '').slice(0, 12),
      tempo: Math.max(40, Math.min(200, Number(raw.tempo) || 72)),
      beats: Number(raw.beats) === 3 ? 3 : 4,
      strum: String(raw.strum || '').slice(0, 40),
      coverage: raw.coverage === 'full' && !truncated ? 'full' : 'excerpt',
      truncated,
      sections,
    };
  }

  function songSteps(goal) {
    const steps = [
      { id: 'hold', kind: 'hold', en: 'Hold the ukulele comfortably', pt: 'Segurar o ukulele com conforto', cost: 5 },
      { id: 'open', kind: 'open', en: 'Hear and play the open strings', pt: 'Ouvir e tocar as cordas soltas', cost: 5 },
      { id: 'downstrum', kind: 'downstrum', en: 'Make a gentle downstrum', pt: 'Fazer uma batida suave para baixo', cost: 5 },
    ];
    if (!goal.song) return steps;
    const song = goal.song;
    const seq = song.sections.flatMap((s) => s.bars.flatMap((bar) => bar.filter((c, i) => i === 0 || c !== bar[i - 1])));
    const unique = [...new Set(seq)];
    const transitions = [];
    for (let i = 1; i < seq.length; i++) {
      const pair = `${seq[i - 1]}:${seq[i]}`;
      if (seq[i] !== seq[i - 1] && !transitions.includes(pair)) transitions.push(pair);
    }
    unique.forEach((c) => {
      if (!goal.skill?.chords?.includes(c)) steps.push({ id: `chord:${c}`, kind: 'chord', chord: c, en: `${CHORDS[c].label} clearly`, pt: `${CHORDS[c].label} com som limpo`, cost: 10 });
    });
    transitions.slice(0, 8).forEach((pair) => {
      const [a, b] = pair.split(':');
      steps.push({ id: `change:${pair}`, kind: 'change', chords: [a, b], en: `${CHORDS[a].label} to ${CHORDS[b].label}`, pt: `${CHORDS[a].label} para ${CHORDS[b].label}`, cost: 10 });
    });
    steps.push({ id: 'pulse', kind: 'pulse', en: 'Keep a steady pulse', pt: 'Manter o pulso firme', cost: 8 });
    song.sections.forEach((s, i) => steps.push({ id: `section:${i}`, kind: 'section', section: i, en: `Play ${s.name}`, pt: `Tocar ${s.name}`, cost: 15 }));
    steps.push({
      id: 'playthrough',
      kind: 'playthrough',
      en: song.coverage === 'full' ? 'Play the song from start to finish' : 'Play the beginner excerpt from start to finish',
      pt: song.coverage === 'full' ? 'Tocar a música do início ao fim' : 'Tocar o trecho iniciante do início ao fim',
      cost: 20,
    });
    return steps;
  }

  function plan(goal, now) {
    const steps = songSteps(goal);
    const pending = steps.filter((s) => (goal.mastery[s.id] || 0) < 2);
    const remaining = Math.round(pending.reduce((n, s) => n + s.cost * (2 - (goal.mastery[s.id] || 0)) / 2, 0));
    const days = Math.max(0, daysBetween(now, goal.date) + 1);
    const workDays = days ? Math.max(1, Math.ceil(days * 0.7)) : 0;
    const capacity = workDays * goal.minutes;
    const requiredDays = Math.ceil(remaining / goal.minutes);
    const schedule = pending.map((s, i) => ({ ...s, date: addDays(now, Math.min(Math.max(0, workDays - 1), Math.floor(i * workDays / Math.max(1, pending.length)))) }));
    return {
      steps,
      pending,
      remaining,
      days,
      capacity,
      requiredDays,
      schedule,
      next: pending[0] || { id: 'rehearse', kind: 'rehearse', en: 'Rehearse the whole song', pt: 'Ensaiar a música inteira', cost: goal.minutes },
    };
  }

  /* Healthy weekly rhythm (ADR 0004): distinct non-tuning practice days in Mon–Sun weeks vs WEEKLY_TARGET. */
  function computeWeeklyMomentum(history, nowIso) {
    const days = new Set((history || []).filter((h) => h.id !== 'tuning' && h.date).map((h) => h.date));
    const now = new Date(nowIso + 'T12:00:00');
    const mon = new Date(now);
    mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const weekDays = [];
    let daysThisWeek = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(mon);
      d.setDate(mon.getDate() + i);
      const k = iso(d);
      const on = days.has(k);
      if (on) daysThisWeek++;
      weekDays.push({ date: k, on, isToday: k === nowIso, future: k > nowIso, dow: d });
    }
    let weeksInRhythm = daysThisWeek >= WEEKLY_TARGET ? 1 : 0;
    const cursor = new Date(mon);
    for (let w = 0; w < 52; w++) {
      cursor.setDate(cursor.getDate() - 7);
      let count = 0;
      for (let i = 0; i < 7; i++) {
        const d = new Date(cursor);
        d.setDate(cursor.getDate() + i);
        if (days.has(iso(d))) count++;
      }
      if (count >= WEEKLY_TARGET) weeksInRhythm++;
      else break;
    }
    return { daysThisWeek, target: WEEKLY_TARGET, weeksInRhythm, weekDays };
  }

  function init(ctx) {
    const { state, save, render, today, lang, diagrams, showLevel, chime, openSheet } = ctx;
    const T = (en, pt) => (lang() === 'pt' ? pt : en);
    const locale = () => (lang() === 'pt' ? 'pt-BR' : 'en-GB');
    const name = (c) => CHORDS[c]?.label || c;
    const dateLabel = (s) => new Date(s + 'T12:00:00').toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
    const goal = () => state().goal;
    const icon = (n, cls) => (window.UI ? UI.icon(n, cls) : '');

    let listening = false;
    let liveCheck = null;
    let liveKind = null;
    let frameN = 0;
    let lookupStarted = false;
    let lookupBusy = false;
    let lookupError = '';
    let searchTimer = null;
    let searchController = null;
    let forceTuner = false;
    let checkinOpen = false;
    let previewStepId = null;
    let sectionChord = null;
    let rewardState = null;
    let restMode = false;
    let bonus = null;
    let playingString = -1;

    const onlineLookup = (location.protocol === 'https:' && location.hostname !== 'educrvz.github.io') || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const isTunedToday = (g) => Boolean(g && g.tunedOn === today());
    const needsTuning = (g) => Boolean(g && (!isTunedToday(g) || forceTuner));

    function activeStep(g, p) {
      if (previewStepId) {
        const found = p.steps.find((s) => s.id === previewStepId);
        if (found) return found;
        previewStepId = null;
      }
      return p.next;
    }

    function songChordList(g) {
      if (!g?.song) return [];
      const seq = g.song.sections.flatMap((s) => s.bars.flat());
      return [...new Set(seq)].filter((c) => CHORDS[c]);
    }

    function pickBonusPair(g, step) {
      if (step.kind === 'change' && step.chords?.length === 2) return step.chords;
      const chords = songChordList(g);
      if (chords.length < 2) return null;
      if (step.chord && chords.includes(step.chord)) {
        const other = chords.find((c) => c !== step.chord);
        return [step.chord, other];
      }
      return [chords[0], chords[1]];
    }

    function stopAudioAndMic() {
      if (listening) { listening = false; Mic.stop(); }
      liveCheck = null;
      liveKind = null;
      if (bonus?.int) { clearInterval(bonus.int); bonus.int = null; }
      if (bonus) { bonus.running = false; bonus.check = null; }
      Player.stop();
    }

    /* ───────── Song Search & Setup (1-screen picker) */
    function selectSong(title, artist, button) {
      const form = document.querySelector('#goal-setup');
      if (!form) return;
      form.elements.title.value = title;
      form.elements.artist.value = artist;
      form.elements.query.value = artist ? `${title} — ${artist}` : title;
      const sel = form.querySelector('#song-selected');
      if (sel) sel.textContent = T(`Selected: ${title}${artist ? ' — ' + artist : ''}`, `Selecionada: ${title}${artist ? ' — ' + artist : ''}`);
      const res = form.querySelector('#song-results');
      if (res) res.replaceChildren();
      form.querySelector('button[type="submit"]').disabled = false;
      form.querySelectorAll('[data-goal-act="pick-song"]').forEach((x) => x.classList.toggle('on', x === button));
      clearTimeout(searchTimer); searchController?.abort();
    }

    function searchInput(input) {
      const form = input.closest('#goal-setup');
      if (!form) return;
      clearTimeout(searchTimer); searchController?.abort();
      form.elements.title.value = ''; form.elements.artist.value = '';
      form.querySelector('button[type="submit"]').disabled = true;
      const sel = form.querySelector('#song-selected');
      if (sel) sel.textContent = '';
      form.querySelectorAll('[data-goal-act="pick-song"]').forEach((x) => x.classList.remove('on'));
      const results = form.querySelector('#song-results');
      const query = input.value.trim();
      if (query.length < 2) { results.textContent = ''; return; }
      results.textContent = T('Searching…', 'Buscando…');
      searchTimer = setTimeout(async () => {
        const controller = new AbortController(); searchController = controller;
        try {
          const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
          if (!response.ok) throw Error('search');
          const data = await response.json();
          if (controller.signal.aborted || !form.isConnected || input.value.trim() !== query) return;
          const songs = Array.isArray(data.songs) ? data.songs : [];
          results.innerHTML = songs.length
            ? songs.slice(0, 5).map((song) => `<button type="button" class="song-result" data-goal-act="pick-song" data-title="${esc(song.title)}" data-artist="${esc(song.artist)}"><b>${esc(song.title)}</b><small>${esc(song.artist)}</small></button>`).join('')
            : `<p class="hint">${T('No chord chart found. Try another spelling or artist.', 'Nenhuma cifra encontrada. Tente outra grafia ou artista.')}</p>`;
        } catch {
          if (!controller.signal.aborted && form.isConnected) results.innerHTML = `<p class="hint">${T('Search unavailable offline. Pick a starter song below.', 'Busca indisponível sem internet. Escolha uma música abaixo.')}</p>`;
        }
      }, 320);
    }

    function setup() {
      return `<section class="stage stage-setup">
        <div class="stage-head">
          <p class="eyebrow">${T('Song goal', 'Meta musical')}</p>
          <h1>${T('Pick one song & a date', 'Escolha uma música e uma data')}</h1>
        </div>
        <form id="goal-setup" class="card goal-form">
          <label>${T('Song or artist', 'Música ou artista')}
            <input name="query" id="song-search" maxlength="120" placeholder="${T('Search song or artist…', 'Busque música ou artista…')}" autocomplete="off">
          </label>
          <div id="song-results" class="song-results" role="status"></div>
          <p id="song-selected" class="hint sel-ok" role="status"></p>
          <input name="title" type="hidden"><input name="artist" type="hidden">
          <div class="starter-box">
            <span class="hint">${T('Or start offline right away', 'Ou comece sem internet agora')}</span>
            <div class="chips">${catalog.map((s) => `<button type="button" class="chip" data-goal-act="pick-song" data-title="${esc(s.title)}" data-artist="${esc(s.artist || '')}">${esc(s.title)}</button>`).join('')}</div>
          </div>
          <div class="goal-fields compact-fields">
            <label>${T('Play it by', 'Tocar até')}<input name="date" type="date" min="${today()}" value="${addDays(today(), 21)}" required></label>
            <label>${T('Min / day', 'Min / dia')}<select name="minutes"><option value="5">5</option><option value="10">10</option><option value="15" selected>15</option><option value="20">20</option></select></label>
          </div>
          <button class="btn big" type="submit" disabled>${T('Start learning', 'Começar')}</button>
        </form>
      </section>`;
    }

    async function lookup(g) {
      if (!onlineLookup || lookupBusy || g !== goal()) return;
      lookupBusy = true; lookupError = ''; render();
      try {
        const response = await fetch('/api/song', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: g.title, artist: g.artist }) });
        const data = await response.json();
        if (!response.ok) throw Error(data.error || 'lookup');
        const song = parseSong(data.song);
        if (!sameTitle(song.title, g.title)) throw Error('different title');
        if (!song.source) throw Error('source');
        if (g !== goal()) return;
        g.title = song.title; g.artist = song.artist; g.song = song; save();
      } catch (error) {
        lookupError = error.message === 'different title'
          ? T('Source named a different song. Pick another result.', 'A fonte indicou outra música. Escolha outro resultado.')
          : T('Could not verify chords right now. Try again.', 'Não consegui verificar os acordes agora. Tente de novo.');
      } finally { lookupBusy = false; render(); }
    }

    /* ───────── Shared Song Map strip (Endowed Progress + Zeigarnik) */
    function songMapStrip(g, p, currentId) {
      const tuned = isTunedToday(g);
      const mom = computeWeeklyMomentum(g.history, today());
      const doneSteps = p.steps.filter((s) => (g.mastery[s.id] || 0) >= 2).length;
      const total = p.steps.length + 1;
      const endowed = doneSteps + (tuned ? 1 : 0);
      const segs = [
        `<i class="${tuned ? 'done' : currentId === 'tuning' ? 'cur' : ''}" title="${T('Tune GCEA', 'Afinar GCEA')}"></i>`,
        ...p.steps.map((s) => {
          const m = g.mastery[s.id] || 0;
          const cls = m >= 2 ? 'done' : s.id === currentId ? 'cur' : m === 1 ? 'part' : '';
          return `<i class="${cls}" title="${esc(T(s.en, s.pt))}"></i>`;
        }),
      ].join('');
      const meta = (endowed > 0 || mom.daysThisWeek > 0)
        ? `<span class="map-meta">${endowed > 0 ? `<b>${endowed}/${total}</b>` : ''}${mom.daysThisWeek > 0 ? `<span class="map-wk" title="${T('Days this week', 'Dias na semana')}">${mom.daysThisWeek}/${mom.target}${T('w', 's')}</span>` : ''}</span>`
        : '';
      return `<button type="button" class="song-map" data-act="sheet" data-tab="song" aria-label="${T('Open song plan', 'Abrir plano da música')}">
        <span class="map-track">${segs}</span>${meta}
      </button>`;
    }

    /* ───────── State 1: Real Visual Daily Tuner (Zero Scroll) */
    function tunerLiveMarkup(c) {
      const cur = c?.cur || null;
      const ok = c?.ok || [false, false, false, false];
      const cents = cur ? Math.max(-50, Math.min(50, cur.cents)) : 0;
      const pads = U.OPEN.map((midi, i) => {
        const cls = [
          'tpad',
          ok[i] ? 'ok' : '',
          cur && cur.s === i ? 'act' : '',
          playingString === i ? 'ring' : '',
        ].filter(Boolean).join(' ');
        return `<button type="button" class="${cls}" data-goal-act="tune-string" data-s="${i}" aria-label="${U.STR[i]} (${U.notePt(midi)})">
          <span class="tpad-badge">${ok[i] ? '✓' : icon('vol')}</span>
          <b>${U.STR[i]}</b>
          <small>${U.notePt(midi)}</small>
        </button>`;
      }).join('');
      const readout = cur
        ? (Math.abs(cur.cents) <= 10
          ? `<span class="ok-txt">✓ ${U.STR[cur.s]} (${U.notePt(U.OPEN[cur.s])}) · ${T('In tune', 'Afinada')}</span>`
          : cur.cents < 0
            ? `${U.STR[cur.s]} (${U.notePt(U.OPEN[cur.s])}) · ${T('Too low — tighten', 'Baixa — aperte')}`
            : `${U.STR[cur.s]} (${U.notePt(U.OPEN[cur.s])}) · ${T('Too high — loosen', 'Alta — afrouxe')}`)
        : (listening ? T('Pluck one string at a time…', 'Toque uma corda por vez…') : T('Tap a string to hear it, or start the mic', 'Toque uma corda para ouvir ou ligue o microfone'));
      return `<div class="tuner-pads">${pads}</div>
        <div class="gauge" role="img" aria-label="${T('Pitch meter', 'Medidor de afinação')}"><i class="zone"></i><i class="needle${cur ? '' : ' idle'}" style="left:${50 + cents}%"></i></div>
        <p class="read tuner-read">${readout}</p>`;
    }

    function tunerStage(g, p) {
      const pendingChip = !g.song ? pendingBanner(g) : '';
      const activeMic = listening && liveKind === 'tune';
      return `<section class="stage stage-tune">
        ${songMapStrip(g, p, 'tuning')}
        ${pendingChip}
        <div class="stage-body center-stage">
          <div class="stage-head">
            <p class="eyebrow">${T('Daily tune-up', 'Afinação do dia')}</p>
            <h1>${T('Tune G · C · E · A', 'Afine G · C · E · A')}</h1>
            <p class="cue">${T('Face to floor: G (Sol) · C (Dó) · E (Mi) · A (Lá)', 'Do rosto ao chão: G (Sol) · C (Dó) · E (Mi) · A (Lá)')}</p>
          </div>
          <div id="tuner-live" class="tuner-live">${tunerLiveMarkup(liveKind === 'tune' ? liveCheck : null)}</div>
          <div class="lvl-wrap${activeMic ? ' on' : ''}">
            <div class="lvl" aria-hidden="true"><i id="lvl"></i><b id="lvlfloor"></b><span>${T('microphone level', 'nível do microfone')}</span></div>
          </div>
          <p id="goal-audio-msg" class="hint stage-msg" role="status"></p>
        </div>
        <footer class="stage-dock">
          <button type="button" class="btn big${activeMic ? ' listening' : ''}" data-goal-act="tune-verify" id="tune-mic-btn">
            ${activeMic ? `${icon('stop')} ${T('Stop microphone', 'Parar microfone')}` : `${icon('mic')} ${T('Tune with microphone', 'Afinar com microfone')}`}
          </button>
          <div class="dock-links">
            <button type="button" class="link-btn" data-goal-act="tune-play" id="tune-play-btn">${icon('play')} ${T('Hear all 4', 'Ouvir as 4')}</button>
            <span class="dot-sep" aria-hidden="true">·</span>
            <button type="button" class="link-btn strong" data-goal-act="tune-self">${T('Already in tune →', 'Já está afinado →')}</button>
          </div>
        </footer>
      </section>`;
    }

    /* ───────── State 2: Single-Screen Lesson */
    function pendingBanner(g) {
      if (onlineLookup && !lookupStarted) { lookupStarted = true; queueMicrotask(() => lookup(g)); }
      if (lookupBusy) return `<div class="pending-chip" role="status">${T('Finding song chords…', 'Buscando acordes da música…')}</div>`;
      if (lookupError) return `<div class="pending-chip warn" role="status"><span>${esc(lookupError)}</span>${onlineLookup ? `<button type="button" class="chip-btn" data-goal-act="lookup">${T('Retry', 'Tentar')}</button>` : ''}</div>`;
      return '';
    }

    function compactChordVisual(id, highlightable) {
      const ch = CHORDS[id];
      return `<div class="goal-diagram compact" ${highlightable ? `data-chord="${id}"` : ''}>
        <div class="dg-head">
          <h4>${esc(ch.label)}</h4>
          <button type="button" class="hear-mini" data-act="hear" data-id="${id}" aria-label="${T('Hear', 'Ouvir')} ${esc(ch.label)}">${icon('vol')}</button>
        </div>
        <div class="pair compact-pair">
          <figure>${diagrams.chordChart(ch)}</figure>
          <figure>${diagrams.chordNeck(ch)}</figure>
        </div>
        <p class="sound compact-sound">${diagrams.soundLine(ch)}</p>
      </div>`;
    }

    function lessonCue(s, song) {
      if (s.kind === 'hold') return T('Rest the body on your chest, support the neck lightly, shoulders relaxed.', 'Apoie o corpo no peito, segure o braço leve e relaxe os ombros.');
      if (s.kind === 'open') return T('Pluck from face to floor: G (Sol), C (Dó), E (Mi), A (Lá) — no fingers on frets.', 'Toque do rosto ao chão: G (Sol), C (Dó), E (Mi), A (Lá) — sem apertar casas.');
      if (s.kind === 'downstrum') return T('Curl your index finger softly (leave your thumb out) and brush down with the nail side.', 'Curve de leve o indicador (sem usar o polegar) e deslize para baixo com o lado da unha.');
      if (s.kind === 'chord') return T(`Form ${name(s.chord)}. Pluck each string to check clarity, then four slow downstrums.`, `Monte ${name(s.chord)}. Toque cada corda para conferir o som e faça quatro batidas lentas.`);
      if (s.kind === 'change') return T(`Two slow downstrums on ${name(s.chords[0])}, pause, then two on ${name(s.chords[1])}.`, `Duas batidas lentas em ${name(s.chords[0])}, pause, depois duas em ${name(s.chords[1])}.`);
      if (s.kind === 'pulse') return T(`Count 1–${song?.beats || 4} steadily. One gentle downstrum on each beat.`, `Conte 1–${song?.beats || 4} firme. Uma batida suave para baixo em cada tempo.`);
      if (s.kind === 'section') return T('One slow downstrum per beat. Pause at chord changes, then connect them.', 'Uma batida lenta por tempo. Pause nas trocas e depois conecte.');
      return T('Play from start to finish at your own steady pace. Note the trickiest change.', 'Toque do início ao fim no seu ritmo. Observe a troca mais difícil.');
    }

    function lessonLiveMarkup(s, c) {
      if (!c) return '';
      if (c.k === 'notes') {
        const seq = s.kind === 'open' ? [[0, 0], [1, 0], [2, 0], [3, 0]] : CHORDS[s.chord].frets.map((f, i) => [i, f]);
        return `<div class="live-strip"><div class="pills live">${seq.map((p, i) => {
          const midi = U.OPEN[p[0]] + p[1];
          return `<span class="pill${i < c.i ? ' hit' : i === c.i ? ' next' : ''}" style="--c:${diagrams.pcColor(midi)}"><b>${U.noteName(midi)}</b><small>${U.STR[p[0]]}</small></span>`;
        }).join('')}</div><p class="read">${c.heard != null ? T('Hearing', 'Ouvindo') + ' <b>' + U.noteName(c.heard) + '</b>' : T('Pluck each string…', 'Toque cada corda…')}</p></div>`;
      }
      if (c.k === 'strum') {
        return `<div class="live-strip"><div class="count-big compact-count"><b>${c.times.length}</b> / ${c.n}</div>
          <div class="dots">${Array.from({ length: c.n }, (_, i) => `<i class="${i < c.times.length ? 'on' : ''}"></i>`).join('')}</div></div>`;
      }
      if (c.k === 'chords') {
        return `<div class="live-strip"><div class="seq live">${c.seq.map((id, i) => `<div class="box compact-box${i < c.i || (i === c.i && c.done) ? ' hit' : i === c.i ? ' next' : ''}"><b>${CHORDS[id].sym}</b><small>${CHORDS[id].pt}</small></div>`).join('')}</div>
          <p class="read">${c.last ? T('Hearing', 'Ouvindo') + ' <b>' + CHORDS[c.last].label + '</b>' : T('Play the chords in order…', 'Toque os acordes em ordem…')}</p></div>`;
      }
      return '';
    }

    function lessonVisual(g, s) {
      const song = g.song;
      if (s.kind === 'hold') {
        return `<div class="posture-grid">
          <div class="posture-item"><b>1</b><span>${T('Body rests gently against your chest', 'Corpo apoiado com leveza no peito')}</span></div>
          <div class="posture-item"><b>2</b><span>${T('Left hand supports the neck lightly', 'Mão esquerda apoia o braço sem apertar')}</span></div>
          <div class="posture-item"><b>3</b><span>${T('Shoulders down, right forearm over the body', 'Ombros soltos, antebraço direito sobre o corpo')}</span></div>
        </div>`;
      }
      if (s.kind === 'open') {
        const neckSvg = diagrams.chordNeck({ frets: [0, 0, 0, 0], fingers: [0, 0, 0, 0], midi: U.OPEN, label: 'GCEA' });
        return `<div class="goal-diagram compact"><figure class="open-neck">${neckSvg}</figure>
          <p class="sound compact-sound">${T('G (Sol) is thin and sounds higher than the C (Dó) next to it.', 'G (Sol) é fina e soa mais aguda que C (Dó) ao lado.')}</p></div>`;
      }
      if (s.kind === 'downstrum') {
        const beats = song?.beats || 4;
        const pat = beats === 3 ? 'D.D.D.' : 'D.D.D.D.';
        return `<div class="goal-diagram compact strum-card">
            ${diagrams.downstrumGuide()}
            <div class="strum-tips">
              <span><b>1</b> ${T('Relax your wrist — let your index nail brush G→A', 'Pulso solto — a unha do indicador desliza de G→A')}</span>
              <span><b>2</b> ${T('Strum where the neck meets the body (not over the hole)', 'Toque onde o braço encontra o corpo (não sobre a boca)')}</span>
            </div>
          </div>
          <div class="goal-diagram compact">${diagrams.strum(pat, beats)}
            <p class="sound compact-sound"><b>${T('How to practice:', 'Como praticar:')}</b> ${T('Tap Play along, count 1–2–3–4 aloud, brush down on each number and lift back silently on “&”.', 'Toque em Tocar junto, conte 1–2–3–4 em voz alta, desça em cada número e volte sem tocar no “e”.')}</p>
          </div>`;
      }
      if (s.kind === 'chord') {
        return compactChordVisual(s.chord, true) + `<p class="legend compact-legend">${T('Dots = fingers: 1 index · 2 mid · 3 ring · 4 little', 'Bolinhas = dedos: 1 ind · 2 méd · 3 anel · 4 mín')}</p>`;
      }
      if (s.kind === 'change') {
        return `<div class="pair-stack">${s.chords.map((c) => compactChordVisual(c, true)).join('')}</div>`;
      }
      if (s.kind === 'pulse') {
        const beats = song?.beats || 4;
        const pat = beats === 3 ? 'D.D.D.' : 'D.D.D.D.';
        const firstChord = songChordList(g)[0] || 'C';
        return `<div class="goal-diagram compact">${diagrams.strum(pat, beats)}</div>${compactChordVisual(firstChord, true)}`;
      }
      // section, playthrough, rehearse
      const bars = s.kind === 'section' && song
        ? song.sections[s.section].bars
        : song ? song.sections.flatMap((x) => x.bars).slice(0, 12) : [];
      const uniq = [...new Set(bars.flat())].filter((c) => CHORDS[c]);
      const shownChord = uniq.includes(sectionChord) ? sectionChord : uniq[0];
      return `<div class="goal-bars compact-bars">${bars.slice(0, 8).map((bar, bi) => {
        const ch = bar[0];
        const label = bar.filter((c, i) => i === 0 || c !== bar[i - 1]).map((c) => CHORDS[c]?.sym || c).join('·');
        return `<button type="button" class="bar-chip${ch === shownChord ? ' on' : ''}" data-goal-act="section-chord" data-chord="${ch}" data-bi="${bi}">${esc(label)}</button>`;
      }).join('')}</div>
      ${uniq.length > 1 ? `<div class="chips compact-chips">${uniq.map((c) => `<button type="button" class="chip sm${c === shownChord ? ' on' : ''}" data-goal-act="section-chord" data-chord="${c}">${esc(CHORDS[c].label)}</button>`).join('')}</div>` : ''}
      ${shownChord ? compactChordVisual(shownChord, true) : ''}`;
    }

    function lessonStage(g, p) {
      const s = activeStep(g, p);
      if (!g.song && p.pending.length === 0) {
        return `<section class="stage stage-lesson">
          ${songMapStrip(g, p, 'pending')}
          <div class="stage-body center-stage">
            <article class="card">
              <h3>${T('Chords still needed', 'Ainda buscando os acordes')}</h3>
              <p class="hint">${esc(lookupError || T('You finished the foundations. Connect to fetch your song chords or choose a starter song.', 'Você concluiu as bases. Conecte-se para buscar os acordes ou escolha uma música pronta.'))}</p>
              <div class="row wrap" style="margin-top:12px">
                ${onlineLookup ? `<button type="button" class="btn sea" data-goal-act="lookup" ${lookupBusy ? 'disabled' : ''}>${T('Try again', 'Tentar de novo')}</button>` : ''}
                <button type="button" class="btn ghost" data-act="sheet" data-tab="song">${T('Song options', 'Opções da música')}</button>
              </div>
            </article>
          </div>
        </section>`;
      }
      const stepIdx = p.steps.findIndex((x) => x.id === s.id);
      const stepBadge = stepIdx >= 0 ? `${T('Step', 'Passo')} ${stepIdx + 1}/${p.steps.length}` : T('Rehearsal', 'Ensaio');
      const canPlay = s.kind !== 'hold';
      const canMic = ['open', 'chord', 'change', 'pulse'].includes(s.kind);
      const micOn = listening && liveKind === 'lesson';
      const pendingChip = !g.song ? pendingBanner(g) : '';
      const isPeeking = Boolean(previewStepId && previewStepId !== p.next.id);

      return `<section class="stage stage-lesson">
        ${songMapStrip(g, p, s.id)}
        ${pendingChip}
        <div class="stage-body">
          <div class="stage-head compact-head">
            <div class="head-row">
              <p class="eyebrow">${stepBadge}${isPeeking ? ` · <button type="button" class="inline-reset" data-goal-act="back-next">${T('Back to next', 'Voltar ao próximo')}</button>` : ''}</p>
              ${(g.mastery[s.id] || 0) === 1 ? `<span class="grad-pill">■ □ 1/2</span>` : ''}
            </div>
            <h2 class="lesson-title">${esc(T(s.en, s.pt))}</h2>
            <p class="cue">${esc(lessonCue(s, g.song))}</p>
          </div>
          <div id="lesson-live">${micOn ? lessonLiveMarkup(s, liveCheck) : ''}</div>
          ${micOn ? `<div class="lvl-wrap on"><div class="lvl" aria-hidden="true"><i id="lvl"></i><b id="lvlfloor"></b><span>${T('microphone level', 'nível do microfone')}</span></div></div>` : ''}
          <div class="lesson-visual${micOn ? ' dim-vis' : ''}">${lessonVisual(g, s)}</div>
          <p id="goal-audio-msg" class="hint stage-msg" role="status"></p>
        </div>
        <footer class="stage-dock">
          ${(canPlay || canMic) ? `<div class="dock-tools">
            ${canPlay ? `<button type="button" class="btn sm ghost${Player.on ? ' sea' : ''}" data-goal-act="play" id="goal-play-btn">${Player.on ? `${icon('stop')} ${T('Stop', 'Parar')}` : `${icon('play')} ${T('Play along', 'Tocar junto')}`}</button>` : ''}
            ${canMic ? `<button type="button" class="btn sm ghost${micOn ? ' listening' : ''}" data-goal-act="verify" id="goal-mic-btn">${micOn ? `${icon('stop')} ${T('Stop mic', 'Parar mic')}` : `${icon('mic')} ${T('Check mic', 'Ouvir mic')}`}</button>` : ''}
          </div>` : ''}
          ${s.kind === 'hold'
            ? `<button type="button" class="btn big" data-goal-act="next-hold">${T('Next →', 'Próximo →')}</button>`
            : checkinOpen
              ? `<div class="checkin-reveal">
                  <div class="checkin-row">
                    <button type="button" class="btn sm" data-goal-act="check" data-result="easy">${T('Clear', 'Limpo')}</button>
                    <button type="button" class="btn sm ghost" data-goal-act="check" data-result="ok">${T('Needs work', 'Quase lá')}</button>
                    <button type="button" class="btn sm ghost" data-goal-act="check" data-result="hard">${T('Still hard', 'Difícil')}</button>
                  </div>
                  <p class="checkin-cap">${T('Self-reported check-in · honest rating adapts your plan', 'Retorno autodeclarado · resposta sincera ajusta seu plano')}</p>
                </div>`
              : `<button type="button" class="btn big" data-goal-act="reveal-checkin">${T('I played it', 'Toquei')}</button>`}
        </footer>
      </section>`;
    }

    /* ───────── State 3: Quiet Post-Check-in Reward (ADR 0004) */
    function weekRhythmMarkup(mom) {
      const cells = mom.weekDays.map((w) => {
        const lbl = w.dow.toLocaleDateString(locale(), { weekday: 'narrow' });
        const cls = [w.on ? 'on' : '', w.isToday ? 'today' : '', w.future ? 'fut' : ''].filter(Boolean).join(' ');
        return `<div class="${cls}"><span>${lbl}</span><i>${w.on ? icon('check') : ''}</i></div>`;
      }).join('');
      const rhythmLine = mom.weeksInRhythm > 0
        ? T(`${mom.daysThisWeek}/${mom.target} days this week · ${mom.weeksInRhythm} wk in rhythm`, `${mom.daysThisWeek}/${mom.target} dias na semana · ${mom.weeksInRhythm} sem no ritmo`)
        : T(`${mom.daysThisWeek}/${mom.target} days this week`, `${mom.daysThisWeek}/${mom.target} dias esta semana`);
      return `<div class="rhythm-card">
        <div class="rhythm-head"><b>${rhythmLine}</b></div>
        <div class="week compact-week" role="img" aria-label="${esc(rhythmLine)}">${cells}</div>
      </div>`;
    }

    function rewardStage(g, p) {
      const r = rewardState;
      const mom = computeWeeklyMomentum(g.history, today());
      const badge = r.result === 'hard' ? '🌱' : r.evidence === 'mic' ? '🎤' : '🌺';
      const evLabel = r.evidence === 'mic'
        ? `<span class="ev mic">${icon('mic')} ${T('Mic verified', 'Verificado por mic')}</span>`
        : `<span class="ev">${T('Self-reported', 'Autodeclarado')}</span>`;
      const grad = r.masteryAfter >= 2
        ? { pips: '■ ■', txt: T('Locked in!', 'Dominado!') }
        : r.masteryAfter === 1
          ? { pips: '■ □', txt: T('1 more clean play to lock it in', 'Mais 1 treino limpo para dominar') }
          : { pips: '□ □', txt: T('Saved to repeat — consolidation is progress', 'Fica para repetir — consolidar é progresso') };
      const bonusDone = r.bonusScore != null;
      const showSafari = r.showSafariHint && window.PWA && !matchMedia('(display-mode: standalone)').matches && navigator.standalone !== true;

      return `<section class="stage stage-reward">
        ${songMapStrip(g, p, p.next.id)}
        <div class="stage-body center-stage reward-body">
          <div class="reward-burst">${badge}</div>
          ${evLabel}
          <h2 class="reward-title">${esc(T(r.step.en, r.step.pt))}</h2>
          <p class="grad-line"><span class="grad-pips">${grad.pips}</span> ${grad.txt}</p>
          <div class="next-mm">
            <small>${T('Up next', 'Próximo passo')}</small>
            <b>${esc(T(p.next.en, p.next.pt))}</b>
          </div>
          ${weekRhythmMarkup(mom)}
          ${bonusDone
            ? `<div class="bonus-done">⚡ ${T(`Bonus done: ${r.bonusScore} switches`, `Bônus feito: ${r.bonusScore} trocas`)}${r.bonusEvidence === 'mic' ? ' · ' + T('Mic verified', 'Verificado por mic') : ''}${r.bonusBest ? ' · ' + T('New best!', 'Novo recorde!') : ''}</div>`
            : r.showBonus && r.bonusPair
              ? `<button type="button" class="bonus-card" data-goal-act="start-bonus">
                  <span class="bonus-ic">${icon('bolt')}</span>
                  <span class="bonus-txt"><b>${T('30s Bonus Jam', 'Desafio Relâmpago · 30s')}</b><small>${esc(CHORDS[r.bonusPair[0]].sym)} ⇄ ${esc(CHORDS[r.bonusPair[1]].sym)} · ${T('hands-free mic counter', 'contagem automática no mic')}</small></span>
                  <span class="bonus-go">→</span>
                </button>`
              : ''}
          ${showSafari ? `<button type="button" class="safari-tip" data-act="sheet" data-tab="diary">${T('Tip: keep progress safe — export backup or add to Home Screen →', 'Dica: proteja seu progresso — exporte cópia ou adicione à Tela de Início →')}</button>` : ''}
        </div>
        <footer class="stage-dock">
          <div class="dock-tools">
            <button type="button" class="btn ghost" data-goal-act="done-today">${T('Done for today', 'Fim por hoje')}</button>
            <button type="button" class="btn" data-goal-act="continue">${T('Next step →', 'Próximo passo →')}</button>
          </div>
        </footer>
      </section>`;
    }

    /* ───────── State 4: Inline 30s Hands-Free Bonus Chord-Change Jam */
    function bonusReadout(b) {
      const [a, c] = b.pair;
      if (!b.running) return T(`Press Start, then switch between ${CHORDS[a].sym} and ${CHORDS[c].sym} — the mic counts automatically.`, `Toque em Começar e alterne entre ${CHORDS[a].sym} e ${CHORDS[c].sym} — o microfone conta sozinho.`);
      if (b.manual) return T('Tap the counter after each clean switch (manual mode).', 'Toque no contador a cada troca limpa (modo manual).');
      const chk = b.check;
      if (!chk?.last) return T(`Listening… strum ${CHORDS[a].sym} or ${CHORDS[c].sym} to start`, `Ouvindo… toque ${CHORDS[a].sym} ou ${CHORDS[c].sym} para começar`);
      return T(`Heard ${CHORDS[chk.last].sym} ✓ · now play ${CHORDS[chk.next].sym}`, `Ouvi ${CHORDS[chk.last].sym} ✓ · agora toque ${CHORDS[chk.next].sym}`);
    }

    function bonusStage(g, p) {
      const [a, b] = bonus.pair;
      const key = [a, b].sort().join(':');
      const rec = (state().changes || {})[key];
      const last = bonus.check?.last || null;
      const next = bonus.check?.next || null;
      return `<section class="stage stage-bonus">
        ${songMapStrip(g, p, p.next.id)}
        <div class="stage-body center-stage">
          <div class="stage-head">
            <p class="eyebrow">⚡ ${T('30s Bonus Jam', 'Desafio Relâmpago · 30s')}</p>
            <h2>${esc(CHORDS[a].label)} ⇄ ${esc(CHORDS[b].label)}</h2>
            <p class="cue">${T('Hands on the ukulele — the microphone counts every clean switch.', 'Mãos no ukulele — o microfone conta cada troca limpa.')}</p>
          </div>
          <div class="mini-row bonus-minis">${[a, b].map((c) => `<button type="button" class="mini${last === c ? ' heard' : next === c ? ' target' : ''}" data-bonus-chord="${c}" data-act="peek" data-id="${c}">${diagrams.chordChart(CHORDS[c])}<span>${CHORDS[c].label}</span></button>`).join('')}</div>
          <div class="chg-board${bonus.running ? ' run' : ''}" id="bonus-board"${bonus.manual && bonus.running ? ' data-goal-act="bonus-manual-tap" role="button" tabindex="0"' : ''}>
            <span class="left" id="bonus-left">${bonus.left} s</span>
            <b id="bonus-n">${bonus.n}</b>
            <small id="bonus-lbl">${bonusReadout(bonus)}</small>
          </div>
          ${!bonus.manual ? `<div class="lvl-wrap${bonus.running ? ' on' : ''}"><div class="lvl" aria-hidden="true"><i id="lvl"></i><b id="lvlfloor"></b><span>${T('microphone level', 'nível do microfone')}</span></div></div>` : ''}
          <p class="hint" id="bonus-msg" role="status">${bonus.error || (rec ? `${T('Best', 'Recorde')}: <b>${rec.best}</b>${rec.evidence === 'mic' ? ' 🎤' : ''}` : T('No record yet for this pair.', 'Sem recorde ainda para este par.'))}</p>
        </div>
        <footer class="stage-dock">
          ${bonus.manual && bonus.running
            ? `<button type="button" class="btn big" data-goal-act="bonus-manual-tap">${T('+1 Clean switch', '+1 Troca limpa')}</button>`
            : `<button type="button" class="btn big${bonus.running ? ' listening' : ''}" data-goal-act="bonus-start">
                ${bonus.running ? `${icon('stop')} ${T('Finish now', 'Encerrar agora')}` : `${icon('mic')} ${T('Start listening (30 s)', 'Começar a ouvir (30 s)')}`}
              </button>`}
          <div class="dock-links">
            ${!bonus.running && !bonus.manual ? `<button type="button" class="link-btn" data-goal-act="bonus-manual">${T('No mic? Count manually', 'Sem mic? Contar na mão')}</button><span class="dot-sep" aria-hidden="true">·</span>` : ''}
            <button type="button" class="link-btn" data-goal-act="skip-bonus">${T('Back to summary', 'Voltar ao resumo')}</button>
          </div>
        </footer>
      </section>`;
    }

    /* ───────── State 5: Peaceful Done-for-Today Screen */
    function restStage(g, p) {
      const mom = computeWeeklyMomentum(g.history, today());
      return `<section class="stage stage-rest">
        ${songMapStrip(g, p, p.next.id)}
        <div class="stage-body center-stage reward-body">
          <div class="reward-burst rest-burst">🌴</div>
          <p class="eyebrow">${T('Session complete', 'Sessão concluída')}</p>
          <h2 class="reward-title">${T('Good work today.', 'Bom treino hoje.')}</h2>
          <p class="cue">${T('Short daily sessions beat cramming. See you next time.', 'Sessões curtas vencem maratonas. Até a próxima.')}</p>
          <div class="next-mm">
            <small>${T('Up next', 'Próximo passo')}</small>
            <b>${esc(T(p.next.en, p.next.pt))}</b>
          </div>
          ${weekRhythmMarkup(mom)}
        </div>
        <footer class="stage-dock">
          <button type="button" class="btn ghost big" data-goal-act="continue">${T('Practice one more step', 'Praticar mais um passo')}</button>
        </footer>
      </section>`;
    }

    /* ───────── Drawer Tab: Full Song Plan, Roadmap & Settings (tucked away!) */
    function planSheet() {
      const g = goal();
      if (!g) return `<p class="hint">${T('No active song yet.', 'Nenhuma música ativa ainda.')}</p>`;
      const p = plan(g, today());
      const total = p.steps.length * 2, earned = p.steps.reduce((n, s) => n + Math.min(2, g.mastery[s.id] || 0), 0);
      const percent = total ? Math.round(100 * earned / total) : 0;
      const forecast = !g.song ? T('Chords pending', 'Buscando acordes')
        : p.days === 0 ? T('Target date passed — pick a new date', 'A data passou — escolha outra')
          : p.remaining === 0 ? T('Ready for rehearsal', 'Pronto para ensaiar')
            : p.remaining <= p.capacity ? T('Beginner version is feasible', 'Versão iniciante é viável')
              : T(`Tight date — needs ~${p.requiredDays} days at ${g.minutes} min/day`, `Data apertada — precisa de ~${p.requiredDays} dias com ${g.minutes} min/dia`);
      const src = g.song?.source ? `<a href="${esc(g.song.source)}" target="_blank" rel="noopener noreferrer">${T('Chord source', 'Fonte dos acordes')}</a>` : T('Source pending', 'Fonte pendente');
      const curStep = activeStep(g, p);

      return `<div class="sheet-song-hero">
        <p class="eyebrow">${T('Active song goal', 'Meta musical ativa')}</p>
        <h3>${esc(g.song?.title || g.title)}</h3>
        ${g.song?.artist || g.artist ? `<p class="hint">${esc(g.song?.artist || g.artist)}</p>` : ''}
        <div class="sheet-stats">
          <span><b>${p.days}</b> ${T('days left', 'dias')} (${dateLabel(g.date)})</span>
          <span><b>${g.minutes}</b> ${T('min/day', 'min/dia')}</span>
          <span><b>${percent}%</b></span>
        </div>
        <p class="forecast-line">${forecast}</p>
      </div>
      ${g.song ? `<article class="card compact-card">
        <div class="goal-facts">
          <span>${src}</span>
          <span>${T('Key', 'Tom')}: ${esc(g.song.key || '—')}${g.song.originalKey && g.song.originalKey !== g.song.key ? ` (${T('from', 'de')} ${esc(g.song.originalKey)})` : ''}</span>
          <span>${g.song.beats}/4 · ${g.song.tempo} BPM</span>
          ${g.song.strum ? `<span>${esc(g.song.strum)}</span>` : ''}
        </div>
        ${g.song.coverage !== 'full' ? `<p class="goal-alert">${T('Sourced beginner excerpt. Full recording may have more sections.', 'Trecho iniciante com fonte. A gravação completa pode ter mais partes.')}</p>` : ''}
        <p class="hint" style="margin:6px 0 0">${T('Remaining practice', 'Treino restante')}: <b>${p.remaining} min</b></p>
      </article>` : ''}
      <article class="card compact-card">
        <h4>${T('Song roadmap', 'Roteiro da música')} <small>${T('tap any step to try it', 'toque para praticar')}</small></h4>
        <ol class="roadmap-list">${p.steps.map((s) => {
          const m = g.mastery[s.id] || 0;
          const badge = m >= 2 ? '✓' : m === 1 ? '◐' : s.id === curStep.id ? '●' : '○';
          return `<li><button type="button" class="roadmap-btn${m >= 2 ? ' done' : ''}${s.id === curStep.id ? ' cur' : ''}" data-goal-act="jump-step" data-step="${esc(s.id)}"><i>${badge}</i><span>${esc(T(s.en, s.pt))}</span></button></li>`;
        }).join('')}</ol>
      </article>
      <details class="card compact-card goal-edit">
        <summary>${T('Change date or minutes', 'Alterar data ou minutos')}</summary>
        <form id="goal-edit">
          <div class="goal-fields compact-fields">
            <label>${T('Play it by', 'Tocar até')}<input name="date" type="date" min="${today()}" value="${esc(g.date)}" required></label>
            <label>${T('Min / day', 'Min / dia')}<select name="minutes">${[5, 10, 15, 20].map((m) => `<option value="${m}"${m === g.minutes ? ' selected' : ''}>${m}</option>`).join('')}</select></label>
          </div>
          <button class="btn sea sm" type="submit">${T('Save and replan', 'Salvar e replanejar')}</button>
        </form>
      </details>
      <div class="row wrap goal-tools">
        <button type="button" class="btn sm ghost danger" data-goal-act="remove">${T('Switch song', 'Trocar de música')}</button>
      </div>`;
    }

    function headerMeta() {
      const g = goal();
      if (!g) return null;
      const p = plan(g, today());
      return {
        title: g.song?.title || g.title,
        days: `${p.days}${T('d', 'd')}`,
        tuned: isTunedToday(g),
        showTuneBtn: !needsTuning(g),
      };
    }

    function view() {
      const g = goal();
      if (!g) return setup();
      const p = plan(g, today());
      if (needsTuning(g)) return tunerStage(g, p);
      if (bonus) return bonusStage(g, p);
      if (rewardState) return rewardStage(g, p);
      if (restMode) return restStage(g, p);
      return lessonStage(g, p);
    }

    function submit(form) {
      const fd = new FormData(form), title = String(fd.get('title') || '').trim(), date = String(fd.get('date') || '');
      if (!title || daysBetween(today(), date) < 0) return;
      const found = catalog.find((s) => sameTitle(s.title, title));
      lookupStarted = false; lookupError = '';
      forceTuner = false; checkinOpen = false; previewStepId = null; rewardState = null; restMode = false; bonus = null; sectionChord = null;
      state().goal = {
        title,
        artist: String(fd.get('artist') || '').trim(),
        date,
        minutes: Math.max(5, Math.min(20, Number(fd.get('minutes')) || 15)),
        skill: { tune: false, strum: false, chords: [] },
        song: found ? parseSong(found) : null,
        mastery: {},
        history: [],
        tunedOn: null,
      };
      state().onboarded = true;
      save(); render();
    }

    function edit(form) {
      const g = goal(), fd = new FormData(form), date = String(fd.get('date') || '');
      if (!g || !date || daysBetween(today(), date) < 0) return;
      g.date = date;
      g.minutes = Math.max(5, Math.min(20, Number(fd.get('minutes')) || g.minutes));
      save(); render();
      if (window.UI) UI.toast(T('Plan updated.', 'Plano atualizado.'));
    }

    function finishLessonCheckin(g, s, result, evidence, rec) {
      if (s.id !== 'rehearse') {
        g.mastery[s.id] = Math.min(2, (g.mastery[s.id] || 0) + (result === 'easy' ? 2 : result === 'ok' ? 1 : 0));
      }
      g.history.push({ date: today(), id: s.id, title: s.en, result, evidence, rec });
      save();
      const nonTuningCount = g.history.filter((h) => h.id !== 'tuning').length;
      const bonusPair = pickBonusPair(g, s);
      const eligibleBonus = Boolean(bonusPair && result !== 'hard' && ['chord', 'change', 'section'].includes(s.kind) && nonTuningCount >= 2 && g.lastBonusDate !== today());
      const showBonus = eligibleBonus && Math.random() < 0.35;
      if (showBonus) { g.lastBonusDate = today(); save(); }
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      checkinOpen = false;
      previewStepId = null;
      restMode = false;
      rewardState = {
        step: s,
        result,
        evidence,
        masteryAfter: g.mastery[s.id] || 0,
        bonusPair,
        showBonus,
        bonusScore: null,
        bonusBest: false,
        showSafariHint: isIOS && nonTuningCount >= 2,
      };
      render();
      if (result !== 'hard') {
        if (chime) chime();
        if (window.UI) { UI.confetti(); UI.buzz([20, 40, 20]); }
      }
    }

    async function finishBonus() {
      if (!bonus) return;
      if (bonus.int) clearInterval(bonus.int);
      if (bonus.check) bonus.check.flush();
      const n = bonus.check ? bonus.check.count : bonus.n;
      const evidence = bonus.manual ? 'self' : 'mic';
      const { pair } = bonus;
      if (listening && liveKind === 'bonus') { listening = false; liveKind = null; await Mic.stop(); }
      const key = [...pair].sort().join(':');
      const S = state();
      S.changes ||= {};
      const old = S.changes[key];
      const best = Math.max(n, old ? old.best : 0);
      const isBest = n > 0 && (!old || n > old.best);
      if (n > 0) {
        S.changes[key] = { best, last: n, on: today(), evidence };
        save();
      }
      bonus = null;
      if (rewardState) { rewardState.bonusScore = n; rewardState.bonusBest = isBest; rewardState.bonusEvidence = evidence; }
      Snd.click(0, true);
      if (window.UI) { UI.buzz([30, 60, 30]); if (isBest) UI.confetti(); }
      render();
    }

    function highlightChordCards(chordId) {
      document.querySelectorAll('.goal-diagram[data-chord]').forEach((el) => el.classList.toggle('active-play', el.dataset.chord === chordId));
      document.querySelectorAll('.bar-chip[data-chord]').forEach((el) => el.classList.toggle('active-play', el.dataset.chord === chordId));
    }

    async function action(b) {
      const act = b.dataset.goalAct;
      if (act === 'pick-song') { selectSong(b.dataset.title, b.dataset.artist || '', b); return; }
      const g = goal(); if (!g) return;

      if (act === 'open-tuner') {
        stopAudioAndMic();
        forceTuner = true; rewardState = null; restMode = false; bonus = null; checkinOpen = false;
        render(); return;
      }

      if (act === 'tune-string') {
        const sIdx = Number(b.dataset.s);
        if (listening) { listening = false; await Mic.stop(); liveCheck = null; liveKind = null; }
        Player.stop();
        playingString = sIdx;
        document.querySelectorAll('.tpad').forEach((el, idx) => el.classList.toggle('ring', idx === sIdx));
        await Snd.string(sIdx);
        if (Snd.mode === 'synth') {
          const msg = document.querySelector('#goal-audio-msg');
          if (msg) msg.textContent = T('Recorded sound unavailable; using synthetic backup.', 'Som gravado indisponível; usando som sintético.');
        }
        setTimeout(() => { if (playingString === sIdx) { playingString = -1; document.querySelectorAll('.tpad.ring').forEach((el) => el.classList.remove('ring')); } }, 900);
        return;
      }

      if (act === 'tune-play') {
        if (listening) { listening = false; await Mic.stop(); liveCheck = null; liveKind = null; }
        if (Player.on) {
          Player.stop(); playingString = -1;
          document.querySelectorAll('.tpad.ring').forEach((el) => el.classList.remove('ring'));
          b.innerHTML = `${icon('play')} ${T('Hear all 4', 'Ouvir as 4')}`;
          return;
        }
        b.innerHTML = `${icon('stop')} ${T('Stop', 'Parar')}`;
        await Player.start({ notes: [[0, 0], [1, 0], [2, 0], [3, 0]] }, 66, {
          click: false,
          onSlot: (idx) => {
            playingString = idx;
            document.querySelectorAll('.tpad').forEach((el, i) => el.classList.toggle('ring', i === idx));
          },
        });
        if (Snd.mode === 'synth') {
          const msg = document.querySelector('#goal-audio-msg');
          if (msg) msg.textContent = T('Recorded sound unavailable; using synthetic backup.', 'Som gravado indisponível; usando som sintético.');
        }
        return;
      }

      if (act === 'tune-self') {
        stopAudioAndMic();
        g.tunedOn = today();
        forceTuner = false;
        checkinOpen = false;
        g.history.push({ date: today(), id: 'tuning', title: 'Tune GCEA', result: 'tuned', evidence: 'self' });
        save(); render(); return;
      }

      if (act === 'tune-verify') {
        const msg = document.querySelector('#goal-audio-msg');
        if (listening && liveKind === 'tune') {
          listening = false; liveCheck = null; liveKind = null;
          await Mic.stop(); render(); return;
        }
        Player.stop(); playingString = -1;
        liveCheck = makeCheck({ k: 'tune' });
        liveKind = 'tune';
        try {
          listening = true; frameN = 0;
          render();
          await Mic.start(async (frame) => {
            if (!listening || liveKind !== 'tune' || !liveCheck) return;
            liveCheck.feed(frame);
            if (showLevel) showLevel(frame);
            if (liveCheck.done) {
              listening = false; liveKind = null;
              await Mic.stop();
              g.tunedOn = today(); forceTuner = false; checkinOpen = false;
              g.history.push({ date: today(), id: 'tuning', title: 'Tune GCEA', result: 'tuned', evidence: 'mic' });
              save();
              if (chime) chime();
              if (window.UI) { UI.buzz([20, 40, 20]); UI.toast(T('✓ Tuned with microphone!', '✓ Afinado pelo microfone!')); }
              liveCheck = null;
              render();
              return;
            }
            if (++frameN % 3 === 0) {
              const box = document.querySelector('#tuner-live');
              if (box) box.innerHTML = tunerLiveMarkup(liveCheck);
            }
          }, false);
        } catch {
          listening = false; liveCheck = null; liveKind = null;
          render();
          const m = document.querySelector('#goal-audio-msg');
          if (m) m.textContent = T('Microphone blocked. Tap a string to tune by ear, or tap "Already in tune".', 'Microfone bloqueado. Toque nas cordas para afinar de ouvido ou toque em "Já está afinado".');
        }
        return;
      }

      if (act === 'play') {
        const p = plan(g, today()), s = activeStep(g, p);
        if (Player.on) {
          Player.stop();
          highlightChordCards(null);
          document.querySelectorAll('.slot.on').forEach((el) => el.classList.remove('on'));
          b.innerHTML = `${icon('play')} ${T('Play along', 'Tocar junto')}`;
          b.classList.remove('sea');
          return;
        }
        if (listening) { listening = false; liveCheck = null; liveKind = null; await Mic.stop(); }
        b.innerHTML = `${icon('stop')} ${T('Stop', 'Parar')}`;
        b.classList.add('sea');
        if (s.kind === 'open') {
          await Player.start({ notes: [[0, 0], [1, 0], [2, 0], [3, 0]] }, 68, { click: false });
          return;
        }
        const seq = s.chord ? [s.chord]
          : s.chords ? s.chords
            : g.song
              ? (s.section != null
                ? g.song.sections[s.section].bars.flat().filter((c, i, a) => i === 0 || c !== a[i - 1]).slice(0, 8)
                : g.song.sections.flatMap((x) => x.bars.flat()).filter((c, i, a) => i === 0 || c !== a[i - 1]).slice(0, 8))
              : ['C'];
        const playSeq = s.kind === 'downstrum' ? [seq[0] || 'C'] : (seq.length ? seq : ['C']);
        const pat = g.song?.beats === 3 ? 'D.D.D.' : 'D.D.D.D.';
        await Player.start({ seq: playSeq, pat }, Math.min(86, g.song?.tempo || 72), {
          click: true,
          onSlot: (slot, ci) => {
            document.querySelectorAll('.slot').forEach((el) => el.classList.toggle('on', Number(el.dataset.slot) === slot));
            highlightChordCards(playSeq[ci]);
          },
        });
        if (Snd.mode === 'synth') {
          const msg = document.querySelector('#goal-audio-msg');
          if (msg) msg.textContent = T('Recorded sound unavailable; using synthetic backup.', 'Som gravado indisponível; usando som sintético.');
        }
        return;
      }

      if (act === 'verify') {
        const p = plan(g, today()), s = activeStep(g, p);
        if (listening && liveKind === 'lesson') {
          listening = false; liveCheck = null; liveKind = null;
          await Mic.stop(); render(); return;
        }
        Player.stop();
        const spec = s.kind === 'open' ? { k: 'notes', seq: [[0, 0], [1, 0], [2, 0], [3, 0]] }
          : s.kind === 'chord' ? { k: 'strings', chord: s.chord }
            : s.kind === 'change' ? { k: 'chords', seq: [...s.chords, ...s.chords] }
              : { k: 'strum', n: 12, even: true, chords: songChordList(g) };
        liveCheck = makeCheck(spec);
        liveKind = 'lesson';
        try {
          listening = true; frameN = 0;
          render();
          await Mic.start(async (frame) => {
            if (!listening || liveKind !== 'lesson' || !liveCheck) return;
            liveCheck.feed(frame);
            if (showLevel) showLevel(frame);
            if (liveCheck.done) {
              const passed = liveCheck.pass !== false;
              listening = false; liveKind = null; liveCheck = null;
              const blob = await Mic.stop();
              if (!passed) {
                render();
                const msg = document.querySelector('#goal-audio-msg');
                if (msg) msg.textContent = T('Uneven spacing — try again slowly.', 'Ritmo irregular — tente mais devagar.');
                return;
              }
              let rec;
              if (blob?.size) {
                rec = Date.now();
                try {
                  await RecStore.put({ id: rec, d: today(), dose: `goal:${s.id}`, title: { en: s.en, pt: s.pt }, blob });
                  const all = await RecStore.all();
                  for (const oldRec of all.sort((a, x) => x.id - a.id).slice(30)) await RecStore.del(oldRec.id);
                } catch {}
              }
              finishLessonCheckin(g, s, 'easy', 'mic', rec);
              return;
            }
            if (++frameN % 3 === 0) {
              const box = document.querySelector('#lesson-live');
              if (box) box.innerHTML = lessonLiveMarkup(s, liveCheck);
            }
          }, true);
        } catch {
          listening = false; liveCheck = null; liveKind = null;
          render();
          const msg = document.querySelector('#goal-audio-msg');
          if (msg) msg.textContent = T('Microphone unavailable. Tap "I played it" below.', 'Microfone indisponível. Toque em "Toquei" abaixo.');
        }
        return;
      }

      if (act === 'next-hold') {
        stopAudioAndMic();
        const p = plan(g, today()), s = activeStep(g, p);
        g.mastery[s.id] = 2;
        g.history.push({ date: today(), id: s.id, title: s.en, result: 'easy', evidence: 'self' });
        previewStepId = null; checkinOpen = false;
        save(); render(); return;
      }

      if (act === 'reveal-checkin') {
        if (listening) { listening = false; liveCheck = null; liveKind = null; await Mic.stop(); }
        Player.stop();
        checkinOpen = true;
        render(); return;
      }

      if (act === 'check') {
        stopAudioAndMic();
        const p = plan(g, today()), s = activeStep(g, p), result = b.dataset.result;
        if (!['easy', 'ok', 'hard'].includes(result)) return;
        finishLessonCheckin(g, s, result, 'self');
        return;
      }

      if (act === 'section-chord') {
        sectionChord = b.dataset.chord;
        render(); return;
      }

      if (act === 'continue') {
        stopAudioAndMic();
        rewardState = null; restMode = false; bonus = null; checkinOpen = false;
        render(); return;
      }

      if (act === 'done-today') {
        stopAudioAndMic();
        rewardState = null; restMode = true; bonus = null; checkinOpen = false;
        render(); return;
      }

      if (act === 'start-bonus') {
        if (!rewardState?.bonusPair) return;
        stopAudioAndMic();
        bonus = { pair: rewardState.bonusPair, left: 30, n: 0, running: false, manual: false, check: null, error: '', int: null };
        render(); return;
      }

      if (act === 'bonus-start') {
        if (!bonus) return;
        if (bonus.running) { await finishBonus(); return; }
        Player.stop();
        const check = makeCheck({ k: 'changes', pair: bonus.pair });
        bonus.check = check; bonus.n = 0; bonus.left = 30; bonus.error = ''; bonus.manual = false;
        try {
          listening = true; liveKind = 'bonus'; bonus.running = true;
          render();
          let prevCount = 0;
          await Mic.start((frame) => {
            if (!listening || liveKind !== 'bonus' || !bonus?.check) return;
            bonus.check.feed(frame);
            if (showLevel) showLevel(frame);
            if (bonus.check.count !== prevCount) {
              prevCount = bonus.check.count;
              bonus.n = prevCount;
              if (window.UI) UI.buzz(10);
              const cnt = document.querySelector('#bonus-n');
              if (cnt) { cnt.textContent = prevCount; cnt.classList.remove('pop-num'); void cnt.offsetWidth; cnt.classList.add('pop-num'); }
            }
            const lbl = document.querySelector('#bonus-lbl');
            if (lbl) lbl.textContent = bonusReadout(bonus);
            document.querySelectorAll('[data-bonus-chord]').forEach((el) => {
              el.classList.toggle('heard', bonus.check.last === el.dataset.bonusChord);
              el.classList.toggle('target', bonus.check.next === el.dataset.bonusChord);
            });
          }, false);
          bonus.int = setInterval(() => {
            if (!bonus) return;
            bonus.left--;
            const el = document.querySelector('#bonus-left');
            if (!el) { clearInterval(bonus.int); bonus.int = null; return; }
            el.textContent = `${bonus.left} s`;
            if (bonus.left <= 0) finishBonus();
          }, 1000);
        } catch {
          listening = false; liveKind = null; bonus.running = false; bonus.check = null;
          bonus.error = T('Microphone unavailable. Allow mic access or tap "Count manually" below.', 'Microfone indisponível. Permita o microfone ou toque em "Contar na mão".');
          render();
        }
        return;
      }

      if (act === 'bonus-manual') {
        if (!bonus) return;
        stopAudioAndMic();
        bonus.manual = true; bonus.running = true; bonus.n = 0; bonus.left = 30; bonus.error = '';
        render();
        bonus.int = setInterval(() => {
          if (!bonus) return;
          bonus.left--;
          const el = document.querySelector('#bonus-left');
          if (!el) { clearInterval(bonus.int); bonus.int = null; return; }
          el.textContent = `${bonus.left} s`;
          if (bonus.left <= 0) finishBonus();
        }, 1000);
        return;
      }

      if (act === 'bonus-manual-tap') {
        if (!bonus?.running || !bonus.manual) return;
        if (window.UI) UI.buzz(8);
        bonus.n++;
        const cnt = document.querySelector('#bonus-n');
        if (cnt) cnt.textContent = bonus.n;
        return;
      }

      if (act === 'skip-bonus') {
        if (bonus?.int) clearInterval(bonus.int);
        if (listening && liveKind === 'bonus') { listening = false; liveKind = null; await Mic.stop(); }
        bonus = null;
        render(); return;
      }

      if (act === 'jump-step') {
        stopAudioAndMic();
        previewStepId = b.dataset.step;
        forceTuner = false; rewardState = null; restMode = false; bonus = null; checkinOpen = false;
        const dlg = document.querySelector('#sheet');
        if (dlg?.open) dlg.close();
        render(); return;
      }

      if (act === 'back-next') {
        stopAudioAndMic();
        previewStepId = null; checkinOpen = false;
        render(); return;
      }

      if (act === 'lookup') { await lookup(g); return; }

      if (act === 'remove' && confirm(T('Switch to another song? Your history will be archived on this device.', 'Trocar de música? Seu histórico será arquivado neste aparelho.'))) {
        stopAudioAndMic();
        lookupStarted = false; lookupError = '';
        forceTuner = false; rewardState = null; restMode = false; bonus = null; previewStepId = null; checkinOpen = false;
        (state().previousJourneys ||= []).push({ archivedAt: new Date().toISOString(), goal: g });
        state().goal = null; state().onboarded = false;
        const dlg = document.querySelector('#sheet');
        if (dlg?.open) dlg.close();
        save(); render();
      }
    }

    function report() {
      const g = goal(); if (!g) return '';
      const p = plan(g, today());
      const mom = computeWeeklyMomentum(g.history, today());
      return [
        `Song goal: ${g.title}${g.artist ? ` — ${g.artist}` : ''}`,
        `Deadline: ${g.date}; ${g.minutes} min/day; Weekly rhythm: ${mom.daysThisWeek}/${mom.target} days (${mom.weeksInRhythm} wk)`,
        `Arrangement: ${g.song ? g.song.source || 'no source' : 'pending'}`,
        `Remaining focused practice: ${p.remaining} min`,
        ...g.history.slice(-10).map((h) => `${h.date}: ${h.title} — ${h.result} (${h.evidence || 'self'})`),
      ].join('\n');
    }

    return {
      view,
      planSheet,
      headerMeta,
      submit,
      edit,
      action,
      searchInput,
      report,
      stop: stopAudioAndMic,
      plan: () => (goal() ? plan(goal(), today()) : null),
      weeklyMomentum: () => computeWeeklyMomentum(goal()?.history || [], today()),
      openTuner: () => { stopAudioAndMic(); forceTuner = true; rewardState = null; restMode = false; bonus = null; render(); },
    };
  }

  window.SongGoal = { init, parseSong, songSteps, plan, computeWeeklyMomentum };
})();
