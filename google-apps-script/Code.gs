/**
 * Panaghimamat 2026 · RSVP backend (Google Apps Script)
 *
 * Update steps:
 *   1. Paste this whole file into the Apps Script project and save.
 *   2. Deploy > Manage deployments > Edit > Version: New version > Deploy.
 *
 * Tabs (already formatted in the SSC sheet; setup() rebuilds them only if missing):
 *   Responses     one row per reply, filled automatically from row 6
 *   Faculty List  officers type faculty full names in column A
 */
const SHEET_TITLE = 'Panaghimamat 2026 · RSVP';
const RESPONSES = 'Responses';
const FACULTY = 'Faculty List';
const HEADERS = ['Date', 'Name', 'Type', 'Attending', 'Contribution', 'Payment', 'Screenshot', 'Reason (if not attending)'];
const FEES = { Student: 550, Faculty: 400 };
const PAYMENT_OPTIONS = ['Cash · not yet paid', 'GCash · check screenshot', 'GoTyme · check screenshot', 'Paid ✓', 'Not attending'];
const WINE = '#5c121c', CREAM = '#f6ead6', PAPER = '#fffaf2', PAPER2 = '#f6ecdc', GOLD = '#9b7536';

/* ---------- One-time setup (only creates what is missing) ---------- */
function setup() {
  const props = PropertiesService.getScriptProperties();
  let book;
  const id = props.getProperty('SHEET_ID');
  if (id) book = SpreadsheetApp.openById(id);
  else { book = SpreadsheetApp.create(SHEET_TITLE); props.setProperty('SHEET_ID', book.getId()); }
  book.setSpreadsheetTimeZone('Asia/Manila');
  if (!book.getSheetByName(RESPONSES)) buildResponses_(book.insertSheet(RESPONSES, 0));
  facultySheet_(book);
  const blank = book.getSheetByName('Sheet1');
  if (blank && book.getSheets().length > 1 && blank.getLastRow() === 0) book.deleteSheet(blank);
  if (!props.getProperty('PROOF_FOLDER_ID')) {
    props.setProperty('PROOF_FOLDER_ID', DriveApp.createFolder('Panaghimamat 2026 · Payment screenshots').getId());
  }
  Logger.log('Sheet ready: ' + book.getUrl());
}

function buildResponses_(sh) {
  sh.setHiddenGridlines(true).setTabColor(WINE);
  sh.getRange('A1:H1000').setFontFamily('Lora').setFontSize(10).setVerticalAlignment('middle');
  sh.getRange('A1:H1').merge().setValue('Panaghimamat 2026 · RSVP & Contributions')
    .setBackground(WINE).setFontColor(CREAM).setFontSize(16).setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange('A2:H3').setBackground(PAPER2).setHorizontalAlignment('center').setFontWeight('bold');
  sh.getRange('A2:H2').setValues([['REPLIES', 'ATTENDING', 'NOT ATTENDING', 'STUDENTS', 'FACULTY', 'EXPECTED', 'COLLECTED', 'TO COLLECT']])
    .setFontSize(8).setFontColor(GOLD);
  sh.getRange('A3:H3').setFormulas([['=COUNTA(B6:B)', '=COUNTIF(D6:D,"Yes")', '=COUNTIF(D6:D,"No")', '=COUNTIF(C6:C,"Student")',
    '=COUNTIF(C6:C,"Faculty")', '=SUM(E6:E)', '=SUMIF(F6:F,"Paid ✓",E6:E)', '=F3-G3']]).setFontSize(15).setFontColor(WINE);
  sh.getRange('F3:H3').setNumberFormat('"₱"#,##0');
  sh.getRange('A5:H5').setValues([HEADERS]).setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange('A5:H1000').applyRowBanding(SpreadsheetApp.BandingTheme.BROWN, true, false)
    .setHeaderRowColor(WINE).setFirstRowColor(PAPER).setSecondRowColor(PAPER2);
  sh.getRange('A5:H5').setFontColor(CREAM);
  sh.getRange('A6:A').setNumberFormat('mmm d, h:mm am/pm');
  sh.getRange('B6:B').setFontWeight('bold');
  sh.getRange('C6:G').setHorizontalAlignment('center');
  sh.getRange('E6:E').setNumberFormat('"₱"#,##0');
  sh.getRange('H6:H').setWrap(true);
  [140, 220, 105, 105, 110, 200, 110, 300].forEach((w, i) => sh.setColumnWidth(i + 1, w));
  sh.setRowHeight(1, 46); sh.setRowHeight(3, 38); sh.setRowHeight(4, 10); sh.setRowHeights(6, 995, 30);
  sh.setFrozenRows(5);
  const pay = sh.getRange('F6:F');
  pay.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(PAYMENT_OPTIONS, true).setAllowInvalid(true).build());
  const rule = (range) => SpreadsheetApp.newConditionalFormatRule().setRanges([range]);
  sh.setConditionalFormatRules([
    rule(pay).whenTextEqualTo('Paid ✓').setBackground('#d9ead3').setFontColor('#2f5a2e').setBold(true).build(),
    rule(pay).whenTextContains('not yet paid').setBackground('#fbe8c8').setFontColor('#7a4a0c').build(),
    rule(pay).whenTextContains('check screenshot').setBackground('#e1e8f3').setFontColor('#28466e').build(),
    rule(pay).whenTextEqualTo('Not attending').setFontColor('#9a8f84').build(),
    rule(sh.getRange('D6:D')).whenTextEqualTo('Yes').setFontColor('#2f5a2e').setBold(true).build(),
    rule(sh.getRange('D6:D')).whenTextEqualTo('No').setFontColor('#9a2a2a').setBold(true).build()
  ]);
}

function book_() {
  return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
}
function facultySheet_(book) {
  let sheet = book.getSheetByName(FACULTY);
  if (!sheet) {
    sheet = book.insertSheet(FACULTY).setHiddenGridlines(true).setTabColor(GOLD);
    sheet.getRange('A1:B300').setFontFamily('Lora').setFontSize(11).setVerticalAlignment('middle');
    sheet.getRange('A1:B1').setValues([['Faculty full name', 'How to use']]).setBackground(WINE).setFontColor(CREAM).setFontWeight('bold');
    sheet.getRange('B2:B3').setValues([['Type one faculty full name per row in column A (first and last name). Titles like Ma\'am or Dr. are optional.'],
      ['New names work on the website within a minute.']]).setFontSize(9).setFontStyle('italic').setFontColor('#86705e').setWrap(true);
    sheet.getRange('A1:A300').applyRowBanding(SpreadsheetApp.BandingTheme.BROWN, true, false)
      .setHeaderRowColor(WINE).setFirstRowColor(PAPER).setSecondRowColor(PAPER2);
    sheet.setColumnWidth(1, 320); sheet.setColumnWidth(2, 360);
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
    if (online) screenshot = '=HYPERLINK("' + saveScreenshot_(d.proof, name) + '","View")';
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
