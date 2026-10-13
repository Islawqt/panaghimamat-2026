(() => {
  'use strict';
  const config = window.PANAGHIMAMAT_CONFIG || {};
  const testMode = config.testMode === true;
  const $ = (id) => document.getElementById(id);
  const screens = [...document.querySelectorAll('.step')];
  const dots = [...document.querySelectorAll('.step-dots span')];
  const roleInputs = [...document.querySelectorAll('[name="role"]')];
  const attendanceInputs = [...document.querySelectorAll('[name="attendance"]')];
  const methodInputs = [...document.querySelectorAll('[name="paymentMethod"]')];
  let step = 0;
  let pending = null;
  const feeByRole = { Student: 550, Faculty: 400 };

  function selected(name) { return document.querySelector(`[name="${name}"]:checked`)?.value || ''; }
  function showStep(next) {
    if (next < 0 || next > 4) return;
    step = next;
    screens.forEach((screen, index) => {
      screen.hidden = index !== next;
      screen.classList.toggle('is-active', index === next);
    });
    dots.forEach((dot, index) => {
      dot.classList.toggle('active', index === Math.min(next, 3));
      dot.classList.toggle('done', index < next);
    });
    $('pager').hidden = next === 4;
    $('backBtn').hidden = next === 0;
    $('nextBtn').hidden = next === 0 || next >= 3;
    document.querySelector('.app-shell').scrollIntoView({ behavior: 'instant' });
    $('mainContent').focus({ preventScroll: true });
    if (next === 3) $('fullName').focus({ preventScroll: true });
  }
  $('openInvitation').addEventListener('click', () => showStep(1));
  $('nextBtn').addEventListener('click', () => showStep(step + 1));
  $('backBtn').addEventListener('click', () => showStep(step - 1));
  $('brandHome').addEventListener('click', (event) => {event.preventDefault();showStep(0)});
  $('restartButton').addEventListener('click', () => showStep(0));
  document.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.target?.matches('input,textarea,select')) return;
    if (event.key === 'ArrowLeft' && step >= 1 && step <= 3) showStep(step - 1);
    if (event.key === 'ArrowRight' && step >= 1 && step <= 2) showStep(step + 1);
  });

  function updatePayment() {
    const role = selected('role');
    const attending = selected('attendance') === 'Attending';
    $('affiliationWrap').hidden = !role;
    $('affiliationLabel').innerHTML = role === 'Faculty' ? 'Department / Office <span aria-hidden="true">*</span>' : 'Program / Year / Section <span aria-hidden="true">*</span>';
    $('affiliation').placeholder = role === 'Faculty' ? 'e.g. IT Department' : 'e.g. BSIT 4A';
    $('affiliation').required = Boolean(role);
    $('paymentFields').hidden = !attending || !role;
    $('feeValue').textContent = role ? `₱${feeByRole[role].toLocaleString('en-PH')}` : '₱—';
    const method = selected('paymentMethod');
    const online = attending && (method === 'GCash' || method === 'Bank Transfer');
    $('onlineDetail').hidden = !online;
    $('transactionRef').required = online && !testMode;
    $('proofImage').required = online && !testMode;
    if (online) {
      const account = method === 'GCash' ? config.gcash : config.bank;
      const info = $('onlineInstructions');
      info.replaceChildren();
      const heading = document.createElement('strong');
      heading.textContent = `${method} · ₱${feeByRole[role]}`;
      info.append(heading);
      if (method === 'GCash' && account?.displayName) addInfo(info, `Recipient: ${account.displayName}`);
      if (method === 'Bank Transfer') {
        if (account?.bankName) addInfo(info, `Bank: ${account.bankName}`);
        if (account?.accountName) addInfo(info, `Account name: ${account.accountName}`);
      }
      if (account?.maskedNumber) addInfo(info, `Account: ${account.maskedNumber}`);
      if (account?.qrImage) {
        if (testMode) {
          const caution = document.createElement('p');
          caution.className = 'qr-test-warning';
          caution.textContent = 'TEST PREVIEW — REAL QR CODE — DO NOT MAKE A TRANSFER';
          info.append(caution);
        }
        const img = document.createElement('img');
        img.src = account.qrImage;
        img.alt = testMode ? `${method} real QR image, displayed for testing only — DO NOT SEND MONEY` : `${method} payment QR code`;
        info.append(img);
      }
      addInfo(info, testMode
        ? 'DEMO ONLY — These original QR codes are scannable. Do not send money. You can use a fake reference and sample screenshot to test the form.'
        : 'Save your transfer screenshot. Your acknowledgment remains pending until verified.');
    }
  }
  function addInfo(parent, message){const paragraph=document.createElement('p');paragraph.textContent=message;parent.append(paragraph);}
  roleInputs.forEach(input => input.addEventListener('change', updatePayment));
  attendanceInputs.forEach(input => input.addEventListener('change', updatePayment));
  methodInputs.forEach(input => input.addEventListener('change', updatePayment));

  function usableAccount(name) {
    const obj = config[name] || {};
    if (testMode) return Boolean(obj.qrImage);
    return Boolean(config.onlinePaymentsEnabled && obj.qrImage && !obj.qrImage.includes('placeholder') && (name === 'gcash' ? obj.displayName : (obj.bankName && obj.accountName)) && obj.maskedNumber);
  }
  $('gcashOption').querySelector('input').disabled = !usableAccount('gcash');
  $('bankOption').querySelector('input').disabled = !usableAccount('bank');
  if (usableAccount('gcash')) $('gcashAvailability').textContent = testMode ? 'Try demo (no transfer)' : 'Transfer & upload proof';
  if (usableAccount('bank')) $('bankAvailability').textContent = testMode ? 'Try demo (no transfer)' : 'Transfer & upload proof';
  $('previewRibbon').hidden = !testMode;
  const configured = /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(config.sheetWebAppUrl || '');
  const preview = testMode || !configured;
  $('connectionStatus').textContent = preview
    ? 'TEST MODE — Nothing entered here is submitted, charged, or stored in Google Sheets.'
    : 'Responses will be sent to the private SSC Google Sheet.';
  $('submitBtn').textContent = preview ? 'Preview acknowledgment (no submission)' : 'Send my response ↗';

  function error(message) {
    $('formError').textContent = message;
    $('formError').hidden = false;
    $('formError').scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  function clearError(){ $('formError').hidden = true; $('formError').textContent = ''; }
  function nonce() {
    const bytes = new Uint8Array(16);
    if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    return [...bytes].map(b => b.toString(16).padStart(2,'0')).join('');
  }
  function imageProof(input) {
    return new Promise((resolve, reject) => {
      const file = input.files[0];
      if (!file) return reject(new Error('Please select a payment screenshot.'));
      if (!['image/jpeg','image/png','image/webp'].includes(file.type)) return reject(new Error('Use JPG, PNG or WebP for the payment screenshot.'));
      if (file.size > 2 * 1024 * 1024) return reject(new Error('Payment screenshot must be 2 MB or smaller.'));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read the payment screenshot.'));
      reader.onload = () => resolve({ name:file.name.replace(/[^\w.-]/g,'_').slice(0,80), mime:file.type, base64:String(reader.result).split(',')[1] });
      reader.readAsDataURL(file);
    });
  }
  $('rsvpForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();
    if ($('companyWebsite').value) return;
    const fullName = $('fullName').value.trim().replace(/\s+/g,' ');
    const role = selected('role');
    const attendance = selected('attendance');
    const affiliation = $('affiliation').value.trim();
    const method = attendance === 'Attending' ? selected('paymentMethod') : 'Not applicable';
    if (fullName.length < 2 || !role || !attendance || !affiliation) return error('Please complete your name, category, affiliation, and attendance response.');
    if (attendance === 'Attending' && !method) return error('Please select a payment method.');
    if ((method === 'GCash' && !usableAccount('gcash')) || (method === 'Bank Transfer' && !usableAccount('bank'))) return error('This online payment option is not available yet.');
    if (!$('consent').checked) return error('Please acknowledge the information notice to continue.');
    const isOnline = method === 'GCash' || method === 'Bank Transfer';
    if (isOnline && !preview && !$('transactionRef').value.trim()) return error('Enter your payment transaction reference.');
    let proof = null;
    if (isOnline && (!preview || $('proofImage').files.length)) {
      try { proof = await imageProof($('proofImage')); } catch (err) { return error(err.message); }
    }
    const payload = { nonce:nonce(), fullName,role,affiliation,attendance,paymentMethod:method,amount:attendance==='Attending'?feeByRole[role]:0,transactionRef:isOnline?$('transactionRef').value.trim():'',proof,website:'',clientDate:new Date().toISOString() };
    if (preview) return showAcknowledgment({...payload,receiptId:`DEMO-${Date.now().toString(36).toUpperCase()}`,saved:false});
    $('submitBtn').disabled = true;
    $('submitBtn').textContent = 'Submitting…';
    pending = {...payload,timeout:null};
    // Standard HTML form POST into a hidden frame avoids putting PII in query strings.
    // Apps Script replies with a signed-back nonce via postMessage; only then show "saved".
    const form = document.createElement('form');
    form.method='POST'; form.action=config.sheetWebAppUrl; form.target='submissionFrame';form.hidden=true;
    const field=document.createElement('input');field.type='hidden';field.name='payload';field.value=JSON.stringify(payload);form.append(field);
    document.body.append(form);
    pending.timeout=setTimeout(() => {if(!pending)return;pending=null;resetSubmit();error('We could not confirm that Google Sheets saved your response. Please try again or contact the SSC.');},25000);
    try { form.submit(); } catch {clearTimeout(pending.timeout);pending=null;resetSubmit();error('Could not contact the response form. Please try again.');}
    form.remove();
  });
  function resetSubmit(){ $('submitBtn').disabled=false; $('submitBtn').textContent='Send my response ↗'; }
  window.addEventListener('message', (event) => {
    if (!pending || !event.data || event.data.type!=='PANAGHIMAMAT_SUBMISSION') return;
    if (!(/^https:\/\/script\.google\.com$/.test(event.origin) || /^https:\/\/script\.googleusercontent\.com$/.test(event.origin) || /^https:\/\/[\w-]+\.googleusercontent\.com$/.test(event.origin))) return;
    if (event.data.nonce!==pending.nonce) return;
    clearTimeout(pending.timeout);
    const savedData=pending;pending=null;resetSubmit();
    if (event.data.ok === true && /^[A-Z0-9-]{8,36}$/.test(String(event.data.receiptId||''))) {
      showAcknowledgment({...savedData,receiptId:event.data.receiptId,saved:true});
    } else error(event.data.message || 'The response could not be saved. Please try again.');
  });

  function showAcknowledgment(d){
    const attending=d.attendance==='Attending';
    const pendingPayment=attending && ['GCash','Bank Transfer'].includes(d.paymentMethod);
    const title = !d.saved ? 'PREVIEW — NOT SUBMITTED' : pendingPayment ? 'PROVISIONAL PAYMENT ACKNOWLEDGMENT' : 'RSVP ACKNOWLEDGMENT';
    $('receiptTitle').textContent=title;
    $('receiptTag').textContent=!d.saved ? 'Demo only · Not saved' : pendingPayment ? 'Awaiting manual payment verification' : 'Response recorded';
    $('replyKicker').textContent=d.saved ? 'A RESPONSE RECEIVED' : 'A PREVIEW OF YOUR REPLY';
    $('replyHeading').innerHTML = d.saved ? 'Your response is <em>received.</em>' : 'A glimpse of <em>what’s next.</em>';
    $('replyBody').textContent = !d.saved ? 'This is a test preview. Nothing was saved, no payment was made, and this acknowledgment is not valid for the event.' : attending ? 'We look forward to celebrating together. Please keep this acknowledgment for your reference.' : 'Thank you for letting us know. Your reply helps us plan the celebration.';
    const details=[['Reference',d.receiptId],['Name',d.fullName],['Category',d.role],['Attendance',d.attendance],['Affiliation',d.affiliation],['Payment method',d.paymentMethod]];
    if(attending)details.push(['Contribution',`₱${d.amount}`]);
    if(pendingPayment)details.push(['Payment status','Pending verification']);
    else if(attending)details.push(['Payment status','Cash — unpaid / pending']);
    if(d.transactionRef)details.push(['Transfer reference',d.transactionRef]);
    $('receiptDetails').replaceChildren();
    details.forEach(([label,value])=>{const wrap=document.createElement('div');const dt=document.createElement('dt');dt.textContent=label;const dd=document.createElement('dd');dd.textContent=String(value);wrap.append(dt,dd);$('receiptDetails').append(wrap)});
    $('receiptFooter').textContent=!d.saved ? 'SAMPLE ONLY · Not saved or validated.' : 'SSC event acknowledgment only · NOT an official proof or receipt of payment. Transfers require manual verification.';
    $('printReceipt').disabled=!d.saved;
    $('printReceipt').textContent=d.saved?'Print / Save acknowledgment ↗':'Printing available after live submission';
    showStep(4);
  }
  $('printReceipt').addEventListener('click',()=>window.print());
  showStep(0);
})();
