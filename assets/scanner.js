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
  // Officer accounts come from the "Officers" tab the President fills in (up to 5).
  let user = store.get('ph26-officer-user'), pass = store.get('ph26-officer-pass'), officer = '';
  const auth = () => ({ user, pass });
  let lastRef = '', guests = [], listView = 'out', listGroup = 'student';
  let mode = 'checkin', windowStatus = null, checkoutEnabled = false;
  let presenceSupported = false, heartbeatBusy = false, onBreak = false, lastKind = '';
  let qrGoneAt = 0;
  const allowed = (m) => !checkoutEnabled || !!(windowStatus && (m === 'checkout' ? windowStatus.checkoutOpen : windowStatus.checkinOpen));
  function switchMode(m) {
    if (!allowed(m) || (m === 'checkout' && !checkoutEnabled)) return;
    mode = m; lastText = ''; lastAt = 0; qrGoneAt = 0;
    hideResult();
    $('chooseCheckin').setAttribute('aria-pressed', String(m === 'checkin'));
    $('chooseCheckout').setAttribute('aria-pressed', String(m === 'checkout'));
    $('manualAction').textContent = m === 'checkout' ? 'Check out' : 'Check in';
    drawList();
  }
  function updateWindow(w) {
    if (!w || typeof w.checkinOpen !== 'boolean' || typeof w.checkoutOpen !== 'boolean') return;
    windowStatus = w; checkoutEnabled = true;
    $('attendanceModes').hidden = false;
    $('chooseCheckin').disabled = !w.checkinOpen;
    $('chooseCheckout').disabled = !w.checkoutOpen;
    $('attendanceWindow').textContent = w.checkoutOpen
      ? (w.checkinOpen ? 'Both modes open · Check-in closes ' + w.checkinCloses + ' PH time' : 'Check-out open · Check-in closed')
      : (w.checkinOpen ? 'Check-in open · Check-out starts ' + w.checkoutOpens + ' PH time' :
        'Check-in ' + w.checkinOpens + '–' + w.checkinCloses + ' · Check-out ' + w.checkoutOpens + '–' + w.checkoutCloses + ' (PH time)');
    if (!allowed(mode) && allowed(mode === 'checkin' ? 'checkout' : 'checkin')) switchMode(mode === 'checkin' ? 'checkout' : 'checkin');
  }
  $('chooseCheckin').addEventListener('click', () => switchMode('checkin'));
  $('chooseCheckout').addEventListener('click', () => switchMode('checkout'));
  // Read-only time refresh; server-side time gates are authoritative.
  setInterval(() => {
    if ($('sStart').hidden && checkoutEnabled)
      fetch(API + '?action=ping', { credentials: 'omit', cache: 'no-store' })
        .then(r => r.json()).then(d => updateWindow(d.window)).catch(() => {});
  }, 60000);
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
  function setCount(stats) {
    if (!stats) return;
    $('countPill').textContent = `${stats.inside} inside · ${stats.checkedOut || 0} out`;
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
      updateWindow(d.window);
      store.set('ph26-officer-user', u); store.set('ph26-officer-pass', p);
      $('officerPass').value = '';
      setCount(d.stats);
      $('whoPill').textContent = officer;
      $('sStart').hidden = true; $('sCam').hidden = false;
      await startCamera();
      wake();
    } catch {
      showErr('No connection. Check your signal and try again.');
    } finally {
      $('startBtn').disabled = false;
      $('startBtn').lastElementChild.textContent = 'Sign in & open scanner';
    }
  });
  if (pass) $('officerPass').placeholder = 'Saved on this phone';

  $('lockBtn').addEventListener('click', () => {
    // Tell the Admin page this scanner is off before the password is forgotten.
    if (presenceSupported && officer) post({ action: 'scannerHeartbeat', ...auth(), mode, status: 'offline' }, 8000).catch(() => {});
    stopCamera();
    store.set('ph26-officer-pass', ''); pass = ''; officer = '';
    hideResult(); presenceSupported = false; lastText = ''; qrGoneAt = 0; onBreak = false; drawStatus();
    $('attendanceModes').hidden = true;
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
    releaseLock();
    clearTimeout(timer);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  $('flipBtn').addEventListener('click', () => { facing = facing === 'environment' ? 'user' : 'environment'; startCamera(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopCamera();
    else if (!$('sCam').hidden && officer) startCamera();
  });

  // Returns { text, pts } where pts are the QR's 4 corners in video pixels (TL, TR, BR, BL).
  async function readFrame() {
    const v = $('video');
    if (!v.videoWidth) return null;
    if (detector) {
      try { const codes = await detector.detect(v); if (codes.length) return { text: codes[0].rawValue || '', pts: codes[0].cornerPoints || [] }; } catch { detector = null; }
      return null;
    }
    if (!window.jsQR) return null;
    // Center square of the frame, scaled down for speed.
    const side = Math.min(v.videoWidth, v.videoHeight), size = Math.min(640, side);
    canvas.width = canvas.height = size;
    ctx.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, size, size);
    const img = ctx.getImageData(0, 0, size, size);
    const hit = window.jsQR(img.data, size, size, { inversionAttempts: 'dontInvert' });
    if (!hit) return null;
    const k = side / size, x0 = (v.videoWidth - side) / 2, y0 = (v.videoHeight - side) / 2, L = hit.location;
    const pts = [L.topLeftCorner, L.topRightCorner, L.bottomRightCorner, L.bottomLeftCorner].map((p) => ({ x: x0 + p.x * k, y: y0 + p.y * k }));
    return { text: hit.data, pts };
  }

  /* Brackets that stick to the QR on screen, like a real scanner. */
  let seenAt = 0;
  function placeLock(pts) {
    const v = $('video'), f = $('finder'), lock = $('lock');
    if (!pts || pts.length < 4 || !v.videoWidth) return;
    // The video fills the square with object-fit: cover, so map video pixels to screen pixels.
    const fw = f.clientWidth, fh = f.clientHeight, sc = Math.max(fw / v.videoWidth, fh / v.videoHeight);
    const ox = (fw - v.videoWidth * sc) / 2, oy = (fh - v.videoHeight * sc) / 2;
    const p = pts.map((q) => ({ x: q.x * sc + ox, y: q.y * sc + oy }));
    const d = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
    const w = (d(p[0], p[1]) + d(p[3], p[2])) / 2 * 1.14, h = (d(p[0], p[3]) + d(p[1], p[2])) / 2 * 1.14;
    const cx = (p[0].x + p[1].x + p[2].x + p[3].x) / 4, cy = (p[0].y + p[1].y + p[2].y + p[3].y) / 4;
    const deg = Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x) * 180 / Math.PI;
    lock.style.width = w + 'px'; lock.style.height = h + 'px';
    lock.style.transform = `translate(${cx - w / 2}px, ${cy - h / 2}px) rotate(${deg}deg)`;
    lock.classList.add('on'); f.classList.add('tracking');
    seenAt = Date.now();
  }
  function releaseLock() {
    $('lock').classList.remove('on', 'locked'); $('finder').classList.remove('tracking');
  }
  async function loop() {
    if (!scanning) return;
    if (!busy && $('result').hidden) {
      const hit = await readFrame();
      if (!scanning) return;
      const text = hit ? String(hit.text || '').trim() : '';
      const now = Date.now();
      if (hit && hit.pts?.length >= 4) placeLock(hit.pts);
      else if (now - seenAt > 350) releaseLock();
      if (text) {
        qrGoneAt = 0;
        // A ticket held in front of the lens is one scan, not dozens of requests.
        // Move it away before presenting the same QR again.
        if (text !== lastText) {
          lastText = text; lastAt = now;
          snapQR(hit.pts);
          void check(text);
        }
      } else if (lastText) {
        if (!qrGoneAt) qrGoneAt = now;
        if (now - qrGoneAt > 850) { lastText = ''; qrGoneAt = 0; }
      }
    }
    timer = setTimeout(loop, 110);
  }
  /* Freeze and zoom on the QR while the Sheet answers: the camera "captures" the ticket. */
  function snapQR(pts) {
    const v = $('video'), c = $('snap');
    $('lock').classList.add('locked');
    try {
      const xs = (pts || []).map((q) => q.x), ys = (pts || []).map((q) => q.y);
      if (xs.length < 4 || !v.videoWidth) throw 0;
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      let side = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 1.35;
      side = Math.min(side, v.videoWidth, v.videoHeight);
      const sx = Math.max(0, Math.min(v.videoWidth - side, cx - side / 2)), sy = Math.max(0, Math.min(v.videoHeight - side, cy - side / 2));
      c.width = c.height = 600;
      c.getContext('2d').drawImage(v, sx, sy, side, side, 0, 0, 600, 600);
      releaseLock();
      $('finder').classList.add('snapped');
      c.hidden = false;
    } catch {}
    v.pause();
  }
  function hideResult() {
    $('result').hidden = true;
    $('snap').hidden = true;
    $('finder').classList.remove('snapped');
    releaseLock();
    const v = $('video');
    if (stream && v.paused) v.play().catch(() => {});
  }
  function resumeCamera() { hideResult(); }
  // Keep the Google script awake while the scanner is open, so the first scan is not slow.
  // Only use new authenticated heartbeat actions once the deployed backend
  // advertises support. An old Apps Script would otherwise treat an unknown
  // action as an RSVP submission.
  async function heartbeat() {
    if (!presenceSupported || heartbeatBusy || !officer || !scanning || document.hidden || $('sCam').hidden) return;
    heartbeatBusy = true;
    try {
      const d = await post({ action: 'scannerHeartbeat', ...auth(), mode, status: onBreak ? 'break' : 'active' }, 12000);
      if (d.ok && d.window) updateWindow(d.window);
    } catch { /* connectivity may be interrupted; status expires automatically */ }
    finally { heartbeatBusy = false; }
  }
  async function probeCapabilities() {
    try {
      const response = await fetch(API + '?action=ping', { credentials:'omit',cache:'no-store' });
      const data = await response.json();
      presenceSupported = !!(data.features && data.features.officerPresence);
      $('statusBtn').hidden = !presenceSupported;
      if (data.window) updateWindow(data.window);
      if (presenceSupported) void heartbeat();
    } catch {}
  }
  // Officers set their own status (Active / On break); the Admin page shows it.
  function drawStatus() {
    $('statusBtn').classList.toggle('away', onBreak);
    $('statusBtn').lastElementChild.textContent = onBreak ? 'On break · tap when back' : 'Active · tap to take a break';
  }
  $('statusBtn').addEventListener('click', () => { onBreak = !onBreak; drawStatus(); void heartbeat(); });
  const wake = () => { if (officer && $('sCam').hidden === false && !document.hidden) void probeCapabilities(); };
  setInterval(heartbeat, 45000);
  setInterval(wake, 120000);

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
    admitted: ['✓', 'Checked in!'], departed: ['✓', 'Checked out!'],
    used: ['!', 'Already checked in'], already_out: ['!', 'Already checked out'],
    not_in: ['✕', 'Not checked in'], unpaid: ['✕', 'Not paid yet'],
    declined: ['✕', 'Not attending'], invalid: ['?', 'Not a valid ticket'], error: ['!', 'Try again']
  };
  function show(kind, d = {}) {
    const [icon, verdict] = VIEW[kind] || VIEW.error;
    const r = $('result');
    r.className = 'result ' + kind;
    $('rIcon').textContent = icon;
    $('rVerdict').textContent = verdict;
    const g = d.guest || {};
    lastRef = kind === 'admitted' || kind === 'departed' ? (d.ref || '') : '';
    lastKind = lastRef ? kind : '';
    $('rOwner').hidden = kind !== 'admitted';
    $('undoBtn').hidden = !lastRef;
    $('undoBtn').textContent = kind === 'departed' ? 'Undo this check-out' : 'Undo this check-in';
    $('rName').textContent = g.name || '';
    $('rMeta').textContent = g.name ? (g.group === 'faculty' ? 'Faculty' : (g.section ? `Student · ${g.section}` : 'Student')) : '';
    $('rDetail').textContent = d.message || '';
    r.hidden = false;
    feedback(kind === 'admitted' || kind === 'departed');
    $('nextBtn').focus();
  }
  async function check(text) {
    busy = true; $('busy').hidden = false;
    try {
      if (checkoutEnabled && !allowed(mode)) return show('error', { message: mode === 'checkout'
        ? 'Check-out is outside its scheduled hours (Philippine time).'
        : 'Check-in is outside its scheduled hours (Philippine time).' });
      const d = await post({ action: mode === 'checkout' && checkoutEnabled ? 'checkout' : 'checkin', ...auth(), ref: text }, 15000);
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
      if ($('result').hidden) resumeCamera();
    }
  }
  $('nextBtn').addEventListener('click', hideResult);
  $('undoBtn').addEventListener('click', async () => {
    if (!lastRef) return;
    const out = lastKind === 'departed';
    $('undoBtn').disabled = true; $('undoBtn').textContent = 'Undoing…';
    try {
      const d = await post({ action: 'undo', ...auth(), ref: lastRef, what: out ? 'checkout' : 'checkin' });
      if (!d.ok) { $('rDetail').textContent = d.message || 'Could not undo.'; return; }
      setCount(d.stats);
      show('error', { message: out ? 'Check-out undone. The guest is inside again.' : 'Check-in undone. The ticket owner can be scanned when they are here.' });
      $('rVerdict').textContent = 'Undone';
    } catch { $('rDetail').textContent = 'No signal. Try again.'; }
    finally { $('undoBtn').disabled = false; }
  });

  /* ---------- Attendance list ---------- */
  // Shown only once the deployed Google script supports it.
  $('listBtn').hidden = false; // Attendance is supported by the deployed backend; version names can change.
  const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
  function drawList() {
    const q = norm($('listSearch').value).trim();
    const group = guests.filter((g) => g.group === listGroup);
    const inside = group.filter((g) => g.checkedIn && !g.checkedOut).length;
    const notArrived = group.filter((g) => !g.checkedIn).length;
    $('nIn').textContent = inside; $('nOut').textContent = notArrived; $('nAll').textContent = group.length;
    ['student', 'faculty'].forEach((k) => {
      const all = guests.filter((g) => g.group === k);
      $(k === 'student' ? 'gStu' : 'gFac').textContent = `${all.filter((g) => g.checkedIn && !g.checkedOut).length}/${all.length}`;
    });
    $('listCount').textContent = `${inside} / ${group.length} inside`;
    const rows = group.filter((g) => (listView === 'all' || (listView === 'in' ? !!g.checkedIn && !g.checkedOut : !g.checkedIn))
      && (!q || norm(g.name + ' ' + g.section).includes(q)));
    if (!rows.length) {
      const li = document.createElement('li'); li.className = 'empty';
      li.textContent = q ? 'No one matches that search.' : listView === 'in' ? 'No one is inside yet.' : listView === 'out' ? 'Everyone has arrived!' : 'No paid guests yet.';
      return $('guestList').replaceChildren(li);
    }
    $('guestList').replaceChildren(...rows.map((g) => {
      const li = document.createElement('li'); li.className = 'guest' + (g.checkedIn && !g.checkedOut ? ' in' : '');
      const info = document.createElement('div');
      const name = document.createElement('strong'); name.textContent = g.name;
      const meta = document.createElement('small'); meta.textContent = g.group === 'faculty' ? 'Faculty' : (g.section || 'Student');
      info.append(name, meta);
      if (g.checkedIn) {
        const w = document.createElement('small'); w.className = 'when';
        w.textContent = g.checkedOut ? '↗ Checked out ' + g.checkedOut : '✓ Inside since ' + g.checkedIn;
        info.append(w);
      }
      const btn = document.createElement('button'); btn.type = 'button';
      // Not arrived → Check in. Inside → Check out (check-out mode) or Undo. Checked out → Undo check-out.
      const act = !g.checkedIn ? 'checkin' : g.checkedOut ? 'undoOut' : mode === 'checkout' ? 'checkout' : 'undoIn';
      const label = { checkin: 'Check in', checkout: 'Check out', undoIn: 'Undo', undoOut: 'Undo out' }[act];
      btn.textContent = label;
      btn.disabled = (act === 'checkin' || act === 'checkout') && !allowed(act);
      if (act === 'checkin' || act === 'checkout') btn.className = 'go';
      // Two taps so a mis-tap never changes attendance.
      let armed = 0;
      btn.addEventListener('click', async () => {
        if (!armed) { armed = setTimeout(() => { armed = 0; btn.className = /^(checkin|checkout)$/.test(act) ? 'go' : ''; btn.textContent = label; }, 3000); btn.className = 'sure'; btn.textContent = 'Tap to confirm'; return; }
        clearTimeout(armed); armed = 0;
        btn.disabled = true; btn.textContent = '…';
        try {
          const d = act === 'checkin' || act === 'checkout'
            ? await post({ action: act, ...auth(), ref: g.ref, manual: true })
            : await post({ action: 'undo', ...auth(), ref: g.ref, what: act === 'undoOut' ? 'checkout' : 'checkin' });
          if (!d.ok) { listErr(d.message || 'Could not save. Try again.'); return loadList(); }
          setCount(d.stats);
          feedback(act === 'checkin' || act === 'checkout');
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
      updateWindow(d.window);
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
