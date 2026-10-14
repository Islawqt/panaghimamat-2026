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
  let officer = store.get('ph26-officer'), code = store.get('ph26-officer-code');
  let stream = null, facing = 'environment', scanning = false, busy = false, lastText = '', lastAt = 0, detector = null, timer = null;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if (/FBAN|FBAV|FB_IAB|Messenger|Instagram|Line\/|TikTok/i.test(navigator.userAgent || '')) $('inAppHint').hidden = false;
  $('officerName').value = officer;

  async function post(body, ms = 20000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), signal: ctrl.signal, credentials: 'omit' });
      return await res.json();
    } finally { clearTimeout(t); }
  }
  const showErr = (m) => { $('startErr').textContent = m; $('startErr').hidden = !m; };
  function setCount(stats) { if (stats) $('countPill').textContent = `${stats.inside} / ${stats.paid} inside`; }

  /* ---------- Unlock ---------- */
  $('startForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    showErr('');
    const name = $('officerName').value.trim().replace(/\s+/g, ' ');
    const typed = $('officerCode').value.trim() || code;
    if (name.length < 2) return showErr('Please type your name.');
    if (!typed) return showErr('Please type the officer code.');
    $('startBtn').disabled = true;
    $('startBtn').lastElementChild.textContent = 'Checking code…';
    try {
      const d = await post({ action: 'officer', code: typed });
      if (!d.ok) { store.set('ph26-officer-code', ''); code = ''; return showErr(d.message || 'That code did not work.'); }
      officer = name; code = typed;
      store.set('ph26-officer', name); store.set('ph26-officer-code', typed);
      setCount(d.stats);
      $('whoPill').textContent = name;
      $('sStart').hidden = true; $('sCam').hidden = false;
      startCamera();
    } catch {
      showErr('No connection. Check your signal and try again.');
    } finally {
      $('startBtn').disabled = false;
      $('startBtn').lastElementChild.textContent = 'Open the scanner';
    }
  });
  if (code) $('officerCode').placeholder = 'Saved on this phone';

  $('lockBtn').addEventListener('click', () => {
    stopCamera();
    store.set('ph26-officer-code', ''); code = '';
    $('officerCode').value = ''; $('officerCode').placeholder = 'From the SSC President';
    $('sCam').hidden = true; $('sStart').hidden = false;
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
      const d = await post({ action: 'checkin', code, officer, ref: text }, 15000);
      if (!d.ok) {
        if (/code/i.test(d.message || '')) { $('lockBtn').click(); showErr(d.message); return; }
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

  /* Manual entry when a QR will not scan (cracked screen, low brightness). */
  $('typeBtn').addEventListener('click', () => { $('typeForm').hidden = !$('typeForm').hidden; if (!$('typeForm').hidden) $('typeInput').focus(); });
  $('typeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const typed = $('typeInput').value.trim();
    if (typed) { check(typed); $('typeInput').value = ''; $('typeForm').hidden = true; }
  });
})();
