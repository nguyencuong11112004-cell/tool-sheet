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

    // Handle proxy request to getNada to bypass CORS in the browser
    if (payload.action === 'get_otp') {
      const email = String(payload.email || '').trim();
      if (!email) {
        throw new Error('Missing email for get_otp action.');
      }

      const response = UrlFetchApp.fetch('https://inboxes.com/api/v2/inbox/' + email, {
        muteHttpExceptions: true
      });

      if (response.getResponseCode() !== 200) {
        throw new Error('Inboxes inbox request failed with status: ' + response.getResponseCode());
      }

      const data = JSON.parse(response.getContentText());
      if (data.msgs && data.msgs.length > 0) {
        const latestMsg = data.msgs[0];
        const msgResponse = UrlFetchApp.fetch('https://inboxes.com/api/v2/message/' + latestMsg.uid, {
          muteHttpExceptions: true
        });

        if (msgResponse.getResponseCode() !== 200) {
          throw new Error('Inboxes message content request failed with status: ' + msgResponse.getResponseCode());
        }

        const msgData = JSON.parse(msgResponse.getContentText());
        return jsonResponse({
          ok: true,
          sender: latestMsg.f || msgData.from || '',
          subject: latestMsg.s || msgData.subject || '',
          html: msgData.html || msgData.text || ''
        });
      } else {
        return jsonResponse({
          ok: true,
          msgs: []
        });
      }
    }

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

// Hàm chạy thủ công một lần để kích hoạt quyền gọi API ngoài (UrlFetchApp.fetch)
function authorize() {
  UrlFetchApp.fetch("https://inboxes.com/api/v2/domain");
  Logger.log("Cấp quyền thành công!");
}
