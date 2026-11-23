/* Installable app support: service worker registration, update notice, and the install prompt.
   Android / desktop Chrome fire `beforeinstallprompt`; iPhone and iPad need the manual Share → Add to Home Screen path. */
(function () {
  const DISMISS = 'uke-install-dismissed';
  let deferred = null;
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const dismissed = () => { try { return localStorage.getItem(DISMISS) === '1'; } catch (e) { return false; } };
  const changed = () => document.dispatchEvent(new Event('pwa-change'));
  const canOffer = () => !standalone() && (!!deferred || isIOS());

  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; changed(); });
  addEventListener('appinstalled', () => { deferred = null; changed(); });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').then((reg) => {
        // A new worker took over while this page was open: offer one reload so the page matches it.
        let had = !!navigator.serviceWorker.controller;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!had) { had = true; return; }
          window.UI && UI.toast(document.documentElement.lang === 'pt-BR' ? 'Nova versão pronta.' : 'New version ready.', { label: document.documentElement.lang === 'pt-BR' ? 'Atualizar' : 'Reload', run: () => location.reload(), sticky: true });
        });
        setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
      }).catch(() => {});
    });
  }

  window.PWA = {
    /* Small banner on the home screen, until installed or dismissed. */
    banner(T) {
      if (!canOffer() || dismissed()) return '';
      return `<div class="install"><p><b>${T('Put it on your home screen', 'Coloque na tela inicial')}</b>${T('Opens like an app and works offline.', 'Abre como um aplicativo e funciona sem internet.')}</p>
        <button class="btn sm sea" data-act="install">${T('Install', 'Instalar')}</button><button class="iconbtn" data-act="dismissinstall" aria-label="${T('Dismiss', 'Dispensar')}">${UI.icon('x')}</button></div>`;
    },
    /* Row in the Diary's App card. */
    card(T) {
      if (standalone()) return `<div class="setrow"><b>${T('Installed', 'Instalado')}</b><span class="hint">✓ ${T('Running as an app; works offline.', 'Rodando como aplicativo; funciona sem internet.')}</span></div>`;
      if (canOffer()) return `<div class="setrow"><b>${T('Install on this device', 'Instalar neste aparelho')}</b><button class="btn sm sea" data-act="install">${UI.icon('download')} ${T('Install', 'Instalar')}</button></div>`;
      return `<div class="setrow"><b>${T('Install on this device', 'Instalar neste aparelho')}</b><span class="hint">${T('Use your browser menu: “Install app” or “Add to Home Screen”.', 'Use o menu do navegador: “Instalar app” ou “Adicionar à Tela de Início”.')}</span></div>`;
    },
    async install(T) {
      if (deferred) { deferred.prompt(); try { await deferred.userChoice; } catch (e) {} deferred = null; changed(); return; }
      UI.toast(isIOS() ? T('In Safari: tap Share, then “Add to Home Screen”.', 'No Safari: toque em Compartilhar e depois em “Adicionar à Tela de Início”.')
        : T('Use your browser menu: “Install app”.', 'Use o menu do navegador: “Instalar app”.'), { label: 'OK', run() {} });
    },
    dismiss() { try { localStorage.setItem(DISMISS, '1'); } catch (e) {} },
  };
})();
