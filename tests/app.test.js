import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addRecoveryEmailIfMissing,
  buildSheetUpdatePayload,
  buildAppsScriptOtpUrl,
  createRecoveryEmail,
  ensureRecoveryEmail,
  filterByEmail,
  filterByName,
  filterRows,
  getAdjacentIndex,
  getAdjacentRow,
  getDoneLabel,
  getNavigationContext,
  getNavigationStep,
  getRecoveryConfirmationMessage,
  getRecoveryDomain,
  getRecoveryUsername,
  getSheetRowNumber,
  getSourcePositionLabel,
  markRowDone,
  mapGvizTable,
  mapRows,
  markRecoveryEmailSynced,
  shouldWriteRecoveryEmail,
  mustWriteRecoveryBeforeLeaving,
  parseCsv,
  toGvizUrl,
  toCsvUrl,
  extractOtpCode
} from '../app.js';

test('converts a public Google Sheet edit link to csv export url', () => {
  const url = toCsvUrl('https://docs.google.com/spreadsheets/d/abc123/edit#gid=987');

  assert.equal(
    url,
    'https://docs.google.com/spreadsheets/d/abc123/export?format=csv&gid=987'
  );
});

test('converts a public Google Sheet edit link to gviz jsonp url', () => {
  const url = toGvizUrl('https://docs.google.com/spreadsheets/d/abc123/edit#gid=987', 'cb');

  assert.equal(
    url,
    'https://docs.google.com/spreadsheets/d/abc123/gviz/tq?tqx=responseHandler:cb&gid=987'
  );
});

test('builds an Apps Script JSONP URL for inboxes OTP lookup', () => {
  const originalNow = Date.now;
  Date.now = () => 12345;

  try {
    const url = buildAppsScriptOtpUrl(
      'https://script.google.com/macros/s/deployment/exec',
      'alpha+test@clowmail.com',
      'otpCallback'
    );

    assert.equal(
      url,
      'https://script.google.com/macros/s/deployment/exec?action=get_otp&email=alpha%2Btest%40clowmail.com&callback=otpCallback&cacheBust=12345'
    );
  } finally {
    Date.now = originalNow;
  }
});

test('parses quoted csv cells and maps Vietnamese headers', () => {
  const csv = [
    'Tên,Ngày,email,mật khẩu,mail khôi phục',
    'Cường,3/6/2026,alpha@hotmail.com,pass123,',
    '"Cường, Team",3/6/2026,beta@hotmail.com,"p,a,s,s",beta9@old.com'
  ].join('\n');

  const rows = mapRows(parseCsv(csv));

  assert.deepEqual(rows, [
    {
      name: 'Cường',
      date: '3/6/2026',
      email: 'alpha@hotmail.com',
      password: 'pass123',
      recoveryEmail: '',
      recoveryEmailFromSheet: false,
      sourceIndex: 0
    },
    {
      name: 'Cường, Team',
      date: '3/6/2026',
      email: 'beta@hotmail.com',
      password: 'p,a,s,s',
      recoveryEmail: 'beta9@old.com',
      recoveryEmailFromSheet: true,
      sourceIndex: 1
    }
  ]);
});

test('filters rows by name without caring about case or accents', () => {
  const rows = [
    { name: 'Cường', email: 'a@hotmail.com' },
    { name: 'Lan', email: 'b@hotmail.com' }
  ];

  assert.deepEqual(filterByName(rows, 'cuong'), [rows[0]]);
  assert.deepEqual(filterByName(rows, 'LAN'), [rows[1]]);
});

test('filters rows by email without caring about case', () => {
  const rows = [
    { name: 'Cường', email: 'Alpha.User@hotmail.com' },
    { name: 'Lan', email: 'beta@outlook.com' }
  ];

  assert.deepEqual(filterByEmail(rows, 'alpha.user'), [rows[0]]);
  assert.deepEqual(filterByEmail(rows, 'OUTLOOK'), [rows[1]]);
  assert.deepEqual(filterByEmail(rows, ''), rows);
});

test('filters rows by email and combines name plus email queries', () => {
  const rows = [
    { name: 'Cường', email: 'alpha@hotmail.com' },
    { name: 'Cường', email: 'beta@outlook.com' },
    { name: 'Lan', email: 'alpha.other@hotmail.com' }
  ];

  assert.deepEqual(filterRows(rows, { emailQuery: 'hotmail' }), [rows[0], rows[2]]);
  assert.deepEqual(filterRows(rows, { nameQuery: 'cuong', emailQuery: 'beta' }), [rows[1]]);
  assert.deepEqual(filterRows(rows, { nameQuery: 'lan', emailQuery: 'beta' }), []);
});

test('maps Google Visualization table data to account rows', () => {
  const rows = mapGvizTable({
    cols: [
      { label: 'Tên' },
      { label: 'email' },
      { label: 'mật khẩu' },
      { label: 'mail khôi phục' }
    ],
    rows: [
      {
        c: [
          { v: 'Cường' },
          { v: 'alpha@hotmail.com' },
          { v: 'pass123' },
          null
        ]
      }
    ]
  });

  assert.deepEqual(rows, [
    {
      name: 'Cường',
      date: '',
      email: 'alpha@hotmail.com',
      password: 'pass123',
      recoveryEmail: '',
      recoveryEmailFromSheet: false,
      sourceIndex: 0
    }
  ]);
});

test('rotates recovery domains every 200 source rows', () => {
  assert.equal(getRecoveryDomain(0), 'clowmail.com');
  assert.equal(getRecoveryDomain(199), 'clowmail.com');
  assert.equal(getRecoveryDomain(200), 'gimpmail.com');
  assert.equal(getRecoveryDomain(400), 'givmail.com');
  assert.equal(getRecoveryDomain(600), 'tupmail.com');
  assert.equal(getRecoveryDomain(800), 'clowmail.com');
});

test('moves selection left and right with wraparound', () => {
  assert.equal(getAdjacentIndex(0, 3, 1), 1);
  assert.equal(getAdjacentIndex(2, 3, 1), 0);
  assert.equal(getAdjacentIndex(0, 3, -1), 2);
  assert.equal(getAdjacentIndex(1, 3, -1), 0);
  assert.equal(getAdjacentIndex(0, 0, 1), 0);
});

test('leaves a single search result when navigating to the next full-list row', () => {
  const rows = [
    { email: 'mail1@test.com', sourceIndex: 0 },
    { email: 'mail2@test.com', sourceIndex: 1 },
    { email: 'mail3@test.com', sourceIndex: 2 }
  ];

  assert.deepEqual(getNavigationContext(rows, [rows[1]], 0, 1), {
    rows,
    index: 2,
    resetSearch: true
  });
  assert.deepEqual(getNavigationContext(rows, [rows[1]], 0, -1), {
    rows,
    index: 0,
    resetSearch: true
  });
});

test('keeps navigating inside multi-row search results', () => {
  const rows = [
    { email: 'mail1@test.com', sourceIndex: 0 },
    { email: 'mail2@test.com', sourceIndex: 1 },
    { email: 'mail3@test.com', sourceIndex: 2 }
  ];
  const filteredRows = [rows[0], rows[2]];

  assert.deepEqual(getNavigationContext(rows, filteredRows, 0, 1), {
    rows: filteredRows,
    index: 1,
    resetSearch: false
  });
});

test('uses the row being left for sheet write before showing the next row', () => {
  const rows = [
    { email: 'mail1@test.com', sourceIndex: 0 },
    { email: 'mail2@test.com', sourceIndex: 1 },
    { email: 'mail3@test.com', sourceIndex: 2 }
  ];

  assert.deepEqual(getNavigationStep(rows, rows, 1, 1), {
    rowToWrite: rows[1],
    rows,
    index: 2,
    rowToShow: rows[2],
    resetSearch: false
  });
});

test('keeps the searched row as row to write when leaving a single search result', () => {
  const rows = [
    { email: 'mail1@test.com', sourceIndex: 0 },
    { email: 'mail2@test.com', sourceIndex: 1 },
    { email: 'mail3@test.com', sourceIndex: 2 }
  ];

  assert.deepEqual(getNavigationStep(rows, [rows[1]], 0, 1), {
    rowToWrite: rows[1],
    rows,
    index: 2,
    rowToShow: rows[2],
    resetSearch: true
  });
});

test('gets the row selected after navigation for auto-copy', () => {
  const rows = [
    { email: 'first@hotmail.com' },
    { email: 'second@hotmail.com' },
    { email: 'third@hotmail.com' }
  ];

  assert.deepEqual(getAdjacentRow(rows, 0, 1), rows[1]);
  assert.deepEqual(getAdjacentRow(rows, 2, 1), rows[0]);
  assert.deepEqual(getAdjacentRow(rows, 0, -1), rows[2]);
  assert.equal(getAdjacentRow([], 0, 1), null);
});

test('creates recovery email from username, random number, and rotated domain', () => {
  const recoveryEmail = createRecoveryEmail('emendia@hotmail.com', 500, () => 0.1234);

  assert.equal(recoveryEmail, 'emendia2110@givmail.com');
});

test('gets username from recovery email', () => {
  assert.equal(getRecoveryUsername('negustophengels8972@clowmail.com'), 'negustophengels8972');
  assert.equal(getRecoveryUsername(''), '');
});

test('keeps generated recovery email stable on the row', () => {
  const row = {
    email: 'alpha@hotmail.com',
    recoveryEmail: '',
    sourceIndex: 0
  };
  let randomValue = 0.1;
  const random = () => {
    const value = randomValue;
    randomValue = 0.9;
    return value;
  };

  assert.equal(ensureRecoveryEmail(row, random), 'alpha1900@clowmail.com');
  assert.equal(ensureRecoveryEmail(row, random), 'alpha1900@clowmail.com');
  assert.equal(row.recoveryEmail, 'alpha1900@clowmail.com');
});

test('adds recovery email only when the row is missing one', () => {
  const missingRecovery = {
    email: 'bravo@hotmail.com',
    recoveryEmail: '',
    sourceIndex: 500
  };
  const existingRecovery = {
    email: 'charlie@hotmail.com',
    recoveryEmail: 'already@custom.com',
    sourceIndex: 0
  };

  assert.deepEqual(addRecoveryEmailIfMissing(missingRecovery, () => 0.2), {
    recoveryEmail: 'bravo2800@givmail.com',
    added: true
  });
  assert.equal(missingRecovery.recoveryEmail, 'bravo2800@givmail.com');
  assert.deepEqual(addRecoveryEmailIfMissing(existingRecovery, () => 0.8), {
    recoveryEmail: 'already@custom.com',
    added: false
  });
});

test('builds sheet update payload with the real spreadsheet row number', () => {
  const row = {
    email: 'delta@hotmail.com',
    recoveryEmail: '',
    sourceIndex: 7
  };

  addRecoveryEmailIfMissing(row, () => 0.3);

  assert.deepEqual(buildSheetUpdatePayload(row), {
    spreadsheetId: '',
    gid: '0',
    rowNumber: 9,
    recoveryEmail: 'delta3700@clowmail.com'
  });
});

test('builds sheet update payload with spreadsheet ID and gid from sheet url', () => {
  const row = {
    email: 'delta@hotmail.com',
    recoveryEmail: 'delta3700@clowmail.com',
    sourceIndex: 7
  };

  assert.deepEqual(
    buildSheetUpdatePayload(row, 'https://docs.google.com/spreadsheets/d/abc123/edit#gid=987'),
    {
      spreadsheetId: 'abc123',
      gid: '987',
      rowNumber: 9,
      recoveryEmail: 'delta3700@clowmail.com'
    }
  );
});

test('gets the real Google Sheet row number from source index', () => {
  assert.equal(getSheetRowNumber({ sourceIndex: 0 }), 2);
  assert.equal(getSheetRowNumber({ sourceIndex: 7 }), 9);
  assert.equal(getSheetRowNumber(null), '');
});

test('gets source position label from all loaded mail rows', () => {
  assert.equal(getSourcePositionLabel({ sourceIndex: 14 }, 100), '15/100');
  assert.equal(getSourcePositionLabel({ sourceIndex: 0 }, 100), '1/100');
  assert.equal(getSourcePositionLabel(null, 100), '0/100');
});

test('only writes generated recovery emails that are not synced yet', () => {
  const generated = {
    email: 'echo@hotmail.com',
    recoveryEmail: '',
    sourceIndex: 0
  };
  const fromSheet = {
    email: 'foxtrot@hotmail.com',
    recoveryEmail: 'existing@custom.com',
    sourceIndex: 1
  };

  addRecoveryEmailIfMissing(generated, () => 0.4);

  assert.equal(shouldWriteRecoveryEmail(generated), true);
  assert.equal(shouldWriteRecoveryEmail(fromSheet), false);

  markRecoveryEmailSynced(generated);

  assert.equal(shouldWriteRecoveryEmail(generated), false);
});

test('marks the previous row as done after leaving it', () => {
  const row = {
    email: 'done@hotmail.com'
  };

  assert.equal(markRowDone(row), true);
  assert.equal(row.done, true);
  assert.equal(markRowDone(null), false);
});

test('returns done label only when recovery email exists in sheet', () => {
  assert.equal(getDoneLabel({ recoveryEmailFromSheet: true }), 'Đã xong');
  assert.equal(getDoneLabel({ recoveryEmailSynced: true }), '');
  assert.equal(getDoneLabel({ done: true, recoveryEmail: '' }), '');
  assert.equal(getDoneLabel({ recoveryEmail: 'generated@local.com', recoveryEmailGenerated: true }), '');
  assert.equal(getDoneLabel(null), '');
});

test('shows confirmation message before leaving the current row', () => {
  assert.equal(
    getRecoveryConfirmationMessage({ name: 'Cường', email: 'alpha@hotmail.com' }),
    'Bạn đã add mail khôi phục cho Cường - alpha@hotmail.com chưa?'
  );
  assert.equal(
    getRecoveryConfirmationMessage({ email: 'beta@hotmail.com' }),
    'Bạn đã add mail khôi phục cho beta@hotmail.com chưa?'
  );
});

test('knows when current row must be written before leaving', () => {
  assert.equal(mustWriteRecoveryBeforeLeaving({
    recoveryEmail: 'alpha1900@clowmail.com',
    recoveryEmailGenerated: true,
    recoveryEmailSynced: false
  }), true);
  assert.equal(mustWriteRecoveryBeforeLeaving({
    recoveryEmail: 'alpha1900@clowmail.com',
    recoveryEmailGenerated: true,
    recoveryEmailSynced: true
  }), false);
  assert.equal(mustWriteRecoveryBeforeLeaving({
    recoveryEmail: 'existing@custom.com'
  }), false);
});

test('extracts OTP code correctly from Vietnamese email HTML', () => {
  const html = `
    <html>
      <body>
        <div class="content">
          <p>Xin chào Cường,</p>
          <p>Mã bảo mật tài khoản Microsoft của bạn là: <strong>837492</strong></p>
          <p>Nếu bạn không yêu cầu mã này, vui lòng bỏ qua.</p>
        </div>
      </body>
    </html>
  `;
  assert.equal(extractOtpCode(html), '837492');
});

test('extracts OTP code correctly from English email HTML with multiple numbers', () => {
  const html = `
    <html>
      <head>
        <style>body { font-size: 14px; width: 600px; }</style>
      </head>
      <body>
        <p>Your security verification code is: 1048576</p>
        <p>Zip code: 90210. Phone: 123-456-7890</p>
      </body>
    </html>
  `;
  assert.equal(extractOtpCode(html), '1048576');
});

