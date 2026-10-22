const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '../assets/status.js'), 'utf8');
const endpoint = 'https://script.google.com/macros/s/test-only/exec';
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const absent = () => response({ ok: true, found: false, guests: [] });
const flush = () => new Promise((resolve) => setImmediate(resolve));

class Element {
  constructor(tag = 'div') {
    this.tagName = tag;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.value = '';
    this._text = '';
    this.hidden = false;
    this.disabled = false;
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map((n) => typeof n === 'string' ? n : n.textContent).join(''); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this._text = ''; this.children = children; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  focus() { this.focused = true; }
  fire(name) { return this.listeners[name]({ preventDefault() {} }); }
}

function page(fetchReply, { abortController = AbortController, referrer = '' } = {}) {
  let now = 0, nextTimer = 0;
  const timers = new Map(), requests = [];
  const elements = Object.fromEntries(['statusForm', 'guestName', 'statusError', 'emailCheck', 'emailCheckText', 'statusBtn', 'statusResult', 'tabFind', 'tabGuide', 'panelFind', 'panelGuide'].map((id) => [id, new Element()]));
  const back = new Element('a');
  const document = {
    referrer,
    getElementById: (id) => elements[id],
    createElement: (tag) => new Element(tag),
    createTextNode: (text) => ({ textContent: String(text) }),
    querySelector: () => back
  };
  Object.defineProperty(document, 'cookie', { get() { throw Error('Cookies blocked'); } });
  const context = {
    document, window: { PANAGHIMAMAT_CONFIG: { sheetWebAppUrl: endpoint } },
    Date: class extends Date { static now() { return now; } },
    AbortController: abortController,
    fetch(url, options) {
      const request = { url, options, body: JSON.parse(options.body) };
      requests.push(request);
      return fetchReply(request, requests.length);
    },
    setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, time: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  };
  Object.defineProperty(context, 'localStorage', { get() { throw Error('Storage blocked'); } });
  vm.createContext(context);
  vm.runInContext(source, context);
  return {
    elements, requests, timers, back,
    submit(name = 'Test Guest') { elements.guestName.value = name; return elements.statusForm.fire('submit'); },
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const next = [...timers.entries()].filter(([, t]) => t.time <= until).sort((a, b) => a[1].time - b[1].time)[0];
        if (!next) break;
        const [id, timer] = next;
        now = timer.time; timers.delete(id); timer.fn();
      }
      now = until;
    }
  };
}

function find(root, className) {
  if ((root.className || '').split(' ').includes(className)) return root;
  for (const child of root.children || []) { const match = find(child, className); if (match) return match; }
}

test('status lookup makes one direct request with no startup ping or artificial wait', async () => {
  const p = page(absent);
  assert.equal(p.requests.length, 0);
  await p.submit('  Juan   Dela Cruz  ');
  assert.equal(p.requests.length, 1);
  assert.deepEqual(p.requests[0].body, { action: 'helperFind', name: 'Juan Dela Cruz' });
  assert.equal(p.requests[0].url, endpoint);
  assert.equal(p.requests[0].options.credentials, 'omit');
  assert.equal(p.requests[0].options.redirect, 'follow');
  assert.equal(p.requests[0].options.headers['Content-Type'], 'text/plain;charset=utf-8');
  assert.equal(Object.keys(p.requests[0].options.headers).length, 1);
  assert.equal(p.requests[0].options.cache, 'no-store');
  assert.equal(p.requests[0].options.referrerPolicy, 'no-referrer');
  assert.match(p.elements.statusResult.textContent, /couldn’t find this name/);
  assert.equal(p.elements.statusBtn.disabled, false);
  assert.equal(p.timers.size, 0);
});

test('one transient connection failure retries the read and shows the result', async () => {
  const p = page((_, attempt) => attempt === 1 ? Promise.reject(new TypeError('Failed to fetch')) : absent());
  const pending = p.submit();
  await flush();
  assert.equal(p.requests.length, 1);
  assert.equal(p.elements.emailCheckText.textContent, 'Reconnecting…');
  p.advance(250);
  await pending;
  assert.equal(p.requests.length, 2);
  assert.match(p.elements.statusResult.textContent, /couldn’t find this name/);
  assert.equal(p.elements.statusError.hidden, true);
});

test('failed checks do not poison later submissions or cause unlimited retries', async () => {
  let offline = true;
  const p = page(() => offline ? Promise.reject(new TypeError('Network blocked')) : absent());
  const pending = p.submit();
  await flush(); p.advance(250); await pending;
  assert.equal(p.requests.length, 2);
  assert.match(p.elements.statusError.textContent, /Could not connect/);
  assert.equal(p.elements.statusBtn.disabled, false);
  offline = false;
  await p.submit();
  assert.equal(p.requests.length, 3);
  assert.match(p.elements.statusResult.textContent, /couldn’t find this name/);
  assert.equal(p.elements.statusError.hidden, true);
});

for (const abortController of [AbortController, undefined]) {
  test(`slow checks stop and restore the form ${abortController ? 'with' : 'without'} AbortController`, async () => {
    const p = page(() => new Promise(() => {}), { abortController: abortController || null });
    const pending = p.submit();
    await flush();
    p.advance(5000);
    assert.equal(p.elements.emailCheckText.textContent, 'Still checking…');
    p.advance(25000);
    await pending;
    assert.equal(p.requests.length, 1);
    assert.match(p.elements.statusError.textContent, /took too long/);
    assert.equal(p.elements.statusBtn.disabled, false);
    assert.equal(p.elements.guestName.readOnly, false);
    assert.equal(p.elements.statusForm.attributes['aria-busy'], 'false');
    assert.equal(p.timers.size, 0);
  });
}

test('both lookup attempts share one time limit', async () => {
  let rejectFirst;
  const p = page((_, attempt) => attempt === 1 ? new Promise((_, reject) => { rejectFirst = reject; }) : new Promise(() => {}));
  const pending = p.submit();
  p.advance(20000); rejectFirst(new TypeError('Connection reset')); await flush();
  p.advance(250); await flush();
  assert.equal(p.requests.length, 2);
  p.advance(9750); await pending;
  assert.match(p.elements.statusError.textContent, /took too long/);
  assert.equal(p.elements.statusBtn.disabled, false);
});

test('a late response after a timeout cannot overwrite a newer lookup', async () => {
  let finishOld;
  const p = page((_, attempt) => attempt === 1 ? new Promise((resolve) => { finishOld = resolve; }) : absent(), { abortController: null });
  const old = p.submit(); p.advance(30000); await old;
  await p.submit('New Guest');
  finishOld(response({ ok: true, found: true, guests: [{ group: 'faculty', stage: 'verified', name: 'Old result' }] }));
  await flush();
  assert.match(p.elements.statusResult.textContent, /couldn’t find this name/);
  assert.equal(p.elements.statusResult.textContent.includes('Old result'), false);
});

test('one-word names and duplicate submits do not send extra requests', async () => {
  let resolve;
  const p = page(() => new Promise((r) => { resolve = r; }));
  await p.submit('Juan');
  assert.equal(p.requests.length, 0);
  assert.equal(p.elements.guestName.focused, true);
  const pending = p.submit();
  await p.submit();
  assert.equal(p.requests.length, 1);
  assert.equal(p.elements.guestName.readOnly, true);
  resolve(absent()); await pending;
  assert.equal(p.elements.statusBtn.disabled, false);
});

test('a backend validation message is shown without retrying it', async () => {
  const p = page(() => response({ ok: false, message: 'Please check your email.' }));
  await p.submit();
  assert.equal(p.requests.length, 1);
  assert.equal(p.elements.statusError.textContent, 'Please check your email.');
});

for (const broken of [
  () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('HTML instead of JSON'); } }),
  () => response({ ok: true, receiptId: 'not-a-helper-result' }),
  () => response({ ok: true, found: true, guests: [{ group: 'faculty', stage: 'unknown' }] })
]) {
  test('unexpected responses are retried once and never shown as a missing guest record', async () => {
    const p = page(broken);
    const pending = p.submit();
    await flush(); p.advance(250); await pending;
    assert.equal(p.requests.length, 2);
    assert.match(p.elements.statusError.textContent, /could not read your reply/);
    assert.equal(p.elements.statusResult.children.length, 0);
  });
}

test('temporary server errors retry, while access errors remain visible', async () => {
  const p = page((_, attempt) => attempt === 1 ? response({}, 503) : absent());
  const pending = p.submit(); await flush(); p.advance(250); await pending;
  assert.equal(p.requests.length, 2);
  assert.match(p.elements.statusResult.textContent, /couldn’t find this name/);
  const denied = page(() => response({}, 403));
  await denied.submit();
  assert.equal(denied.requests.length, 1);
  assert.match(denied.elements.statusError.textContent, /Could not connect/);
});

for (const group of ['student', 'faculty']) {
  for (const stage of ['declined', 'verified', 'checking', 'unpaid']) {
    test(`${group}: ${stage} status still renders with browser storage blocked`, async () => {
      const p = page(() => response({ ok: true, found: true, guests: [{ group, stage, name: 'Test Guest', email: 'te****@x.com', section: group === 'student' ? 'BSIS 4A' : '', repliedOn: 'Oct 16', method: 'GCash', ticketSent: '', checkedIn: false }] }));
      await p.submit();
      const text = p.elements.statusResult.textContent;
      assert.match(text, /Test Guest/);
      assert.equal(p.elements.statusError.hidden, true);
      if (stage === 'verified') assert.match(text, new RegExp(group === 'faculty' ? '₱400' : '₱550'));
      if (stage === 'declined') assert.match(text, /Not attending/);
      if (stage === 'checking') assert.match(text, /Payment being checked/);
      if (stage === 'unpaid') assert.match(text, /Waiting for your cash payment/);
    });
  }
}

test('ticket resending remains an explicit, single request after a successful lookup', async () => {
  const p = page((request) => request.body.action === 'helperFind'
    ? response({ ok: true, found: true, guests: [{ group: 'faculty', stage: 'verified', name: 'Test Guest', email: 'te****@x.com', repliedOn: 'Oct 16', ticketSent: 'Oct 16', checkedIn: false }] })
    : Promise.reject(new TypeError('Response lost')));
  await p.submit();
  const button = find(p.elements.statusResult, 'gh-again');
  assert.ok(button);
  await button.fire('click');
  assert.equal(p.requests.length, 2);
  assert.deepEqual(p.requests[1].body, { action: 'helperSend', name: 'Test Guest', group: 'faculty', email: '' });
  assert.equal(button.disabled, false);
  assert.match(p.elements.statusResult.textContent, /No connection/);
  assert.equal(p.timers.size, 0);
});

test('faculty guests keep their faculty invitation link', () => {
  const p = page(absent, { referrer: 'https://islawqt.github.io/panaghimamat-2026/faculty/' });
  assert.equal(p.back.attributes.href, 'faculty/');
});
