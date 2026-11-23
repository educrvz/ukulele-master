/* Small UI helpers shared by the views: icons, toast, confetti, haptics, screen wake lock, theme. */
(function () {
  const P = {
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
    note: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    book: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>',
    play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-1.800 .800-3 1.500-4 .500 1.500 1.500 2 2 2-.500-3 0-6 1.500-8z"/>',
    star: '<path d="m12 3 2.700 5.600 6.100.800-4.500 4.300 1.100 6.100L12 16.900 6.600 19.800l1.100-6.100L3.200 9.400l6.100-.800z"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    right: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    eye: '<path d="M2 12s3.600-7 10-7 10 7 10 7-3.600 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    hand: '<path d="M8 13V5.500a1.500 1.500 0 0 1 3 0V11m0-1V4.500a1.500 1.500 0 0 1 3 0V11m0-4.500a1.500 1.500 0 0 1 3 0V14a7 7 0 0 1-7 7c-2.500 0-4-1-5.500-3L3 14.500c-.800-1.200 .700-2.700 2-1.500l3 2.500"/>',
    drum: '<ellipse cx="12" cy="9" rx="8" ry="3.500"/><path d="M4 9v7c0 2 3.600 3.500 8 3.500s8-1.500 8-3.500V9M8 12.200v7M16 12.200v7"/>',
    clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.500 2M9 2h6"/>',
    download: '<path d="M12 4v11m0 0-4.500-4.500M12 15l4.500-4.500M5 20h14"/>',
    swap: '<path d="M4 8h14m0 0-4-4m4 4-4 4M20 16H6m0 0 4-4m-4 4 4 4"/>',
  };
  const icon = (n, cls) => `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;

  let toastTimer = null;
  function toast(msg, action) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.innerHTML = `<span></span>${action ? '<button type="button"></button>' : ''}`;
    el.firstChild.textContent = msg;
    if (action) { el.lastChild.textContent = action.label; el.lastChild.onclick = () => { el.classList.remove('show'); action.run(); }; }
    el.classList.add('show');
    clearTimeout(toastTimer);
    if (!action || !action.sticky) toastTimer = setTimeout(() => el.classList.remove('show'), action ? 8000 : 2600);
  }

  function confetti() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = document.createElement('div');
    box.className = 'confetti';
    const colors = ['#ef5b43', '#ffb52e', '#0c8b86', '#3e9a57', '#7a4fb5', '#ff8fa3'];
    for (let i = 0; i < 46; i++) {
      const p = document.createElement('i');
      p.style.cssText = `--x:${Math.random() * 100}%;--c:${colors[i % colors.length]};--d:${1.4 + Math.random() * 1.4}s;--delay:${Math.random() * 0.35}s;--dx:${(Math.random() - 0.5) * 220}px;--rot:${(Math.random() - 0.5) * 1400}deg`;
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 3400);
  }

  const buzz = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms || 12); } catch (e) {} };

  /* Keeps the screen on during a lesson, so the phone does not dim while both hands are on the ukulele. */
  let lock = null, wanted = false;
  async function wake(on) {
    wanted = on;
    try {
      if (on && !lock && navigator.wakeLock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); }
      if (!on && lock) { await lock.release(); lock = null; }
    } catch (e) { lock = null; }
  }
  document.addEventListener('visibilitychange', () => { if (wanted && document.visibilityState === 'visible') wake(true); });

  function theme(t) {
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
  }

  window.UI = { icon, toast, confetti, buzz, wake, theme };
})();
