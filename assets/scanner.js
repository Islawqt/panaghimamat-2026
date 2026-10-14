/* Panaghimamat 2026 · SSC door scanner (/scanner/)
 * Reads a guest's QR ticket with the phone camera and checks them in on the Google Sheet.
 * The QR holds only the ticket reference. Each ticket admits once. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const API = (window.PANAGHIMAMAT_CONFIG || {}).sheetWebAppUrl || '';
  const store = {
    get(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
    set(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} }
  };
  // Officer accounts come from the "Officers" tab the President fills in (up to 4).
  let user = store.get('ph26-officer-user'), pass = store.get('ph26-officer-pass'), officer = '';
  const auth = () => ({ user, pass });
  let lastRef = '', guests = [], listView = 'out', listGroup = 'student';
  let stream = null, facing = 'environment', scanning = false, busy = false, lastText = '', lastAt = 0, detector = null, timer = null;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if (/FBAN|FBAV|FB_IAB|Messenger|Instagram|Line\/|TikTok/i.test(navigator.userAgent || '')) $('inAppHint').hidden = false;
  $('officerUser').value = user;

  async function post(body, ms = 20000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), signal: ctrl.signal, credentials: 'omit' });
      return await res.json();
    } finally { clearTimeout(t); }
  }
  const showErr = (m) => { $('startErr').textContent = m; $('startErr').hidden = !m; };
  let lastStats = null;
  function setCount(stats) {
    if (!stats) return;
    lastStats = stats;
    $('countPill').textContent = `${stats.inside} / ${stats.paid} inside`;
  }

  /* ---------- Sign in ---------- */
  $('startForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    showErr('');
    const u = $('officerUser').value.trim().toLowerCase();
    const p = $('officerPass').value || (u === user ? pass : '');
    if (!u) return showErr('Please type your username.');
    if (!p) return showErr('Please type your password.');
    $('startBtn').disabled = true;
    $('startBtn').lastElementChild.textContent = 'Signing in…';
    try {
      const d = await post({ action: 'officer', user: u, pass: p });
      if (!d.ok) { store.set('ph26-officer-pass', ''); pass = ''; return showErr(d.message || 'Wrong username or password.'); }
      user = u; pass = p; officer = d.officer || u;
      store.set('ph26-officer-user', u); store.set('ph26-officer-pass', p);
      $('officerPass').value = '';
      setCount(d.stats);
      $('whoPill').textContent = officer;
      $('sStart').hidden = true; $('sCam').hidden = false;
      startCamera();
    } catch {
      showErr('No connection. Check your signal and try again.');
    } finally {
      $('startBtn').disabled = false;
      $('startBtn').lastElementChild.textContent = 'Sign in & open scanner';
    }
  });
  if (pass) $('officerPass').placeholder = 'Saved on this phone';

  $('lockBtn').addEventListener('click', () => {
    stopCamera();
    store.set('ph26-officer-pass', ''); pass = ''; officer = '';
    $('officerPass').value = ''; $('officerPass').placeholder = 'From the SSC President';
    $('sCam').hidden = true; $('sList').hidden = true; $('sStart').hidden = false;
  });

  /* ---------- Camera ---------- */
  function camMsg(text) { $('camMsg').textContent = text; $('camMsg').hidden = !text; $('laser').hidden = !!text; }
  async function startCamera() {
    stopCamera();
    camMsg('');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return camMsg('This browser cannot open the camera. Open the link in Chrome or Safari, or tap “Type code”.');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 1280 } } });
      const v = $('video');
      v.srcObject = stream;
      await v.play().catch(() => {});
      if (!detector && 'BarcodeDetector' in window) {
        try { if ((await BarcodeDetector.getSupportedFormats()).includes('qr_code')) detector = new BarcodeDetector({ formats: ['qr_code'] }); } catch {}
      }
      scanning = true;
      loop();
    } catch (err) {
      camMsg(err && err.name === 'NotAllowedError'
        ? 'Camera is blocked. Allow camera access for this site in your browser settings, then tap Flip camera.'
        : 'Could not open the camera. Tap “Flip camera” to try again, or “Type code”.');
    }
  }
  function stopCamera() {
    scanning = false;
    clearTimeout(timer);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  $('flipBtn').addEventListener('click', () => { facing = facing === 'environment' ? 'user' : 'environment'; startCamera(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopCamera(); else if (!$('sCam').hidden && $('result').hidden) startCamera(); });

  async function readFrame() {
    const v = $('video');
    if (!v.videoWidth) return '';
    if (detector) {
      try { const codes = await detector.detect(v); if (codes.length) return codes[0].rawValue || ''; } catch { detector = null; }
      return '';
    }
    if (!window.jsQR) return '';
    // Center square of the frame, scaled down for speed.
    const side = Math.min(v.videoWidth, v.videoHeight), size = Math.min(640, side);
    canvas.width = canvas.height = size;
    ctx.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, size, size);
    const img = ctx.getImageData(0, 0, size, size);
    const hit = window.jsQR(img.data, size, size, { inversionAttempts: 'dontInvert' });
    return hit ? hit.data : '';
  }
  async function loop() {
    if (!scanning) return;
    if (!busy && $('result').hidden) {
      const text = (await readFrame()).trim();
      const now = Date.now();
      if (text && !(text === lastText && now - lastAt < 4000)) { lastText = text; lastAt = now; check(text); }
    }
    timer = setTimeout(loop, 140);
  }

  /* ---------- Check-in ---------- */
  function feedback(good) {
    try { navigator.vibrate && navigator.vibrate(good ? 120 : [90, 60, 90, 60, 90]); } catch {}
    try {
      const a = new (window.AudioContext || window.webkitAudioContext)();
      const o = a.createOscillator(), g = a.createGain();
      o.type = 'sine'; o.frequency.value = good ? 880 : 220;
      g.gain.setValueAtTime(.18, a.currentTime); g.gain.exponentialRampToValueAtTime(.001, a.currentTime + (good ? .25 : .5));
      o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + (good ? .25 : .5));
    } catch {}
  }
  const VIEW = {
    admitted: ['✓', 'Welcome!'], used: ['!', 'Already used'], unpaid: ['✕', 'Not paid yet'],
    declined: ['✕', 'Not attending'], invalid: ['?', 'Not a valid ticket'], error: ['!', 'Try again']
  };
  function show(kind, d = {}) {
    const [icon, verdict] = VIEW[kind] || VIEW.error;
    const r = $('result');
    r.className = 'result ' + kind;
    $('rIcon').textContent = icon;
    $('rVerdict').textContent = verdict;
    const g = d.guest || {};
    lastRef = kind === 'admitted' ? (d.ref || '') : '';
    $('rOwner').hidden = kind !== 'admitted';
    $('undoBtn').hidden = !lastRef;
    $('rName').textContent = g.name || '';
    $('rMeta').textContent = g.name ? (g.group === 'faculty' ? 'Faculty' : (g.section ? `Student · ${g.section}` : 'Student')) : '';
    $('rDetail').textContent = d.message || '';
    r.hidden = false;
    feedback(kind === 'admitted');
    $('nextBtn').focus();
  }
  async function check(text) {
    busy = true; $('busy').hidden = false;
    try {
      const d = await post({ action: 'checkin', ...auth(), ref: text }, 15000);
      if (!d.ok) {
        if (/password|sign in|officer accounts/i.test(d.message || '')) { $('lockBtn').click(); showErr(d.message); return; }
        return show('error', { message: d.message });
      }
      setCount(d.stats);
      show(d.result, d);
    } catch {
      show('error', { message: 'No signal. Move closer to Wi-Fi or data, then scan again.' });
    } finally {
      busy = false; $('busy').hidden = true;
    }
  }
  $('nextBtn').addEventListener('click', () => { $('result').hidden = true; lastText = ''; });
  $('undoBtn').addEventListener('click', async () => {
    if (!lastRef) return;
    $('undoBtn').disabled = true; $('undoBtn').textContent = 'Undoing…';
    try {
      const d = await post({ action: 'undo', ...auth(), ref: lastRef });
      if (!d.ok) { $('rDetail').textContent = d.message || 'Could not undo.'; return; }
      setCount(d.stats);
      show('error', { message: 'Check-in undone. The ticket owner can be scanned when they are here.' });
      $('rVerdict').textContent = 'Undone';
    } catch { $('rDetail').textContent = 'No signal. Try again.'; }
    finally { $('undoBtn').disabled = false; $('undoBtn').textContent = 'Undo this check-in'; }
  });

  /* ---------- Attendance list ---------- */
  // Shown only once the deployed Google script supports it.
  $('listBtn').hidden = true;
  fetch(`${API}?action=ping`, { credentials: 'omit' }).then((r) => r.json())
    .then((d) => { $('listBtn').hidden = !/officers/.test(String(d && d.version || '')); }).catch(() => {});
  const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
  function drawList() {
    const q = norm($('listSearch').value).trim();
    const group = guests.filter((g) => g.group === listGroup);
    const inside = group.filter((g) => g.checkedIn).length;
    $('nIn').textContent = inside; $('nOut').textContent = group.length - inside; $('nAll').textContent = group.length;
    ['student', 'faculty'].forEach((k) => {
      const all = guests.filter((g) => g.group === k);
      $(k === 'student' ? 'gStu' : 'gFac').textContent = `${all.filter((g) => g.checkedIn).length}/${all.length}`;
    });
    $('listCount').textContent = `${inside} / ${group.length} inside`;
    const rows = group.filter((g) => (listView === 'all' || (listView === 'in') === !!g.checkedIn) && (!q || norm(g.name + ' ' + g.section).includes(q)));
    if (!rows.length) {
      const li = document.createElement('li'); li.className = 'empty';
      li.textContent = q ? 'No one matches that search.' : listView === 'in' ? 'No one is inside yet.' : listView === 'out' ? 'Everyone is inside!' : 'No paid guests yet.';
      return $('guestList').replaceChildren(li);
    }
    $('guestList').replaceChildren(...rows.map((g) => {
      const li = document.createElement('li'); li.className = 'guest' + (g.checkedIn ? ' in' : '');
      const info = document.createElement('div');
      const name = document.createElement('strong'); name.textContent = g.name;
      const meta = document.createElement('small'); meta.textContent = g.group === 'faculty' ? 'Faculty' : (g.section || 'Student');
      info.append(name, meta);
      if (g.checkedIn) { const w = document.createElement('small'); w.className = 'when'; w.textContent = '✓ ' + g.checkedIn; info.append(w); }
      const btn = document.createElement('button'); btn.type = 'button';
      btn.textContent = g.checkedIn ? 'Undo' : 'Check in';
      if (!g.checkedIn) btn.className = 'go';
      // Two taps so a mis-tap never changes attendance.
      let armed = 0;
      btn.addEventListener('click', async () => {
        if (!armed) { armed = setTimeout(() => { armed = 0; btn.className = g.checkedIn ? '' : 'go'; btn.textContent = g.checkedIn ? 'Undo' : 'Check in'; }, 3000); btn.className = 'sure'; btn.textContent = 'Tap to confirm'; return; }
        clearTimeout(armed); armed = 0;
        btn.disabled = true; btn.textContent = '…';
        try {
          const d = g.checkedIn ? await post({ action: 'undo', ...auth(), ref: g.ref }) : await post({ action: 'checkin', ...auth(), ref: g.ref, manual: true });
          if (!d.ok) { listErr(d.message || 'Could not save. Try again.'); return loadList(); }
          setCount(d.stats);
          feedback(!g.checkedIn);
          await loadList();
        } catch { listErr('No signal. Try again.'); btn.disabled = false; }
      });
      li.append(info, btn);
      return li;
    }));
  }
  const listErr = (m) => { $('listErr').textContent = m; $('listErr').hidden = !m; };
  async function loadList() {
    listErr('');
    $('listRefresh').disabled = true; $('listRefresh').textContent = 'Loading…';
    try {
      const d = await post({ action: 'attendance', ...auth() });
      if (!d.ok) return listErr(d.message || 'Could not load the list.');
      guests = d.guests || [];
      setCount(d.stats);
      drawList();
    } catch { listErr('No signal. Check your connection and tap Refresh.'); }
    finally { $('listRefresh').disabled = false; $('listRefresh').textContent = 'Refresh list'; }
  }
  $('listBtn').addEventListener('click', () => { stopCamera(); $('sCam').hidden = true; $('sList').hidden = false; window.scrollTo(0, 0); drawList(); loadList(); });
  $('backToScan').addEventListener('click', () => { $('sList').hidden = true; $('sCam').hidden = false; startCamera(); });
  $('listRefresh').addEventListener('click', loadList);
  $('listSearch').addEventListener('input', drawList);
  document.querySelectorAll('.seg.view button').forEach((b) => b.addEventListener('click', () => {
    listView = b.dataset.show;
    document.querySelectorAll('.seg.view button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    drawList();
  }));
  // Students and faculty are kept apart, like their two tabs in the Sheet.
  document.querySelectorAll('.seg.group button').forEach((b) => b.addEventListener('click', () => {
    listGroup = b.dataset.group;
    document.querySelectorAll('.seg.group button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    $('listTitle').textContent = listGroup === 'faculty' ? 'Faculty attendance' : 'Student attendance';
    drawList();
  }));

  /* Manual entry when a QR will not scan (cracked screen, low brightness). */
  $('typeBtn').addEventListener('click', () => { $('typeForm').hidden = !$('typeForm').hidden; if (!$('typeForm').hidden) $('typeInput').focus(); });
  $('typeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const typed = $('typeInput').value.trim();
    if (typed) { check(typed); $('typeInput').value = ''; $('typeForm').hidden = true; }
  });
})();
