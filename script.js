(() => {
  'use strict';
  const config = window.PANAGHIMAMAT_CONFIG || {};
  const testMode = config.testMode === true;
  const $ = (id) => document.getElementById(id);
  const screens = [...document.querySelectorAll('.step')];
  const dots = [...document.querySelectorAll('.dots span')];
  const FACULTY = document.body.dataset.audience === 'faculty';
  const FEE = FACULTY ? 400 : 550; // per faculty member / per student
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? 0 : ms));
  let step = 0;
  let busy = false;

  const anim = (el, frames, opts) => {
    if (reduceMotion || !el.animate) { Object.assign(el.style, frames[frames.length - 1]); return Promise.resolve(); }
    const a = el.animate(frames, { fill: 'forwards', ...opts });
    return a.finished.then(() => { try { a.commitStyles(); } catch {} a.cancel(); });
  };
  const EASE_OUT = 'cubic-bezier(.22,1,.36,1)';
  const EASE_IN_OUT = 'cubic-bezier(.65,0,.35,1)';

  /* ---------- Pages (soft fade and rise/fall between pages) ---------- */
  let switching = false;
  function applyStep(next) {
    step = next;
    screens.forEach((s, i) => { s.hidden = i !== next; s.classList.toggle('is-active', i === next); });
    dots.forEach((d, i) => d.classList.toggle('active', i === Math.min(next, 2)));
    $('pager').hidden = next === 0 || next === 3;
    $('nextBtn').style.visibility = next >= 2 ? 'hidden' : 'visible';
  }
  async function showStep(next, instant) {
    if (next < 0 || next > 3 || next === step || switching) return;
    switching = true;
    const dir = next > step ? 1 : -1;
    const out = screens[step], into = screens[next];
    if (!instant && !reduceMotion) {
      await anim(out, [{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: `translateY(${-dir * 22}px)`, filter: 'blur(3px)' }], { duration: 280, easing: 'cubic-bezier(.55,0,.75,.4)' });
      out.style.cssText = '';
    }
    applyStep(next);
    if (next >= 1) warmUp();
    window.scrollTo({ top: 0 });
    $('mainContent').focus({ preventScroll: true });
    if (!instant && !reduceMotion) {
      const parts = [...into.children].filter((el) => !el.hidden);
      parts.forEach((el) => { el.style.opacity = '0'; });
      await Promise.all(parts.map((el, i) => anim(el,
        [{ opacity: 0, transform: `translateY(${dir * 26}px)`, filter: 'blur(4px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
        { duration: 560, delay: Math.min(i, 6) * 60, easing: EASE_OUT })));
      parts.forEach((el) => { el.style.cssText = ''; });
    }
    switching = false;
  }
  $('nextBtn').addEventListener('click', () => showStep(step + 1));
  $('backBtn').addEventListener('click', () => showStep(step - 1));
  $('toPayment').addEventListener('click', () => { if (!busy) showStep(1); });
  $('brandHome').addEventListener('click', (e) => { e.preventDefault(); if (step !== 0) showStep(0); });
  $('restartButton').addEventListener('click', () => showStep(0));

  /* ---------- Envelope ---------- */
  const envelope = $('envelope');
  const layer = $('inviteLayer');
  const card = $('invitationCard');
  const seal = $('sealButton');
  const flap = envelope.querySelector('.env-flap');
  const letter = envelope.querySelector('.env-letter');
  const content = card.querySelector('.invite-content');
  const replySlip = document.createElement('div');
  replySlip.className = 'env-reply paper';
  replySlip.setAttribute('aria-hidden', 'true');
  replySlip.hidden = true;
  const slipKicker = document.createElement('span');
  slipKicker.className = 'mini-kicker';
  slipKicker.textContent = 'Your next chapter';
  const slipTitle = document.createElement('strong');
  slipTitle.textContent = 'Contribution & RSVP';
  const slipNote = document.createElement('span');
  slipNote.textContent = 'A celebration awaits your reply';
  replySlip.append(slipKicker, slipTitle, slipNote);
  envelope.append(replySlip);

  if (config.eventTheme) {
    $('themeValue').textContent = config.eventTheme;
    $('themeRow').hidden = false;
  }

  // Transform that makes the full card sit exactly over the small letter (for a seamless "unfold").
  function letterToCard() {
    const l = letter.getBoundingClientRect(), c = card.getBoundingClientRect();
    const sx = l.width / c.width, sy = l.height / c.height;
    const dx = (l.left + l.width / 2) - (c.left + c.width / 2), dy = (l.top + l.height / 2) - (c.top + c.height / 2);
    return `translate(${dx}px,${dy}px) scale(${sx},${sy})`;
  }

  async function openEnvelope() {
    if (busy || switching) return;
    busy = true;
    envelope.classList.remove('is-read');
    envelope.classList.add('is-open');
    // 1. the seal is pressed, then lifts away
    await anim(seal, [{ transform: 'scale(1)' }, { transform: 'scale(.92)' }], { duration: 140, easing: 'ease-out' });
    anim(seal, [{ transform: 'scale(.92)', opacity: 1 }, { transform: 'translateY(-14px) scale(1.08) rotate(-12deg)', opacity: 0 }], { duration: 420, easing: EASE_OUT });
    // 2. the flap swings up (front half), slips behind the letter, then settles
    await anim(flap, [{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(90deg)' }], { duration: 380, delay: 120, easing: 'cubic-bezier(.5,0,.75,.3)' });
    envelope.classList.add('flap-up');
    await anim(flap, [{ transform: 'rotateX(90deg)' }, { transform: 'rotateX(180deg)' }], { duration: 420, easing: EASE_OUT });
    // 3. the letter glides out
    await anim(letter, [{ transform: 'translateY(0)' }, { transform: 'translateY(-46%)' }], { duration: 760, easing: EASE_IN_OUT });
    // 4. the letter unfolds into the full invitation
    layer.hidden = false;
    card.scrollTop = 0;
    const from = letterToCard();
    letter.style.opacity = '0';
    content.style.opacity = '0';
    anim(layer, [{ backgroundColor: 'rgba(18,2,5,0)' }, { backgroundColor: 'rgba(18,2,5,.62)' }], { duration: 700, easing: 'ease-out' });
    await anim(card, [{ transform: from }, { transform: 'none' }], { duration: 760, easing: EASE_OUT });
    card.style.transform = '';
    await anim(content, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: EASE_OUT });
    content.style.cssText = '';
    card.focus({ preventScroll: true });
    busy = false;
  }

  // Three paper panels fold over their real creases, then return to the envelope.
  async function foldPaper() {
    if (reduceMotion) return;
    card.scrollTop = 0;
    const rect = card.getBoundingClientRect();
    const stage = document.createElement('div');
    stage.className = 'paper-fold';
    stage.setAttribute('aria-hidden', 'true');
    stage.inert = true;
    Object.assign(stage.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    const panels = [0, 1, 2].map((i) => {
      const panel = document.createElement('div');
      panel.className = `fold-panel fold-panel-${i}`;
      const face = document.createElement('div');
      face.className = 'fold-face';
      const copy = card.querySelector('.invite-sheet').cloneNode(true);
      copy.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
      copy.querySelectorAll('a,button,input').forEach((el) => { el.setAttribute('tabindex', '-1'); });
      Object.assign(copy.style, { width: `${rect.width}px`, position: 'absolute', top: `${-i * rect.height / 3}px`, left: '0' });
      face.append(copy);
      const back = document.createElement('div');
      back.className = 'fold-back';
      panel.append(face, back);
      stage.append(panel);
      return panel;
    });
    layer.append(stage);
    card.style.visibility = 'hidden';
    try {
      await anim(panels[0], [{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(-180deg)' }], { duration: 520, easing: EASE_IN_OUT });
      await anim(panels[2], [{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(180deg)' }], { duration: 520, easing: EASE_IN_OUT });
      const target = letter.getBoundingClientRect();
      const dx = target.left + target.width / 2 - rect.left - rect.width / 2;
      const dy = target.top + target.height / 2 - rect.top - rect.height / 2;
      await Promise.all([
        anim(stage, [{ transform: 'none' }, { transform: `translate(${dx}px,${dy}px) scale(${target.width / rect.width},${target.height * 3 / rect.height})` }], { duration: 650, easing: EASE_IN_OUT }),
        anim(layer, [{ backgroundColor: 'rgba(18,2,5,.62)', backdropFilter: 'blur(3px)' }, { backgroundColor: 'rgba(18,2,5,0)', backdropFilter: 'blur(0px)' }], { duration: 650, easing: 'ease-in' })
      ]);
    } finally {
      stage.remove();
      card.style.visibility = '';
    }
  }

  async function closeEnvelope() {
    if (busy || layer.hidden) return;
    busy = true;
    try {
      await foldPaper();
      letter.style.opacity = '';
      layer.hidden = true;
      await anim(letter, [{ transform: 'translateY(-46%)' }, { transform: 'translateY(0)' }], { duration: 480, easing: EASE_IN_OUT });
      letter.style.opacity = '0';
      $('envelopeHint').hidden = true;
      // Keep the flap open: the reply slip emerges only after the letter is tucked in.
      replySlip.hidden = false;
      await anim(replySlip, [{ transform: 'translateY(0)' }, { transform: 'translateY(-80%)' }], { duration: 780, easing: EASE_OUT });
      await wait(420);
      await showStep(1);
    } finally {
      // Reset the envelope off-screen so Back / Read again always works.
      layer.hidden = true;
      layer.style.cssText = ''; card.style.cssText = ''; content.style.cssText = '';
      replySlip.hidden = true; replySlip.style.cssText = '';
      letter.style.cssText = ''; flap.style.cssText = ''; seal.style.cssText = '';
      envelope.classList.remove('is-open', 'flap-up');
      envelope.classList.add('is-read');
      $('envelopeHint').hidden = true;
      $('afterRead').hidden = false;
      busy = false;
    }
  }
  $('sealButton').addEventListener('click', openEnvelope);
  $('reopenEnvelope').addEventListener('click', openEnvelope);
  $('closeInvitation').addEventListener('click', closeEnvelope);
  layer.addEventListener('click', (e) => { if (e.target === layer) closeEnvelope(); });
  document.addEventListener('keydown', (e) => {
    if (layer.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); closeEnvelope(); }
    if (e.key === 'Tab') { // keep focus inside the invitation while it is open
      const items = [...layer.querySelectorAll('a,button')];
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === $('invitationCard'))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ---------- QR tabs ---------- */
  const accounts = {
    gcash: { img: config.gcash?.qrImage, name: config.gcash?.displayName, label: 'GCash number', number: config.gcash?.maskedNumber, alt: 'GCash QR code' },
    bank: { img: config.bank?.qrImage, name: config.bank?.accountName, label: `${config.bank?.bankName || 'Bank'} account`, number: config.bank?.maskedNumber, alt: 'GoTyme Bank QR code' }
  };
  const tabs = [$('tabGcash'), $('tabBank')];
  function selectAccount(key) {
    const a = accounts[key];
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.account === key)));
    $('qrPanel').setAttribute('aria-labelledby', key === 'gcash' ? 'tabGcash' : 'tabBank');
    if (a.img) $('qrImage').src = a.img;
    $('qrImage').alt = `${a.alt} of ${a.name || 'Anthony Sedoro'}`;
    $('qrName').textContent = a.name || '';
    $('qrNumberLabel').textContent = a.label;
    $('qrNumber').textContent = a.number || '';
  }
  tabs.forEach((t) => {
    t.addEventListener('click', () => selectAccount(t.dataset.account));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const other = tabs.find((x) => x !== t);
      other.focus(); selectAccount(other.dataset.account);
    });
  });
  selectAccount('gcash');
  document.querySelectorAll('[data-test-only]').forEach((el) => { el.hidden = !testMode; });
  // Outside test mode, online payment only shows once the SSC switches it on in config.js.
  if (!testMode && config.onlinePaymentsEnabled !== true) {
    document.querySelector('.qr-card').hidden = true;
    document.querySelectorAll('[name="paymentMethod"]:not([value="Cash"])').forEach((i) => { i.disabled = true; i.closest('.method').hidden = true; });
  }

  /* ---------- Form ---------- */
  const API = config.sheetWebAppUrl || '';
  const configured = /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(API);
  const preview = testMode || !configured;
  const selected = (name) => document.querySelector(`[name="${name}"]:checked`)?.value || '';
  const cleanName = () => $('fullName').value.trim().replace(/\s+/g, ' ');

  // Small JSON helper with a time limit, so a slow signal never hangs the page.
  async function callApi(url, options = {}, ms = 20000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, { ...options, signal: ctrl.signal, credentials: 'omit', redirect: 'follow' });
      const raw = await res.text();
      try { return JSON.parse(raw); } catch { return { ok: false, notReady: true }; }
    } finally { clearTimeout(timer); }
  }
  // Wake the Google script early so the actual sending is quicker.
  let warmed = false;
  function warmUp() { if (warmed || !configured) return; warmed = true; fetch(`${API}?action=ping`, { credentials: 'omit' }).catch(() => {}); }

  /* Students type their year & section */
  const cleanSection = () => ($('section') ? $('section').value.trim().replace(/\s+/g, ' ').toUpperCase() : '');
  if ($('section')) $('section').addEventListener('blur', () => { $('section').value = cleanSection(); });

  function updatePayment() {
    const attendance = selected('attendance');
    const attending = attendance === 'Attending';
    $('reasonWrap').hidden = attendance !== 'Not attending';
    $('paymentFields').hidden = !attending;
    $('feeValue').textContent = `₱${FEE}`;
    const method = selected('paymentMethod');
    $('proofWrap').hidden = !(attending && (method === 'GCash' || method === 'Bank Transfer'));
  }
  document.querySelectorAll('[name="attendance"],[name="paymentMethod"]').forEach((i) => i.addEventListener('change', updatePayment));

  $('previewRibbon').hidden = !testMode;
  $('connectionStatus').textContent = preview ? 'Test preview: your reply will not be saved yet.' : '';
  $('submitBtn').textContent = preview ? 'Preview my reply' : 'Send my reply';

  function error(message) { $('formError').textContent = message; $('formError').hidden = false; $('formError').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  function clearError() { $('formError').hidden = true; $('formError').textContent = ''; }

  // Shrink the screenshot before sending (phone screenshots are often 1–3 MB). Much faster on slow data.
  async function imageProof(input) {
    const file = input.files[0];
    if (!file) throw new Error('Please attach your payment screenshot.');
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Use a JPG, PNG or WebP screenshot.');
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
      canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL('image/jpeg', 0.78).split(',')[1];
      return { mime: 'image/jpeg', base64 };
    } catch {
      if (file.size > 2 * 1024 * 1024) throw new Error('Screenshot must be 2 MB or smaller.');
      const dataUrl = await new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = bad; r.readAsDataURL(file); });
      return { mime: file.type, base64: dataUrl.split(',')[1] };
    }
  }

  let sending = false;
  // Persist only opaque hashes/IDs, never names or payment screenshots.
  // An unchanged reply keeps its ID after a timeout, refresh, or repeat click.
  const requestIds = new Map();
  async function requestIdFor(payload) {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    const key = 'panaghimamat-request-v1';
    let stored = [];
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      if (Array.isArray(value)) stored = value.filter((r) => r && typeof r.hash === 'string' && /^[a-zA-Z0-9-]{16,100}$/.test(r.id) && r.time > Date.now() - 30 * 86400000);
    } catch { /* Storage may be unavailable in private browsing. */ }
    const found = stored.find((r) => r.hash === hash);
    const id = found?.id || requestIds.get(hash) || Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
    requestIds.set(hash, id);
    try { localStorage.setItem(key, JSON.stringify([...stored.filter((r) => r.hash !== hash).slice(-19), { hash, id, time: Date.now() }])); } catch {}
    return id;
  }
  $('rsvpForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (sending) return;
    clearError();
    if ($('companyWebsite').value) return;
    const fullName = cleanName();
    const section = cleanSection();
    const attendance = selected('attendance');
    const method = attendance === 'Attending' ? selected('paymentMethod') : '';
    const reason = $('reason').value.trim().replace(/\s+/g, ' ');
    if (fullName.split(' ').length < 2) return error('Please type your full name (first and last name).');
    if (!FACULTY && section.length < 2) return error('Please type your year and section, e.g. BSIS 4A.');
    if (!attendance) return error('Please tell us if you can attend.');
    if (attendance === 'Not attending' && reason.length < 3) return error('Please give a short reason for not attending.');
    if (attendance === 'Attending' && !method) return error('Please choose how you will pay.');
    if (!$('consent').checked) return error('Please tick the agreement box to continue.');
    const isOnline = method === 'GCash' || method === 'Bank Transfer';
    sending = true;
    $('submitBtn').disabled = true;
    $('submitBtn').textContent = 'Sending…';
    try {
      let proof = null;
      if (isOnline && (!preview || $('proofImage').files.length)) proof = await imageProof($('proofImage'));
      const payload = { group: FACULTY ? 'faculty' : 'student', fullName, section, attendance, paymentMethod: method, reason: attendance === 'Not attending' ? reason : '', proof, website: '' };
      const amount = attendance === 'Attending' ? FEE : 0;
      if (preview) return showAcknowledgment({ ...payload, amount, receiptId: `DEMO-${Date.now().toString(36).toUpperCase()}`, saved: false });
      payload.requestId = await requestIdFor(payload);
      // text/plain keeps this a "simple" request, so the browser sends it straight away (no pre-check round trip).
      const data = await callApi(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) }, 45000);
      if (data.ok === true) showAcknowledgment({ ...payload, amount, receiptId: data.receiptId, saved: true });
      else if (data.notReady) error('The SSC records are being updated. Please try again in a few minutes.');
      else error(data.message || 'Your reply could not be saved. Please try again.');
    } catch (err) {
      error(err && err.name === 'AbortError' ? 'We could not confirm your reply yet. Please check your signal and send the same reply again.' : (err && err.message) || 'No connection. Please try again.');
    } finally {
      sending = false;
      $('submitBtn').disabled = false;
      $('submitBtn').textContent = preview ? 'Preview my reply' : 'Send my reply';
    }
  });

  function showAcknowledgment(d) {
    const attending = d.attendance === 'Attending';
    const online = attending && ['GCash', 'Bank Transfer'].includes(d.paymentMethod);
    $('receiptTitle').textContent = !d.saved ? 'Preview only' : online ? 'Payment acknowledgment' : 'RSVP acknowledgment';
    $('receiptTag').textContent = !d.saved ? 'Not saved' : online ? 'Awaiting SSC verification' : 'Reply recorded';
    $('replyBody').textContent = !d.saved
      ? 'This is a test preview. Nothing was saved and no payment was recorded.'
      : attending ? 'We look forward to celebrating with you on October 23.' : 'Thank you for letting us know. You will be missed.';
    const rows = [['Reference', d.receiptId], ['Name', d.fullName], ['Attending', attending ? 'Yes' : 'No']];
    if (!FACULTY) rows.splice(2, 0, ['Year & section', d.section]);
    if (attending) rows.push(['Payment', d.paymentMethod === 'Bank Transfer' ? 'GoTyme' : d.paymentMethod], ['Contribution', `₱${d.amount}`], ['Status', online ? 'Pending verification' : 'Cash, to be paid']);
    $('receiptDetails').replaceChildren(...rows.map(([k, v]) => { const w = document.createElement('div'); const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = String(v); w.append(dt, dd); return w; }));
    $('receiptFooter').textContent = !d.saved ? 'Sample only. Not saved or validated.' : 'Event acknowledgment only, not an official receipt. Online payments are checked by the SSC.';
    $('printReceipt').disabled = !d.saved;
    showStep(3);
  }
  $('printReceipt').addEventListener('click', () => window.print());
  applyStep(0);
})();
