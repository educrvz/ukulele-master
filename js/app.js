/* Ukulele Master v4 — single-screen focus stage + slide-over drawer. Progress stays in this browser only. */
(function () {
  const U = window.UKE, { CHORDS } = U;
  const { icon, toast } = window.UI;
  const VERSION = '4.0.0';
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
  const escapeHTML = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const FINGERS = () => T('1 index · 2 middle · 3 ring · 4 little. Numbers inside dots are fingers, not frets.', '1 indicador · 2 médio · 3 anelar · 4 mínimo. Os números nas bolinhas são dedos, não casas.');

  /* Microphone level bar helper shared between stage and drawer tools. */
  const levelBar = (id) => `<div class="lvl" aria-hidden="true"><i id="${id || 'lvl'}"></i><b id="${id ? id + 'floor' : 'lvlfloor'}"></b><span>${T('microphone level', 'nível do microfone')}</span></div>`;
  const dbPct = (x) => Math.max(0, Math.min(100, ((20 * Math.log10(Math.max(x, 1e-5)) + 66) / 60) * 100));
  function showLevel(fr, id) {
    const scope = ($('#sheet')?.open ? $('#sheet') : document);
    const barId = id || 'lvl';
    const bar = $('#' + barId, scope), fl = $('#' + barId + 'floor', scope);
    if (!bar) return;
    bar.style.width = (fr ? dbPct(fr.rms) : 0) + '%';
    bar.classList.toggle('hot', !!fr && fr.rms > Math.max(0.006, 2.5 * (fr.floor || 0)));
    if (fl) fl.style.left = (fr ? dbPct(fr.floor || 0) : 0) + '%';
  }
  function chime() {
    try {
      Snd.load().then(() => {
        const t = Snd.ensure().currentTime;
        [72, 76, 79, 84].forEach((m, i) => Snd.pluck(m, t + 0.05 + i * 0.08, 0.22, 0.9));
      });
    } catch (e) {}
  }

  let sheetTab = 'song';
  let V = { chord: 'G', cgA: 'C', cgB: 'G' };
  let chk = null, bpm = 60, frameN = 0, cg = null;

  const goalAPI = SongGoal.init({
    state: () => S,
    save,
    render: () => render(),
    today,
    lang: () => S.lang,
    diagrams: DG,
    showLevel,
    chime,
    openSheet: (tab) => openSheet(tab),
  });

  function stopTools() {
    Player.stop();
    if (Mic.on) Mic.stop();
    chk = null;
    if (cg) { clearInterval(cg.int); cg = null; }
  }
  function stopAll() {
    goalAPI.stop();
    stopTools();
  }

  function chordCard(id) {
    const ch = CHORDS[id];
    return `<article class="card chord-card compact-card"><header><h3>${ch.label}${ch.tag ? ` <small>${L(ch.tag)}</small>` : ''}</h3>
      <button type="button" class="btn ghost sm" data-act="hear" data-id="${id}">${icon('play')} ${T('Hear', 'Ouvir')}</button></header>
      <div class="pair compact-pair"><figure>${DG.chordChart(ch)}</figure><figure>${DG.chordNeck(ch)}</figure></div>
      <p class="sound compact-sound">${DG.soundLine(ch)}</p></article>`;
  }
  const minis = (ids) => `<div class="mini-row">${ids.map((c) => `<button type="button" class="mini" data-act="peek" data-id="${c}" aria-label="${CHORDS[c].label}">${DG.chordChart(CHORDS[c])}<span>${CHORDS[c].label}</span></button>`).join('')}</div>`;

  function tunerHTML(c) {
    const cur = c.cur, cents = cur ? Math.max(-50, Math.min(50, cur.cents)) : 0;
    return `<div class="tuner"><div class="strs">${U.OPEN.map((m, i) => `<span class="${c.ok[i] ? 'ok' : ''}${cur && cur.s === i ? ' act' : ''}">${U.noteName(m)}${c.ok[i] ? ' ✓' : ''}</span>`).join('')}</div>
      <div class="gauge"><i class="zone"></i><i class="needle${cur ? '' : ' idle'}" style="left:${50 + cents}%"></i></div>
      <p class="read">${cur ? (Math.abs(cur.cents) <= 10 ? '✓ ' + T('In tune', 'Afinada') : cur.cents < 0 ? T('Too low — tighten', 'Baixa — aperte') : T('Too high — loosen', 'Alta — afrouxe')) : T('Pluck a string…', 'Toque uma corda…')}</p></div>`;
  }

  // ───────── Main single-screen render
  function render() {
    const hasGoal = Boolean(S.onboarded && S.goal);
    UI.wake(hasGoal);
    $('#lang').textContent = S.lang === 'pt' ? 'EN' : 'PT';
    const meta = hasGoal ? goalAPI.headerMeta() : null;
    $('#top-brand').hidden = hasGoal;
    $('#top-song').hidden = !hasGoal;
    $('#top-menu').hidden = !hasGoal;
    $('#top-tune').hidden = !(meta && meta.showTuneBtn);
    if (meta) {
      $('#top-song-title').textContent = meta.title;
      $('#top-song-days').textContent = meta.days;
    }

    const el = $('#view');
    if (!S.lang) {
      el.innerHTML = onboardingLang();
    } else {
      el.innerHTML = goalAPI.view();
    }
    if ($('#sheet')?.open) renderSheet();
  }

  function onboardingLang() {
    return `<section class="onb">
      <img class="logo" src="icons/icon.svg" alt="">
      <h1>Ukulele Master</h1>
      <p class="lead">Choose your language · Escolha o idioma</p>
      <div class="col">
        <button type="button" class="btn big" data-act="lang" data-l="en">English</button>
        <button type="button" class="btn big sea" data-act="lang" data-l="pt">Português</button>
      </div>
    </section>`;
  }

  // ───────── Slide-over Drawer (Song Plan, Practice Tools, Diary & Backup)
  function openSheet(tab) {
    stopAll();
    sheetTab = ['song', 'tools', 'diary'].includes(tab) ? tab : 'song';
    const dlg = $('#sheet');
    if (!dlg) return;
    renderSheet();
    if (!dlg.open) dlg.showModal();
  }

  function renderSheet() {
    const dlg = $('#sheet');
    if (!dlg) return;
    const tabs = [
      ['song', T('Song', 'Música')],
      ['tools', T('Tools', 'Treino')],
      ['diary', T('Diary', 'Diário')],
    ];
    const body = sheetTab === 'song' ? goalAPI.planSheet()
      : sheetTab === 'tools' ? toolsSheet()
        : diarySheet();
    dlg.innerHTML = `<div class="sheet-wrap">
      <header class="sheet-top">
        <div class="seg3 sheet-tabs">${tabs.map(([k, l]) => `<button type="button" data-act="sheettab" data-tab="${k}" class="${sheetTab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <button type="button" class="iconbtn" data-act="closesheet" aria-label="${T('Close', 'Fechar')}">${icon('x')}</button>
      </header>
      <div class="sheet-body">${body}</div>
    </div>`;
    if (sheetTab === 'diary') loadRecs();
  }

  function cgReadout(a, b) {
    if (!cg) return T(`Press Start, then switch between ${CHORDS[a].sym} and ${CHORDS[b].sym} — the mic counts automatically.`, `Toque em Começar e alterne entre ${CHORDS[a].sym} e ${CHORDS[b].sym} — o mic conta sozinho.`);
    if (cg.manual) return T('Tap +1 after each clean change (manual mode).', 'Toque em +1 a cada troca limpa (modo manual).');
    if (!cg.check?.last) return T(`Listening… play ${CHORDS[a].sym} or ${CHORDS[b].sym} to start`, `Ouvindo… toque ${CHORDS[a].sym} ou ${CHORDS[b].sym} para começar`);
    return T(`Heard ${CHORDS[cg.check.last].sym} ✓ · now play ${CHORDS[cg.check.next].sym}`, `Ouvi ${CHORDS[cg.check.last].sym} ✓ · agora toque ${CHORDS[cg.check.next].sym}`);
  }

  function toolsSheet() {
    const sel = V.chord || 'G';
    const known = Object.keys(CHORDS);
    const a = V.cgA || 'C', b = V.cgB || 'G', rec = (S.changes || {})[[a, b].sort().join(':')];
    const opts = (cur) => known.filter((id) => id !== 'Chi').map((id) => `<option value="${id}"${id === cur ? ' selected' : ''}>${CHORDS[id].label}</option>`).join('');
    const cgOn = Boolean(cg);
    const cgLast = cg?.check?.last || null, cgNext = cg?.check?.next || null;
    return `<article class="card compact-card">
        <h3>${icon('mic')} ${T('Tuner', 'Afinador')}</h3>
        <div id="live">${tunerHTML(makeCheck({ k: 'tune' }))}</div>
        ${levelBar('lvl')}
        <p style="margin-top:10px"><button type="button" class="btn sea sm" data-act="tuner" id="tunerb">${icon('mic')} ${T('Start tuner', 'Ligar afinador')}</button></p>
      </article>
      <article class="card compact-card">
        <h3>${icon('drum')} ${T('Metronome', 'Metrônomo')}</h3>
        <div class="tools"><i class="beat" id="beat"></i>
          <button type="button" class="pbtn play" data-act="metro" id="metro" data-full="1">${icon('play')} ${T('Start', 'Ligar')}</button>
          <span class="bpm"><button type="button" data-act="bpm" data-d="-5" aria-label="${T('Slower', 'Mais lento')}">−</button><b><span id="bpm">${bpm}</span><small>BPM</small></b><button type="button" data-act="bpm" data-d="5" aria-label="${T('Faster', 'Mais rápido')}">+</button></span>
        </div>
      </article>
      <article class="card compact-card">
        <h3>${icon('swap')} ${T('One-minute changes', 'Trocas em um minuto')}</h3>
        <p class="hint">${T('Keep both hands on the ukulele — the microphone hears each clean switch and counts for 60 s.', 'Fique com as duas mãos no ukulele — o microfone ouve cada troca limpa e conta por 60 s.')}</p>
        <div class="cg-pick"><select id="cgA"${cgOn ? ' disabled' : ''} aria-label="${T('First chord', 'Primeiro acorde')}">${opts(a)}</select><span>${icon('swap')}</span><select id="cgB"${cgOn ? ' disabled' : ''} aria-label="${T('Second chord', 'Segundo acorde')}">${opts(b)}</select></div>
        <div class="mini-row">${[a, b].map((c) => `<button type="button" class="mini${cgLast === c ? ' heard' : cgNext === c ? ' target' : ''}" data-cg-chord="${c}" data-act="peek" data-id="${c}" aria-label="${CHORDS[c].label}">${DG.chordChart(CHORDS[c])}<span>${CHORDS[c].label}</span></button>`).join('')}</div>
        <div class="chg-board${cgOn ? ' run' : ''}" id="cgboard">
          <span class="left" id="cgleft">${cg ? cg.left : 60} s</span>
          <b id="cgn">${cg ? cg.n : 0}</b>
          <small id="cglbl">${cgReadout(a, b)}</small>
        </div>
        ${!(cg && cg.manual) ? `<div class="lvl-wrap${cgOn ? ' on' : ''}">${levelBar('cglvl')}</div>` : ''}
        <div class="cg-actions">
          ${cg && cg.manual
            ? `<button type="button" class="btn big" data-act="cgmanualtap">${T('+1 Clean switch', '+1 Troca limpa')}</button>`
            : `<button type="button" class="btn big${cgOn ? ' listening' : ''}" data-act="cgstart" id="cgstart">
                ${cgOn ? `${icon('stop')} ${T('Finish & save', 'Encerrar e salvar')}` : `${icon('mic')} ${T('Start listening (60 s)', 'Começar a ouvir (60 s)')}`}
              </button>`}
          ${!cgOn ? `<button type="button" class="link-btn" data-act="cgmanual">${T('No mic? Count manually', 'Sem mic? Contar na mão')}</button>` : ''}
        </div>
        <p class="hint" id="cgmsg" style="margin-top:6px">${rec ? `${T('Best', 'Recorde')}: <b>${rec.best}</b>${rec.evidence === 'mic' ? ' 🎤' : ''} · ${T('Last', 'Última')}: ${rec.last} (${niceDate(rec.on)})` : T('No record yet for this pair.', 'Ainda sem recorde para este par.')}</p>
      </article>
      <h4 class="sub">${T('Chord library', 'Biblioteca de acordes')}</h4>
      <div class="chips">${known.map((id) => `<button type="button" class="chip${id === sel ? ' on' : ''}" data-act="pick" data-id="${id}">${CHORDS[id].sym}${CHORDS[id].tag ? '↑' : ''}</button>`).join('')}</div>
      ${chordCard(sel)}
      <p class="legend">${FINGERS()}</p>`;
  }

  function diarySheet() {
    const history = S.goal?.history || [];
    const archived = S.previousJourneys || [];
    const steps = S.goal ? SongGoal.songSteps(S.goal) : [];
    const rows = history.slice().reverse().map((h) => {
      const title = h.id === 'tuning' ? T('Tune GCEA', 'Afinar GCEA') : L(steps.find((s) => s.id === h.id)) || h.title;
      const res = h.result === 'tuned' ? T('Tuned', 'Afinado') : T(({ easy: 'Clear', ok: 'Needs work', hard: 'Still hard' })[h.result] || h.result, ({ easy: 'Limpo', ok: 'Quase lá', hard: 'Difícil' })[h.result] || h.result);
      const ev = h.evidence === 'mic' ? T('Mic', 'Mic') : T('Self', 'Auto');
      return `<li><span>${niceDate(h.date)}</span><b>${escapeHTML(title)}</b><span>${escapeHTML(res)}</span><span class="ev${h.evidence === 'mic' ? ' mic' : ''}">${ev}</span></li>`;
    }).join('');
    return `<article class="card compact-card">
        <h3>${T('Song check-ins', 'Retornos da música')}</h3>
        <ul class="log">${rows || `<li>${T('No check-ins yet.', 'Ainda sem retornos.')}</li>`}</ul>
      </article>
      <article class="card compact-card">
        <h3>${T('Recordings from this journey', 'Gravações desta jornada')}</h3>
        <div id="recs"><p class="hint">…</p></div>
      </article>
      ${archived.length ? `<details class="card compact-card"><summary>${T('Previous journeys', 'Jornadas anteriores')} (${archived.length})</summary>
        <p class="hint">${T('Old progress is preserved on this device and included in your backup.', 'O progresso antigo fica guardado neste aparelho e na cópia.')}</p>
        ${archived.slice().reverse().map((a) => `<details><summary>${escapeHTML(a.goal?.title || T('Original lessons', 'Aulas originais'))} · ${escapeHTML(a.archivedAt.slice(0, 10))}</summary><ol>${(a.goal?.history || a.log || []).slice(-20).reverse().map((h) => `<li>${escapeHTML(h.date || h.d)} · ${escapeHTML(h.title || h.id)} · ${escapeHTML(h.evidence || h.level || 'self')}</li>`).join('') || `<li>${T('No entries', 'Sem registros')}</li>`}</ol></details>`).join('')}
        <div id="old-recs"></div></details>` : ''}
      <article class="card compact-card">
        <h3>${T('Back up & report', 'Cópia e relatório')}</h3>
        <p class="hint">${T('Progress stays in this browser. Export a backup to keep it or move devices.', 'O progresso fica neste navegador. Exporte uma cópia para guardar ou trocar de aparelho.')}</p>
        <div class="row wrap">
          <button type="button" class="btn sm ghost" data-act="export">${icon('download')} ${T('Export backup', 'Exportar cópia')}</button>
          <label class="btn sm ghost">${T('Import backup', 'Importar cópia')}<input type="file" id="imp" accept="application/json" hidden></label>
          <button type="button" class="btn sm ghost" data-act="report">${T('Copy report', 'Copiar relatório')}</button>
        </div>
        <div id="shmsg"></div>
      </article>
      <article class="card compact-card">
        <h3>${T('Appearance & app', 'Aparência e app')}</h3>
        <div class="seg3">${[['auto', T('Auto', 'Auto')], ['light', T('Light', 'Claro')], ['dark', T('Dark', 'Escuro')]].map(([k, l]) => `<button type="button" data-act="theme" data-t="${k}" class="${S.theme === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        ${window.PWA ? PWA.card(T) : ''}
        <p class="hint" style="margin-top:8px">Ukulele Master ${VERSION}</p>
      </article>`;
  }

  async function loadRecs() {
    let recs = [], old = [];
    try {
      const all = (await RecStore.all()).sort((a, b) => b.id - a.id);
      recs = all.filter((r) => r.id >= (S.journeyStartedAt || 0));
      old = all.filter((r) => r.id < (S.journeyStartedAt || 0));
    } catch (e) {}
    const scope = $('#sheet');
    const el = $('#recs', scope);
    if (!el) return;
    el.innerHTML = recs.length
      ? recs.map((r) => `<div class="rec"><div><b>${escapeHTML(L(r.title) || r.dose)}</b><small>${niceDate(r.d)}</small></div><audio controls preload="none" src="${URL.createObjectURL(r.blob)}"></audio></div>`).join('')
      : `<p class="hint">${T('Microphone-verified recordings appear here.', 'Gravações verificadas pelo microfone aparecem aqui.')}</p>`;
    const oldEl = $('#old-recs', scope);
    if (oldEl && old.length) {
      oldEl.innerHTML = `<h4>${T('Earlier recordings', 'Gravações anteriores')}</h4>` + old.map((r) => `<div class="rec"><div><b>${escapeHTML(L(r.title) || r.dose)}</b><small>${niceDate(r.d)}</small></div><audio controls preload="none" src="${URL.createObjectURL(r.blob)}"></audio></div>`).join('');
    }
  }

  async function cgStart() {
    if (cg) { await cgEnd(); return; }
    Player.stop();
    if (Mic.on) { await Mic.stop(); chk = null; }
    const a = V.cgA || 'C', b = V.cgB || 'G';
    const check = makeCheck({ k: 'changes', pair: [a, b] });
    cg = { n: 0, left: 60, a, b, manual: false, check, int: null };
    renderSheet();
    let prevCount = 0;
    try {
      await Mic.start((fr) => {
        if (!cg?.check) return;
        cg.check.feed(fr);
        showLevel(fr, 'cglvl');
        const scope = $('#sheet');
        if (cg.check.count !== prevCount) {
          prevCount = cg.check.count;
          cg.n = prevCount;
          UI.buzz(10);
          const cnt = $('#cgn', scope);
          if (cnt) { cnt.textContent = prevCount; cnt.classList.remove('pop-num'); void cnt.offsetWidth; cnt.classList.add('pop-num'); }
        }
        const lbl = $('#cglbl', scope);
        if (lbl) lbl.textContent = cgReadout(a, b);
        $$('[data-cg-chord]', scope).forEach((el) => {
          el.classList.toggle('heard', cg.check.last === el.dataset.cgChord);
          el.classList.toggle('target', cg.check.next === el.dataset.cgChord);
        });
      }, false);
      cg.int = setInterval(() => {
        if (!cg) return;
        cg.left--;
        const l = $('#cgleft', $('#sheet')); if (!l) { clearInterval(cg.int); cg = null; return; }
        l.textContent = cg.left + ' s';
        if (cg.left <= 0) cgEnd();
      }, 1000);
    } catch {
      cg = null;
      renderSheet();
      const msg = $('#cgmsg', $('#sheet'));
      if (msg) msg.textContent = T('Microphone blocked. Allow mic access or use "Count manually".', 'Microfone bloqueado. Permita o microfone ou use "Contar na mão".');
    }
  }

  function cgManualStart() {
    stopTools();
    const a = V.cgA || 'C', b = V.cgB || 'G';
    cg = { n: 0, left: 60, a, b, manual: true, check: null, int: null };
    renderSheet();
    cg.int = setInterval(() => {
      if (!cg) return;
      cg.left--;
      const l = $('#cgleft', $('#sheet')); if (!l) { clearInterval(cg.int); cg = null; return; }
      l.textContent = cg.left + ' s';
      if (cg.left <= 0) cgEnd();
    }, 1000);
  }

  function cgManualTap() {
    if (!cg?.manual) return;
    UI.buzz(8);
    cg.n++;
    const cnt = $('#cgn', $('#sheet'));
    if (cnt) cnt.textContent = cg.n;
  }

  async function cgEnd() {
    if (!cg) return;
    if (cg.int) clearInterval(cg.int);
    if (cg.check) cg.check.flush();
    const n = cg.check ? cg.check.count : cg.n;
    const evidence = cg.manual ? 'self' : 'mic';
    const { a, b } = cg, key = [a, b].sort().join(':'), old = (S.changes || {})[key];
    cg = null;
    if (Mic.on) await Mic.stop();
    const best = Math.max(n, old ? old.best : 0), isBest = n > 0 && (!old || n > old.best);
    if (n > 0) {
      S.changes ||= {};
      S.changes[key] = { best, last: n, on: today(), evidence };
      save();
    }
    Snd.click(0, true); UI.buzz([30, 60, 30]);
    if (isBest) UI.confetti();
    renderSheet();
    toast(n
      ? (isBest ? T(`New record: ${n} changes!`, `Novo recorde: ${n} trocas!`) : T(`${n} changes. Best: ${best}.`, `${n} trocas. Recorde: ${best}.`))
      : T('No changes heard.', 'Nenhuma troca ouvida.'));
  }

  function syncMetro(on) {
    const m = $('#metro', $('#sheet'));
    if (m) {
      m.classList.toggle('on', on);
      m.innerHTML = on ? `${icon('stop')} ${T('Stop', 'Parar')}` : `${icon('play')} ${T('Start', 'Ligar')}`;
    }
    if (!on) { const b = $('#beat', $('#sheet')); if (b) b.classList.remove('tick'); }
  }

  // ───────── Actions
  const A = {
    lang(b) { setLang(b.dataset.l); render(); },
    sheet(b) { openSheet(b.dataset.tab || 'song'); },
    sheettab(b) { stopTools(); sheetTab = b.dataset.tab; renderSheet(); },
    closesheet() { stopTools(); const d = $('#sheet'); if (d?.open) d.close(); },
    hear(b) {
      const card = b.closest('.card, .goal-diagram'), delays = Snd.chord(b.dataset.id);
      delays.forEach((ms, i) => setTimeout(() => { const p = $(`[data-pill="${i}"]`, card); if (p) { p.classList.add('ping'); setTimeout(() => p.classList.remove('ping'), 450); } }, ms));
    },
    peek(b) {
      const dlg = $('#peek');
      dlg.innerHTML = chordCard(b.dataset.id) + `<p class="legend">${FINGERS()}</p><button type="button" class="btn big ghost" data-act="closepeek">${T('Close', 'Fechar')}</button>`;
      dlg.showModal();
    },
    closepeek() { $('#peek').close(); },
    metro() {
      if (Player.on) { Player.stop(); syncMetro(false); return; }
      Player.start({ pat: 'D.D.D.D.', seq: null }, bpm, {
        click: true,
        sound: false,
        onSlot: (s) => {
          const beat = $('#beat', $('#sheet'));
          if (beat && s % 2 === 0) { beat.classList.add('tick'); setTimeout(() => beat.classList.remove('tick'), 110); }
        },
      });
      syncMetro(true);
    },
    bpm(b) {
      bpm = Math.max(40, Math.min(140, bpm + +b.dataset.d));
      const el = $('#bpm', $('#sheet')); if (el) el.textContent = bpm;
      if (Player.on) { Player.stop(); syncMetro(false); }
    },
    pick(b) { V.chord = b.dataset.id; stopTools(); renderSheet(); },
    cgstart: cgStart,
    cgmanual: cgManualStart,
    cgmanualtap: cgManualTap,
    async tuner() {
      const scope = $('#sheet'), b = $('#tunerb', scope);
      const lab = (on) => (on ? `${icon('stop')} ${T('Stop', 'Parar')}` : `${icon('mic')} ${T('Start tuner', 'Ligar afinador')}`);
      if (Mic.on) { await Mic.stop(); chk = null; b.innerHTML = lab(false); return; }
      chk = makeCheck({ k: 'tune' });
      try {
        await Mic.start((fr) => {
          if (!chk) return;
          chk.feed(fr); showLevel(fr); chk.done = false;
          if (++frameN % 3 === 0) { const l = $('#live', scope); if (l) l.innerHTML = tunerHTML(chk); }
        }, false);
        b.innerHTML = lab(true);
      } catch (e) {
        chk = null;
        toast(T('The microphone is blocked. Allow it in the browser settings.', 'O microfone está bloqueado. Permita nas configurações do navegador.'));
      }
    },
    theme(b) { S.theme = b.dataset.t; UI.theme(S.theme); save(); render(); },
    install() { if (window.PWA) PWA.install(T); },
    dismissinstall() { if (window.PWA) PWA.dismiss(); render(); },
    async report() {
      const txt = `Ukulele Master — ${T('progress report', 'relatório de progresso')} (${today()})\n\n${goalAPI.report()}`;
      try { await navigator.clipboard.writeText(txt); toast(T('Report copied.', 'Relatório copiado.')); }
      catch (e) { const el = $('#shmsg', $('#sheet')); if (el) el.innerHTML = `<textarea rows="6" readonly>${escapeHTML(txt)}</textarea>`; }
    },
    export() {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/json' }));
      a.download = `ukulele-master-${today()}.json`;
      a.click();
    },
  };

  document.addEventListener('click', (e) => {
    const dlg = $('#sheet');
    if (e.target === dlg) { A.closesheet(); return; }
    const peek = $('#peek');
    if (e.target === peek) { A.closepeek(); return; }
    const gb = e.target.closest('[data-goal-act]');
    if (gb) { goalAPI.action(gb); return; }
    const b = e.target.closest('[data-act]');
    if (b && A[b.dataset.act]) A[b.dataset.act](b);
  });
  document.addEventListener('input', (e) => { if (e.target.id === 'song-search') goalAPI.searchInput(e.target); });
  document.addEventListener('change', (e) => {
    const scope = $('#sheet');
    if (e.target.id === 'cgA' || e.target.id === 'cgB') {
      V.cgA = $('#cgA', scope).value; V.cgB = $('#cgB', scope).value;
      if (V.cgA === V.cgB) {
        const other = Object.keys(CHORDS).find((c) => c !== V.cgA && c !== 'Chi');
        if (e.target.id === 'cgA') V.cgB = other; else V.cgA = other;
      }
      renderSheet(); return;
    }
    if (e.target.id !== 'imp' || !e.target.files[0]) return;
    e.target.files[0].text().then((t) => {
      try {
        const o = JSON.parse(t);
        if (!o || (!o.doses && !o.goal)) throw Error('shape');
        S = Object.assign(S, o); migrateJourney(); save(); setLang(S.lang || 'en'); UI.theme(S.theme); render();
        toast(T('Backup imported.', 'Cópia importada.'));
      } catch (err) { toast(T('That file is not a backup.', 'Esse arquivo não é uma cópia.')); }
    });
  });
  document.addEventListener('submit', (e) => {
    if (e.target.id === 'goal-setup') { e.preventDefault(); goalAPI.submit(e.target); }
    if (e.target.id === 'goal-edit') { e.preventDefault(); goalAPI.edit(e.target); }
  });
  $('#sheet').addEventListener('close', () => stopTools());
  $('#lang').addEventListener('click', () => { setLang(S.lang === 'pt' ? 'en' : 'pt'); stopAll(); render(); });

  const net = () => document.body.classList.toggle('is-offline', !navigator.onLine);
  addEventListener('online', net); addEventListener('offline', net); net();
  document.addEventListener('pwa-change', () => { if ($('#sheet')?.open && sheetTab === 'diary') renderSheet(); });

  if (S.lang) setLang(S.lang);
  render();

  // Home-screen shortcuts open the matching drawer tab directly: ./?view=practice
  const startView = new URLSearchParams(location.search).get('view');
  if (S.onboarded && S.goal && ['goal', 'practice', 'diary'].includes(startView)) {
    openSheet(startView === 'practice' ? 'tools' : startView === 'goal' ? 'song' : 'diary');
  }

  window.__uke = { S: () => S, openSheet, openTuner: () => goalAPI.openTuner(), version: VERSION };
})();
