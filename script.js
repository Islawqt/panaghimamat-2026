(() => {
  'use strict';
  const config = window.PANAGHIMAMAT_CONFIG || {};
  const testMode = config.testMode === true;
  const $ = (id) => document.getElementById(id);
  const screens = [...document.querySelectorAll('.step')];
  const dots = [...document.querySelectorAll('.dots span')];
  const feeByRole = { Student: 550, Faculty: 400 };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? 0 : ms));
  let step = 0;
  let busy = false;
  let pending = null;

  /* ---------- Pages ---------- */
  function showStep(next) {
    if (next < 0 || next > 3) return;
    step = next;
    screens.forEach((s, i) => { s.hidden = i !== next; s.classList.toggle('is-active', i === next); });
    dots.forEach((d, i) => d.classList.toggle('active', i === Math.min(next, 2)));
    $('pager').hidden = next === 0 || next === 3;
    $('nextBtn').style.visibility = next >= 2 ? 'hidden' : 'visible';
    window.scrollTo({ top: 0 });
    $('mainContent').focus({ preventScroll: true });
  }
  $('nextBtn').addEventListener('click', () => showStep(step + 1));
  $('backBtn').addEventListener('click', () => showStep(step - 1));
  $('toPayment').addEventListener('click', () => showStep(1));
  $('brandHome').addEventListener('click', (e) => { e.preventDefault(); showStep(0); });
  $('restartButton').addEventListener('click', () => showStep(0));

  /* ---------- Envelope ---------- */
  const envelope = $('envelope');
  const layer = $('inviteLayer');

  if (config.eventTheme) {
    $('themeValue').textContent = config.eventTheme;
    $('themeRow').hidden = false;
  }

  async function openEnvelope() {
    if (busy) return;
    busy = true;
    envelope.classList.remove('is-read');
    envelope.classList.add('is-open');
    await wait(1250); // seal lifts, flap swings open, letter slides out
    layer.hidden = false;
    $('invitationCard').scrollTop = 0;
    $('invitationCard').focus();
    busy = false;
  }
  async function closeEnvelope() {
    if (busy || layer.hidden) return;
    busy = true;
    layer.classList.add('is-closing');
    await wait(330);
    layer.hidden = true;
    layer.classList.remove('is-closing');
    envelope.classList.remove('is-open'); // letter slides back, flap closes, seal returns
    await wait(1100);
    envelope.classList.add('is-read');
    $('envelopeHint').hidden = true;
    $('afterRead').hidden = false;
    $('toPayment').focus();
    busy = false;
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
  function selected(name) { return document.querySelector(`[name="${name}"]:checked`)?.value || ''; }
  function updatePayment() {
    const role = selected('role');
    const attending = selected('attendance') === 'Attending';
    $('affiliationWrap').hidden = !role;
    $('affiliationLabel').innerHTML = role === 'Faculty' ? 'Department / Office <span aria-hidden="true">*</span>' : 'Program / Year / Section <span aria-hidden="true">*</span>';
    $('affiliation').placeholder = role === 'Faculty' ? 'e.g. IT Department' : 'e.g. BSIS 4A';
    $('affiliation').required = Boolean(role);
    $('paymentFields').hidden = !attending || !role;
    $('feeValue').textContent = role ? `₱${feeByRole[role]}` : '₱—';
    const method = selected('paymentMethod');
    const online = attending && (method === 'GCash' || method === 'Bank Transfer');
    $('proofWrap').hidden = !online;
    $('proofImage').required = online && !testMode;
  }
  document.querySelectorAll('[name="role"],[name="attendance"],[name="paymentMethod"]').forEach((i) => i.addEventListener('change', updatePayment));

  const configured = /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(config.sheetWebAppUrl || '');
  const preview = testMode || !configured;
  $('previewRibbon').hidden = !testMode;
  $('connectionStatus').textContent = preview ? 'Test preview: your reply will not be saved yet.' : '';
  $('submitBtn').textContent = preview ? 'Preview my reply' : 'Send my reply';

  function error(message) { $('formError').textContent = message; $('formError').hidden = false; $('formError').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  function clearError() { $('formError').hidden = true; $('formError').textContent = ''; }
  function nonce() {
    const bytes = new Uint8Array(16);
    if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  function imageProof(input) {
    return new Promise((resolve, reject) => {
      const file = input.files[0];
      if (!file) return reject(new Error('Please attach your payment screenshot.'));
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return reject(new Error('Use a JPG, PNG or WebP screenshot.'));
      if (file.size > 2 * 1024 * 1024) return reject(new Error('Screenshot must be 2 MB or smaller.'));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read the screenshot.'));
      reader.onload = () => resolve({ name: file.name.replace(/[^\w.-]/g, '_').slice(0, 80), mime: file.type, base64: String(reader.result).split(',')[1] });
      reader.readAsDataURL(file);
    });
  }

  $('rsvpForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();
    if ($('companyWebsite').value) return;
    const fullName = $('fullName').value.trim().replace(/\s+/g, ' ');
    const role = selected('role');
    const attendance = selected('attendance');
    const affiliation = $('affiliation').value.trim();
    const method = attendance === 'Attending' ? selected('paymentMethod') : 'Not applicable';
    if (fullName.length < 2 || !role || !attendance || !affiliation) return error('Please fill in your name, category, program or department, and attendance.');
    if (attendance === 'Attending' && !method) return error('Please choose how you will pay.');
    if (!$('consent').checked) return error('Please tick the agreement box to continue.');
    const isOnline = method === 'GCash' || method === 'Bank Transfer';
    let proof = null;
    if (isOnline && (!preview || $('proofImage').files.length)) {
      try { proof = await imageProof($('proofImage')); } catch (err) { return error(err.message); }
    }
    const payload = { nonce: nonce(), fullName, role, affiliation, attendance, paymentMethod: method, amount: attendance === 'Attending' ? feeByRole[role] : 0, proof, website: '', clientDate: new Date().toISOString() };
    if (preview) return showAcknowledgment({ ...payload, receiptId: `DEMO-${Date.now().toString(36).toUpperCase()}`, saved: false });
    $('submitBtn').disabled = true;
    $('submitBtn').textContent = 'Sending…';
    pending = { ...payload, timeout: null };
    // Plain form POST into a hidden frame keeps personal data out of URLs.
    const form = document.createElement('form');
    form.method = 'POST'; form.action = config.sheetWebAppUrl; form.target = 'submissionFrame'; form.hidden = true;
    const field = document.createElement('input'); field.type = 'hidden'; field.name = 'payload'; field.value = JSON.stringify(payload); form.append(field);
    document.body.append(form);
    pending.timeout = setTimeout(() => { if (!pending) return; pending = null; resetSubmit(); error('We could not confirm your reply was saved. Please try again or message the SSC.'); }, 25000);
    try { form.submit(); } catch { clearTimeout(pending.timeout); pending = null; resetSubmit(); error('Could not send your reply. Please try again.'); }
    form.remove();
  });
  function resetSubmit() { $('submitBtn').disabled = false; $('submitBtn').textContent = 'Send my reply'; }
  window.addEventListener('message', (event) => {
    if (!pending || !event.data || event.data.type !== 'PANAGHIMAMAT_SUBMISSION') return;
    if (!/^https:\/\/([\w-]+\.)?(script\.google\.com|googleusercontent\.com)$/.test(event.origin)) return;
    if (event.data.nonce !== pending.nonce) return;
    clearTimeout(pending.timeout);
    const saved = pending; pending = null; resetSubmit();
    if (event.data.ok === true && /^[A-Z0-9-]{8,36}$/.test(String(event.data.receiptId || ''))) showAcknowledgment({ ...saved, receiptId: event.data.receiptId, saved: true });
    else error(event.data.message || 'Your reply could not be saved. Please try again.');
  });

  function showAcknowledgment(d) {
    const attending = d.attendance === 'Attending';
    const online = attending && ['GCash', 'Bank Transfer'].includes(d.paymentMethod);
    $('receiptTitle').textContent = !d.saved ? 'Preview only' : online ? 'Payment acknowledgment' : 'RSVP acknowledgment';
    $('receiptTag').textContent = !d.saved ? 'Not saved' : online ? 'Awaiting SSC verification' : 'Reply recorded';
    $('replyBody').textContent = !d.saved
      ? 'This is a test preview. Nothing was saved and no payment was recorded.'
      : attending ? 'We look forward to celebrating with you on October 23.' : 'Thank you for letting us know. You will be missed.';
    const rows = [['Reference', d.receiptId], ['Name', d.fullName], ['Category', d.role], ['Attendance', d.attendance], ['Program / Dept.', d.affiliation]];
    if (attending) rows.push(['Payment', d.paymentMethod === 'Bank Transfer' ? 'GoTyme Bank' : d.paymentMethod], ['Contribution', `₱${d.amount}`], ['Status', online ? 'Pending verification' : 'Cash, to be paid']);
    $('receiptDetails').replaceChildren(...rows.map(([k, v]) => { const w = document.createElement('div'); const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = String(v); w.append(dt, dd); return w; }));
    $('receiptFooter').textContent = !d.saved ? 'Sample only. Not saved or validated.' : 'Event acknowledgment only, not an official receipt. Online payments are checked by the SSC.';
    $('printReceipt').disabled = !d.saved;
    showStep(3);
  }
  $('printReceipt').addEventListener('click', () => window.print());
  showStep(0);
})();
