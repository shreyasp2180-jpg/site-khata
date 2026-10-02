/**
 * SITE KHATA — Google Sheets connector
 * ------------------------------------
 * Paste this whole file into your Google Sheet: Extensions → Apps Script.
 * 1. Change the PIN below to your own secret (6+ digits or letters).
 * 2. Click Save, choose the function "setup" in the toolbar and click Run.
 *    Allow the permissions Google asks for (it's your own script).
 * 3. Deploy → New deployment → type "Web app"
 *      Execute as: Me      Who has access: Anyone
 *    Copy the Web app URL and paste it into the Site Khata app with your PIN.
 *
 * Your data stays in this Sheet ("Projects" and "Entries" tabs) and receipt
 * photos go to a Drive folder called "Site Khata receipts".
 */

const PIN = 'CHANGE-ME';

const PROJECT_COLS = [
  ['id', 'ID'], ['name', 'Project'], ['client', 'Client'], ['site', 'Site'], ['type', 'Work type'],
  ['contract', 'Contract value'], ['status', 'Status'], ['start', 'Start date'], ['created', 'Created'], ['sample', 'Example']
];
const ENTRY_COLS = [
  ['id', 'ID'], ['projectId', 'Project ID'], ['project', 'Project'], ['kind', 'Type'], ['date', 'Date'],
  ['category', 'Category'], ['party', 'Party'], ['amount', 'Amount'], ['gst', 'GST'], ['paid', 'Paid with bill'],
  ['unpaid', 'Unpaid'], ['billNo', 'Bill no.'], ['mode', 'Mode'], ['note', 'Note'],
  ['receiptUrl', 'Receipt photo'], ['receiptId', 'Receipt file ID'], ['created', 'Created'], ['sample', 'Example']
];
const NUMBERS = { contract: 1, amount: 1, gst: 1, paid: 1, unpaid: 1, created: 1 };
const DATES = { start: 1, date: 1 };
const KIND_LABEL = { in: 'Money in', exp: 'Expense', pay: 'Vendor payment' };
const KIND_KEY = { 'Money in': 'in', 'Expense': 'exp', 'Vendor payment': 'pay' };
const FOLDER = 'Site Khata receipts';

/* Run once from the editor to create the tabs, the folder and grant permissions. */
function setup() {
  sheet_('Projects', PROJECT_COLS);
  sheet_('Entries', ENTRY_COLS);
  folder_();
  if (PIN === 'CHANGE-ME') throw new Error('Set your own PIN at the top of the script, save, and run setup again.');
  Logger.log('Site Khata is ready. Now deploy it as a Web app.');
}

function doGet() {
  return out_({ ok: true, app: 'Site Khata', message: 'Connector is running. Use this URL in the app.' });
}

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'bad_request' }); }
  if (PIN === 'CHANGE-ME') return out_({ ok: false, error: 'pin_not_set' });
  if (String(req.pin || '') !== String(PIN)) return out_({ ok: false, error: 'wrong_pin' });
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const r = handle_(req);
    return out_(Object.assign({ ok: true }, r));
  } catch (err) {
    return out_({ ok: false, error: 'server', message: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function handle_(req) {
  switch (req.action) {
    case 'ping':
      return { app: 'Site Khata' };
    case 'load':
      return {
        projects: read_('Projects', PROJECT_COLS),
        txns: read_('Entries', ENTRY_COLS).map(function (t) { t.kind = KIND_KEY[t.kind] || t.kind; t.receipt = !!t.receiptId; return t; })
      };
    case 'saveProject': {
      const p = req.project;
      upsert_('Projects', PROJECT_COLS, p);
      // keep project names in Entries readable after a rename
      const sh = sheet_('Entries', ENTRY_COLS), data = sh.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) if (data[i][1] === p.id && data[i][2] !== p.name) sh.getRange(i + 1, 3).setValue(p.name);
      return {};
    }
    case 'deleteProject': {
      const sh = sheet_('Entries', ENTRY_COLS), data = sh.getDataRange().getValues();
      for (let i = data.length - 1; i >= 1; i--) {
        if (data[i][1] === req.id) { trash_(data[i][15]); sh.deleteRow(i + 1); }
      }
      remove_('Projects', PROJECT_COLS, req.id);
      return {};
    }
    case 'saveEntry': {
      const t = Object.assign({}, req.entry);
      const old = find_('Entries', ENTRY_COLS, t.id);
      t.receiptId = old ? old.receiptId : '';
      t.receiptUrl = old ? old.receiptUrl : '';
      if (req.photo) {
        if (t.receiptId) trash_(t.receiptId);
        const m = String(req.photo).match(/^data:(image\/[\w+.-]+);base64,(.*)$/);
        if (m) {
          const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], (t.billNo || t.party || 'receipt') + ' ' + t.date + '.jpg');
          const f = folder_().createFile(blob);
          t.receiptId = f.getId();
          t.receiptUrl = f.getUrl();
        }
      }
      const p = find_('Projects', PROJECT_COLS, t.projectId);
      t.project = p ? p.name : '';
      t.unpaid = t.kind === 'exp' ? (Number(t.amount) || 0) - (Number(t.paid) || 0) : '';
      const row = Object.assign({}, t, { kind: KIND_LABEL[t.kind] || t.kind });
      upsert_('Entries', ENTRY_COLS, row);
      reallocate_(t.projectId, t.party);
      if (old && (old.projectId !== t.projectId || norm_(old.party) !== norm_(t.party))) reallocate_(old.projectId, old.party);
      return { receiptId: t.receiptId, receiptUrl: t.receiptUrl };
    }
    case 'deleteEntry': {
      const old = find_('Entries', ENTRY_COLS, req.id);
      if (old) trash_(old.receiptId);
      remove_('Entries', ENTRY_COLS, req.id);
      if (old) reallocate_(old.projectId, old.party);
      return {};
    }
    case 'getReceipt': {
      const f = DriveApp.getFileById(req.receiptId);
      const b = f.getBlob();
      return { photo: 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes()) };
    }
    default:
      throw new Error('Unknown action ' + req.action);
  }
}

/* Later vendor payments are applied to that vendor's bills on the same project,
   oldest bill first, so the Unpaid column shows what is really still owed. */
function norm_(s) { return String(s || '').trim().toLowerCase(); }
function reallocate_(projectId, party) {
  const key = norm_(party);
  if (!projectId || !key) return;
  const sh = sheet_('Entries', ENTRY_COLS), data = sh.getDataRange().getValues();
  const time = v => v instanceof Date ? v.getTime() : (v ? new Date(String(v) + 'T00:00:00').getTime() : 0);
  let pool = 0; const bills = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (r[1] !== projectId || norm_(r[6]) !== key) continue;
    if (r[3] === 'Vendor payment' || r[3] === 'pay') pool += Number(r[7]) || 0;
    else if (r[3] === 'Expense' || r[3] === 'exp') bills.push({ row: i + 1, t: time(r[4]), c: Number(r[16]) || 0, rem: Math.max(0, (Number(r[7]) || 0) - (Number(r[9]) || 0)), cur: r[10] });
  }
  bills.sort((a, b) => a.t - b.t || a.c - b.c);
  bills.forEach(b => {
    const take = Math.min(b.rem, pool); pool -= take;
    const left = b.rem - take;
    if (left !== b.cur) sh.getRange(b.row, 11).setValue(left);
  });
}

/* ---------- helpers ---------- */
function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function sheet_(name, cols) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, cols.length).setValues([cols.map(function (c) { return c[1]; })]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.hideColumns(1);
    if (name === 'Entries') { sh.hideColumns(2); sh.hideColumns(16); }
  }
  return sh;
}
function folder_() {
  const it = DriveApp.getFoldersByName(FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER);
}
function trash_(id) {
  if (!id) return;
  try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* already gone */ }
}
function tz_() { return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(); }
function toObj_(row, cols) {
  const o = {};
  cols.forEach(function (c, i) {
    let v = row[i];
    if (v instanceof Date) v = Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
    if (NUMBERS[c[0]]) v = v === '' ? 0 : Number(v);
    if (c[0] === 'sample') v = v === true || v === 'TRUE' || v === 'Yes';
    o[c[0]] = v;
  });
  return o;
}
function toRow_(o, cols) {
  return cols.map(function (c) {
    const v = o[c[0]];
    if (c[0] === 'sample') return v ? 'Yes' : '';
    if (v === undefined || v === null) return '';
    if (DATES[c[0]] && v) return new Date(String(v) + 'T00:00:00');
    return v;
  });
}
function read_(name, cols) {
  const sh = sheet_(name, cols), data = sh.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < data.length; i++) if (data[i][0]) out.push(toObj_(data[i], cols));
  return out;
}
function rowOf_(sh, id) {
  if (!id) return -1;
  const ids = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getValues();
  for (let i = 1; i < ids.length; i++) if (ids[i][0] === id) return i + 1;
  return -1;
}
function find_(name, cols, id) {
  const sh = sheet_(name, cols), r = rowOf_(sh, id);
  return r < 0 ? null : toObj_(sh.getRange(r, 1, 1, cols.length).getValues()[0], cols);
}
function upsert_(name, cols, o) {
  if (!o || !o.id) throw new Error('Missing id');
  const sh = sheet_(name, cols), r = rowOf_(sh, o.id), row = [toRow_(o, cols)];
  if (r > 0) sh.getRange(r, 1, 1, cols.length).setValues(row);
  else sh.appendRow(row[0]);
}
function remove_(name, cols, id) {
  const sh = sheet_(name, cols), r = rowOf_(sh, id);
  if (r > 0) sh.deleteRow(r);
}
