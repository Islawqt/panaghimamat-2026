/**
 * STI College Valencia — Panaghimamat 2026 RSVP and contribution tracker
 * OWNER SETUP: run setupPanaghimamat() once in your OWN Google Apps Script account.
 * Deploy as a web app: Execute as Me; Who has access: Anyone.
 * Privacy: keep the created sheet and proof folder restricted to authorized SSC staff.
 * No banking credentials, service-account keys or private data belong in the public website.
 */
const EVENT = Object.freeze({
  title: 'Panaghimamat 2026 — STI College Valencia',
  expectedOrigin: 'https://islawqt.github.io',
  timezone: 'Asia/Manila',
  amount: Object.freeze({Student: 550, Faculty: 400}),
  headings: ['Submitted at (PH)','Acknowledgment ID','Full name','Program / Department',
    'Attendance','Contribution (PHP)','Payment method','Payment status',
    'Transaction reference','Proof URL (private)','Verified by','SSC notes',
    'Browser submitted at','Submission nonce']
});

function setupPanaghimamat() {
  const p = PropertiesService.getScriptProperties();
  if (p.getProperty('SHEET_ID')) {
    const old = SpreadsheetApp.openById(p.getProperty('SHEET_ID'));
    Logger.log('Already initialized — sheet: ' + old.getUrl());
    return { spreadsheetUrl: old.getUrl(), folderId: p.getProperty('PROOF_FOLDER_ID') };
  }
  const book = SpreadsheetApp.create('STI College Valencia — Panaghimamat 2026 | SSC RSVP & Contributions');
  book.setSpreadsheetTimeZone(EVENT.timezone);
  const dashboard = book.getSheets()[0].setName('Dashboard');
  const students = book.insertSheet('Students');
  const faculty = book.insertSheet('Faculty');
  const guide = book.insertSheet('SSC Guide');
  styleRecords_(students, '#204438');
  styleRecords_(faculty, '#394F72');
  styleDashboard_(dashboard);
  styleGuide_(guide);
  const proofFolder = DriveApp.createFolder('Panaghimamat 2026 — PRIVATE Payment Proofs');
  p.setProperties({SHEET_ID:book.getId(),PROOF_FOLDER_ID:proofFolder.getId(),ALLOWED_ORIGIN:EVENT.expectedOrigin});
  Logger.log('COPY SHEET LINK: ' + book.getUrl());
  Logger.log('PRIVATE PROOF FOLDER: ' + proofFolder.getUrl());
  return { spreadsheetUrl: book.getUrl(), proofFolderUrl: proofFolder.getUrl() };
}

function styleRecords_(sheet, dark) {
  sheet.clear();
  sheet.getRange(1,1,1,EVENT.headings.length).setValues([EVENT.headings]);
  sheet.getRange(1,1,1,14).setBackground(dark).setFontColor('#F9F4E8')
    .setFontWeight('bold').setFontSize(10).setVerticalAlignment('middle');
  sheet.setRowHeight(1,46);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(3);
  sheet.getRange(1,1,1000,14).createFilter();
  sheet.setColumnWidths(1,1,165);sheet.setColumnWidths(2,1,190);
  sheet.setColumnWidths(3,1,180);sheet.setColumnWidths(4,1,170);
  sheet.setColumnWidths(5,1,132);sheet.setColumnWidths(6,1,140);
  sheet.setColumnWidths(7,1,135);sheet.setColumnWidths(8,1,190);
  sheet.setColumnWidths(9,1,190);sheet.setColumnWidths(10,1,240);
  sheet.setColumnWidths(11,1,150);sheet.setColumnWidths(12,1,200);
  sheet.setColumnWidths(13,1,185);sheet.setColumnWidths(14,1,250);
  sheet.getRange('A:A').setNumberFormat('mmm d, yyyy h:mm AM/PM');
  sheet.getRange('F:F').setNumberFormat('"₱"#,##0.00');
  sheet.getRange('E2:E1000').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['Attending','Not attending'],true).build());
  sheet.getRange('H2:H1000').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['Cash — to collect','Online — pending verification','Verified — paid','Not required','Payment declined / disputed'],true).build());
  sheet.getRange('K2:K1000').setBackground('#FFF6DA');
  sheet.getRange('L2:L1000').setBackground('#FFF6DA');
  const statuses = [
    ['Verified — paid','#E4F3E9','#205C3A'],
    ['Online — pending verification','#FFF0D3','#7A5218'],
    ['Cash — to collect','#E8EFF8','#32517A'],
    ['Payment declined / disputed','#FCE8E5','#842F2A']
  ];
  const rules = statuses.map(([status,bg,fg]) => SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo(status).setBackground(bg).setFontColor(fg).setRanges([sheet.getRange('H2:H1000')]).build());
  sheet.setConditionalFormatRules(rules);
  sheet.getRange('A2:N1000').setVerticalAlignment('middle');
  sheet.setTabColor(dark);
}

function styleDashboard_(sheet) {
  sheet.clear();sheet.setHiddenGridlines(true);sheet.setTabColor('#B69A62');
  sheet.setColumnWidths(1,1,35);sheet.setColumnWidths(2,1,215);
  sheet.setColumnWidths(3,4,148);sheet.setColumnWidths(7,1,38);
  sheet.getRange('B2:F3').merge().setValue('PANAGHIMAMAT 2026')
    .setBackground('#173C30').setFontColor('#F7F2E7').setFontFamily('Georgia')
    .setFontSize(24).setFontWeight('bold').setVerticalAlignment('middle');
  sheet.setRowHeight(2,35);sheet.setRowHeight(3,35);
  sheet.getRange('B4:F4').merge().setValue('STI College Valencia  •  Teachers’ Day & Acquaintance Celebration  •  22 OCT 2026')
    .setBackground('#E9E5D8').setFontColor('#29493A').setFontSize(10);
  sheet.getRange('B6:F6').setValues([['METRIC','STUDENTS','FACULTY','COMBINED','']]);
  sheet.getRange('B6:F6').setBackground('#B89A63').setFontColor('#FFFFFF').setFontWeight('bold');
  const metrics = [
    ['Total responses', '=COUNTA(Students!B2:B)', '=COUNTA(Faculty!B2:B)', '=SUM(C7:D7)', ''],
    ['Attending', '=COUNTIF(Students!E2:E,"Attending")', '=COUNTIF(Faculty!E2:E,"Attending")', '=SUM(C8:D8)', ''],
    ['Not attending', '=COUNTIF(Students!E2:E,"Not attending")', '=COUNTIF(Faculty!E2:E,"Not attending")', '=SUM(C9:D9)', ''],
    ['Online pending', '=COUNTIF(Students!H2:H,"Online — pending verification")', '=COUNTIF(Faculty!H2:H,"Online — pending verification")', '=SUM(C10:D10)', ''],
    ['Cash to collect', '=COUNTIF(Students!H2:H,"Cash — to collect")', '=COUNTIF(Faculty!H2:H,"Cash — to collect")', '=SUM(C11:D11)', ''],
    ['Verified paid', '=COUNTIF(Students!H2:H,"Verified — paid")', '=COUNTIF(Faculty!H2:H,"Verified — paid")', '=SUM(C12:D12)', ''],
    ['Confirmed collections (₱)', '=SUMIF(Students!H2:H,"Verified — paid",Students!F2:F)', '=SUMIF(Faculty!H2:H,"Verified — paid",Faculty!F2:F)', '=SUM(C13:D13)', ''],
    ['Outstanding pledges (₱)', '=SUMIFS(Students!F2:F,Students!E2:E,"Attending",Students!H2:H,"<>Verified — paid")', '=SUMIFS(Faculty!F2:F,Faculty!E2:E,"Attending",Faculty!H2:H,"<>Verified — paid")', '=SUM(C14:D14)', '']
  ];
  sheet.getRange('B7:B14').setValues(metrics.map(row=>[row[0]]));
  sheet.getRange('C7:E14').setFormulas(metrics.map(row=>row.slice(1,4)));
  sheet.getRange('B7:E14').setBackground('#FCFAF4').setFontColor('#213F32');
  sheet.getRange('B8:E8').setBackground('#E6F1E7');
  sheet.getRange('B12:E12').setBackground('#E6F1E7');
  sheet.getRange('B13:E13').setBackground('#F3ECD6');
  sheet.getRange('C13:E14').setNumberFormat('"₱"#,##0.00');
  sheet.getRange('B16:F16').merge().setValue('PAYMENT STATUS IS MANUAL — receiving a screenshot is not proof of settled funds.')
    .setBackground('#F3E5C8').setFontColor('#6B4B1C').setFontWeight('bold').setWrap(true);
  sheet.setRowHeight(16,40);
  sheet.getRange('B18:F18').merge().setValue('Only mark “Verified — paid” after the SSC confirms the actual cash or transfer in the receiving account.')
    .setFontColor('#4E6555').setWrap(true);
}

function styleGuide_(sheet) {
  sheet.clear();sheet.setHiddenGridlines(true);sheet.setTabColor('#BEA568');
  sheet.setColumnWidth(1,45);sheet.setColumnWidth(2,300);sheet.setColumnWidth(3,610);
  sheet.getRange('B2:C2').merge().setValue('SSC • OPERATIONS GUIDE')
    .setBackground('#173C30').setFontColor('#FFF8E9').setFontSize(20).setFontWeight('bold');
  const rows = [
    ['Purpose','Private RSVP and contribution register for both Teachers’ Day and Panaghimamat 2026.'],
    ['Students','₱550 each. New responses arrive automatically on the Students tab.'],
    ['Faculty','₱400 each. New responses arrive automatically on the Faculty tab.'],
    ['Cash','“Cash — to collect” means NOT paid; verify cash and update status manually.'],
    ['GCash / bank','“Online — pending verification” means a screenshot was submitted, NOT that payment cleared.'],
    ['Payment verification','Check the official receiving account and transaction reference. Only after confirmation set Status to “Verified — paid”.'],
    ['Payment screenshots','Stored in a PRIVATE Google Drive folder. Do not publicly share URLs or change the folder’s visibility.'],
    ['Privacy','Limit access to authorized SSC staff. Use records only for event coordination, collection tracking and verification.'],
    ['Editing','Do not modify the submitted response ID, nonce, screenshot URL or personally identifiable data unless correcting an error.'],
    ['Event','Thursday, October 22, 2026 · Regidor Country Homes · time to be announced.'],
    ['Contribution period','October 7–19, 2026 · SSC Treasurer Ms. Jhodel Aranas.'],
    ['Publisher','Owned and administered by the SSC via the Google account that deploys this Apps Script.']
  ];
  sheet.getRange(4,2,rows.length,2).setValues(rows);
  sheet.getRange(4,2,rows.length,1).setFontWeight('bold').setBackground('#E9EEE7');
  sheet.getRange(4,3,rows.length,1).setBackground('#FBFAF5');
  sheet.getRange(4,2,rows.length,2).setWrap(true).setVerticalAlignment('middle');
  rows.forEach((_,i)=>sheet.setRowHeight(i+4,50));
}

function doGet() {
  return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><p>Panaghimamat RSVP endpoint is active. Use the invitation form to submit.</p>');
}

function doPost(e) {
  let nonce = '';
  try {
    const raw = e && e.parameter && e.parameter.payload;
    if (!raw || raw.length > 4 * 1024 * 1024) throw Error('Submission is missing or too large.');
    const d = JSON.parse(raw);
    nonce = String(d.nonce||'');
    const result = saveSubmission_(d);
    return reply_({type:'PANAGHIMAMAT_SUBMISSION',nonce,ok:true,receiptId:result.receiptId});
  } catch (ex) {
    return reply_({type:'PANAGHIMAMAT_SUBMISSION',nonce,ok:false,message:'Unable to record this submission. Please contact the SSC or try again.'});
  }
}

function saveSubmission_(d) {
  const p = PropertiesService.getScriptProperties();
  const sheetId = p.getProperty('SHEET_ID'), folderId = p.getProperty('PROOF_FOLDER_ID');
  if (!sheetId || !folderId) throw Error('SSC has not completed setup.');
  const text = (value,max) => String(value == null ? '' : value).trim().replace(/\s+/g,' ').slice(0,max);
  if (text(d.website,100)) throw Error('Automated submission');
  const nonce = text(d.nonce,64);
  if (!/^[a-f0-9]{32}$/.test(nonce)) throw Error('Bad nonce');
  const fullName = text(d.fullName,100);
  const role = text(d.role,20);
  const affiliation = text(d.affiliation,100);
  const attendance = text(d.attendance,30);
  const method = text(d.paymentMethod,30);
  const transactionRef = text(d.transactionRef,80);
  if (fullName.length < 2 || !affiliation || !['Student','Faculty'].includes(role) ||
      !['Attending','Not attending'].includes(attendance)) throw Error('Invalid response');
  const attending = attendance === 'Attending';
  const allowedMethods = ['Cash','GCash','Bank Transfer'];
  if ((attending && !allowedMethods.includes(method)) || (!attending && method !== 'Not applicable')) throw Error('Invalid payment');
  const online = attending && ['GCash','Bank Transfer'].includes(method);
  if (online && !transactionRef) throw Error('Missing transfer reference');
  if (!!d.proof !== online) throw Error('Missing or unexpected proof');
  // Recalculate the fee on the server. Never trust a submitted amount.
  const amount = attending ? EVENT.amount[role] : 0;
  const status = !attending ? 'Not required' : online ? 'Online — pending verification' : 'Cash — to collect';
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw Error('Busy');
  let uploaded = null;
  try {
    const book = SpreadsheetApp.openById(sheetId);
    const sheet = book.getSheetByName(role === 'Student' ? 'Students':'Faculty');
    if (!sheet) throw Error('Missing tab');
    // Make a duplicate submission idempotent, even if the browser retries.
    const existing = sheet.getRange('N2:N' + Math.max(2,sheet.getLastRow())).createTextFinder(nonce).matchEntireCell(true).findNext();
    if (existing) return {receiptId:sheet.getRange(existing.getRow(),2).getDisplayValue()};
    let proofUrl = '';
    if (online) {
      const proof = d.proof;
      if (!proof || !['image/jpeg','image/png','image/webp'].includes(proof.mime) ||
          typeof proof.base64 !== 'string' || proof.base64.length > 2.8*1024*1024) throw Error('Invalid proof');
      const blobBytes = Utilities.base64Decode(proof.base64);
      if (blobBytes.length > 2*1024*1024) throw Error('Too large');
      // Images are stored in the restricted proof folder; no public links or sharing permissions.
      const extension = proof.mime === 'image/png' ? 'png' : proof.mime === 'image/webp' ? 'webp' : 'jpg';
      const blob = Utilities.newBlob(blobBytes,proof.mime,'proof-'+nonce+'.'+extension);
      uploaded = DriveApp.getFolderById(folderId).createFile(blob);
      proofUrl = uploaded.getUrl();
    }
    const receiptId = 'PH26-' + Utilities.getUuid().slice(0,8).toUpperCase();
    // Prevent user-provided spreadsheet formula injection.
    const plain = s => /^[=+\-@\t\r]/.test(String(s)) ? "'"+s : s;
    sheet.appendRow([new Date(), receiptId, plain(fullName),plain(affiliation),attendance, amount,method,
      status,plain(transactionRef),proofUrl,'','',plain(text(d.clientDate,60)),nonce]);
    const row=sheet.getLastRow();
    sheet.getRange(row,1,1,14).setBackground(row%2===0?'#FCFCF8':'#F1F4EE');
    sheet.getRange(row,6).setNumberFormat('"₱"#,##0.00');
    sheet.getRange(row,1).setNumberFormat('mmm d, yyyy h:mm AM/PM');
    sheet.getRange(row,11,1,2).setBackground('#FFF6DA');
    return {receiptId};
  } catch (ex) {
    if (uploaded) { try {uploaded.setTrashed(true);} catch(ignore) {} }
    throw ex;
  } finally {lock.releaseLock();}
}

function reply_(data) {
  const origin=PropertiesService.getScriptProperties().getProperty('ALLOWED_ORIGIN')||EVENT.expectedOrigin;
  // A cross-origin frame can deliver a result only via postMessage; do not include PII in response.
  const out = '<!doctype html><meta charset="utf-8"><script>'+
    'window.top.postMessage(' + JSON.stringify(data).replace(/</g,'\\u003c') + ',' + JSON.stringify(origin) + ');'+
    '</script><p>Response processed. You may return to the invitation.</p>';
  return HtmlService.createHtmlOutput(out)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .setTitle('Submission response');
}
