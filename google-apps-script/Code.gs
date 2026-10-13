/**
 * Panaghimamat 2026 · RSVP backend (Google Apps Script)
 *
 * Setup:
 *   1. Paste this file into the Apps Script project and save.
 *   2. Run setup() once (it tidies the Sheet and creates the tabs below).
 *   3. Deploy > Manage deployments > Edit > Version: New version > Deploy.
 *
 * Tabs:
 *   Responses     one row per reply (filled automatically)
 *   Faculty List  officers type faculty full names in column A
 */
const SHEET_TITLE = 'Panaghimamat 2026 · RSVP';
const RESPONSES = 'Responses';
const FACULTY = 'Faculty List';
const HEADERS = ['Date', 'Name', 'Type', 'Attending', 'Contribution', 'Payment', 'Screenshot', 'Reason (if not attending)'];
const FEES = { Student: 550, Faculty: 400 };
const PAYMENT_OPTIONS = ['Cash · not yet paid', 'GCash · check screenshot', 'GoTyme · check screenshot', 'Paid ✓', 'Not attending'];

/* ---------- One-time setup ---------- */
function setup() {
  const props = PropertiesService.getScriptProperties();
  let book;
  const id = props.getProperty('SHEET_ID');
  if (id) book = SpreadsheetApp.openById(id);
  else { book = SpreadsheetApp.create(SHEET_TITLE); props.setProperty('SHEET_ID', book.getId()); }
  book.setSpreadsheetTimeZone('Asia/Manila');

  const responses = book.getSheetByName(RESPONSES) || book.insertSheet(RESPONSES, 0);
  responses.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
    .setFontWeight('bold').setBackground('#5c121c').setFontColor('#f6ead6');
  responses.setFrozenRows(1);
  [150, 220, 80, 90, 100, 190, 110, 280].forEach((w, i) => responses.setColumnWidth(i + 1, w));
  responses.getRange('E2:E').setNumberFormat('"₱"#,##0');
  responses.getRange('F2:F').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(PAYMENT_OPTIONS, true).setAllowInvalid(true).build());
  responses.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Paid ✓').setBackground('#d9ead3').setRanges([responses.getRange('F2:F')]).build()
  ]);

  facultySheet_(book);

  // Remove the old, more complicated tabs from earlier versions (only if they hold no replies).
  ['Dashboard', 'SSC Guide', 'Students', 'Faculty'].forEach((name) => {
    const old = book.getSheetByName(name);
    if (!old) return;
    const isRecordTab = name === 'Students' || name === 'Faculty';
    const hasReplies = isRecordTab && old.getRange('C2:C').getValues().some(([v]) => String(v).trim());
    if (!hasReplies) book.deleteSheet(old);
  });

  if (!props.getProperty('PROOF_FOLDER_ID')) {
    props.setProperty('PROOF_FOLDER_ID', DriveApp.createFolder('Panaghimamat 2026 · Payment screenshots').getId());
  }
  Logger.log('Sheet ready: ' + book.getUrl());
}

function book_() {
  return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
}
function facultySheet_(book) {
  let sheet = book.getSheetByName(FACULTY);
  if (!sheet) {
    sheet = book.insertSheet(FACULTY);
    sheet.getRange('A1').setValue('Faculty full name').setFontWeight('bold').setBackground('#5c121c').setFontColor('#f6ead6');
    sheet.setColumnWidth(1, 320);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/* ---------- Web endpoints ---------- */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'verifyFaculty') return json_(verifyFaculty_(p.name));
  return json_({ ok: true, message: 'Panaghimamat RSVP is running.' }); // also used as a warm-up ping
}

function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    return json_({ ok: true, receiptId: save_(data) });
  } catch (err) {
    return json_({ ok: false, message: err.userMessage || 'Could not save your reply. Please try again.' });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function fail_(message) {
  const err = new Error(message);
  err.userMessage = message;
  throw err;
}

/* ---------- Faculty check (no log-in, so we match names) ---------- */
function normalizeName_(value) {
  return String(value == null ? '' : value).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(mr|mrs|ms|dr|prof|sir|maam|engr|atty)\b\.?/g, ' ')
    .replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
function facultyNames_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('faculty_names');
  if (cached) return JSON.parse(cached);
  const names = facultySheet_(book_()).getRange('A2:A').getValues()
    .map(([v]) => normalizeName_(v)).filter(Boolean);
  cache.put('faculty_names', JSON.stringify(names), 60); // new names show up within a minute
  return names;
}
function isListedFaculty_(name) {
  const given = normalizeName_(name).split(' ');
  if (given.length < 2) return false;
  return facultyNames_().some((listed) => {
    const t = listed.split(' ');
    if (listed === given.join(' ')) return true;
    // also match when the middle name or initial is left out
    return t.length >= 2 && t[0] === given[0] && t[t.length - 1] === given[given.length - 1];
  });
}
function verifyFaculty_(name) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('faculty_fails') || 0);
  if (fails >= 40) return { ok: false, message: 'Too many tries. Please wait a few minutes or message an SSC officer.' };
  if (isListedFaculty_(name)) return { ok: true };
  cache.put('faculty_fails', String(fails + 1), 600);
  return { ok: false, message: 'Your name is not on the faculty list yet. Type your full name, or message an SSC officer.' };
}

/* ---------- Saving a reply ---------- */
function save_(d) {
  const text = (v, max) => String(v == null ? '' : v).trim().replace(/\s+/g, ' ').slice(0, max);
  if (text(d.website, 100)) fail_('Could not save your reply.'); // spam trap

  const name = text(d.fullName, 100);
  const type = text(d.role, 20);
  const attending = text(d.attendance, 30) === 'Attending';
  const method = text(d.paymentMethod, 30);
  const reason = text(d.reason, 300);

  if (name.length < 2 || !FEES[type]) fail_('Please complete your name and type.');
  if (type === 'Faculty' && !isListedFaculty_(name)) fail_('Your name is not on the faculty list. Please check it or message an SSC officer.');
  if (!attending && reason.length < 3) fail_('Please give a short reason for not attending.');

  let payment = 'Not attending';
  let screenshot = '';
  if (attending) {
    const online = method === 'GCash' || method === 'Bank Transfer';
    if (!online && method !== 'Cash') fail_('Please choose how you will pay.');
    payment = method === 'Cash' ? 'Cash · not yet paid' : method === 'GCash' ? 'GCash · check screenshot' : 'GoTyme · check screenshot';
    if (online) screenshot = saveScreenshot_(d.proof, name);
  }

  const safe = (s) => (/^[=+\-@]/.test(s) ? "'" + s : s); // keep typed text from acting as a formula
  book_().getSheetByName(RESPONSES).appendRow([
    new Date(), safe(name), type, attending ? 'Yes' : 'No',
    attending ? FEES[type] : '', payment, screenshot, attending ? '' : safe(reason)
  ]);
  return 'PH26-' + Utilities.getUuid().slice(0, 6).toUpperCase();
}

function saveScreenshot_(proof, name) {
  const okType = proof && ['image/jpeg', 'image/png', 'image/webp'].includes(proof.mime);
  if (!okType || typeof proof.base64 !== 'string') fail_('Please attach your payment screenshot.');
  const bytes = Utilities.base64Decode(proof.base64);
  if (bytes.length > 2 * 1024 * 1024) fail_('Screenshot is too large. Please use one under 2 MB.');
  const ext = proof.mime === 'image/png' ? 'png' : proof.mime === 'image/webp' ? 'webp' : 'jpg';
  const fileName = name.replace(/[^\w ]/g, '').slice(0, 40) + ' ' + Date.now() + '.' + ext;
  const folder = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('PROOF_FOLDER_ID'));
  return folder.createFile(Utilities.newBlob(bytes, proof.mime, fileName)).getUrl();
}
