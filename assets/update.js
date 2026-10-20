/* Panaghimamat 2026 · keeps every open page on the latest version.
 * GitHub Pages stamps each deploy with a new Last-Modified time. Each page loads its
 * files with that time as the version (see the loader in each page's <head>), and this
 * script checks every 2 minutes whether a newer deploy exists. If nobody has typed on
 * the page yet it reloads by itself; otherwise it shows a small "tap to refresh" note. */
(() => {
  'use strict';
  const mine = Date.parse(document.lastModified);
  if (!mine || location.protocol === 'file:') return;
  let touched = false, noted = false;
  addEventListener('input', () => { touched = true; }, true);

  function note() {
    if (noted) return;
    noted = true;
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'May bag-ong update · Tap para i-refresh';
    b.setAttribute('style', 'position:fixed;left:50%;bottom:max(14px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:9999;' +
      'padding:10px 16px;border:1px solid #c9a25c;border-radius:999px;background:#2a080d;color:#f6ead6;' +
      'font:600 14px/1.2 Georgia,serif;box-shadow:0 6px 18px rgba(0,0,0,.35);cursor:pointer;max-width:92vw');
    b.addEventListener('click', () => location.reload());
    document.body.appendChild(b);
  }
  async function check() {
    if (document.hidden) return;
    try {
      const res = await fetch(location.pathname + '?fresh=' + Date.now(), { method: 'HEAD', cache: 'no-store' });
      const latest = Date.parse(res.headers.get('last-modified') || '');
      if (!latest || latest <= mine + 1000) return;
      let tried = '';
      try { tried = sessionStorage.getItem('ph26-reloaded') || ''; } catch {}
      // Reload by itself once per new version, only if nothing has been typed and no result is on screen.
      const busy = touched || document.querySelector('.result:not([hidden])');
      if (!busy && tried !== String(latest)) {
        try { sessionStorage.setItem('ph26-reloaded', String(latest)); } catch {}
        location.reload();
      } else note();
    } catch { /* offline: try again later */ }
  }
  check();
  setInterval(check, 120000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
})();
