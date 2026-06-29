const RECOVERY_HEADER_ALIASES = [
  'mail khoi phuc',
  'mailkhoiphuc',
  'mail khôi phục',
  'recovery email',
  'recovery',
  'recoveryemail'
];

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    const rowNumber = Number(payload.rowNumber);
    const recoveryEmail = String(payload.recoveryEmail || '').trim();
    const spreadsheetId = payload.spreadsheetId;
    const gid = payload.gid;

    if (!rowNumber || rowNumber < 2) {
      throw new Error('Invalid rowNumber.');
    }

    if (!recoveryEmail) {
      throw new Error('Missing recoveryEmail.');
    }

    // 1. Open the spreadsheet using ID if available, otherwise get active
    let ss;
    if (spreadsheetId) {
      ss = SpreadsheetApp.openById(spreadsheetId);
    } else {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    }

    if (!ss) {
      throw new Error('Cannot open Spreadsheet.');
    }

    // 2. Find sheet by gid (sheetId) if available
    let sheet;
    if (gid) {
      const sheets = ss.getSheets();
      sheet = sheets.find(function(s) {
        return String(s.getSheetId()) === String(gid);
      });
    }

    if (!sheet) {
      sheet = ss.getActiveSheet();
    }
    if (!sheet) {
      sheet = ss.getSheets()[0];
    }

    if (!sheet) {
      throw new Error('Cannot find target Sheet.');
    }

    const recoveryColumn = findRecoveryColumn(sheet);
    const cell = sheet.getRange(rowNumber, recoveryColumn);
    const existingValue = String(cell.getValue() || '').trim();

    // 3. Write only if the new value is different from the existing value (supports overwriting)
    if (existingValue !== recoveryEmail) {
      cell.setValue(recoveryEmail);
      SpreadsheetApp.flush();
      return jsonResponse({
        ok: true,
        written: true,
        rowNumber,
        recoveryColumn
      });
    }

    return jsonResponse({
      ok: true,
      written: false,
      rowNumber,
      recoveryColumn
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error.message
    });
  }
}

function findRecoveryColumn(sheet) {
  const lastColumn = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const index = headers.findIndex((header) => {
    return RECOVERY_HEADER_ALIASES.includes(normalizeText(header));
  });

  if (index === -1) {
    throw new Error('Cannot find recovery email column.');
  }

  return index + 1;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
