/* Guest helper (/status/): a guest types their name, sees where their reply is,
 * and can get their QR ticket again. A new email waits for an SSC officer's approval.
 * The "Not getting it?" tab lists the common reasons with a Spam guide. */
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

  // Looking up is safe to retry once. Sending is never retried automatically.
  async function find(name) {
    const deadline = Date.now() + REQUEST_LIMIT;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const data = await call({ action: 'helperFind', name }, Math.max(1, deadline - Date.now()));
        if (data.ok && (!Array.isArray(data.guests) || data.guests.some((g) => !g ||
          !['student', 'faculty'].includes(g.group) || !['declined', 'verified', 'checking', 'unpaid'].includes(g.stage)))) {
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

  /* Tabs */
  const tabs = [['tabFind', 'panelFind'], ['tabGuide', 'panelGuide']];
  function showTab(id) {
    tabs.forEach(([t, p]) => { $(t).setAttribute('aria-selected', String(t === id)); $(p).hidden = t !== id; });
  }
  tabs.forEach(([t]) => $(t).addEventListener('click', () => showTab(t)));
  const openGuide = () => { showTab('tabGuide'); $('tabGuide').scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  const err = (m) => { $('statusError').textContent = m; $('statusError').hidden = !m; };
  function busy(on) {
    checking = on;
    clearTimeout(slowTimer);
    $('statusForm').setAttribute('aria-busy', String(on));
    $('guestName').readOnly = on;
    $('emailCheck').dataset.state = on ? 'checking' : '';
    $('emailCheckText').textContent = on ? 'Checking…' : '';
    $('statusBtn').disabled = on;
    $('statusBtn').textContent = on ? 'Finding…' : 'Find me';
    if (on) slowTimer = setTimeout(() => { $('emailCheckText').textContent = 'Still checking…'; }, 5000);
  }
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const linkBtn = (text, fn) => { const b = el('button', 'gh-link', text); b.type = 'button'; b.addEventListener('click', fn); return b; };

  function step(state, title, detail) {
    const li = el('li', 'st-step ' + state);
    li.append(el('span', 'st-dot', state === 'done' ? '✓' : state === 'wait' ? '…' : state === 'stop' ? '✕' : ''));
    const body = el('div', 'st-body');
    body.append(el('strong', '', title));
    if (detail) { const p = el('p', ''); p.append(...[].concat(detail)); body.append(p); }
    li.append(body);
    return li;
  }

  function card(g, name) {
    const c = el('article', 'paper paper-card st-card');
    const who = el('p', 'st-who');
    who.append(el('strong', '', g.name), document.createTextNode(g.group === 'faculty' ? ' · Faculty' : g.section ? ' · ' + g.section : ''));
    c.append(who);
    const list = el('ol', 'st-steps');
    list.append(step('done', 'Reply received', g.repliedOn));
    if (g.stage === 'declined') {
      list.append(step('stop', 'Not attending', 'Your reply says you can’t attend, so there is no payment or ticket.'));
      c.append(list);
      return c;
    }
    const pay = {
      verified: ['done', 'Payment verified', `The SSC confirmed your ₱${g.group === 'faculty' ? 400 : 550} contribution.`],
      checking: ['wait', 'Payment being checked', `Your ${g.method} screenshot is with the SSC. This usually takes a day.`],
      unpaid: ['wait', 'Waiting for your cash payment', 'Pay the Treasurer, Ms. Jhodel Aranas, or the President, Ms. Anthony Sedoro. Already paid? It is marked in the records soon after.']
    }[g.stage];
    list.append(step(...pay));
    if (g.stage === 'verified') {
      const sent = g.ticketSent
        ? [`Emailed ${g.ticketSent} to `, el('b', '', g.email || 'your email'), '.']
        : g.sendFailed ? ['We could not send it. Your email may have a typo. Use a different email below.']
        : g.email ? ['Your ticket is being prepared. It arrives within 5 minutes.'] : ['Add your email below to get your ticket.'];
      list.append(step(g.ticketSent ? 'done' : 'wait', 'QR ticket sent', sent));
      if (g.checkedIn) list.append(step('done', 'Checked in', 'Enjoy the celebration!'));
    } else {
      list.append(step('next', 'QR ticket', 'Emailed to you automatically once your payment is verified.'));
    }
    c.append(list);
    if (g.checkedIn) return c;

    const box = el('div', 'gh-actions');
    const note = el('p', 'st-note');
    note.setAttribute('role', 'status');
    if (g.pending) note.textContent = `Your new email ${g.pending} is waiting for an SSC officer’s OK. Once approved, your ticket is sent there right away.`;

    // Same email or a new one. Typing the email on file sends again; a different one asks for approval.
    const form = el('form', 'gh-email');
    form.noValidate = true;
    form.hidden = !!g.email;
    const label = el('label', 'sr-only', 'Email for your QR ticket');
    const input = el('input');
    Object.assign(input, { type: 'email', id: 'ghEmail-' + g.group, maxLength: 120, autocomplete: 'email', placeholder: 'e.g. name@gmail.com' });
    input.inputMode = 'email';
    label.htmlFor = input.id;
    const go = el('button', 'primary-btn', g.email ? 'Send to this email' : 'Save my email');
    go.type = 'submit';
    const help = el('small', 'field-help', g.email
      ? 'Same email as before: we send it again now. A new email: an SSC officer checks it first, then sends your ticket.'
      : 'Your ticket is sent here once your payment is verified.');
    form.append(label, input, go, help);

    const again = el('button', 'primary-btn full gh-again', `Send again to ${g.email}`);
    again.type = 'button';
    again.hidden = !g.email || g.stage !== 'verified';
    const other = linkBtn('Use a different email', () => { form.hidden = false; other.hidden = true; input.focus(); });
    other.hidden = !g.email;

    async function send(email) {
      const btns = [again, go];
      btns.forEach((b) => { b.disabled = true; });
      const label0 = again.textContent, label1 = go.textContent;
      (email ? go : again).textContent = 'Sending…';
      note.textContent = '';
      try {
        const d = await call({ action: 'helperSend', name, group: g.group, email: email || '' });
        if (!d.ok) { note.textContent = d.message || 'Could not send. Please try again.'; return; }
        if (d.sent) {
          note.replaceChildren(`Sent to ${d.email}. Check Inbox, Spam and Promotions. It can take a few minutes. `, linkBtn('Not getting it?', openGuide));
          again.hidden = true;
        } else if (d.pending) {
          note.textContent = `Got it. Your new email ${d.email} needs an SSC officer’s OK first. Once approved, your ticket is sent there right away. You can check back here.`;
          form.hidden = true;
        } else if (d.saved) {
          note.textContent = `Saved ${d.email}. Your ticket is sent there once your payment is verified.`;
          form.hidden = true;
        }
      } catch {
        note.textContent = 'No connection. Please try again.';
      } finally {
        btns.forEach((b) => { b.disabled = false; });
        again.textContent = label0; go.textContent = label1;
      }
    }
    again.addEventListener('click', () => send(''));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = input.value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { input.focus(); note.textContent = 'Please type a valid email, e.g. name@gmail.com.'; return; }
      send(email);
    });

    if (g.email) {
      const line = el('p', 'gh-email-line', 'Your ticket email: ');
      line.append(el('b', '', g.email));
      box.append(line, again, other);
    }
    box.append(form, note);
    c.append(box);
    return c;
  }

  $('statusForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (checking) return;
    err('');
    const name = $('guestName').value.trim().replace(/\s+/g, ' ');
    if (name.split(' ').length < 2) { $('guestName').focus(); return err('Please type your full name (first and last name).'); }
    busy(true);
    $('statusResult').replaceChildren();
    try {
      const d = await find(name);
      if (!d.ok) return err(d.message || 'Could not find your reply. Please try again.');
      if (!d.found) {
        const c = el('div', 'paper paper-card st-card');
        c.append(el('p', 'st-who', 'We couldn’t find this name.'),
          el('p', 'st-note', 'Check the spelling, or type it the way you wrote it in your reply. Haven’t replied yet? Go back to the invitation.'));
        return $('statusResult').replaceChildren(c);
      }
      $('statusResult').replaceChildren(...d.guests.map((g) => card(g, name)));
    } catch (error) {
      err(error.kind === 'timeout'
        ? 'The check took too long. Please try again in a moment.'
        : error.kind === 'response'
          ? 'We could not read your reply. Please refresh this page and try again.'
          : 'Could not connect. Please try again. If it keeps happening, try your regular browser or another connection.');
    } finally {
      busy(false);
    }
  });
})();
// Faculty guests go back to the faculty invitation.
if (/\/faculty\/?$/.test(document.referrer.split(/[?#]/)[0])) document.querySelector('.status-back a').setAttribute('href', 'faculty/');
