/* Status page (/status/): a guest types the email from their reply and sees
 * reply received → payment verified → QR ticket sent. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const API = (window.PANAGHIMAMAT_CONFIG || {}).sheetWebAppUrl || '';
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const REQUEST_LIMIT = 30000;
  let checking = false, slowTimer = 0;

  function requestError(kind, retryable = true) {
    const error = new Error(kind);
    error.kind = kind;
    error.retryable = retryable;
    return error;
  }
  async function call(body, ms = REQUEST_LIMIT) {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    let timer;
    try {
      return await Promise.race([
        (async () => {
          const res = await fetch(API, {
            method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(body), ...(ctrl ? { signal: ctrl.signal } : {}),
            credentials: 'omit', redirect: 'follow', cache: 'no-store', referrerPolicy: 'no-referrer'
          });
          if (!res.ok) throw requestError('network', res.status === 408 || res.status === 429 || res.status >= 500);
          let data;
          try { data = await res.json(); } catch { throw requestError('response'); }
          if (!data || typeof data.ok !== 'boolean') throw requestError('response');
          return data;
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            reject(requestError('timeout', false));
            if (ctrl) ctrl.abort();
          }, ms);
        })
      ]);
    } finally { clearTimeout(timer); }
  }

  // The deployed API supports status. Go straight to the lookup and retry only this read.
  // One deadline covers both attempts; resending a ticket is never retried automatically.
  async function checkStatus(email) {
    const deadline = Date.now() + REQUEST_LIMIT;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const data = await call({ action: 'status', email }, Math.max(1, deadline - Date.now()));
        if (data.ok && (typeof data.found !== 'boolean' || !Array.isArray(data.replies) ||
          data.found !== (data.replies.length > 0) || data.replies.some((r) => !r ||
            !['student', 'faculty'].includes(r.group) || !['declined', 'verified', 'checking', 'unpaid'].includes(r.stage)))) {
          throw requestError('response');
        }
        return data;
      } catch (error) {
        if (attempt || error.retryable === false || deadline - Date.now() < 1000) throw error;
        $('emailCheckText').textContent = 'Reconnecting…';
        await pause(250);
      }
    }
  }

  const err = (m) => { $('statusError').textContent = m; $('statusError').hidden = !m; };
  function busy(on) {
    checking = on;
    clearTimeout(slowTimer);
    $('statusForm').setAttribute('aria-busy', String(on));
    $('statusEmail').readOnly = on;
    $('emailCheck').dataset.state = on ? 'checking' : '';
    $('emailCheckText').textContent = on ? 'Checking…' : '';
    $('statusBtn').disabled = on;
    $('statusBtn').textContent = on ? 'Checking…' : 'Check status';
    if (on) slowTimer = setTimeout(() => { $('emailCheckText').textContent = 'Still checking…'; }, 5000);
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
    if (checking) return;
    err('');
    const email = $('statusEmail').value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { $('statusEmail').focus(); return err('Please type the email you used in your reply, e.g. name@gmail.com.'); }
    busy(true);
    $('statusResult').replaceChildren();
    try {
      const d = await checkStatus(email);
      if (!d.ok) return err(d.message || 'Could not check your status. Please try again.');
      if (!d.found) {
        const c = el('div', 'paper paper-card st-card');
        c.append(el('p', 'st-who', 'No reply uses this email.'), el('p', 'st-note', 'Check the spelling. If you replied without an email, open the invitation, type your name, and add your email there.'));
        return $('statusResult').replaceChildren(c);
      }
      $('statusResult').replaceChildren(...d.replies.map((r) => card(r, email)));
    } catch (error) {
      err(error.kind === 'timeout'
        ? 'The check took too long. Please try again in a moment.'
        : error.kind === 'response'
          ? 'We could not read your status. Please refresh this page and try again.'
          : 'Could not connect. Please try again. If it keeps happening, try your regular browser or another connection.');
    } finally {
      busy(false);
    }
  });
})();
// Faculty guests go back to the faculty invitation.
if (/\/faculty\/?$/.test(document.referrer.split(/[?#]/)[0])) document.querySelector('.status-back a').setAttribute('href', 'faculty/');
