const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const source = readFileSync(join(__dirname, '../script.js'), 'utf8');
const helper = source.slice(source.indexOf('  const requestIds = new Map();'), source.indexOf("  $('rsvpForm').addEventListener('submit'"));
function page(storage) {
  const ctx = { crypto: webcrypto, TextEncoder, localStorage: storage };
  vm.createContext(ctx); vm.runInContext(helper, ctx); return ctx.requestIdFor;
}
test('unchanged requests retain an ID across retries and page reloads without storing personal data', async () => {
  const values = new Map(), storage = { getItem: (k) => values.get(k), setItem: (k, v) => values.set(k, v) };
  const idFor = page(storage), payload = { group: 'student', fullName: 'Private Name', proof: { base64: 'private-proof' } };
  const id = await idFor(payload);
  assert.equal(await idFor(payload), id);
  assert.equal(await page(storage)(payload), id);
  assert.notEqual(await idFor({ ...payload, group: 'faculty' }), id);
  assert.notEqual(await idFor({ ...payload, fullName: 'Different Name' }), id);
  const saved = [...values.values()].join();
  assert.equal(saved.includes('Private Name'), false);
  assert.equal(saved.includes('private-proof'), false);
});
test('blocked browser storage still allows stable retries in the current page', async () => {
  const fail = () => { throw Error('Storage blocked'); };
  const idFor = page({ getItem: fail, setItem: fail });
  assert.equal(await idFor({ group: 'faculty' }), await idFor({ group: 'faculty' }));
});
