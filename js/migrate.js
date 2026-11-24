/* Move local practice state from the former public host to the private app. */
(function () {
  const key = 'uke-master-v1';
  const privateUrl = 'https://ukulele-master-two.vercel.app/';
  if (location.hostname === 'educrvz.github.io') {
    const saved = localStorage.getItem(key);
    location.replace(privateUrl + (saved ? '#uke-import=' + encodeURIComponent(saved) : ''));
    return;
  }
  if (location.hostname.endsWith('.vercel.app') && location.hash.startsWith('#uke-import=')) {
    try {
      const incoming = decodeURIComponent(location.hash.slice('#uke-import='.length));
      JSON.parse(incoming);
      const existing = localStorage.getItem(key);
      if (!existing || confirm('Replace this device’s app progress with your saved progress from the old address?\n\nSubstituir o progresso deste aparelho pelo progresso salvo no endereço antigo?')) localStorage.setItem(key, incoming);
    } catch { /* Keep the existing state if the transfer link is incomplete. */ }
    history.replaceState(null, '', location.pathname + location.search);
  }
})();
