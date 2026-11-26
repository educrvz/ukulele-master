/* Song Goal Mode. One active song, local progress, deterministic replanning. */
(function () {
  const catalog = window.SONG_CATALOG || [];
  const CHORDS = window.UKE.CHORDS;
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
    return { title, artist: String(raw.artist || '').trim().slice(0, 100), source: validUrl(raw.source), key: String(raw.key || '').slice(0, 12), originalKey: String(raw.originalKey || '').slice(0, 12), tempo: Math.max(40, Math.min(200, Number(raw.tempo) || 72)), beats: Number(raw.beats) === 3 ? 3 : 4, strum: String(raw.strum || '').slice(0, 40), coverage: raw.coverage === 'full' && !truncated ? 'full' : 'excerpt', truncated, sections };
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
    unique.forEach((c) => { if (!goal.skill?.chords?.includes(c)) steps.push({ id: `chord:${c}`, kind: 'chord', chord: c, en: `${CHORDS[c].label} clearly`, pt: `${CHORDS[c].label} com som limpo`, cost: 10 }); });
    transitions.slice(0, 8).forEach((pair) => {
      const [a, b] = pair.split(':');
      steps.push({ id: `change:${pair}`, kind: 'change', chords: [a, b], en: `${CHORDS[a].label} to ${CHORDS[b].label}`, pt: `${CHORDS[a].label} para ${CHORDS[b].label}`, cost: 10 });
    });
    steps.push({ id: 'pulse', kind: 'pulse', en: 'Keep a steady pulse', pt: 'Manter o pulso firme', cost: 8 });
    song.sections.forEach((s, i) => steps.push({ id: `section:${i}`, kind: 'section', section: i, en: `Play ${s.name}`, pt: `Tocar ${s.name}`, cost: 15 }));
    steps.push({ id: 'playthrough', kind: 'playthrough', en: song.coverage === 'full' ? 'Play the song from start to finish' : 'Play the beginner excerpt from start to finish', pt: song.coverage === 'full' ? 'Tocar a música do início ao fim' : 'Tocar o trecho iniciante do início ao fim', cost: 20 });
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
    return { steps, pending, remaining, days, capacity, requiredDays, schedule, next: pending[0] || { id: 'rehearse', kind: 'rehearse', en: 'Rehearse the whole song', pt: 'Ensaiar a música inteira', cost: goal.minutes } };
  }

  function init(ctx) {
    const { state, save, render, today, lang, diagrams } = ctx;
    const T = (en, pt) => lang() === 'pt' ? pt : en;
    const name = (c) => CHORDS[c]?.label || c;
    const dateLabel = (s) => new Date(s + 'T12:00:00').toLocaleDateString(lang() === 'pt' ? 'pt-BR' : 'en-GB', { day: 'numeric', month: 'short' });
    const goal = () => state().goal;
    let listening = false;
    let lookupStarted = false;
    let lookupBusy = false;
    let lookupError = '';
    let searchTimer = null;
    let searchController = null;
    let sessionReady = false;
    const onlineLookup = location.protocol === 'https:' && location.hostname !== 'educrvz.github.io' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';

    function selectSong(title, artist, button) {
      const form = document.querySelector('#goal-setup');
      if (!form) return;
      form.elements.title.value = title;
      form.elements.artist.value = artist;
      form.elements.query.value = `${title} — ${artist}`;
      form.querySelector('#song-selected').textContent = T(`Selected: ${title} — ${artist}`, `Selecionada: ${title} — ${artist}`);
      form.querySelector('#song-results').replaceChildren();
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
      form.querySelector('#song-selected').textContent = '';
      form.querySelectorAll('[data-goal-act="pick-song"]').forEach((x) => x.classList.remove('on'));
      const results = form.querySelector('#song-results');
      const query = input.value.trim();
      if (query.length < 2) { results.textContent = T('Type at least two letters to search.', 'Digite pelo menos duas letras para buscar.'); return; }
      results.textContent = T('Searching songs…', 'Buscando músicas…');
      searchTimer = setTimeout(async () => {
        const controller = new AbortController(); searchController = controller;
        try {
          const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
          if (!response.ok) throw Error('search');
          const data = await response.json();
          if (controller.signal.aborted || !form.isConnected || input.value.trim() !== query) return;
          const songs = Array.isArray(data.songs) ? data.songs : [];
          results.innerHTML = songs.length ? songs.slice(0, 6).map((song) => `<button type="button" class="song-result" data-goal-act="pick-song" data-title="${esc(song.title)}" data-artist="${esc(song.artist)}"><b>${esc(song.title)}</b><small>${esc(song.artist)}</small></button>`).join('') : T('No matching chord songs found. Try another spelling or artist.', 'Nenhuma música com acordes encontrada. Tente outra grafia ou artista.');
        } catch (error) {
          if (!controller.signal.aborted && form.isConnected) results.textContent = T('Song search is unavailable right now. Try again shortly.', 'A busca de músicas está indisponível agora. Tente novamente em breve.');
        }
      }, 350);
    }

    function setup() {
      const tomorrow = addDays(today(), 1);
      return `<h1 class="page">${T('Play a song by a date', 'Toque uma música até uma data')}</h1>
        <p class="page-sub">${T('Choose a song. We turn it into tiny lessons and revise the plan after every check-in.', 'Escolha uma música. Ela vira pequenas aulas, e o plano é revisto a cada retorno.')}</p>
        <form id="goal-setup" class="card goal-form">
          <label>${T('Song or artist', 'Música ou artista')}<input name="query" id="song-search" maxlength="120" placeholder="${T('Type a song or artist', 'Digite uma música ou artista')}" autocomplete="off"></label>
          <div id="song-results" class="song-results" role="status">${T('Type at least two letters to search.', 'Digite pelo menos duas letras para buscar.')}</div>
          <p id="song-selected" class="hint" role="status"></p><input name="title" type="hidden"><input name="artist" type="hidden">
          <div><p class="hint">${T('Ready-to-play starter songs', 'Músicas iniciais prontas para tocar')}</p><div class="chips">${catalog.map((s) => `<button type="button" class="chip" data-goal-act="pick-song" data-title="${esc(s.title)}" data-artist="${esc(s.artist || '')}">${esc(s.title)}</button>`).join('')}</div></div>
          <div class="goal-fields"><label>${T('I want to play it by', 'Quero tocar até')}<input name="date" type="date" min="${today()}" value="${addDays(today(), 21)}" required></label>
          <label>${T('Minutes per day', 'Minutos por dia')}<select name="minutes"><option value="5">5</option><option value="10">10</option><option value="15" selected>15</option><option value="20">20</option></select></label></div>
          <button class="btn big" type="submit" disabled>${T('Build my plan', 'Montar meu plano')}</button></form>
        <p class="hint">${T('Select a suggested song first. Progress stays on this device.', 'Selecione uma música sugerida. O progresso fica neste aparelho.')}</p>`;
    }

    function pendingSong(g) {
      if (onlineLookup && !lookupStarted) { lookupStarted = true; queueMicrotask(() => lookup(g)); }
      return `<article class="card"><h3>${T('Finding your song', 'Buscando sua música')}</h3>
        <p>${T('Your song and date are saved. We are finding a chord source and preparing your lessons.', 'Sua música e data estão salvas. Estamos buscando uma fonte de acordes e preparando suas aulas.')}</p>
        <p id="goal-lookup-msg" role="status">${lookupBusy || !lookupStarted ? T('Finding a chord source and building your plan…', 'Buscando uma fonte de acordes e montando seu plano…') : esc(lookupError)}</p>
        ${onlineLookup ? `<button class="btn sm" data-goal-act="lookup" ${lookupBusy ? 'disabled' : ''}>${T('Try again', 'Tentar de novo')}</button>` : ''}</article>`;
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
        lookupError = error.message === 'different title' ? T('The chord source named a different song. Choose another result.', 'A fonte de acordes indicou outra música. Escolha outro resultado.') : T('Could not verify this song right now. Try again.', 'Não consegui verificar esta música agora. Tente de novo.');
      } finally { lookupBusy = false; render(); }
    }

    function lesson(g, p) {
      const s = p.next, song = g.song, heard = s.chord ? [s.chord] : s.chords || (s.section != null ? [...new Set(song.sections[s.section].bars.flat())].slice(0, 3) : []);
      let instruction = '';
      if (s.kind === 'hold') instruction = T('Sit comfortably. Rest the body against your chest, support the neck lightly, and keep your shoulders relaxed.', 'Sente-se com conforto. Apoie o corpo no peito, segure o braço com leveza e relaxe os ombros.');
      if (s.kind === 'open') instruction = T('Pluck the strings from face to floor: G, C, E, A. Hear each one ring without touching a fret.', 'Toque as cordas do rosto para o chão: G, C, E, A. Ouça cada uma soar sem apertar uma casa.');
      if (s.kind === 'downstrum') instruction = T('Brush down gently with your index finger. Try four slow strokes, leaving space between them.', 'Passe o indicador suavemente para baixo. Faça quatro batidas lentas, com espaço entre elas.');
      if (s.kind === 'chord') instruction = T(`Form ${name(s.chord)}. Pluck each string, then play four slow downstrums. Listen for buzzes.`, `Monte ${name(s.chord)}. Toque cada corda e depois faça quatro batidas lentas para baixo. Ouça se há zumbidos.`);
      if (s.kind === 'change') instruction = T(`Play two downstrums on ${name(s.chords[0])}, pause, then two on ${name(s.chords[1])}. Repeat slowly.`, `Faça duas batidas em ${name(s.chords[0])}, pause, depois duas em ${name(s.chords[1])}. Repita devagar.`);
      if (s.kind === 'pulse') instruction = T(`Count ${song.beats} beats aloud. One gentle downstrum per beat at a comfortable pace.`, `Conte ${song.beats} tempos em voz alta. Uma batida suave para baixo por tempo, em ritmo confortável.`);
      if (s.kind === 'section') instruction = T('Play this section slowly, one downstrum per beat. Pause at changes, then try again without stopping.', 'Toque esta parte devagar, uma batida para baixo por tempo. Pause nas trocas e depois tente sem parar.');
      if (s.kind === 'playthrough' || s.kind === 'rehearse') instruction = T('Play from the first section to the last at a comfortable tempo. A pause is fine; note the hardest change.', 'Toque da primeira à última parte em andamento confortável. Pode pausar; observe a troca mais difícil.');
      const section = s.kind === 'section' ? song.sections[s.section] : null;
      return `<article class="card goal-lesson"><p class="eyebrow">${T('Today’s five-minute lesson', 'Aula de cinco minutos de hoje')}</p><h3>${esc(T(s.en, s.pt))}</h3>
        <p>${s.kind === 'hold' || s.kind === 'open' ? T('Start slowly:', 'Comece devagar:') : T('Minute 1: look at the shapes. Minutes 2–5:', 'Minuto 1: veja os desenhos. Minutos 2–5:')} ${esc(instruction)}</p>
        ${section ? `<div class="goal-bars">${section.bars.map((bar) => `<span>${bar.filter((c, i) => i === 0 || c !== bar[i - 1]).map((c) => esc(name(c))).join(' · ')}</span>`).join('')}</div>` : ''}
        ${heard.map((c) => `<div class="goal-diagram"><h4>${esc(name(c))}</h4><div class="pair"><figure>${diagrams.chordChart(CHORDS[c])}<figcaption>${T('Finger placement', 'Posição dos dedos')}</figcaption></figure><figure>${diagrams.chordNeck(CHORDS[c])}<figcaption>${T('Sounding notes', 'Notas que soam')}</figcaption></figure></div><p class="sound">${diagrams.soundLine(CHORDS[c])}</p></div>`).join('')}
        <div class="goal-checkins">${s.kind === 'hold' ? '' : `<button class="btn sm ghost" data-goal-act="play">▶ ${T('Play-along sound', 'Som para acompanhar')}</button>`}
        ${['tune', 'chord', 'change', 'pulse'].includes(s.kind) ? `<button class="btn sm ghost" data-goal-act="verify">🎤 ${T('Microphone check', 'Checagem com microfone')}</button>` : ''}</div>
        <p id="goal-audio-msg" class="hint" role="status">${T('Play-along uses recorded ukulele notes when available. Pause it before using the microphone.', 'O acompanhamento usa notas de ukulele gravadas quando disponíveis. Pare o som antes de usar o microfone.')}</p>
        <p class="hint">${T('Check in only after playing. The buttons below are self-reported.', 'Faça o retorno só depois de tocar. Os botões abaixo são autodeclarados.')}</p>
        <div class="goal-checkins"><button class="btn sm" data-goal-act="check" data-result="easy">${T('Clear and comfortable', 'Limpo e confortável')}</button><button class="btn sm ghost" data-goal-act="check" data-result="ok">${T('Played, needs practice', 'Toquei, preciso praticar')}</button><button class="btn sm ghost" data-goal-act="check" data-result="hard">${T('Tried, still hard', 'Tentei, ainda difícil')}</button></div></article>`;
    }

    function dashboard(g) {
      const p = plan(g, today());
      const total = p.steps.length * 2, earned = p.steps.reduce((n, s) => n + Math.min(2, g.mastery[s.id] || 0), 0);
      const percent = total ? Math.round(100 * earned / total) : 0;
      const forecast = !g.song ? '' : p.days === 0 ? T('Target date passed; choose a new date', 'A data passou; escolha outra') : p.remaining === 0 ? T('Ready for rehearsal', 'Pronto para ensaiar') : p.remaining <= p.capacity ? T('Beginner version is feasible', 'Versão iniciante é viável') : T('The date is tight; add minutes or move the date', 'A data está apertada; aumente os minutos ou mude a data');
      const src = g.song?.source ? `<a href="${esc(g.song.source)}" target="_blank" rel="noopener noreferrer">${T('Chord source', 'Fonte dos acordes')}</a>` : T('Source not supplied', 'Fonte não informada');
      return `<section class="hero goal-hero"><div class="txt" style="align-items:stretch"><p class="eyebrow">${T('Song goal', 'Meta musical')}</p><h2>${esc(g.song?.title || g.title)}</h2>${g.song?.artist || g.artist ? `<p>${esc(g.song?.artist || g.artist)}</p>` : ''}
        <div class="count">${p.days} <small>${T('days until', 'dias até')} ${dateLabel(g.date)} · ${g.minutes} ${T('min/day', 'min/dia')}</small></div>
        ${g.song ? `<div class="goal-meter" role="img" aria-label="${percent}%"><i style="width:${percent}%"></i></div><p><b>${percent}%</b> ${T('practiced steps', 'etapas praticadas')} · ${forecast}</p>` : ''}</div></section>
        ${sessionReady ? lesson(g, p) : tuningCard()}
        ${g.song ? `<article class="card"><div class="goal-facts"><span>${src}</span><span>${T('Key', 'Tom')}: ${esc(g.song.key || '—')}${g.song.originalKey && g.song.originalKey !== g.song.key ? ` (${T('transposed from', 'transposto de')} ${esc(g.song.originalKey)})` : ''}</span><span>${g.song.beats}/4</span><span>${T('practice tempo', 'andamento de treino')} ${g.song.tempo} BPM</span>${g.song.strum ? `<span>${esc(g.song.strum)}</span>` : ''}</div>
          ${g.song.coverage !== 'full' ? `<p class="goal-alert">${T('This is a sourced beginner excerpt. The full recording may contain more sections.', 'Este é um trecho iniciante com fonte. A gravação completa pode ter mais partes.')}${g.song.truncated ? ' ' + T('The source chart was shortened for practice.', 'A cifra da fonte foi reduzida para o treino.') : ''}</p>` : ''}
          <p>${T('Remaining focused practice', 'Treino focado restante')}: <b>${p.remaining} ${T('minutes', 'minutos')}</b>. ${T('One-session cram', 'Tudo de uma vez')}: ${Math.ceil(p.remaining / 60)}h ${p.remaining % 60}m. ${T('The last 30% of days are reserved for rehearsal and missed sessions.', 'Os últimos 30% dos dias ficam para ensaio e sessões perdidas.')}</p>
          ${p.remaining > p.capacity ? `<p class="goal-alert">${T(`At ${g.minutes} minutes/day, you need about ${p.requiredDays} practice days.`, `Com ${g.minutes} minutos/dia, você precisa de cerca de ${p.requiredDays} dias de treino.`)}</p>` : ''}
          <details><summary>${T('Upcoming plan', 'Próximas aulas')}</summary><ol>${p.schedule.slice(0, 12).map((s) => `<li>${dateLabel(s.date)} · ${esc(T(s.en, s.pt))}</li>`).join('')}</ol></details></article>
          <article class="card"><h3>${T('Check-in history', 'Histórico de retornos')}</h3><ol class="goal-history">${g.history.slice(-8).reverse().map((h) => `<li>${dateLabel(h.date)} · ${esc(h.id === 'tuning' ? T('Tune GCEA', 'Afinar GCEA') : T(p.steps.find((s) => s.id === h.id)?.en || h.title, p.steps.find((s) => s.id === h.id)?.pt || h.title))} · ${h.result === 'tuned' ? T('ready to play', 'pronto para tocar') : esc(T(({easy:'clear',ok:'needs practice',hard:'still hard'})[h.result],({easy:'limpo',ok:'precisa praticar',hard:'ainda difícil'})[h.result]))} · ${h.evidence === 'mic' ? T('microphone verified', 'verificado por microfone') : T('self-report', 'autodeclarado')}</li>`).join('') || `<li>${T('No practice reported yet.', 'Nenhum treino registrado ainda.')}</li>`}</ol></article>` : pendingSong(g)}
        <details class="card goal-edit"><summary>${T('Change date or minutes', 'Alterar data ou minutos')}</summary>
          <form id="goal-edit"><div class="goal-fields"><label>${T('I want to play it by', 'Quero tocar até')}<input name="date" type="date" min="${today()}" value="${esc(g.date)}" required></label>
          <label>${T('Minutes per day', 'Minutos por dia')}<select name="minutes">${[5, 10, 15, 20].map((m) => `<option value="${m}"${m === g.minutes ? ' selected' : ''}>${m}</option>`).join('')}</select></label></div>
          <button class="btn sea" type="submit">${T('Save and replan', 'Salvar e replanejar')}</button></form></details>
        <div class="row wrap goal-tools"><button class="btn sm ghost danger" data-goal-act="remove">${T('Start another song', 'Começar outra música')}</button></div>`;
    }
    function tuningCard() {
      return `<article class="card goal-lesson"><p class="eyebrow">${T('Start every class', 'Comece toda aula')}</p><h3>${T('Tune G · C · E · A', 'Afine G · C · E · A')}</h3>
        <p>${T('From the string nearest your face to the one nearest the floor. Turn each peg slowly, pluck again, and listen. You can use the microphone or confirm the tuning yourself.', 'Da corda mais perto do rosto até a mais perto do chão. Gire cada tarraxa devagar, toque de novo e escute. Use o microfone ou confirme a afinação por conta própria.')}</p>
        <div class="goal-checkins"><button class="btn sm ghost" data-goal-act="tune-play">▶ ${T('Hear GCEA', 'Ouvir GCEA')}</button><button class="btn sm ghost" data-goal-act="tune-verify">🎤 ${T('Check with microphone', 'Conferir com microfone')}</button></div>
        <p id="goal-audio-msg" class="hint" role="status">${T('Stop the reference sound before using the microphone. Silence does not confirm tuning.', 'Pare o som de referência antes de usar o microfone. Silêncio não confirma afinação.')}</p>
        <button class="btn big" data-goal-act="tune-self">${T('I tuned it · start lesson', 'Afinei · começar aula')}</button></article>`;
    }
    function edit(form) {
      const g = goal(), fd = new FormData(form), date = String(fd.get('date') || '');
      if (!g || !date || daysBetween(today(), date) < 0) return;
      g.date = date; g.minutes = Math.max(5, Math.min(20, Number(fd.get('minutes')) || g.minutes));
      save(); render();
    }

    function view() { return goal() ? dashboard(goal()) : setup(); }
    function submit(form) {
      const fd = new FormData(form), title = String(fd.get('title') || '').trim(), date = String(fd.get('date') || '');
      if (!title || daysBetween(today(), date) < 0) return;
      const found = catalog.find((s) => sameTitle(s.title, title));
      lookupStarted = false; lookupError = '';
      state().goal = { title, artist: String(fd.get('artist') || '').trim(), date, minutes: Math.max(5, Math.min(20, Number(fd.get('minutes')) || 5)), skill: { tune: false, strum: false, chords: [] }, song: found ? parseSong(found) : null, mastery: {}, history: [] };
      state().onboarded = true; sessionReady = false;
      save(); render();
    }
    async function action(b) {
      if (b.dataset.goalAct === 'pick-song') { selectSong(b.dataset.title, b.dataset.artist || '', b); return; }
      const g = goal(); if (!g) return;
      if (b.dataset.goalAct === 'tune-play') {
        if (Player.on) { Player.stop(); b.textContent = '▶ ' + T('Hear GCEA', 'Ouvir GCEA'); return; }
        await Player.start({ notes: [[0, 0], [1, 0], [2, 0], [3, 0]] }, 72, { click: false });
        if (Snd.mode === 'synth') document.querySelector('#goal-audio-msg').textContent = T('Recorded sound unavailable; using the synthetic backup.', 'Som gravado indisponível; usando o som sintético de reserva.');
        b.textContent = '■ ' + T('Stop sound', 'Parar som'); return;
      }
      if (b.dataset.goalAct === 'tune-self') {
        Player.stop(); sessionReady = true;
        g.history.push({ date: today(), id: 'tuning', title: 'Tune GCEA', result: 'tuned', evidence: 'self' });
        save(); render(); return;
      }
      if (b.dataset.goalAct === 'tune-verify') {
        const msg = document.querySelector('#goal-audio-msg');
        if (listening) { listening = false; await Mic.stop(); render(); return; }
        Player.stop(); const check = makeCheck({ k: 'tune' });
        try {
          listening = true; b.textContent = '■ ' + T('Stop microphone', 'Parar microfone');
          await Mic.start(async (frame) => {
            if (!listening) return;
            check.feed(frame);
            if (!check.done) return;
            listening = false; await Mic.stop(); sessionReady = true;
            g.history.push({ date: today(), id: 'tuning', title: 'Tune GCEA', result: 'tuned', evidence: 'mic' });
            save(); render();
          }, true);
        } catch { listening = false; msg.textContent = T('Microphone unavailable. Confirm the tuning yourself below.', 'Microfone indisponível. Confirme a afinação abaixo.'); b.textContent = '🎤 ' + T('Check with microphone', 'Conferir com microfone'); }
        return;
      }
      if (b.dataset.goalAct === 'play') {
        const p = plan(g, today()), s = p.next;
        if (Player.on) { Player.stop(); b.textContent = '▶ ' + T('Play-along sound', 'Som para acompanhar'); return; }
        if (s.kind === 'open') {
          await Player.start({ notes: [[0, 0], [1, 0], [2, 0], [3, 0]] }, 72, { click: false });
          b.textContent = '■ ' + T('Stop sound', 'Parar som');
          return;
        }
        const seq = s.chord ? [s.chord] : s.chords || (g.song ? (s.section != null ? g.song.sections[s.section].bars.flat().filter((c, i, a) => i === 0 || c !== a[i - 1]).slice(0, 8) : g.song.sections.flatMap((x) => x.bars.flat()).filter((c, i, a) => i === 0 || c !== a[i - 1]).slice(0, 8)) : ['C']);
        await Player.start({ seq: s.kind === 'downstrum' ? [seq[0] || 'C'] : seq.length ? seq : ['C'], pat: g.song?.beats === 3 ? 'D.D.D.' : 'D.D.D.D.' }, Math.min(90, g.song?.tempo || 72), { click: true });
        if (Snd.mode === 'synth') document.querySelector('#goal-audio-msg').textContent = T('Recorded sound unavailable; using the synthetic backup.', 'Som gravado indisponível; usando o som sintético de reserva.');
        b.textContent = '■ ' + T('Stop sound', 'Parar som');
      }
      if (b.dataset.goalAct === 'verify' && !listening) {
        const s = plan(g, today()).next;
        const spec = s.kind === 'tune' ? { k: 'tune' } : s.kind === 'chord' ? { k: 'strings', chord: s.chord } : s.kind === 'change' ? { k: 'chords', seq: [...s.chords, ...s.chords] } : { k: 'strum', n: 12, even: true };
        const check = makeCheck(spec), msg = document.querySelector('#goal-audio-msg');
        Player.stop();
        try {
          listening = true; b.textContent = '■ ' + T('Stop microphone', 'Parar microfone');
          await Mic.start(async (frame) => {
            if (!listening) return;
            check.feed(frame);
            if (!check.done) return;
            listening = false;
            const blob = await Mic.stop();
            let rec;
            if (blob?.size) { rec = Date.now(); try { await RecStore.put({ id: rec, d: today(), dose: `goal:${s.id}`, title: { en: s.en, pt: s.pt }, blob }); } catch {} }
            g.mastery[s.id] = 2;
            g.history.push({ date: today(), id: s.id, title: s.en, result: 'easy', evidence: 'mic', rec });
            save(); render();
          }, true);
        } catch { listening = false; msg.textContent = T('Microphone unavailable. Use a self-reported check-in below.', 'Microfone indisponível. Use um retorno autodeclarado abaixo.'); b.textContent = '🎤 ' + T('Microphone check', 'Checagem com microfone'); }
      } else if (b.dataset.goalAct === 'verify' && listening) { listening = false; await Mic.stop(); b.textContent = '🎤 ' + T('Microphone check', 'Checagem com microfone'); }
      if (b.dataset.goalAct === 'lookup') await lookup(g);
      if (b.dataset.goalAct === 'check') {
        if (listening) { listening = false; await Mic.stop(); }
        Player.stop();
        const p = plan(g, today()), s = p.next, result = b.dataset.result;
        if (!['easy', 'ok', 'hard'].includes(result)) return;
        if (s.id !== 'rehearse') g.mastery[s.id] = Math.min(2, (g.mastery[s.id] || 0) + (result === 'easy' ? 2 : result === 'ok' ? 1 : 0));
        g.history.push({ date: today(), id: s.id, title: s.en, result, evidence: 'self' });
        save(); render();
      }
      if (b.dataset.goalAct === 'remove' && confirm(T('Replace this song goal? Its check-in history will be archived on this device.', 'Trocar esta meta? O histórico de retornos será arquivado neste aparelho.'))) { Player.stop(); if (listening) { listening = false; await Mic.stop(); } lookupStarted = false; lookupError = ''; (state().previousJourneys ||= []).push({ archivedAt: new Date().toISOString(), goal: g }); state().goal = null; state().onboarded = false; sessionReady = false; save(); render(); }
    }
    function report() {
      const g = goal(); if (!g) return '';
      const p = plan(g, today());
      return [`Song goal: ${g.title}${g.artist ? ` — ${g.artist}` : ''}`, `Deadline: ${g.date}; ${g.minutes} min/day`, `Arrangement: ${g.song ? g.song.source || 'no source' : 'pending'}`, `Remaining focused practice: ${p.remaining} min`, ...g.history.slice(-10).map((h) => `${h.date}: ${h.title} — ${h.result} (${h.evidence || 'self'})`) ].join('\n');
    }
    return { view, submit, edit, action, searchInput, report, stop: () => { listening = false; }, plan: () => goal() ? plan(goal(), today()) : null };
  }
  window.SongGoal = { init, parseSong, songSteps, plan };
})();
