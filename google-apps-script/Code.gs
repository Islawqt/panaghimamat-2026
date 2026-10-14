/**
 * Panaghimamat 2026 · RSVP backend (Google Apps Script)
 * Serves both invitation pages: students (/) and faculty (/faculty/).
 *
 * Update steps:
 *   1. Paste this whole file into the Apps Script project and save.
 *      Also add QR.gs as a second file named "QR" (makes the QR picture for ticket emails).
 *   2. Deploy > Manage deployments > Edit > Version: New version > Deploy.
 *   3. Once: run setupTicketEmails from the editor and allow email sending.
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
  officersTab_(book);
  attendanceTab_('student', book);
  attendanceTab_('faculty', book);
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
const SITE = 'https://islawqt.github.io/panaghimamat-2026/';

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'ticket') return json_(ticket_(p.ref));
  return json_({ ok: true, version: '2026-10-14-tickets-checkin-mail-dedupe-status-mind-guard-attendance-officers', message: 'Panaghimamat RSVP is running.' });
}

/* ---------- Tickets ----------
 * A ticket is looked up by its reference (PH26- plus 32 random characters, so it cannot be guessed).
 * The QR only unlocks after an officer sets Payment to "Paid ✓". Email is never returned. */
function ticket_(ref) {
  ref = String(ref || '').trim().toUpperCase();
  if (!/^PH26-[A-F0-9]{32}$/.test(ref)) return { ok: false, message: 'This ticket link is not valid.' };
  const book = book_();
  const tabs = [[book.getSheetByName(STUDENTS) || book.getSheetByName('Responses'), 'student'], [book.getSheetByName(FACULTY), 'faculty']];
  for (const [sheet, group] of tabs) {
    if (!sheet || sheet.getLastRow() < 6) continue;
    const headers = sheet.getRange(5, 1, 1, sheet.getLastColumn()).getValues()[0];
    const col = (t) => headers.indexOf(t) + 1;
    if (!col('Reference')) continue;
    const hit = findReply_(sheet, col('Reference'), ref);
    if (!hit) continue;
    const row = sheet.getRange(hit.getRow(), 1, 1, headers.length).getValues()[0];
    const get = (t) => (col(t) ? row[col(t) - 1] : '');
    return {
      ok: true, group, reference: ref,
      name: String(get('Name')), section: String(get('Year & Section') || ''),
      attending: get('Attending') === 'Yes',
      paid: String(get('Payment')).trim() === 'Paid ✓'
    };
  }
  return { ok: false, message: 'We could not find this ticket. Please message an SSC officer.' };
}

/* Run once from the editor to add ticket links to replies saved before tickets existed. */
function fillTicketLinks() {
  const book = book_();
  [book.getSheetByName(STUDENTS) || book.getSheetByName('Responses'), book.getSheetByName(FACULTY)].forEach((sheet) => {
    if (!sheet) return;
    const columns = referenceColumns_(sheet);
    const count = sheet.getLastRow() - 5;
    if (count < 1) return;
    const refs = sheet.getRange(6, columns.Reference, count, 1).getValues();
    const attending = sheet.getRange(6, sheet.getRange(5, 1, 1, sheet.getLastColumn()).getValues()[0].indexOf('Attending') + 1, count, 1).getValues();
    sheet.getRange(6, columns.Ticket, count, 1).setValues(refs.map(([r], i) => [r && attending[i][0] === 'Yes' ? ticketLink_(r) : '']));
  });
}
function ticketLink_(ref) {
  return '=HYPERLINK("' + SITE + 'ticket/?ref=' + ref + '","Open ticket")';
}

function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (data.action === 'checkin') return json_(checkin_(data));
    if (data.action === 'officer') return json_(officer_(data));
    if (data.action === 'attendance') return json_(attendance_(data));
    if (data.action === 'undo') return json_(undoCheckin_(data));
    if (data.action === 'lookup') return json_(lookup_(data.group, data.name));
    if (data.action === 'addEmail') return json_(addEmail_(data));
    if (data.action === 'status') return json_(status_(data));
    if (data.action === 'resend') return json_(resendTicket_(data));
    saveInfo_ = {};
    const receiptId = save_(data);
    return json_({ ok: true, receiptId, merged: !!saveInfo_.merged, changedMind: !!saveInfo_.changedMind, repliedOn: saveInfo_.repliedOn || '' });
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
  const email = text(d.email, 120).toLowerCase();
  // Required on the new page; optional here so replies from older cached pages still save.
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail_('Please type a valid email for your QR ticket.');
  if (email && emailTypo_(email)) fail_('Please check the spelling of your email (for example, gmail.com).');

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
    return saveLocked_({ group, name, section, attending, payment, reason, online, proof: d.proof, requestId, fingerprint, email });
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
  ['Reference', 'Request ID', 'Reply fingerprint', 'Email', 'Ticket', 'Checked in', 'Ticket sent', 'Changed mind'].forEach((title) => {
    let column = headers.indexOf(title) + 1;
    if (!column) {
      column = headers.length + 1;
      if (column > sheet.getMaxColumns()) sheet.insertColumnsAfter(sheet.getMaxColumns(), 1);
      sheet.getRange(5, column).setValue(title).setBackground(WINE).setFontColor(CREAM).setFontWeight('bold');
      sheet.setColumnWidth(column, title === 'Reference' ? 300 : title === 'Email' ? 230 : title === 'Ticket' ? 120 : title === 'Checked in' || title === 'Ticket sent' || title === 'Changed mind' ? 200 : 180);
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
  const { group, name, section, attending, payment, reason, online, proof, requestId, fingerprint, email } = d;
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
  // Same person replying again: update their first reply instead of adding a second row.
  // Same person = same name (any order/case) or same email in this tab, e.g. "Khyme Caliradelle" vs "Khyme Clairadelle".
  const twin = findByName_(sheet, name) || findByEmail_(sheet, email);
  if (twin) return mergeReply_(sheet, columns, twin, d, safe);
  const screenshot = online ? '=HYPERLINK("' + saveScreenshot_(proof, name) + '","View")' : '';
  const receiptId = 'PH26-' + Utilities.getUuid().replace(/-/g, '').toUpperCase();
  const row = [new Date(), safe(name)];
  if (group === 'student') row.push(safe(section));
  row.push(attending ? 'Yes' : 'No', attending ? FEE[group] : '', payment, screenshot, attending ? '' : safe(reason));
  while (row.length < columns.width) row.push('');
  row[columns.Reference - 1] = receiptId;
  row[columns['Request ID'] - 1] = requestId;
  row[columns['Reply fingerprint'] - 1] = fingerprint;
  row[columns.Email - 1] = email ? safe(email) : '';
  row[columns.Ticket - 1] = attending ? ticketLink_(receiptId) : '';
  sheet.appendRow(row);
  SpreadsheetApp.flush(); // commit reply + reference together before releasing the lock
  sheet.getRange(sheet.getLastRow(), 1).setNumberFormat('mmm d, h:mm am/pm'); // appendRow resets the date style
  return receiptId;
}

/* ---------- One reply per person ----------
 * Names match ignoring case, commas, dots, initials and word order:
 * "Sabedola, Ailah Marie M." = "Ailah Marie Sabedola". */
let saveInfo_ = {};
function nameKey_(name) {
  return String(name || '').toLowerCase().replace(/[^a-z\u00c0-\u024f\s]/g, ' ').split(/\s+/)
    .filter((w) => w.length > 1).sort().join(' ');
}
function tabFor_(group) {
  const book = book_();
  return group === 'faculty' ? book.getSheetByName(FACULTY) : (book.getSheetByName(STUDENTS) || book.getSheetByName('Responses'));
}
// Returns { row, headers, values } for the first reply with the same name, or null.
function findByName_(sheet, name) {
  const key = nameKey_(name);
  if (!key || sheet.getLastRow() < 6) return null;
  const headers = sheet.getRange(5, 1, 1, sheet.getLastColumn()).getValues()[0];
  const nameCol = headers.indexOf('Name');
  const rows = sheet.getRange(6, 1, sheet.getLastRow() - 5, headers.length).getValues();
  const i = rows.findIndex((r) => nameKey_(r[nameCol]) === key);
  return i < 0 ? null : { row: 6 + i, headers, values: rows[i] };
}
function findByEmail_(sheet, email) {
  if (!email || sheet.getLastRow() < 6) return null;
  const headers = sheet.getRange(5, 1, 1, sheet.getLastColumn()).getValues()[0];
  const e = headers.indexOf('Email');
  if (e < 0) return null;
  const rows = sheet.getRange(6, 1, sheet.getLastRow() - 5, headers.length).getValues();
  const i = rows.findIndex((r) => String(r[e]).trim().toLowerCase() === email);
  return i < 0 ? null : { row: 6 + i, headers, values: rows[i] };
}
// Common email typos that would make a ticket bounce (gmail.con, gmial.com, …).
function emailTypo_(email) {
  const domain = String(email).split('@')[1] || '';
  return /\.(con|cim|cmo|comm|vom|xom)$/.test(domain) ||
    /^(gmial|gmai|gamil|gmal|gnail|gmaill|yaho|yahooo|hotmial|outlok)\./.test(domain) ||
    (/^(gmail|hotmail|outlook|icloud)\./.test(domain) && domain !== domain.split('.')[0] + '.com') ||
    (/^yahoo\./.test(domain) && !/^yahoo\.com(\.ph)?$/.test(domain));
}
function repliedOn_(value) {
  return value instanceof Date ? Utilities.formatDate(value, 'Asia/Manila', 'MMM d, h:mm a') : String(value || '');
}

// Latest reply wins, except an officer's "Paid ✓" is never undone and a saved email is never replaced.
function mergeReply_(sheet, columns, twin, d, safe) {
  const { group, attending, payment, reason, online, proof, requestId, fingerprint, email } = d;
  const at = (t) => twin.headers.indexOf(t) + 1;
  const cell = (t) => sheet.getRange(twin.row, at(t));
  const reference = twin.values[columns.Reference - 1];
  const paid = String(twin.values[at('Payment') - 1]).trim() === 'Paid ✓';
  // Someone who declined may switch to attending once. After that the reply stays "attending".
  const wasDeclined = twin.values[at('Attending') - 1] === 'No';
  const usedChance = !!String(twin.values[columns['Changed mind'] - 1] || '').trim();
  if (usedChance && !attending) fail_('You already used your one chance to change your reply. Please message an SSC officer.');
  const changedMind = wasDeclined && attending;
  // Guard other people's replies: a saved email must match, and an attending reply can't be cancelled from the site.
  const savedEmail = String(twin.values[columns.Email - 1] || '').trim().toLowerCase();
  if (savedEmail && email && savedEmail !== email) fail_('A reply with this name already uses a different email. If this is you, use that same email or message an SSC officer.');
  if (!wasDeclined && !attending) fail_('You already replied that you are attending. To cancel, please message an SSC officer.');
  if (changedMind && usedChance) fail_('You already used your one chance to change your reply. Please message an SSC officer.');
  if (email && !String(twin.values[columns.Email - 1]).trim()) sheet.getRange(twin.row, columns.Email).setValue(safe(email));
  if (!paid) {
    if (online) cell('Screenshot').setValue('=HYPERLINK("' + saveScreenshot_(proof, d.name) + '","View")');
    else cell('Screenshot').setValue('');
    cell('Attending').setValue(attending ? 'Yes' : 'No');
    cell('Contribution').setValue(attending ? FEE[group] : '');
    cell('Payment').setValue(payment);
    cell('Reason (if not attending)').setValue(attending ? '' : safe(reason));
    sheet.getRange(twin.row, columns.Ticket).setValue(attending && reference ? ticketLink_(reference) : '');
  }
  if (changedMind) sheet.getRange(twin.row, columns['Changed mind']).setValue(Utilities.formatDate(new Date(), 'Asia/Manila', 'MMM d, h:mm a') + ' · No → Yes');
  sheet.getRange(twin.row, columns['Request ID']).setValue(requestId);
  sheet.getRange(twin.row, columns['Reply fingerprint']).setValue(fingerprint);
  SpreadsheetApp.flush();
  saveInfo_ = { merged: true, changedMind, repliedOn: repliedOn_(twin.values[0]) };
  return reference;
}

/* The invitation asks this when a guest types their name, so people who replied before
 * can just add an email instead of filling the form again. Only says whether a reply exists. */
function lookup_(group, name) {
  const sheet = tabFor_(group === 'faculty' ? 'faculty' : 'student');
  const twin = sheet && findByName_(sheet, String(name || '').slice(0, 100));
  if (!twin) return { ok: true, found: false };
  const col = (t) => twin.headers.indexOf(t);
  const has = (t) => col(t) >= 0 && !!String(twin.values[col(t)]).trim();
  return {
    ok: true, found: true, hasEmail: has('Email'), repliedOn: repliedOn_(twin.values[0]),
    declined: twin.values[col('Attending')] === 'No', changedMind: has('Changed mind')
  };
}

// Adds an email to an earlier reply. Never replaces an email that is already saved.
function addEmail_(d) {
  try {
    const email = String(d.email || '').trim().toLowerCase().slice(0, 120);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail_('Please type a valid email for your QR ticket.');
    if (emailTypo_(email)) fail_('Please check the spelling of your email (for example, gmail.com).');
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(15000)) fail_('The SSC records are busy. Please try again in a moment.');
    try {
      const sheet = tabFor_(d.group === 'faculty' ? 'faculty' : 'student');
      const columns = referenceColumns_(sheet);
      const twin = findByName_(sheet, String(d.name || '').slice(0, 100));
      if (!twin) fail_('We could not find your earlier reply. Please fill in the form instead.');
      if (twin.values[twin.headers.indexOf('Attending')] === 'No') fail_('Your reply says you can’t attend. Use “Change my mind” on the invitation first.');
      if (String(twin.values[columns.Email - 1]).trim()) return { ok: true, already: true };
      sheet.getRange(twin.row, columns.Email).setValue(email);
      SpreadsheetApp.flush();
      return { ok: true, added: true };
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return { ok: false, message: err.userMessage || 'Could not save your email. Please try again.' };
  }
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

/* ---------- Officer accounts (scanner at /scanner/) ----------
 * Up to 4 officers. The President types each officer's name, username and password
 * into the "Officers" tab (rows 6 to 9). Only those 4 rows count. Keep the Sheet private. */
const OFFICERS = 'Officers', MAX_OFFICERS = 4;
function officersTab_(book) {
  book = book || book_();
  let sh = book.getSheetByName(OFFICERS);
  if (sh) return sh;
  sh = book.insertSheet(OFFICERS);
  sh.getRange(1, 1, 1, 3).merge().setValue('Panaghimamat 2026 · Scanner officers')
    .setBackground(WINE).setFontColor(CREAM).setFontWeight('bold').setFontSize(14).setHorizontalAlignment('center');
  sh.getRange(2, 1, 1, 3).merge().setValue('Up to 4 officers. Fill rows 6 to 9 only. Officers sign in to the scanner with their username and password.')
    .setFontColor(GOLD).setWrap(true);
  sh.getRange(3, 1, 1, 3).merge().setValue('Keep this Sheet private. Change a password here any time; it works on the next scan.').setFontColor(GOLD);
  sh.getRange(5, 1, 1, 3).setValues([['Name (shown in attendance)', 'Username', 'Password']])
    .setBackground(WINE).setFontColor(CREAM).setFontWeight('bold');
  sh.getRange(6, 1, MAX_OFFICERS, 3).setBackground(PAPER).setNumberFormat('@');
  [220, 160, 160].forEach((w, i) => sh.setColumnWidth(i + 1, w));
  sh.setFrozenRows(5);
  return sh;
}
// Returns { name, username } or throws. Wrong passwords lock that username for 10 minutes after 8 tries.
function officerLogin_(d) {
  const user = String(d.user || '').trim().toLowerCase().slice(0, 40);
  const pass = String(d.pass || '').slice(0, 80);
  if (!user || !pass) fail_('Please sign in with your officer username and password.');
  const cache = CacheService.getScriptCache();
  const key = 'officer_fail:' + user;
  const fails = Number(cache.get(key) || 0);
  if (fails >= 8) fail_('Too many wrong passwords. Wait 10 minutes or ask the President.');
  const rows = officersTab_().getRange(6, 1, MAX_OFFICERS, 3).getValues();
  const hit = rows.find((r) => String(r[1]).trim().toLowerCase() === user && String(r[2]) !== '' && String(r[2]) === pass);
  if (!hit) {
    cache.put(key, String(fails + 1), 600);
    fail_(rows.some((r) => String(r[1]).trim()) ? 'Wrong username or password.' : 'No officer accounts yet. The President adds them in the Officers tab of the Sheet.');
  }
  return { name: String(hit[0]).trim().replace(/\s+/g, ' ').slice(0, 40) || user, username: user };
}

function officer_(d) {
  try {
    const who = officerLogin_(d);
    return { ok: true, officer: who.name, stats: checkinStats_() };
  } catch (err) {
    return { ok: false, message: err.userMessage || 'Could not sign in.' };
  }
}

/* ---------- Attendance tabs ----------
 * One tab for students, one for faculty. Each check-in adds a row with the time; an undo marks it void. */
const ATTENDANCE = { student: 'Attendance · Students', faculty: 'Attendance · Faculty' };
function attendanceTab_(group, book) {
  book = book || book_();
  let sh = book.getSheetByName(ATTENDANCE[group]);
  if (sh) return sh;
  sh = book.insertSheet(ATTENDANCE[group]);
  const student = group === 'student';
  const headers = student ? ['Time in', 'Name', 'Year & Section', 'Scanned by', 'How', 'Status', 'Ticket ref']
    : ['Time in', 'Name', 'Scanned by', 'How', 'Status', 'Ticket ref'];
  const n = headers.length, status = String.fromCharCode(64 + headers.indexOf('Status') + 1);
  sh.getRange(1, 1, 1, n).merge().setValue('Panaghimamat 2026 · Attendance · ' + (student ? 'Students' : 'Faculty'))
    .setBackground(WINE).setFontColor(CREAM).setFontWeight('bold').setFontSize(14).setHorizontalAlignment('center');
  sh.getRange(2, 1, 1, 2).setValues([['PRESENT', 'VOIDED']]).setFontColor(GOLD).setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange(3, 1, 1, 2).setFormulas([[`=COUNTIF(${status}6:${status},"Present")`, `=COUNTIF(${status}6:${status},"Void*")`]])
    .setFontColor(WINE).setFontWeight('bold').setFontSize(14).setHorizontalAlignment('center');
  sh.getRange(5, 1, 1, n).setValues([headers]).setBackground(WINE).setFontColor(CREAM).setFontWeight('bold');
  (student ? [140, 230, 120, 150, 110, 200, 300] : [140, 230, 150, 110, 200, 300]).forEach((w, i) => sh.setColumnWidth(i + 1, w));
  sh.setFrozenRows(5);
  return sh;
}
function logAttendance_(guest, ref, by, how) {
  const sh = attendanceTab_(guest.group);
  const row = [new Date(), guest.name];
  if (guest.group === 'student') row.push(guest.section);
  row.push(by, how, 'Present', ref);
  sh.appendRow(row);
  sh.getRange(sh.getLastRow(), 1).setNumberFormat('mmm d, h:mm am/pm');
}
function voidAttendance_(group, ref, by) {
  const sh = attendanceTab_(group);
  if (sh.getLastRow() < 6) return;
  const headers = sh.getRange(5, 1, 1, sh.getLastColumn()).getValues()[0];
  const st = headers.indexOf('Status'), rf = headers.indexOf('Ticket ref');
  const rows = sh.getRange(6, 1, sh.getLastRow() - 5, headers.length).getValues();
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i][rf] === ref && rows[i][st] === 'Present') {
      sh.getRange(6 + i, st + 1).setValue('Void · undone by ' + by + ' · ' + Utilities.formatDate(new Date(), 'Asia/Manila', 'h:mm a'));
      return;
    }
  }
}

function checkinStats_() {
  const book = book_();
  const stats = { paid: 0, inside: 0, student: { paid: 0, inside: 0 }, faculty: { paid: 0, inside: 0 } };
  [[book.getSheetByName(STUDENTS) || book.getSheetByName('Responses'), 'student'], [book.getSheetByName(FACULTY), 'faculty']].forEach(([sheet, group]) => {
    if (!sheet || sheet.getLastRow() < 6) return;
    const headers = sheet.getRange(5, 1, 1, sheet.getLastColumn()).getValues()[0];
    const rows = sheet.getRange(6, 1, sheet.getLastRow() - 5, headers.length).getValues();
    const pay = headers.indexOf('Payment'), chk = headers.indexOf('Checked in');
    rows.forEach((r) => {
      if (String(r[pay]).trim() === 'Paid ✓') { stats.paid++; stats[group].paid++; }
      if (chk >= 0 && String(r[chk]).trim()) { stats.inside++; stats[group].inside++; }
    });
  });
  return stats;
}

function checkin_(d) {
  try {
    const who = officerLogin_(d);
    const ref = String(d.ref || '').trim().toUpperCase().replace(/^.*REF=/, '');
    if (!/^PH26-[A-F0-9]{32}$/.test(ref)) return { ok: true, result: 'invalid', message: 'This is not a Panaghimamat ticket.' };
    const officer = who.name + (d.manual ? ' (from list)' : '');
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(15000)) fail_('Busy. Scan again.');
    try {
      const book = book_();
      const tabs = [[book.getSheetByName(STUDENTS) || book.getSheetByName('Responses'), 'student'], [book.getSheetByName(FACULTY), 'faculty']];
      for (const [sheet, group] of tabs) {
        if (!sheet || sheet.getLastRow() < 6) continue;
        const columns = referenceColumns_(sheet);
        const hit = findReply_(sheet, columns.Reference, ref);
        if (!hit) continue;
        const headers = sheet.getRange(5, 1, 1, sheet.getLastColumn()).getValues()[0];
        const row = sheet.getRange(hit.getRow(), 1, 1, headers.length).getValues()[0];
        const get = (t) => (headers.indexOf(t) >= 0 ? row[headers.indexOf(t)] : '');
        const guest = { name: String(get('Name')), section: String(get('Year & Section') || ''), group };
        if (get('Attending') !== 'Yes') return { ok: true, result: 'declined', guest, message: 'This reply said they are not attending.' };
        if (String(get('Payment')).trim() !== 'Paid ✓') return { ok: true, result: 'unpaid', guest, message: 'Payment is not verified yet (' + get('Payment') + ').' };
        const already = String(get('Checked in')).trim();
        if (already) return { ok: true, result: 'used', guest, message: 'Already checked in: ' + already, stats: checkinStats_() };
        const stamp = Utilities.formatDate(new Date(), 'Asia/Manila', 'MMM d, h:mm a') + ' · ' + officer;
        sheet.getRange(hit.getRow(), columns['Checked in']).setValue(stamp);
        logAttendance_(guest, ref, who.name, d.manual ? 'From list' : 'QR scan');
        SpreadsheetApp.flush();
        return { ok: true, result: 'admitted', guest, ref, message: 'Checked in ' + stamp, stats: checkinStats_() };
      }
      return { ok: true, result: 'invalid', message: 'No reply has this ticket. Check the name in the Sheet.' };
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return { ok: false, message: err.userMessage || 'Could not check in. Try again.' };
  }
}

/* ---------- Ticket emails ----------
 * Every 5 minutes: each guest marked "Paid ✓" who is attending, has an email and no "Ticket sent" yet
 * gets their QR ticket by email. To send one again, clear that guest's "Ticket sent" cell.
 * Sent from the Google account that runs this script. */
const EVENT_LINE = 'Friday, October 23, 2026 · 1:00 – 5:00 PM';
const VENUE_LINE = 'Regidor Country Homes, Carnai, Valencia City';

function setupTicketEmails() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'sendPendingTickets')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendPendingTickets').timeBased().everyMinutes(5).create();
  const sent = sendPendingTickets();
  Logger.log('Ticket emails are on (every 5 minutes). Sent now: ' + sent + '. Emails left today: ' + MailApp.getRemainingDailyQuota());
}

function sendPendingTickets() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return 0; // a save or another run is busy; the next run catches up
  let sent = 0;
  try {
    const book = book_();
    const tabs = [[book.getSheetByName(STUDENTS) || book.getSheetByName('Responses'), 'student'], [book.getSheetByName(FACULTY), 'faculty']];
    for (const [sheet, group] of tabs) {
      if (!sheet || sheet.getLastRow() < 6) continue;
      const columns = referenceColumns_(sheet);
      const headers = sheet.getRange(5, 1, 1, sheet.getLastColumn()).getValues()[0];
      const rows = sheet.getRange(6, 1, sheet.getLastRow() - 5, headers.length).getValues();
      const at = (t) => headers.indexOf(t);
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const ref = String(r[at('Reference')]).trim();
        const email = String(r[at('Email')]).trim().toLowerCase();
        if (String(r[at('Payment')]).trim() !== 'Paid ✓' || r[at('Attending')] !== 'Yes') continue;
        if (String(r[at('Ticket sent')]).trim() || !/^PH26-[A-F0-9]{32}$/.test(ref) || !email) continue;
        const cell = sheet.getRange(6 + i, columns['Ticket sent']);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { cell.setValue('Not sent · check email'); continue; }
        if (MailApp.getRemainingDailyQuota() < 1) return sent; // Gmail daily limit reached; continues tomorrow
        const guest = { name: String(r[at('Name')]).trim(), section: at('Year & Section') >= 0 ? String(r[at('Year & Section')]).trim() : '', group, reference: ref };
        try {
          MailApp.sendEmail(ticketEmail_(guest, email));
          cell.setValue(Utilities.formatDate(new Date(), 'Asia/Manila', 'MMM d, h:mm a') + ' → ' + email);
          sent++;
        } catch (err) {
          cell.setValue('Not sent · check email');
        }
        SpreadsheetApp.flush();
      }
    }
  } finally {
    lock.releaseLock();
  }
  return sent;
}

function qrBlob_(ref) {
  const qr = qrcode(0, 'M');
  qr.addData(ref);
  qr.make();
  const data = qr.createDataURL(8, 4).split(',')[1];
  return Utilities.newBlob(Utilities.base64Decode(data), 'image/gif', 'Panaghimamat-ticket-QR.gif');
}

function ticketEmail_(g, email) {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const first = g.name.split(' ')[0] || g.name;
  const who = g.group === 'faculty' ? 'Faculty' : (g.section ? 'Student · ' + g.section : 'Student');
  const link = SITE + 'ticket/?ref=' + g.reference;
  const qr = qrBlob_(g.reference);
  const html =
    '<div style="background:#5c121c;padding:24px 12px;font-family:Georgia,serif">' +
    '<div style="max-width:460px;margin:0 auto;background:#fffaf2;border:1px solid #9b7536;border-radius:6px;padding:28px 24px;text-align:center;color:#3a2a1e">' +
    '<p style="margin:0;font-size:12px;letter-spacing:3px;color:#9b7536">STI COLLEGE VALENCIA · SUPREME STUDENT COUNCIL</p>' +
    '<h1 style="margin:14px 0 4px;font-size:26px;font-weight:normal;color:#5c121c">Panaghimamat 2026</h1>' +
    '<p style="margin:0 0 18px;font-style:italic">Teachers’ Day Celebration</p>' +
    '<p style="margin:0 0 16px;text-align:left">Hi ' + esc(first) + ',<br>Your payment is verified. Here is your ticket.</p>' +
    '<img src="cid:qr" width="240" height="240" alt="Your ticket QR code" style="display:block;margin:0 auto;width:240px;height:240px;image-rendering:pixelated">' +
    '<p style="margin:12px 0 2px;font-size:20px;color:#5c121c">' + esc(g.name) + '</p>' +
    '<p style="margin:0 0 16px;color:#7a6650">' + esc(who) + '</p>' +
    '<p style="margin:0;font-size:15px">' + EVENT_LINE + '<br>' + VENUE_LINE + '</p>' +
    '<p style="margin:18px 0;padding:12px;background:#f6ecdc;border-radius:4px;font-size:14px;text-align:left">' +
    'Show this QR at the entrance. An SSC officer will scan it. It admits one person, once, so please don’t share it.<br><br>' +
    '<b>No phone on the day?</b> A friend’s phone can show your QR, but <b>you must be there in person</b> when it is scanned. ' +
    'A ticket scanned for someone who is not there is void.</p>' +
    '<a href="' + link + '" style="display:inline-block;background:#5c121c;color:#f6ead6;text-decoration:none;padding:10px 20px;border-radius:4px">Open your ticket online</a>' +
    '<p style="margin:18px 0 0;font-size:11px;color:#9b8a74">Reference ' + g.reference + '</p>' +
    '</div></div>';
  const body = 'Hi ' + first + ',\n\nYour payment is verified. Your Panaghimamat 2026 QR ticket is attached.\n\n' +
    g.name + ' · ' + who + '\n' + EVENT_LINE + '\n' + VENUE_LINE + '\n\n' +
    'Show the QR at the entrance. It admits one person, once.\n' +
    'No phone on the day? A friend\u2019s phone can show your QR, but you must be there in person when it is scanned. A ticket scanned for someone who is not there is void.\n' +
    'Open your ticket online: ' + link + '\n\nSTI College Valencia · Supreme Student Council';
  return {
    to: email, name: 'STI SSC Valencia', subject: 'Your Panaghimamat 2026 ticket',
    body, htmlBody: html, inlineImages: { qr }, attachments: [qr.copyBlob()]
  };
}

/* ---------- Status check (/status/) ----------
 * A guest types the email from their reply and sees where it stands.
 * Only a short name is shown, and a resent ticket always goes to that same email. */
function repliesByEmail_(email) {
  const found = [];
  const book = book_();
  [[book.getSheetByName(STUDENTS) || book.getSheetByName('Responses'), 'student'], [book.getSheetByName(FACULTY), 'faculty']].forEach(([sheet, group]) => {
    if (!sheet || sheet.getLastRow() < 6) return;
    const headers = sheet.getRange(5, 1, 1, sheet.getLastColumn()).getValues()[0];
    const e = headers.indexOf('Email');
    if (e < 0) return;
    sheet.getRange(6, 1, sheet.getLastRow() - 5, headers.length).getValues().forEach((r, i) => {
      if (String(r[e]).trim().toLowerCase() === email) found.push({ sheet, group, headers, row: 6 + i, values: r });
    });
  });
  return found;
}
function cleanEmail_(v) {
  const email = String(v || '').trim().toLowerCase().slice(0, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail_('Please type the email you used in your reply.');
  return email;
}
function shortName_(name) {
  const parts = String(name).replace(/,/g, ' ').trim().split(/\s+/);
  if (String(name).includes(',')) return (parts[1] || '') + ' ' + (parts[0] || '').charAt(0) + '.'; // "Sabedola, Ailah" → "Ailah S."
  return parts[0] + (parts.length > 1 ? ' ' + parts[parts.length - 1].charAt(0) + '.' : '');
}

function status_(d) {
  try {
    const email = cleanEmail_(d.email);
    const replies = repliesByEmail_(email).map(({ group, headers, values }) => {
      const get = (t) => (headers.indexOf(t) >= 0 ? values[headers.indexOf(t)] : '');
      const payment = String(get('Payment')).trim();
      const attending = get('Attending') === 'Yes';
      const stage = !attending ? 'declined' : payment === 'Paid ✓' ? 'verified' : /screenshot/.test(payment) ? 'checking' : 'unpaid';
      return {
        group, name: shortName_(get('Name')), section: String(get('Year & Section') || ''),
        repliedOn: repliedOn_(get('Date')), attending, stage,
        method: /GCash/.test(payment) ? 'GCash' : /GoTyme/.test(payment) ? 'GoTyme' : attending ? 'Cash' : '',
        ticketSent: /→/.test(String(get('Ticket sent'))) ? String(get('Ticket sent')).split('→')[0].trim() : '',
        checkedIn: !!String(get('Checked in')).trim()
      };
    });
    return { ok: true, found: replies.length > 0, replies };
  } catch (err) {
    return { ok: false, message: err.userMessage || 'Could not check your status. Please try again.' };
  }
}

// Sends the ticket again, only to the email saved in the reply. Once per 30 minutes per email.
function resendTicket_(d) {
  try {
    const email = cleanEmail_(d.email);
    const cache = CacheService.getScriptCache();
    if (cache.get('resend:' + email)) fail_('Your ticket was just sent. Please wait 30 minutes before asking again, and check Spam.');
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(15000)) fail_('Busy. Please try again in a moment.');
    let sent = 0;
    try {
      repliesByEmail_(email).forEach(({ sheet, group, headers, row, values }) => {
        const get = (t) => (headers.indexOf(t) >= 0 ? values[headers.indexOf(t)] : '');
        if (String(get('Payment')).trim() !== 'Paid ✓' || get('Attending') !== 'Yes') return;
        const ref = String(get('Reference')).trim();
        if (!/^PH26-[A-F0-9]{32}$/.test(ref)) return;
        if (MailApp.getRemainingDailyQuota() < 1) fail_('Too many emails today. Please try again tomorrow or ask an SSC officer.');
        MailApp.sendEmail(ticketEmail_({ name: String(get('Name')).trim(), section: String(get('Year & Section') || '').trim(), group, reference: ref }, email));
        if (headers.indexOf('Ticket sent') >= 0) sheet.getRange(row, headers.indexOf('Ticket sent') + 1).setValue(Utilities.formatDate(new Date(), 'Asia/Manila', 'MMM d, h:mm a') + ' → ' + email);
        sent++;
      });
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }
    if (!sent) fail_('Your ticket is sent once your payment is verified.');
    cache.put('resend:' + email, '1', 1800);
    return { ok: true, sent };
  } catch (err) {
    return { ok: false, message: err.userMessage || 'Could not send your ticket. Please try again.' };
  }
}

/* ---------- Attendance list (scanner) ----------
 * Officers see every paid, attending guest and who is inside. Signed-in officers only. */
function attendance_(d) {
  try {
    officerLogin_(d);
    const book = book_();
    const guests = [];
    [[book.getSheetByName(STUDENTS) || book.getSheetByName('Responses'), 'student'], [book.getSheetByName(FACULTY), 'faculty']].forEach(([sheet, group]) => {
      if (!sheet || sheet.getLastRow() < 6) return;
      const headers = sheet.getRange(5, 1, 1, sheet.getLastColumn()).getValues()[0];
      const at = (t) => headers.indexOf(t);
      sheet.getRange(6, 1, sheet.getLastRow() - 5, headers.length).getValues().forEach((r) => {
        if (r[at('Attending')] !== 'Yes' || String(r[at('Payment')]).trim() !== 'Paid ✓') return;
        guests.push({
          name: String(r[at('Name')]).trim(), group, section: at('Year & Section') >= 0 ? String(r[at('Year & Section')]).trim() : '',
          ref: String(r[at('Reference')]).trim(), checkedIn: at('Checked in') >= 0 ? String(r[at('Checked in')]).trim() : ''
        });
      });
    });
    guests.sort((a, b) => a.name.localeCompare(b.name));
    return { ok: true, guests, stats: checkinStats_() };
  } catch (err) {
    return { ok: false, message: err.userMessage || 'Could not load the list. Try again.' };
  }
}

// Undo a check-in (wrong person scanned, or the ticket owner was not there). The real owner can then be scanned.
function undoCheckin_(d) {
  try {
    const who = officerLogin_(d);
    const ref = String(d.ref || '').trim().toUpperCase();
    if (!/^PH26-[A-F0-9]{32}$/.test(ref)) fail_('This is not a Panaghimamat ticket.');
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(15000)) fail_('Busy. Try again.');
    try {
      const book = book_();
      for (const [sheet, group] of [[book.getSheetByName(STUDENTS) || book.getSheetByName('Responses'), 'student'], [book.getSheetByName(FACULTY), 'faculty']]) {
        if (!sheet || sheet.getLastRow() < 6) continue;
        const columns = referenceColumns_(sheet);
        const hit = findReply_(sheet, columns.Reference, ref);
        if (!hit) continue;
        sheet.getRange(hit.getRow(), columns['Checked in']).setValue('');
        voidAttendance_(group, ref, who.name);
        SpreadsheetApp.flush();
        return { ok: true, stats: checkinStats_() };
      }
      fail_('No reply has this ticket.');
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return { ok: false, message: err.userMessage || 'Could not undo. Try again.' };
  }
}
