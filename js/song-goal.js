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
  const readJson = (value) => JSON.parse(String(value).trim().replace(/\\([:()])/g, '$1').replace(/^```(?:json)?\s*|\s*```$/gi, ''));
  const sameTitle = (a, b) => norm(a).replace(/ /g, '') === norm(b).replace(/ /g, '');

  function parseSong(raw) {
    if (!raw || typeof raw !== 'object') throw Error('song');
    const title = String(raw.title || '').trim().slice(0, 120);
    if (!title) throw Error('title');
    const sections = (raw.sections || []).slice(0, 12).map((s) => {
      const bars = (s.bars || s.chords?.map((c) => [c]) || []).slice(0, 64).map((bar) => {
        const names = (Array.isArray(bar) ? bar : [bar]).filter(Boolean).map((x) => String(x).replace(/♭/g, 'b').trim());
        if (!names.length || names.some((c) => !CHORDS[c])) throw Error('chord');
        return names.slice(0, 8);
      });
      if (!bars.length) throw Error('section');
      return { name: String(s.name || 'Section').trim().slice(0, 40), repeats: Math.max(1, Math.min(4, Number(s.repeats) || 1)), bars };
    });
    if (!sections.length) throw Error('sections');
    return { title, artist: String(raw.artist || '').trim().slice(0, 100), source: validUrl(raw.source), key: String(raw.key || '').slice(0, 12), originalKey: String(raw.originalKey || '').slice(0, 12), tempo: Math.max(40, Math.min(200, Number(raw.tempo) || 72)), beats: Number(raw.beats) === 3 ? 3 : 4, strum: String(raw.strum || '').slice(0, 40), sections };
  }

  function songSteps(goal) {
    if (!goal.song) return [];
    const song = goal.song;
    const seq = song.sections.flatMap((s) => s.bars.flatMap((bar) => bar.filter((c, i) => i === 0 || c !== bar[i - 1])));
    const unique = [...new Set(seq)];
    const transitions = [];
    for (let i = 1; i < seq.length; i++) {
      const pair = `${seq[i - 1]}:${seq[i]}`;
      if (seq[i] !== seq[i - 1] && !transitions.includes(pair)) transitions.push(pair);
    }
    const steps = [];
    if (!goal.skill.tune) steps.push({ id: 'tune', kind: 'tune', en: 'Tune the four strings', pt: 'Afinar as quatro cordas', cost: 5 });
    unique.forEach((c) => { if (!goal.skill.chords.includes(c)) steps.push({ id: `chord:${c}`, kind: 'chord', chord: c, en: `${CHORDS[c].label} clearly`, pt: `${CHORDS[c].label} com som limpo`, cost: 10 }); });
    transitions.slice(0, 8).forEach((pair) => {
      const [a, b] = pair.split(':');
      steps.push({ id: `change:${pair}`, kind: 'change', chords: [a, b], en: `${CHORDS[a].label} to ${CHORDS[b].label}`, pt: `${CHORDS[a].label} para ${CHORDS[b].label}`, cost: 10 });
    });
    if (!goal.skill.strum) steps.push({ id: 'pulse', kind: 'pulse', en: 'Keep a steady pulse', pt: 'Manter o pulso firme', cost: 8 });
    song.sections.forEach((s, i) => steps.push({ id: `section:${i}`, kind: 'section', section: i, en: `Play ${s.name}`, pt: `Tocar ${s.name}`, cost: 15 }));
    steps.push({ id: 'playthrough', kind: 'playthrough', en: 'Play the song from start to finish', pt: 'Tocar a música do início ao fim', cost: 20 });
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
    const onlineLookup = location.protocol === 'https:' && location.hostname !== 'educrvz.github.io' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const prompt = (g) => `Find a trustworthy chord source for "${g.title}"${g.artist ? ` by ${g.artist}` : ''}. Return ONLY a JSON object, no markdown and no lyrics. Fields: title, artist, source (https URL to the chord source), key, tempo (number, estimate if unknown), beats (3 or 4), optional strum, sections (array of {name, chords:["C","G","Am","F"]} in song order). The chords must be transposed, if needed, to these ukulele shapes only: ${Object.keys(CHORDS).filter((c) => c !== 'Chi').join(', ')}. Do not invent a song arrangement. If no reliable chord source is found, say so instead of JSON. Keep sections short but preserve verse/chorus differences.`;

    function setup() {
      const tomorrow = addDays(today(), 1);
      return `<h1 class="page">${T('Play a song by a date', 'Toque uma música até uma data')}</h1>
        <p class="page-sub">${T('Choose a song. We turn it into tiny lessons and revise the plan after every check-in.', 'Escolha uma música. Ela vira pequenas aulas, e o plano é revisto a cada retorno.')}</p>
        <form id="goal-setup" class="card goal-form">
          <label>${T('Song', 'Música')}<input name="title" required maxlength="120" placeholder="${T('Song title', 'Nome da música')}" list="song-suggestions" autocomplete="off"></label>
          <datalist id="song-suggestions">${catalog.map((s) => `<option value="${esc(s.title)}">`).join('')}</datalist>
          <div><p class="hint">${T('Ready-to-play starter songs', 'Músicas iniciais prontas para tocar')}</p><div class="chips">${catalog.map((s) => `<button type="button" class="chip" data-goal-act="pick-song" data-title="${esc(s.title)}" data-artist="${esc(s.artist || '')}">${esc(s.title)}</button>`).join('')}</div></div>
          <label>${T('Artist, if known', 'Artista, se souber')}<input name="artist" maxlength="100" autocomplete="off"></label>
          <div class="goal-fields"><label>${T('I want to play it by', 'Quero tocar até')}<input name="date" type="date" min="${today()}" value="${addDays(today(), 21)}" required></label>
          <label>${T('Minutes per day', 'Minutos por dia')}<select name="minutes"><option value="5">5</option><option value="10">10</option><option value="15">15</option><option value="20">20</option></select></label></div>
          <fieldset><legend>${T('Quick skill check', 'Checagem rápida')}</legend>
            <div class="ticks"><label class="tick"><input type="checkbox" name="tune"> ${T('I can tune my ukulele', 'Sei afinar o ukulele')}</label>
            <label class="tick"><input type="checkbox" name="strum"> ${T('I can keep an even downstrum', 'Consigo manter batidas para baixo regulares')}</label></div>
            <p class="hint" style="margin:0">${T('Chords I can play clearly', 'Acordes que consigo tocar com som limpo')}</p><div class="ticks">${['C', 'G', 'Am', 'F', 'D', 'Em', 'Dm', 'A'].map((c) => `<label class="tick"><input type="checkbox" name="chord" value="${c}"> ${esc(name(c))}</label>`).join('')}</div>
          </fieldset><button class="btn big" type="submit">${T('Build my plan', 'Montar meu plano')}</button></form>
        <p class="hint">${T('Progress stays on this device. A source is needed before we can make song-specific lessons.', 'O progresso fica neste aparelho. Precisamos de uma fonte antes de criar aulas específicas da música.')}</p>`;
    }

    function pendingSong(g) {
      if (onlineLookup && !lookupStarted) { lookupStarted = true; queueMicrotask(() => lookup(g)); }
      return `<article class="card"><h3>${T('Song analysis needed', 'Falta analisar a música')}</h3>
        <p>${T('Your goal and date are saved. This song is outside the verified starter catalog, so there is no honest song-specific plan yet.', 'Sua meta e data estão salvas. A música não está no catálogo inicial verificado, então ainda não há um plano específico confiável.')}</p>
        ${onlineLookup ? `<p id="goal-lookup-msg" role="status">${lookupBusy || !lookupStarted ? T('Finding a chord source and building your plan…', 'Buscando uma fonte de acordes e montando seu plano…') : esc(lookupError)}</p><button class="btn sm" data-goal-act="lookup" ${lookupBusy ? 'disabled' : ''}>${T('Find song in the app', 'Buscar música no app')}</button><details><summary>${T('Have a chord analysis already?', 'Já tem uma análise de acordes?')}</summary>` : `<p>${T('Ask ChatGPT to find a chord source and return a short chord-only analysis.', 'Peça ao ChatGPT para encontrar uma fonte de acordes e devolver uma análise curta, só com acordes.')}</p>`}
        <div class="row wrap"><button class="btn sm" data-goal-act="copy-prompt">${T('Copy AI request', 'Copiar pedido para IA')}</button><a class="btn sm ghost" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">${T('Open ChatGPT', 'Abrir ChatGPT')}</a></div>
        <label>${T('Paste the AI JSON response here', 'Cole a resposta JSON da IA aqui')}<textarea id="goal-json" rows="7" placeholder='{"title":"...","source":"https://...","sections":[{"name":"Verse","chords":["C","G","Am","F"]}]}'></textarea></label>
        <button class="btn" data-goal-act="import">${T('Analyze and build plan', 'Analisar e montar plano')}</button><p id="goal-msg" class="hint" role="status"></p>${onlineLookup ? '</details>' : ''}</article>`;
    }

    async function lookup(g) {
      if (!onlineLookup || lookupBusy || g !== goal()) return;
      lookupBusy = true; lookupError = ''; render();
      try {
        const response = await fetch('/api/song', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: g.title, artist: g.artist }) });
        const data = await response.json();
        if (!response.ok) throw Error(data.error || 'lookup');
        const song = parseSong(data.song);
        if (!sameTitle(song.title, g.title) && !confirm(T(`Found “${song.title}” by ${song.artist}. Use this song?`, `Encontrei “${song.title}” de ${song.artist}. Usar esta música?`))) throw Error('different title');
        if (!song.source) throw Error('source');
        if (g !== goal()) return;
        g.title = song.title; g.artist = song.artist; g.song = song; g.mastery = {}; g.history = []; save();
      } catch (error) {
        lookupError = error.message === 'different title' ? T('Song was not changed. Check the title and try again.', 'A música não foi alterada. Confira o título e tente novamente.') : T('Could not verify this song right now. Try again or paste an analysis below.', 'Não consegui verificar esta música agora. Tente de novo ou cole uma análise abaixo.');
      } finally { lookupBusy = false; render(); }
    }

    function lesson(g, p) {
      const s = p.next, song = g.song, heard = s.chord ? [s.chord] : s.chords || (s.section != null ? [...new Set(song.sections[s.section].bars.flat())].slice(0, 3) : []);
      let instruction = '';
      if (s.kind === 'tune') instruction = T('Tune G (Sol), C (Dó), E (Mi), A (Lá), from face to floor. Use the tuner in Practice.', 'Afine G (Sol), C (Dó), E (Mi), A (Lá), do rosto para o chão. Use o afinador em Treino.');
      if (s.kind === 'chord') instruction = T(`Form ${name(s.chord)}. Pluck each string, then play four slow downstrums. Listen for buzzes.`, `Monte ${name(s.chord)}. Toque cada corda e depois faça quatro batidas lentas para baixo. Ouça se há zumbidos.`);
      if (s.kind === 'change') instruction = T(`Play two downstrums on ${name(s.chords[0])}, pause, then two on ${name(s.chords[1])}. Repeat slowly.`, `Faça duas batidas em ${name(s.chords[0])}, pause, depois duas em ${name(s.chords[1])}. Repita devagar.`);
      if (s.kind === 'pulse') instruction = T(`Count ${song.beats} beats aloud. One gentle downstrum per beat at a comfortable pace.`, `Conte ${song.beats} tempos em voz alta. Uma batida suave para baixo por tempo, em ritmo confortável.`);
      if (s.kind === 'section') instruction = T('Play this section slowly, one downstrum per beat. Pause at changes, then try again without stopping.', 'Toque esta parte devagar, uma batida para baixo por tempo. Pause nas trocas e depois tente sem parar.');
      if (s.kind === 'playthrough' || s.kind === 'rehearse') instruction = T('Play from the first section to the last at a comfortable tempo. A pause is fine; note the hardest change.', 'Toque da primeira à última parte em andamento confortável. Pode pausar; observe a troca mais difícil.');
      const section = s.kind === 'section' ? song.sections[s.section] : null;
      return `<article class="card goal-lesson"><p class="eyebrow">${T('Today’s five-minute lesson', 'Aula de cinco minutos de hoje')}</p><h3>${esc(T(s.en, s.pt))}</h3>
        <p>${T('Minute 1: look at the shapes. Minutes 2–5:', 'Minuto 1: veja os desenhos. Minutos 2–5:')} ${esc(instruction)}</p>
        ${section ? `<div class="goal-bars">${section.bars.map((bar) => `<span>${bar.filter((c, i) => i === 0 || c !== bar[i - 1]).map((c) => esc(name(c))).join(' · ')}</span>`).join('')}</div>` : ''}
        ${heard.map((c) => `<div class="goal-diagram"><h4>${esc(name(c))}</h4><div class="pair"><figure>${diagrams.chordChart(CHORDS[c])}<figcaption>${T('Finger placement', 'Posição dos dedos')}</figcaption></figure><figure>${diagrams.chordNeck(CHORDS[c])}<figcaption>${T('Sounding notes', 'Notas que soam')}</figcaption></figure></div><p class="sound">${diagrams.soundLine(CHORDS[c])}</p></div>`).join('')}
        <div class="goal-checkins"><button class="btn sm ghost" data-goal-act="play">▶ ${T('Play-along sound', 'Som para acompanhar')}</button>
        ${['tune', 'chord', 'change', 'pulse'].includes(s.kind) ? `<button class="btn sm ghost" data-goal-act="verify">🎤 ${T('Microphone check', 'Checagem com microfone')}</button>` : ''}</div>
        <p id="goal-audio-msg" class="hint" role="status">${T('The play-along sound is synthesized. Microphone recognition has not yet been calibrated with a real ukulele.', 'O som para acompanhar é sintetizado. O reconhecimento por microfone ainda não foi calibrado com um ukulele real.')}</p>
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
        ${g.song ? `<article class="card"><div class="goal-facts"><span>${src}</span><span>${T('Key', 'Tom')}: ${esc(g.song.key || '—')}${g.song.originalKey && g.song.originalKey !== g.song.key ? ` (${T('transposed from', 'transposto de')} ${esc(g.song.originalKey)})` : ''}</span><span>${g.song.beats}/4</span><span>${T('practice tempo', 'andamento de treino')} ${g.song.tempo} BPM</span>${g.song.strum ? `<span>${esc(g.song.strum)}</span>` : ''}</div>
          <p>${T('Remaining focused practice', 'Treino focado restante')}: <b>${p.remaining} ${T('minutes', 'minutos')}</b>. ${T('One-session cram', 'Tudo de uma vez')}: ${Math.ceil(p.remaining / 60)}h ${p.remaining % 60}m. ${T('The last 30% of days are reserved for rehearsal and missed sessions.', 'Os últimos 30% dos dias ficam para ensaio e sessões perdidas.')}</p>
          ${p.remaining > p.capacity ? `<p class="goal-alert">${T(`At ${g.minutes} minutes/day, you need about ${p.requiredDays} practice days.`, `Com ${g.minutes} minutos/dia, você precisa de cerca de ${p.requiredDays} dias de treino.`)}</p>` : ''}
          <details><summary>${T('Upcoming plan', 'Próximas aulas')}</summary><ol>${p.schedule.slice(0, 12).map((s) => `<li>${dateLabel(s.date)} · ${esc(T(s.en, s.pt))}</li>`).join('')}</ol></details></article>
          ${lesson(g, p)}<article class="card"><h3>${T('Check-in history', 'Histórico de retornos')}</h3><ol class="goal-history">${g.history.slice(-8).reverse().map((h) => `<li>${dateLabel(h.date)} · ${esc(h.title)} · ${esc(T(({easy:'clear',ok:'needs practice',hard:'still hard'})[h.result],({easy:'limpo',ok:'precisa praticar',hard:'ainda difícil'})[h.result]))} · ${h.evidence === 'mic' ? T('microphone verified', 'verificado por microfone') : T('self-report', 'autodeclarado')}</li>`).join('') || `<li>${T('No practice reported yet.', 'Nenhum treino registrado ainda.')}</li>`}</ol></article>` : pendingSong(g)}
        <details class="card goal-edit"><summary>${T('Change date or minutes', 'Alterar data ou minutos')}</summary>
          <form id="goal-edit"><div class="goal-fields"><label>${T('I want to play it by', 'Quero tocar até')}<input name="date" type="date" min="${today()}" value="${esc(g.date)}" required></label>
          <label>${T('Minutes per day', 'Minutos por dia')}<select name="minutes">${[5, 10, 15, 20].map((m) => `<option value="${m}"${m === g.minutes ? ' selected' : ''}>${m}</option>`).join('')}</select></label></div>
          <button class="btn sea" type="submit">${T('Save and replan', 'Salvar e replanejar')}</button></form></details>
        <div class="row wrap goal-tools"><button class="btn sm ghost danger" data-goal-act="remove">${T('Start another song', 'Começar outra música')}</button></div>`;
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
      state().goal = { title, artist: String(fd.get('artist') || '').trim(), date, minutes: Math.max(5, Math.min(20, Number(fd.get('minutes')) || 5)), skill: { tune: fd.has('tune'), strum: fd.has('strum'), chords: fd.getAll('chord') }, song: found ? parseSong(found) : null, mastery: {}, history: [] };
      save(); render();
    }
    async function action(b) {
      if (b.dataset.goalAct === 'pick-song') {
        const f = document.querySelector('#goal-setup');
        if (f) { f.elements.title.value = b.dataset.title; f.elements.artist.value = b.dataset.artist || ''; f.querySelectorAll('[data-goal-act="pick-song"]').forEach((x) => x.classList.toggle('on', x === b)); }
        return;
      }
      const g = goal(); if (!g) return;
      if (b.dataset.goalAct === 'play') {
        const p = plan(g, today()), s = p.next;
        if (Player.on) { Player.stop(); b.textContent = '▶ ' + T('Play-along sound', 'Som para acompanhar'); return; }
        if (s.kind === 'tune') {
          Player.start({ notes: [[0, 0], [1, 0], [2, 0], [3, 0]] }, 72, { click: false });
          b.textContent = '■ ' + T('Stop sound', 'Parar som');
          return;
        }
        const seq = s.chord ? [s.chord] : s.chords || (s.section != null ? g.song.sections[s.section].bars.flat().filter((c, i, a) => i === 0 || c !== a[i - 1]).slice(0, 8) : g.song.sections.flatMap((x) => x.bars.flat()).filter((c, i, a) => i === 0 || c !== a[i - 1]).slice(0, 8));
        Player.start({ seq: seq.length ? seq : ['C'], pat: g.song.beats === 3 ? 'D.D.D.' : 'D.D.D.D.' }, Math.min(90, g.song.tempo), { click: true });
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
      if (b.dataset.goalAct === 'copy-prompt') {
        const msg = document.querySelector('#goal-msg');
        try { await navigator.clipboard.writeText(prompt(g)); msg.textContent = T('Copied. Paste into ChatGPT, then paste its JSON response below.', 'Copiado. Cole no ChatGPT e depois cole a resposta JSON abaixo.'); }
        catch { msg.textContent = prompt(g); }
      }
      if (b.dataset.goalAct === 'lookup') await lookup(g);
      if (b.dataset.goalAct === 'import') {
        try { const song = parseSong(readJson(document.querySelector('#goal-json').value)); if (!sameTitle(song.title, g.title)) throw Error('title mismatch'); g.title = song.title; g.artist = song.artist || g.artist; g.song = song; g.mastery = {}; g.history = []; save(); render(); }
        catch (error) { document.querySelector('#goal-msg').textContent = error.message === 'title mismatch' ? T('This analysis names a different song. Check the title.', 'A análise indica outra música. Confira o título.') : T('Could not read this analysis. Check the JSON and supported chords.', 'Não consegui ler a análise. Confira o JSON e os acordes aceitos.'); }
      }
      if (b.dataset.goalAct === 'check') {
        if (listening) { listening = false; await Mic.stop(); }
        Player.stop();
        const p = plan(g, today()), s = p.next, result = b.dataset.result;
        if (!['easy', 'ok', 'hard'].includes(result)) return;
        if (s.id !== 'rehearse') g.mastery[s.id] = Math.min(2, (g.mastery[s.id] || 0) + (result === 'easy' ? 2 : result === 'ok' ? 1 : 0));
        g.history.push({ date: today(), id: s.id, title: s.en, result, evidence: 'self' });
        save(); render();
      }
      if (b.dataset.goalAct === 'remove' && confirm(T('Replace this song goal? Its check-in history will be removed from this device.', 'Trocar esta meta? O histórico de retornos desta música será apagado deste aparelho.'))) { Player.stop(); if (listening) { listening = false; await Mic.stop(); } lookupStarted = false; lookupError = ''; state().goal = null; save(); render(); }
    }
    function report() {
      const g = goal(); if (!g) return '';
      const p = plan(g, today());
      return [`Song goal: ${g.title}${g.artist ? ` — ${g.artist}` : ''}`, `Deadline: ${g.date}; ${g.minutes} min/day`, `Arrangement: ${g.song ? g.song.source || 'no source' : 'pending'}`, `Remaining focused practice: ${p.remaining} min`, ...g.history.slice(-10).map((h) => `${h.date}: ${h.title} — ${h.result} (${h.evidence || 'self'})`) ].join('\n');
    }
    return { view, submit, edit, action, report, stop: () => { listening = false; }, plan: () => goal() ? plan(goal(), today()) : null };
  }
  window.SongGoal = { init, parseSong, songSteps, plan };
})();
