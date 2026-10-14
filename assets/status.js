/* Status page (/status/): a guest types the email from their reply and sees
 * reply received → payment verified → QR ticket sent. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const API = (window.PANAGHIMAMAT_CONFIG || {}).sheetWebAppUrl || '';
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  let ready = null;

  async function call(body, ms = 20000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), signal: ctrl.signal, credentials: 'omit' });
      return await res.json();
    } finally { clearTimeout(t); }
  }
  // Status checks exist only on the updated Google script; older versions would treat the request as a reply.
  function backendReady() {
    ready ||= fetch(`${API}?action=ping`, { credentials: 'omit' }).then((r) => r.json()).then((d) => /status/.test(String(d && d.version || ''))).catch(() => false);
    return ready;
  }
  backendReady();

  const err = (m) => { $('statusError').textContent = m; $('statusError').hidden = !m; };
  function busy(on) {
    $('emailCheck').dataset.state = on ? 'checking' : '';
    $('emailCheckText').textContent = on ? 'Checking…' : '';
    $('statusBtn').disabled = on;
    $('statusBtn').textContent = on ? 'Checking…' : 'Check status';
  }
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  function step(state, title, detail) {
    const li = el('li', 'st-step ' + state);
    li.append(el('span', 'st-dot', state === 'done' ? '✓' : state === 'wait' ? '…' : state === 'stop' ? '✕' : ''));
    const body = el('div', 'st-body');
    body.append(el('strong', '', title));
    if (detail) { const p = el('p', ''); p.append(...[].concat(detail)); body.append(p); }
    li.append(body);
    return li;
  }

  function card(r, email) {
    const c = el('article', 'paper paper-card st-card');
    const who = el('p', 'st-who');
    who.append(el('strong', '', r.name), document.createTextNode(r.group === 'faculty' ? ' · Faculty' : r.section ? ' · ' + r.section : ''));
    c.append(who);
    const list = el('ol', 'st-steps');
    list.append(step('done', 'Reply received', r.repliedOn));
    if (r.stage === 'declined') {
      list.append(step('stop', 'Not attending', 'Your reply says you can’t attend, so there is no payment or ticket.'));
    } else {
      const pay = {
        verified: ['done', 'Payment verified', `The SSC confirmed your ₱${r.group === 'faculty' ? 400 : 550} contribution.`],
        checking: ['wait', 'Payment being checked', `Your ${r.method} screenshot is with the SSC. This usually takes a day.`],
        unpaid: ['wait', 'Waiting for your cash payment', 'Pay the Treasurer, Ms. Jhodel Aranas, or the President, Ms. Anthony Sedoro. Already paid? They mark it in the records soon after. If it has been more than a day, message them.']
      }[r.stage];
      list.append(step(...pay));
      if (r.stage === 'verified') {
        const sent = r.ticketSent ? [`Emailed ${r.ticketSent} to `, el('b', '', email), '. Check Spam too.'] : ['Your ticket is being prepared. It arrives within 5 minutes.'];
        list.append(step(r.ticketSent ? 'done' : 'wait', 'QR ticket sent', sent));
        if (r.checkedIn) list.append(step('done', 'Checked in', 'Enjoy the celebration!'));
      } else {
        list.append(step('next', 'QR ticket', 'Emailed to you automatically once your payment is verified.'));
      }
    }
    c.append(list);
    if (r.stage === 'verified' && r.ticketSent && !r.checkedIn) {
      const btn = el('button', 'ghost-btn full st-resend', 'Send my ticket again');
      btn.type = 'button';
      const note = el('p', 'st-note');
      btn.addEventListener('click', async () => {
        btn.disabled = true; btn.textContent = 'Sending…';
        try {
          const d = await call({ action: 'resend', email });
          note.textContent = d.ok ? `Sent again to ${email}. Check Inbox and Spam.` : (d.message || 'Could not send. Please try again.');
          if (d.ok) btn.hidden = true;
        } catch { note.textContent = 'No connection. Please try again.'; }
        finally { btn.disabled = false; btn.textContent = 'Send my ticket again'; }
      });
      c.append(btn, note);
    }
    return c;
  }

  $('statusForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    err('');
    const email = $('statusEmail').value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { $('statusEmail').focus(); return err('Please type the email you used in your reply, e.g. name@gmail.com.'); }
    busy(true);
    $('statusResult').replaceChildren();
    try {
      if (!(await backendReady())) return err('Status checks open soon. Please try again later.');
      const [d] = await Promise.all([call({ action: 'status', email }), pause(900)]);
      if (!d.ok) return err(d.message || 'Could not check your status. Please try again.');
      if (!d.found) {
        const c = el('div', 'paper paper-card st-card');
        c.append(el('p', 'st-who', 'No reply uses this email.'), el('p', 'st-note', 'Check the spelling. If you replied without an email, open the invitation, type your name, and add your email there.'));
        return $('statusResult').replaceChildren(c);
      }
      $('statusResult').replaceChildren(...d.replies.map((r) => card(r, email)));
    } catch {
      err('No connection. Please check your signal and try again.');
    } finally {
      busy(false);
    }
  });
})();
// Faculty guests go back to the faculty invitation.
if (/\/faculty\/?$/.test(document.referrer.split(/[?#]/)[0])) document.querySelector('.status-back a').setAttribute('href', 'faculty/');
