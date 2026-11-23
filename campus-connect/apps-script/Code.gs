// Paste this into your Google Sheet: Extensions > Apps Script. Then Deploy > New deployment > Web app
// (Execute as: Me, Who has access: Anyone). Copy the Web app URL into SHEETS_WEBHOOK_URL.
// Set SECRET to the same value as SHEETS_SECRET on the server.
const SECRET = 'change-me';

function doPost(e) {
  try {
    const p = JSON.parse(e.postData.contents);
    if (p.secret !== SECRET) return out({ ok: false, error: 'Bad secret' });
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    Object.keys(p.tables).forEach(function (name) {
      const rows = p.tables[name];
      const sh = ss.getSheetByName(name) || ss.insertSheet(name);
      sh.clear();
      sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, rows[0].length).setFontWeight('bold').setBackground('#4f46e5').setFontColor('#ffffff');
    });
    return out({ ok: true });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
