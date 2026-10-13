/**
 * Panaghimamat 2026 · RSVP backend (Google Apps Script)
 * Serves both invitation pages: students (/) and faculty (/faculty/).
 *
 * Update steps:
 *   1. Paste this whole file into the Apps Script project and save.
 *   2. Deploy > Manage deployments > Edit > Version: New version > Deploy.
 *
 * Tabs (already formatted in the SSC sheet; setup() builds any that are missing):
 *   Students      one row per student reply, filled automatically from row 6
 *   Faculty       one row per faculty reply, filled automatically from row 6
 */
const SHEET_TITLE = 'Panaghimamat 2026 · RSVP';
const STUDENTS = 'Students';
const FACULTY = 'Faculty';
const FEE = { student: 550, faculty: 400 };
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
  if (!book.getSheetByName(STUDENTS) && !book.getSheetByName('Responses')) buildRecords_(book.insertSheet(STUDENTS, 0), 'student');
  if (!book.getSheetByName(FACULTY)) buildRecords_(book.insertSheet(FACULTY, 1), 'faculty');
  const blank = book.getSheetByName('Sheet1');
  if (blank && book.getSheets().length > 1 && blank.getLastRow() === 0) book.deleteSheet(blank);
  if (!props.getProperty('PROOF_FOLDER_ID')) {
    props.setProperty('PROOF_FOLDER_ID', DriveApp.createFolder('Panaghimamat 2026 · Payment screenshots').getId());
  }
  Logger.log('Sheet ready: ' + book.getUrl());
}

/* Builds a styled records tab. Students have a Year & Section column; faculty do not. */
function buildRecords_(sh, group) {
  const student = group === 'student';
  const headers = student
    ? ['Date', 'Name', 'Year & Section', 'Attending', 'Contribution', 'Payment', 'Screenshot', 'Reason (if not attending)']
    : ['Date', 'Name', 'Attending', 'Contribution', 'Payment', 'Screenshot', 'Reason (if not attending)'];
  const n = headers.length;
  const col = (name) => String.fromCharCode(65 + headers.indexOf(name)); // column letter by header
  const att = col('Attending'), amt = col('Contribution'), pay = col('Payment');
  const last = String.fromCharCode(64 + n);

  sh.setHiddenGridlines(true).setTabColor(student ? WINE : GOLD);
  sh.getRange(`A1:${last}1000`).setFontFamily('Lora').setFontSize(10).setVerticalAlignment('middle');
  sh.getRange(`A1:${last}1`).merge().setValue(`Panaghimamat 2026 · ${student ? 'Students' : 'Faculty'}`)
    .setBackground(WINE).setFontColor(CREAM).setFontSize(16).setFontWeight('bold').setHorizontalAlignment('center');

  // Summary row: counts, then money (expected, collected, still to collect)
  const labels = ['REPLIES', 'ATTENDING', 'NOT ATTENDING', 'PAID'];
  const sums = ['=COUNTA(B6:B)', `=COUNTIF(${att}6:${att},"Yes")`, `=COUNTIF(${att}6:${att},"No")`, `=COUNTIF(${pay}6:${pay},"Paid ✓")`];
  if (student) { labels.push('UNPAID'); sums.push('=B3-D3'); }
  const e = String.fromCharCode(65 + labels.length), c = String.fromCharCode(66 + labels.length);
  labels.push('EXPECTED', 'COLLECTED', 'TO COLLECT');
  sums.push(`=SUM(${amt}6:${amt})`, `=SUMIF(${pay}6:${pay},"Paid ✓",${amt}6:${amt})`, `=${e}3-${c}3`);
  sh.getRange(`A2:${last}3`).setBackground(PAPER2).setHorizontalAlignment('center').setFontWeight('bold');
  sh.getRange(`A2:${last}2`).setValues([labels]).setFontSize(8).setFontColor(GOLD);
  sh.getRange(`A3:${last}3`).setFormulas([sums]).setFontSize(15).setFontColor(WINE);
  sh.getRange(3, n - 2, 1, 3).setNumberFormat('"₱"#,##0');

  sh.getRange(`A5:${last}5`).setValues([headers]).setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange(`A5:${last}1000`).applyRowBanding(SpreadsheetApp.BandingTheme.BROWN, true, false)
    .setHeaderRowColor(WINE).setFirstRowColor(PAPER).setSecondRowColor(PAPER2);
  sh.getRange(`A5:${last}5`).setFontColor(CREAM);
  sh.getRange('A6:A').setNumberFormat('mmm d, h:mm am/pm');
  sh.getRange('B6:B').setFontWeight('bold');
  sh.getRange(`C6:${col('Screenshot')}`).setHorizontalAlignment('center');
  sh.getRange(`${amt}6:${amt}`).setNumberFormat('"₱"#,##0');
  sh.getRange(`${last}6:${last}`).setWrap(true);
  const widths = student ? [140, 220, 130, 105, 110, 200, 110, 300] : [140, 240, 105, 110, 200, 110, 300];
  widths.forEach((w, i) => sh.setColumnWidth(i + 1, w));
  sh.setRowHeight(1, 46); sh.setRowHeight(3, 38); sh.setRowHeight(4, 10); sh.setRowHeights(6, 995, 30);
  sh.setFrozenRows(5);

  const payRange = sh.getRange(`${pay}6:${pay}`);
  const attRange = sh.getRange(`${att}6:${att}`);
  payRange.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(PAYMENT_OPTIONS, true).setAllowInvalid(true).build());
  const rule = (range) => SpreadsheetApp.newConditionalFormatRule().setRanges([range]);
  sh.setConditionalFormatRules([
    rule(payRange).whenTextEqualTo('Paid ✓').setBackground('#d9ead3').setFontColor('#2f5a2e').setBold(true).build(),
    rule(payRange).whenTextContains('not yet paid').setBackground('#fbe8c8').setFontColor('#7a4a0c').build(),
    rule(payRange).whenTextContains('check screenshot').setBackground('#e1e8f3').setFontColor('#28466e').build(),
    rule(payRange).whenTextEqualTo('Not attending').setFontColor('#9a8f84').build(),
    rule(attRange).whenTextEqualTo('Yes').setFontColor('#2f5a2e').setBold(true).build(),
    rule(attRange).whenTextEqualTo('No').setFontColor('#9a2a2a').setBold(true).build()
  ]);
}

function book_() {
  return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
}

/* ---------- Web endpoints ---------- */
function doGet() {
  return json_({ ok: true, version: '2026-10-14-idempotent', message: 'Panaghimamat RSVP is running.' });
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

/* ---------- Saving a reply ---------- */
function save_(d) {
  const text = (v, max) => String(v == null ? '' : v).trim().replace(/\s+/g, ' ').slice(0, max);
  if (text(d.website, 100)) fail_('Could not save your reply.'); // spam trap

  const group = d.group === 'faculty' ? 'faculty' : 'student';
  const name = text(d.fullName, 100);
  const section = text(d.section, 20).toUpperCase();
  const attending = text(d.attendance, 30) === 'Attending';
  const method = text(d.paymentMethod, 30);
  const reason = text(d.reason, 300);

  if (name.length < 2) fail_('Please type your full name.');
  if (group === 'student' && section.length < 2) fail_('Please type your year and section, e.g. BSIS 4A.');
  if (!attending && reason.length < 3) fail_('Please give a short reason for not attending.');

  let payment = 'Not attending';
  const online = attending && (method === 'GCash' || method === 'Bank Transfer');
  if (attending) {
    if (!online && method !== 'Cash') fail_('Please choose how you will pay.');
    payment = method === 'Cash' ? 'Cash · not yet paid' : method === 'GCash' ? 'GCash · check screenshot' : 'GoTyme · check screenshot';
  }

  // Old cached pages still work: identical replies also match by fingerprint.
  const requestId = text(d.requestId, 100);
  if (requestId && !/^[a-zA-Z0-9-]{16,100}$/.test(requestId)) fail_('Please refresh the invitation and try again.');
  const fingerprint = hash_(JSON.stringify([
    group, name.toLowerCase(), group === 'student' ? section : '', attending,
    attending ? method : '', attending ? '' : reason,
    online && d.proof ? [d.proof.mime, hash_(String(d.proof.base64 || ''))] : null
  ]));
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) fail_('The SSC records are busy. Please send the same reply again in a moment.');
  try {
    return saveLocked_({ group, name, section, attending, payment, reason, online, proof: d.proof, requestId, fingerprint });
  } finally {
    lock.releaseLock();
  }
}

function hash_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)
    .map((b) => ('0' + (b & 255).toString(16)).slice(-2)).join('');
}

// Add metadata at the right edge. Never shift existing columns, formulas or records.
function referenceColumns_(sheet) {
  const headers = sheet.getRange(5, 1, 1, sheet.getLastColumn()).getValues()[0];
  const columns = {};
  ['Reference', 'Request ID', 'Reply fingerprint'].forEach((title) => {
    let column = headers.indexOf(title) + 1;
    if (!column) {
      column = headers.length + 1;
      if (column > sheet.getMaxColumns()) sheet.insertColumnsAfter(sheet.getMaxColumns(), 1);
      sheet.getRange(5, column).setValue(title).setBackground(WINE).setFontColor(CREAM).setFontWeight('bold');
      sheet.setColumnWidth(column, title === 'Reference' ? 300 : 180);
      headers.push(title);
    }
    columns[title] = column;
  });
  columns.width = headers.length;
  return columns;
}

function findReply_(sheet, column, value) {
  const count = sheet.getLastRow() - 5;
  if (!value || count < 1) return null;
  return sheet.getRange(6, column, count, 1).createTextFinder(value)
    .matchEntireCell(true).matchCase(true).useRegularExpression(false).findNext();
}

function saveLocked_(d) {
  const { group, name, section, attending, payment, reason, online, proof, requestId, fingerprint } = d;
  const safe = (s) => (/^[=+\-@]/.test(s) ? "'" + s : s); // keep typed text from acting as a formula
  const book = book_();
  const sheet = group === 'student'
    ? (book.getSheetByName(STUDENTS) || book.getSheetByName('Responses'))
    : book.getSheetByName(FACULTY);
  if (!sheet) fail_('The SSC records are being set up. Please try again later.');
  const columns = referenceColumns_(sheet);
  const byId = findReply_(sheet, columns['Request ID'], requestId);
  if (byId && sheet.getRange(byId.getRow(), columns['Reply fingerprint']).getValue() !== fingerprint) {
    fail_('This reply has changed. Please refresh the invitation before sending it again.');
  }
  const existing = byId || findReply_(sheet, columns['Reply fingerprint'], fingerprint);
  if (existing) {
    // Do not overwrite an officer's payment verification or upload the proof again.
    const reference = sheet.getRange(existing.getRow(), columns.Reference).getValue();
    SpreadsheetApp.flush();
    return reference;
  }
  const screenshot = online ? '=HYPERLINK("' + saveScreenshot_(proof, name) + '","View")' : '';
  const receiptId = 'PH26-' + Utilities.getUuid().replace(/-/g, '').toUpperCase();
  const row = [new Date(), safe(name)];
  if (group === 'student') row.push(safe(section));
  row.push(attending ? 'Yes' : 'No', attending ? FEE[group] : '', payment, screenshot, attending ? '' : safe(reason));
  while (row.length < columns.width) row.push('');
  row[columns.Reference - 1] = receiptId;
  row[columns['Request ID'] - 1] = requestId;
  row[columns['Reply fingerprint'] - 1] = fingerprint;
  sheet.appendRow(row);
  SpreadsheetApp.flush(); // commit reply + reference together before releasing the lock
  sheet.getRange(sheet.getLastRow(), 1).setNumberFormat('mmm d, h:mm am/pm'); // appendRow resets the date style
  return receiptId;
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
