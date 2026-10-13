const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

// In-memory Google service doubles: never contact the production sheet or Drive.
function backend({ legacy = false } = {}) {
  let locked = false, uploads = 0, failAfterAppend = false, flushes = 0;
  function sheet(student) {
    const headers = ['Date', 'Name', ...(student ? ['Year & Section'] : []), 'Attending', 'Contribution', 'Payment', 'Screenshot', 'Reason (if not attending)'];
    const rows = [[], [], [], [], headers];
    let maxColumns = headers.length;
    const sh = {
      rows, getLastColumn: () => Math.max(...rows.map((r) => r.length)), getLastRow: () => rows.length,
      getMaxColumns: () => maxColumns, insertColumnsAfter: (_, n) => { maxColumns += n; }, setColumnWidth() {},
      appendRow(row) { assert.ok(locked); rows.push([...row]); },
      getRange(r, c, h = 1, w = 1) {
        const range = {
          getValues: () => Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => rows[r - 1 + y]?.[c - 1 + x] ?? '')),
          getValue: () => rows[r - 1]?.[c - 1] ?? '',
          setValue(value) { rows[r - 1] ||= []; rows[r - 1][c - 1] = value; return range; },
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
  const sheets = { [legacy ? 'Responses' : 'Students']: students, Faculty: faculty };
  const context = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'mock-id' }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: (name) => sheets[name] }), flush: () => { assert.ok(locked); flushes++; } },
    LockService: { getScriptLock: () => ({ tryLock: () => { if (locked) return false; locked = true; return true; }, releaseLock: () => { locked = false; } }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(), DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (algorithm, value) => [...crypto.createHash(algorithm).update(value).digest()],
      base64Decode: (s) => [...Buffer.from(s, 'base64')], newBlob: (...args) => args
    },
    DriveApp: { getFolderById: () => ({ createFile: () => { assert.ok(locked); uploads++; return { getUrl: () => `https://drive.google.com/file/d/mock-${uploads}` }; } }) }
  };
  vm.createContext(context);
  vm.runInContext(readFileSync(join(__dirname, '../google-apps-script/Code.gs'), 'utf8'), context);
  return { save: context.save_, students, faculty, get uploads() { return uploads; }, get locked() { return locked; }, get flushes() { return flushes; }, failAfterAppend: () => { failAfterAppend = true; }, holdLock: () => { locked = true; } };
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
