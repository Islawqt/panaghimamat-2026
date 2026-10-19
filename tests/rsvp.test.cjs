const { test: runTest } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

// Keep backend source out of the public repo. Supply a private copy to run these tests.
const backendDir = process.env.PANAGHIMAMAT_BACKEND_DIR || join(__dirname, '../private/google-apps-script');
const backendAvailable = ['Code.gs', 'QR.gs'].every((name) => existsSync(join(backendDir, name)));
if (process.env.PANAGHIMAMAT_BACKEND_DIR && !backendAvailable) {
  throw new Error('PANAGHIMAMAT_BACKEND_DIR must contain Code.gs and QR.gs.');
}
const test = (name, fn) => runTest(name, {
  skip: backendAvailable ? false : 'Private Apps Script source not supplied; set PANAGHIMAMAT_BACKEND_DIR to run.'
}, fn);

// In-memory Google service doubles: never contact the production sheet or Drive.
function backend({ legacy = false } = {}) {
  let locked = false, uploads = 0, failAfterAppend = false, flushes = 0, quota = 100;
  const mails = [], triggers = [];
  const cache = new Map();
  function sheet(student, rowsIn) {
    const headers = ['Date', 'Name', ...(student ? ['Year & Section'] : []), 'Attending', 'Contribution', 'Payment', 'Screenshot', 'Reason (if not attending)'];
    const rows = rowsIn || [[], [], [], [], headers];
    let maxColumns = rowsIn ? 26 : headers.length;
    const sh = {
      rows, getLastColumn: () => Math.max(0, ...Array.from(rows, (r) => (r ? r.length : 0))), getLastRow: () => rows.length,
      getMaxColumns: () => maxColumns, insertColumnsAfter: (_, n) => { maxColumns += n; }, setColumnWidth() {},
      appendRow(row) { assert.ok(locked); rows.push([...row]); },
      setFrozenRows() {},
      getRange(r, c, h = 1, w = 1) {
        const range = {
          getValues: () => Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => rows[r - 1 + y]?.[c - 1 + x] ?? '')),
          getValue: () => rows[r - 1]?.[c - 1] ?? '',
          setValue(value) { rows[r - 1] ||= []; rows[r - 1][c - 1] = value; return range; },
          setValues(values) { values.forEach((v, y) => { rows[r - 1 + y] ||= []; v.forEach((x, i) => { rows[r - 1 + y][c - 1 + i] = x; }); }); return range; },
          setFormulas(values) { return range.setValues(values); },
          merge() { return range; }, setFontSize() { return range; }, setHorizontalAlignment() { return range; }, setWrap() { return range; },
          setBackground() { return range; }, setFontColor() { return range; }, setFontWeight() { return range; },
          setNumberFormat() { if (failAfterAppend) { failAfterAppend = false; throw Error('Response lost after saving'); } return range; },
          createTextFinder(value) {
            const finder = {
              matchEntireCell() { return finder; }, matchCase() { return finder; }, useRegularExpression() { return finder; },
              findNext() { const index = rows.findIndex((row, i) => i >= r - 1 && i < r - 1 + h && row[c - 1] === value); return index < 0 ? null : { getRow: () => index + 1 }; }
            };
            return finder;
          }
        };
        return range;
      }
    };
    return sh;
  }
  const students = sheet(true), faculty = sheet(false);
  // The President's officer accounts: rows 6 to 10 of the Officers tab.
  const officers = sheet(false, [[], [], [], [], ['Name', 'Username', 'Password'], ['Ana Cruz', 'ana', 'pw-ana'], ['Ben', 'ben', 'pw-ben'], ['', '', ''], ['', '', ''], ['', '', '']]);
  const sheets = { [legacy ? 'Responses' : 'Students']: students, Faculty: faculty, Officers: officers };
  const context = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k === 'OFFICER_CODE' ? 'SSC2026' : 'mock-id') }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) ?? null, put: (k, v) => cache.set(k, v) }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: (name) => sheets[name], insertSheet: (name) => (sheets[name] = sheet(false, [])) }), flush: () => { assert.ok(locked); flushes++; } },
    LockService: { getScriptLock: () => ({ tryLock: () => { if (locked) return false; locked = true; return true; }, releaseLock: () => { locked = false; } }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(), DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (algorithm, value) => [...crypto.createHash(algorithm).update(value).digest()],
      base64Decode: (s) => [...Buffer.from(s, 'base64')], formatDate: () => 'Oct 23, 1:05 PM',
      newBlob: (bytes, type, name) => ({ bytes, type, name, copyBlob() { return { ...this }; } })
    },
    MailApp: {
      getRemainingDailyQuota: () => quota,
      sendEmail(m) { assert.ok(locked); if (/bounce/.test(m.to)) throw Error('Invalid email'); quota--; mails.push(m); }
    },
    ScriptApp: {
      getProjectTriggers: () => [...triggers], deleteTrigger: (t) => triggers.splice(triggers.indexOf(t), 1),
      newTrigger: (fn) => ({ timeBased: () => ({ everyMinutes: (n) => ({ create: () => triggers.push({ fn, n, getHandlerFunction: () => fn }) }) }) })
    },
    Logger: { log() {} },
    DriveApp: { getFolderById: () => ({ createFile: () => { assert.ok(locked); uploads++; return { getUrl: () => `https://drive.google.com/file/d/mock-${uploads}` }; } }) }
  };
  vm.createContext(context);
  vm.runInContext(readFileSync(join(backendDir, 'QR.gs'), 'utf8'), context);
  vm.runInContext(readFileSync(join(backendDir, 'Code.gs'), 'utf8'), context);
  return { sheets, attendance: context.attendance_, undo: context.undoCheckin_, status: context.status_, resend: context.resendTicket_, lookup: context.lookup_, addEmail: context.addEmail_, send: context.sendPendingTickets, setupMail: context.setupTicketEmails, mails, triggers, setQuota: (n) => { quota = n; }, save: context.save_, ticket: context.ticket_, checkin: context.checkin_, officer: context.officer_, students, faculty, get uploads() { return uploads; }, get locked() { return locked; }, get flushes() { return flushes; }, failAfterAppend: () => { failAfterAppend = true; }, holdLock: () => { locked = true; } };
}
const reply = (group, extra = {}) => ({ group, fullName: 'Test Guest', section: 'BSIS 4A', attendance: 'Attending', paymentMethod: 'Cash', requestId: crypto.randomUUID(), ...extra });

for (const group of ['student', 'faculty']) {
  test(`${group}: repeat requests retain one row and a searchable reference`, () => {
    const b = backend(), d = reply(group), sh = group === 'student' ? b.students : b.faculty;
    const originalHeaders = [...sh.rows[4]];
    const id = b.save(d);
    assert.equal(b.save(d), id);
    assert.equal(sh.rows.length, 6);
    assert.equal(sh.rows[5][sh.rows[4].indexOf('Reference')], id);
    assert.deepEqual(sh.rows[4].slice(0, originalHeaders.length), originalHeaders);
    assert.equal(sh.rows[5][sh.rows[4].indexOf('Contribution')], group === 'student' ? 550 : 400);
    assert.equal(b.locked, false);
  });
  test(`${group}: lost response after append is recovered without a duplicate`, () => {
    const b = backend(), d = reply(group), sh = group === 'student' ? b.students : b.faculty;
    b.failAfterAppend();
    assert.throws(() => b.save(d), /Response lost/);
    const saved = sh.rows[5][sh.rows[4].indexOf('Reference')];
    assert.equal(b.save(d), saved);
    assert.equal(sh.rows.length, 6);
  });
  for (const method of ['GCash', 'Bank Transfer']) test(`${group}: ${method} retries reuse proof and preserve officer verification`, () => {
    const b = backend(), d = reply(group, { paymentMethod: method, proof: { mime: 'image/png', base64: 'dGVzdA==' } });
    const sh = group === 'student' ? b.students : b.faculty, id = b.save(d);
    const pay = sh.rows[4].indexOf('Payment');
    assert.match(sh.rows[5][pay], /check screenshot/);
    sh.rows[5][pay] = 'Paid ✓';
    assert.equal(b.save({ ...d, requestId: crypto.randomUUID() }), id);
    assert.equal(sh.rows.length, 6);
    assert.equal(sh.rows[5][pay], 'Paid ✓');
    assert.equal(b.uploads, 1);
  });
  test(`${group}: declining attendance keeps its original column layout and no fee`, () => {
    const b = backend(), d = reply(group, { attendance: 'Not attending', paymentMethod: '', reason: 'Prior commitment' });
    const sh = group === 'student' ? b.students : b.faculty;
    const id = b.save(d);
    assert.equal(b.save(d), id);
    assert.equal(sh.rows[5][sh.rows[4].indexOf('Contribution')], '');
    assert.equal(sh.rows[5][sh.rows[4].indexOf('Payment')], 'Not attending');
    assert.equal(b.uploads, 0);
  });
}
test('legacy pages and Responses tab work without request IDs', () => {
  const b = backend({ legacy: true }), d = reply('student');
  delete d.requestId;
  const id = b.save(d);
  assert.equal(b.save(d), id);
  assert.equal(b.students.rows.length, 6);
});
test('different people and audience groups are not merged', () => {
  const b = backend(), d = reply('student');
  const a = b.save(d), f = b.save(reply('faculty')), other = b.save(reply('student', { fullName: 'Other Guest' }));
  assert.notEqual(a, f); assert.notEqual(a, other);
  assert.equal(b.students.rows.length, 7); assert.equal(b.faculty.rows.length, 6);
});
test('changed payload cannot reuse an existing request ID', () => {
  const b = backend(), d = reply('student');
  b.save(d);
  assert.throws(() => b.save({ ...d, fullName: 'Changed Guest' }), /reply has changed/);
  assert.equal(b.students.rows.length, 6);
  assert.equal(b.locked, false);
});
test('lock contention performs no writes or uploads', () => {
  const b = backend(); b.holdLock();
  assert.throws(() => b.save(reply('student')), /records are busy/);
  assert.equal(b.students.rows.length, 5); assert.equal(b.uploads, 0);
});
test('existing records and extra officer columns survive metadata migration', () => {
  const b = backend();
  b.students.rows[4].push('Officer notes');
  const old = ['old date', 'Existing Guest', 'BSIS 4A', 'Yes', 550, 'Paid ✓', '', '', 'Verified'];
  b.students.rows.push([...old]);
  b.save(reply('student'));
  assert.deepEqual(b.students.rows[5], old);
  assert.equal(b.students.rows[4][8], 'Officer notes');
  assert.equal(b.students.rows[6][8], '');
});

for (const group of ['student', 'faculty']) {
  test(`${group}: email and ticket link are saved; QR unlocks only after "Paid ✓"`, () => {
    const b = backend(), sh = group === 'student' ? b.students : b.faculty;
    const id = b.save(reply(group, { email: 'Guest@Example.com' }));
    const h = sh.rows[4];
    assert.equal(sh.rows[5][h.indexOf('Email')], 'guest@example.com');
    assert.match(sh.rows[5][h.indexOf('Ticket')], new RegExp(`ticket/\\?ref=${id}`));
    let t = b.ticket(id.toLowerCase());
    assert.equal(t.ok, true);
    assert.equal(t.paid, false);
    assert.equal(t.group, group);
    assert.equal(t.name, 'Test Guest');
    assert.equal('email' in t, false);
    sh.rows[5][h.indexOf('Payment')] = 'Paid ✓';
    t = b.ticket(id);
    assert.equal(t.paid, true);
  });
  test(`${group}: bad or unknown ticket references are refused; declined replies get no ticket`, () => {
    const b = backend(), sh = group === 'student' ? b.students : b.faculty;
    assert.equal(b.ticket('PH26-123').ok, false);
    assert.equal(b.ticket('PH26-' + 'A'.repeat(32)).ok, false);
    b.save(reply(group, { attendance: 'Not attending', paymentMethod: '', reason: 'Out of town' }));
    assert.equal(sh.rows[5][sh.rows[4].indexOf('Ticket')], '');
    assert.throws(() => b.save(reply(group, { email: 'not-an-email' })), /valid email/);
  });
}

for (const group of ['student', 'faculty']) {
  test(`${group}: door check-in admits a paid ticket once and refuses unpaid, unknown or wrong-code scans`, () => {
    const b = backend(), sh = group === 'student' ? b.students : b.faculty;
    const id = b.save(reply(group, { email: 'g@x.com' }));
    const h = sh.rows[4];
    assert.equal(b.officer({ user: 'ana', pass: 'nope' }).ok, false);
    assert.equal(b.officer({ user: 'ana', pass: 'pw-ana' }).ok, true);
    assert.equal(b.checkin({ user: 'ana', pass: 'wrong', ref: id }).ok, false);
    assert.equal(b.checkin({ user: 'ana', pass: 'pw-ana', ref: id }).result, 'unpaid');
    sh.rows[5][h.indexOf('Payment')] = 'Paid ✓';
    const first = b.checkin({ user: 'ana', pass: 'pw-ana', ref: id });
    assert.equal(first.result, 'admitted');
    assert.equal(first.guest.name, 'Test Guest');
    assert.equal(first.stats.inside, 1);
    const col = sh.rows[4].indexOf('Checked in');
    assert.match(sh.rows[5][col], /Oct 23, 1:05 PM · Ana Cruz/);
    assert.equal(b.checkin({ user: 'ana', pass: 'pw-ana', ref: id.toLowerCase() }).result, 'used');
    assert.equal(b.checkin({ user: 'ana', pass: 'pw-ana', ref: 'https://islawqt.github.io/panaghimamat-2026/ticket/?ref=' + id }).result, 'used');
    assert.equal(b.checkin({ user: 'ana', pass: 'pw-ana', ref: 'PH26-' + 'B'.repeat(32) }).result, 'invalid');
    assert.equal(b.checkin({ user: 'ana', pass: 'pw-ana', ref: 'hello' }).result, 'invalid');
    assert.equal(b.locked, false);
  });
}

test('paid guests with an email get their QR ticket once; others wait', () => {
  const b = backend();
  const paid = b.save(reply('student', { email: 'ana@x.com', fullName: 'Ana Cruz' }));
  b.save(reply('student', { email: 'ben@x.com', fullName: 'Ben Uy' }));            // not paid yet
  b.save(reply('student', { fullName: 'Cy Lim' }));                                // paid, no email
  const fac = b.save(reply('faculty', { email: 'prof@x.com', fullName: 'Prof Dee' }));
  const h = b.students.rows[4], pay = h.indexOf('Payment');
  b.students.rows[5][pay] = 'Paid ✓'; b.students.rows[7][pay] = 'Paid ✓';
  b.faculty.rows[5][b.faculty.rows[4].indexOf('Payment')] = 'Paid ✓';

  b.setupMail();
  assert.equal(b.triggers.length, 1); assert.equal(b.triggers[0].n, 5);
  b.setupMail();
  assert.equal(b.triggers.length, 1, 'setup replaces the old trigger');
  assert.deepEqual(b.mails.map((m) => m.to).sort(), ['ana@x.com', 'prof@x.com']);
  const ana = b.mails.find((m) => m.to === 'ana@x.com');
  assert.match(ana.htmlBody, /cid:qr/); assert.match(ana.htmlBody, new RegExp('ticket/\\?ref=' + paid));
  assert.match(ana.htmlBody, /Ana Cruz/); assert.match(ana.htmlBody, /BSIS 4A/);
  assert.equal(ana.inlineImages.qr.type, 'image/gif');
  assert.match(b.mails.find((m) => m.to === 'prof@x.com').body, new RegExp(fac));
  const sent = h.indexOf('Ticket sent');
  assert.match(b.students.rows[5][sent], /→ ana@x.com/);
  assert.equal(b.students.rows[6][sent] ?? '', '');
  assert.equal(b.send(), 0, 'nobody gets it twice');

  b.students.rows[6][pay] = 'Paid ✓';                       // officer verifies Ben later
  b.students.rows[7][h.indexOf('Email')] = 'cy@x.com';       // Cy's email typed in from a PM
  assert.equal(b.send(), 2);
  assert.equal(b.mails.length, 4);
  assert.equal(b.locked, false);
});
test('ticket emails stop at the daily limit and mark bad addresses', () => {
  const b = backend();
  b.save(reply('student', { email: 'bounce@x.com', fullName: 'Bad Mail' }));
  b.save(reply('student', { email: 'ok@x.com', fullName: 'Good Mail' }));
  const h = b.students.rows[4];
  b.students.rows[5][h.indexOf('Payment')] = 'Paid ✓'; b.students.rows[6][h.indexOf('Payment')] = 'Paid ✓';
  b.setQuota(0);
  assert.equal(b.send(), 0);
  assert.equal(b.students.rows[6][h.indexOf('Ticket sent')] ?? '', '');
  b.setQuota(10);
  assert.equal(b.send(), 1);
  assert.equal(b.students.rows[5][h.indexOf('Ticket sent')], 'Not sent · check email');
  assert.equal(b.locked, false);
});
test('QR.gs makes a GIF picture without a browser', () => {
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(readFileSync(join(backendDir, 'QR.gs'), 'utf8'), ctx);
  const ref = 'PH26-4D7228F7CC7942B2A94D4E87106243C1';
  const q = ctx.qrcode(0, 'M'); q.addData(ref); q.make();
  const url = q.createDataURL(8, 4);
  assert.match(url, /^data:image\/gif;base64,R0lGOD/);
  assert.ok(q.getModuleCount() >= 21);
});

test('a second reply from the same person updates the first row instead of adding one', () => {
  const b = backend(), sh = b.students, h = () => sh.rows[4];
  const first = b.save(reply('student', { fullName: 'Sabedola, Ailah Marie M.', paymentMethod: 'Cash' }));
  const again = b.save(reply('student', { fullName: 'ailah marie sabedola', section: 'BSTM 1B', paymentMethod: 'GCash', email: 'ailah@x.com', proof: { mime: 'image/png', base64: 'dGVzdA==' } }));
  assert.equal(again, first);
  assert.equal(sh.rows.length, 6);
  assert.equal(sh.rows[5][h().indexOf('Email')], 'ailah@x.com');
  assert.match(sh.rows[5][h().indexOf('Payment')], /GCash · check screenshot/);
  assert.match(sh.rows[5][h().indexOf('Screenshot')], /View/);
  sh.rows[5][h().indexOf('Payment')] = 'Paid ✓';
  assert.throws(() => b.save(reply('student', { fullName: 'Ailah Marie Sabedola', paymentMethod: 'Cash', email: 'other@x.com' })), /different email/);
  b.save(reply('student', { fullName: 'Ailah Marie Sabedola', paymentMethod: 'Cash', email: 'ailah@x.com' }));
  assert.equal(sh.rows.length, 6);
  assert.equal(sh.rows[5][h().indexOf('Payment')], 'Paid ✓', 'officer verification is kept');
  assert.equal(sh.rows[5][h().indexOf('Email')], 'ailah@x.com', 'saved email is never replaced');
  assert.equal(b.uploads, 1);
  b.save(reply('student', { fullName: 'Ailah Marie Cruz' }));
  assert.equal(sh.rows.length, 7, 'different people still get their own row');
  assert.equal(b.locked, false);
});
test('earlier repliers can look themselves up and add an email once', () => {
  const b = backend(), sh = b.students;
  assert.equal(b.lookup('student', 'Nobody Here').found, false);
  b.save(reply('student', { fullName: 'Daniella Balino' }));
  sh.rows[5][sh.rows[4].indexOf('Payment')] = 'Paid ✓';
  const l = b.lookup('student', 'balino daniella');
  assert.equal(l.found, true); assert.equal(l.hasEmail, false);
  assert.equal('reference' in l || 'paid' in l, false, 'lookup reveals nothing else');
  assert.equal(b.lookup('faculty', 'Daniella Balino').found, false);
  assert.equal(b.addEmail({ group: 'student', name: 'Daniella Balino', email: 'bad' }).ok, false);
  assert.equal(b.addEmail({ group: 'student', name: 'Someone Else', email: 'a@x.com' }).ok, false);
  assert.equal(b.addEmail({ group: 'student', name: 'Daniella Balino', email: 'Dani@X.com' }).added, true);
  assert.equal(sh.rows[5][sh.rows[4].indexOf('Email')], 'dani@x.com');
  assert.equal(b.addEmail({ group: 'student', name: 'Daniella Balino', email: 'thief@x.com' }).already, true);
  assert.equal(sh.rows[5][sh.rows[4].indexOf('Email')], 'dani@x.com');
  assert.equal(b.lookup('student', 'Daniella Balino').hasEmail, true);
  assert.equal(b.send(), 1);
  assert.equal(b.mails[0].to, 'dani@x.com');
  assert.equal(b.locked, false);
});

test('status check by email shows progress without full names and resends only to that email', () => {
  const b = backend(), sh = b.students;
  assert.equal(b.status({ email: 'nope' }).ok, false);
  assert.equal(b.status({ email: 'none@x.com' }).found, false);
  b.save(reply('student', { fullName: 'Joseph Clarence Solatorio', email: 'jo@x.com', paymentMethod: 'Cash' }));
  let s = b.status({ email: ' JO@x.com ' });
  assert.equal(s.found, true);
  assert.equal(s.replies[0].name, 'Joseph S.');
  assert.equal(s.replies[0].stage, 'unpaid');
  assert.equal(s.replies[0].method, 'Cash');
  assert.equal('reference' in s.replies[0] || 'email' in s.replies[0], false);
  assert.equal(b.resend({ email: 'jo@x.com' }).ok, false, 'no ticket before payment');
  sh.rows[5][sh.rows[4].indexOf('Payment')] = 'Paid ✓';
  b.send();
  s = b.status({ email: 'jo@x.com' });
  assert.equal(s.replies[0].stage, 'verified');
  assert.match(s.replies[0].ticketSent, /Oct 23/);
  const r = b.resend({ email: 'jo@x.com' });
  assert.equal(r.ok, true); assert.equal(r.sent, 1);
  assert.equal(b.mails.at(-1).to, 'jo@x.com');
  assert.match(b.resend({ email: 'jo@x.com' }).message, /30 minutes/);
  assert.equal(b.mails.length, 2);
  b.save(reply('faculty', { fullName: 'Sabedola, Ailah Marie M.', email: 'ai@x.com', paymentMethod: 'GCash', proof: { mime: 'image/png', base64: 'dGVzdA==' } }));
  s = b.status({ email: 'ai@x.com' });
  assert.equal(s.replies[0].name, 'Ailah S.'); assert.equal(s.replies[0].stage, 'checking'); assert.equal(s.replies[0].group, 'faculty');
  assert.equal(b.locked, false);
});

test('someone who declined can switch to attending once; reason is cleared and the switch is recorded', () => {
  const b = backend(), sh = b.students, h = () => sh.rows[4], col = (t) => h().indexOf(t);
  const ref = b.save(reply('student', { fullName: 'Lea Nicole Viador', attendance: 'Not attending', paymentMethod: '', reason: 'No budget yet' }));
  let l = b.lookup('student', 'Lea Nicole Viador');
  assert.equal(l.declined, true); assert.equal(l.changedMind, false);
  assert.equal(b.addEmail({ group: 'student', name: 'Lea Nicole Viador', email: 'lea@x.com' }).ok, false, 'declined replies change their mind first');
  assert.equal(b.save(reply('student', { fullName: 'Lea Nicole Viador', email: 'lea@x.com', paymentMethod: 'Cash' })), ref);
  assert.equal(sh.rows.length, 6);
  assert.equal(sh.rows[5][col('Attending')], 'Yes');
  assert.equal(sh.rows[5][col('Reason (if not attending)')], '');
  assert.equal(sh.rows[5][col('Contribution')], 550);
  assert.equal(sh.rows[5][col('Email')], 'lea@x.com');
  assert.match(sh.rows[5][col('Ticket')], /ticket/);
  assert.match(sh.rows[5][col('Changed mind')], /No → Yes/);
  l = b.lookup('student', 'Lea Nicole Viador');
  assert.equal(l.declined, false); assert.equal(l.changedMind, true);
  assert.throws(() => b.save(reply('student', { fullName: 'Lea Nicole Viador', attendance: 'Not attending', paymentMethod: '', reason: 'Changed again' })), /one chance/);
  assert.equal(sh.rows[5][col('Attending')], 'Yes');
  sh.rows[5][col('Attending')] = 'No'; // officer sets it back by hand
  assert.throws(() => b.save(reply('student', { fullName: 'Lea Nicole Viador', email: 'lea@x.com', paymentMethod: 'GCash', proof: { mime: 'image/png', base64: 'dGVzdA==' } })), /one chance/);
  assert.equal(b.locked, false);
});

test('guards: same email merges a misspelled name; no cancelling an attending reply; email typos refused', () => {
  const b = backend(), sh = b.students;
  const first = b.save(reply('student', { fullName: 'Khyme Caliradelle Bongabong', email: 'khyme@x.com' }));
  assert.equal(b.save(reply('student', { fullName: 'Khyme Clairadelle Bongabong', email: 'khyme@x.com', paymentMethod: 'GCash', proof: { mime: 'image/png', base64: 'dGVzdA==' } })), first);
  assert.equal(sh.rows.length, 6);
  assert.throws(() => b.save(reply('student', { fullName: 'Khyme Caliradelle Bongabong', attendance: 'Not attending', paymentMethod: '', reason: 'prank' })), /To cancel/);
  assert.equal(sh.rows[5][sh.rows[4].indexOf('Attending')], 'Yes');
  assert.throws(() => b.save(reply('student', { fullName: 'New Person', email: 'np@gmail.con' })), /spelling/);
  assert.throws(() => b.save(reply('student', { fullName: 'New Person', email: 'np@gmial.com' })), /spelling/);
  assert.equal(b.addEmail({ group: 'student', name: 'Khyme Caliradelle Bongabong', email: 'k@gmail.co' }).ok, false);
  assert.equal(sh.rows.length, 6);
  assert.equal(b.locked, false);
});

test('officer attendance list shows paid guests; undo lets the real owner be scanned later', () => {
  const b = backend(), sh = b.students;
  const a = b.save(reply('student', { fullName: 'Zed Alpha', email: 'z@x.com' }));
  b.save(reply('student', { fullName: 'Amy Beta', email: 'a@x.com' }));
  b.save(reply('faculty', { fullName: 'Prof Gamma', email: 'p@x.com' }));
  sh.rows[5][sh.rows[4].indexOf('Payment')] = 'Paid ✓';
  b.faculty.rows[5][b.faculty.rows[4].indexOf('Payment')] = 'Paid ✓';
  assert.equal(b.attendance({ user: 'ana', pass: 'nope' }).ok, false);
  let list = b.attendance({ user: 'ana', pass: 'pw-ana' });
  assert.equal(list.guests.map((g) => g.name).join('|'), 'Prof Gamma|Zed Alpha');
  const scan = b.checkin({ user: 'ana', pass: 'pw-ana', ref: a });
  assert.equal(scan.result, 'admitted'); assert.equal(scan.ref, a);
  list = b.attendance({ user: 'ana', pass: 'pw-ana' });
  assert.match(list.guests.find((g) => g.ref === a).checkedIn, /Ana Cruz/);
  assert.equal(list.stats.inside, 1);
  assert.equal(b.undo({ user: 'eve', pass: 'pw-ana', ref: a }).ok, false);
  assert.equal(b.undo({ user: 'ana', pass: 'pw-ana', ref: a }).stats.inside, 0);
  assert.equal(b.checkin({ user: 'ana', pass: 'pw-ana', ref: a, manual: true, user: 'ben', pass: 'pw-ben' }).result, 'admitted');
  assert.match(sh.rows[5][sh.rows[4].indexOf('Checked in')], /Ben \(from list\)/);
  assert.equal(b.locked, false);
});
test('ticket email tells guests without a phone they must be there in person', () => {
  const b = backend(), sh = b.students;
  b.save(reply('student', { fullName: 'No Phone', email: 'np@x.com' }));
  sh.rows[5][sh.rows[4].indexOf('Payment')] = 'Paid ✓';
  b.send();
  assert.match(b.mails[0].htmlBody, /must be there in person/);
  assert.match(b.mails[0].body, /void/);
});

test('officers sign in with accounts from the Officers tab; attendance tabs log each check-in by group', () => {
  const b = backend();
  assert.equal(b.officer({ user: 'ANA', pass: 'pw-ana' }).officer, 'Ana Cruz');
  assert.equal(b.officer({ user: 'ana', pass: 'pw-ben' }).ok, false);
  assert.equal(b.officer({ user: 'zoe', pass: '' }).ok, false);
  b.sheets.Officers.rows[7] = ['Cara', 'cara', 'pw-cara']; b.sheets.Officers.rows[8] = ['Dan', 'dan', 'pw-dan'];
  b.sheets.Officers.rows[9] = ['Eve', 'eve', 'pw-eve']; b.sheets.Officers.rows[10] = ['Sixth', 'sixth', 'pw-6'];
  assert.equal(b.officer({ user: 'dan', pass: 'pw-dan' }).ok, true);
  assert.equal(b.officer({ user: 'eve', pass: 'pw-eve' }).ok, true, 'the 5th officer can sign in');
  assert.equal(b.officer({ user: 'sixth', pass: 'pw-6' }).ok, false, 'only 5 officers count');
  for (let i = 0; i < 8; i++) b.officer({ user: 'ben', pass: 'guess' + i });
  assert.match(b.officer({ user: 'ben', pass: 'pw-ben' }).message, /Too many/);
  assert.equal(b.officer({ user: 'ana', pass: 'pw-ana' }).ok, true, 'one locked officer does not lock the others');

  const s1 = b.save(reply('student', { fullName: 'Stu Dent', email: 's@x.com' }));
  const f1 = b.save(reply('faculty', { fullName: 'Fac Ulty', email: 'f@x.com' }));
  b.students.rows[5][b.students.rows[4].indexOf('Payment')] = 'Paid ✓';
  b.faculty.rows[5][b.faculty.rows[4].indexOf('Payment')] = 'Paid ✓';
  const r1 = b.checkin({ user: 'ana', pass: 'pw-ana', ref: s1 });
  assert.equal(r1.stats.student.inside, 1); assert.equal(r1.stats.faculty.inside, 0);
  b.checkin({ user: 'cara', pass: 'pw-cara', ref: f1, manual: true });
  const st = b.sheets['Attendance · Students'], fa = b.sheets['Attendance · Faculty'];
  const sRow = st.rows.find((r) => r && r[1] === 'Stu Dent'), fRow = fa.rows.find((r) => r && r[1] === 'Fac Ulty');
  assert.equal(sRow[2], 'BSIS 4A'); assert.equal(sRow[3], 'Ana Cruz'); assert.equal(sRow[4], 'QR scan'); assert.equal(sRow[5], 'Present');
  assert.equal(fRow[2], 'Cara'); assert.equal(fRow[3], 'From list'); assert.equal(fRow[4], 'Present');
  const u = b.undo({ user: 'dan', pass: 'pw-dan', ref: s1 });
  assert.equal(u.ok, true, JSON.stringify(u));
  assert.match(st.rows.find((r) => r && r[1] === 'Stu Dent')[5], /Void · undone by Dan/);
  b.checkin({ user: 'ana', pass: 'pw-ana', ref: s1 });
  assert.equal(st.rows.filter((r) => r && r[1] === 'Stu Dent').length, 2, 'a fresh row after the real owner is scanned');
  assert.equal(b.locked, false);
});
