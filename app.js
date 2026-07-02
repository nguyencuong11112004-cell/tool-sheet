const RECOVERY_DOMAINS = [
  'clowmail.com',
  'gimpmail.com',
  'givmail.com',
  'tupmail.com'
];

const OTP_POLL_INTERVAL_MS = 5000;
const DEFAULT_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyCH_4_6XtbeR1_VRXopO5Dposnv8t8EuieXGnBKB_GC-MfVvulfCWv0RCPJYDVi4jsuA/exec';

const HEADER_ALIASES = {
  name: ['ten', 'name'],
  date: ['ngay', 'date'],
  email: ['email', 'mail'],
  password: ['mat khau', 'matkhau', 'password', 'pass', 'mk'],
  recoveryEmail: ['mail khoi phuc', 'mailkhoiphuc', 'recovery email', 'recovery', 'recoveryemail']
};

export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export function toCsvUrl(input) {
  const { id, gid } = parseGoogleSheetLink(input);

  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

export function toGvizUrl(input, callbackName) {
  const { id, gid } = parseGoogleSheetLink(input);

  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=responseHandler:${callbackName}&gid=${gid}`;
}

function parseGoogleSheetLink(input) {
  const rawValue = String(input ?? '').trim();

  if (!rawValue) {
    throw new Error('Vui lòng nhập link Google Sheet.');
  }

  const url = new URL(rawValue);

  if (!url.hostname.includes('docs.google.com')) {
    throw new Error('Link phải là Google Sheet public.');
  }

  const match = url.pathname.match(/\/spreadsheets\/d\/([^/]+)/);

  if (!match) {
    throw new Error('Không tìm thấy ID của Google Sheet trong link.');
  }

  let gid = url.searchParams.get('gid') || '0';
  const hashGid = url.hash.match(/gid=(\d+)/);

  if (hashGid) {
    gid = hashGid[1];
  }

  return {
    id: match[1],
    gid
  };
}

export function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  const text = String(csvText ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(cell.trim());
      cell = '';
      continue;
    }

    if (char === '\n' && !inQuotes) {
      row.push(cell.trim());
      if (row.some((value) => value !== '')) {
        rows.push(row);
      }
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cell.trim());
  if (row.some((value) => value !== '')) {
    rows.push(row);
  }

  return rows;
}

export function findHeader(headers, key) {
  const aliases = HEADER_ALIASES[key] ?? [];
  const normalizedHeaders = headers.map((header) => normalizeText(header));

  return normalizedHeaders.findIndex((header) => aliases.includes(header));
}

export function mapRows(parsedRows) {
  if (!Array.isArray(parsedRows) || parsedRows.length < 2) {
    return [];
  }

  const headers = parsedRows[0];
  const indexes = {
    name: findHeader(headers, 'name'),
    date: findHeader(headers, 'date'),
    email: findHeader(headers, 'email'),
    password: findHeader(headers, 'password'),
    recoveryEmail: findHeader(headers, 'recoveryEmail')
  };

  return parsedRows.slice(1)
    .map((row, sourceIndex) => {
      const recoveryEmail = indexes.recoveryEmail >= 0 ? row[indexes.recoveryEmail] ?? '' : '';

      return {
        name: indexes.name >= 0 ? row[indexes.name] ?? '' : '',
        date: indexes.date >= 0 ? row[indexes.date] ?? '' : '',
        email: indexes.email >= 0 ? row[indexes.email] ?? '' : '',
        password: indexes.password >= 0 ? row[indexes.password] ?? '' : '',
        recoveryEmail,
        recoveryEmailFromSheet: Boolean(recoveryEmail),
        sourceIndex
      };
    })
    .filter((row) => row.email || row.password || row.name);
}

export function mapGvizTable(table) {
  const headers = (table?.cols ?? []).map((column) => column.label || column.id || '');
  const bodyRows = (table?.rows ?? []).map((row) => {
    return (row.c ?? []).map((cell) => {
      if (!cell) {
        return '';
      }

      return cell.f ?? cell.v ?? '';
    });
  });

  return mapRows([headers, ...bodyRows]);
}

export function getRecoveryDomain(sourceIndex) {
  const safeIndex = Math.max(0, Number(sourceIndex) || 0);
  const domainIndex = Math.floor(safeIndex / 200) % RECOVERY_DOMAINS.length;

  return RECOVERY_DOMAINS[domainIndex];
}

export function createRecoveryEmail(email, sourceIndex, random = Math.random) {
  const username = String(email ?? '').split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '');
  const suffix = Math.floor(random() * 9000) + 1000;

  return `${username || 'mail'}${suffix}@${getRecoveryDomain(sourceIndex)}`;
}

export function addRecoveryEmailIfMissing(row, random = Math.random) {
  if (!row) {
    return {
      recoveryEmail: '',
      added: false
    };
  }

  if (row.recoveryEmail) {
    return {
      recoveryEmail: row.recoveryEmail,
      added: false
    };
  }

  row.recoveryEmail = createRecoveryEmail(row.email, row.sourceIndex, random);
  row.recoveryEmailGenerated = true;
  row.recoveryEmailSynced = false;

  return {
    recoveryEmail: row.recoveryEmail,
    added: true
  };
}

export function ensureRecoveryEmail(row, random = Math.random) {
  return addRecoveryEmailIfMissing(row, random).recoveryEmail;
}

export function getRecoveryUsername(recoveryEmail) {
  return String(recoveryEmail ?? '').split('@')[0];
}

export function extractOtpCode(html) {
  if (!html) return null;
  // Strip HTML tags and normalize whitespace
  const text = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Try to find a 6 to 8-digit code with keywords nearby
  const keywords = ['ma', 'code', 'security', 'verify', 'xac nhan', 'xac minh', 'bao mat', 'otp'];
  
  // Find all 6 to 8 digit numbers
  const numbers = text.match(/\b\d{6,8}\b/g) || [];
  
  if (numbers.length === 1) {
    return numbers[0];
  }
  
  const normalizedText = normalizeText(text);
  for (const num of numbers) {
    const numPos = text.indexOf(num);
    if (numPos !== -1) {
      const surroundingText = normalizedText.slice(Math.max(0, numPos - 100), numPos + 100);
      if (keywords.some(kw => surroundingText.includes(kw))) {
        return num;
      }
    }
  }
  
  return numbers[0] || null;
}

async function fetchGetnadaDirect(email) {
  const res = await fetch(`https://inboxes.com/api/v2/inbox/${email}`);
  if (!res.ok) throw new Error("Direct inbox fetch failed");
  const data = await res.json();
  if (data.msgs && data.msgs.length > 0) {
    const latestMsg = data.msgs[0];
    const msgRes = await fetch(`https://inboxes.com/api/v2/message/${latestMsg.uid}`);
    if (!msgRes.ok) throw new Error("Direct message fetch failed");
    const msgData = await msgRes.json();
    return {
      code: extractOtpCode(msgData.html || msgData.text),
      sender: latestMsg.f || msgData.from,
      subject: latestMsg.s || msgData.subject
    };
  }
  return null;
}

export function buildAppsScriptOtpUrl(scriptUrl, email, callbackName) {
  const url = new URL(String(scriptUrl || '').trim());

  url.searchParams.set('action', 'get_otp');
  url.searchParams.set('email', email);
  url.searchParams.set('callback', callbackName);
  url.searchParams.set('cacheBust', Date.now());

  return url.toString();
}

function normalizeOtpResult(result) {
  if (!result.ok) {
    if (result.error === 'Invalid rowNumber.') {
      throw new Error('Please deploy a new Google Apps Script version (New Deployment).');
    }
    throw new Error(result.error || 'Apps Script error');
  }

  if (result.html) {
    return {
      code: extractOtpCode(result.html),
      sender: result.sender,
      subject: result.subject
    };
  }

  return null;
}

function fetchGetnadaViaAppsScriptJsonp(scriptUrl, email) {
  if (typeof document === 'undefined') {
    return fetchGetnadaViaAppsScript(scriptUrl, email);
  }

  return new Promise((resolve, reject) => {
    const callbackName = `inboxesOtpCallback_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const script = document.createElement('script');
    let timeoutId;

    const cleanup = () => {
      clearTimeout(timeoutId);
      script.remove();
      delete window[callbackName];
    };

    window[callbackName] = (result) => {
      try {
        cleanup();
        resolve(normalizeOtpResult(result || {}));
      } catch (error) {
        reject(error);
      }
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('Cannot load Apps Script proxy. Check the Web App URL and deploy a new version.'));
    };

    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Apps Script proxy timed out.'));
    }, 20000);

    try {
      script.src = buildAppsScriptOtpUrl(scriptUrl, email, callbackName);
      document.head.append(script);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

async function fetchGetnadaViaAppsScript(scriptUrl, email) {
  const response = await fetch(scriptUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify({
      action: 'get_otp',
      email: email
    })
  });

  if (!response.ok) {
    throw new Error(`Apps Script trả về mã lỗi ${response.status}`);
  }

  const result = await response.json();
  if (!result.ok) {
    if (result.error === 'Invalid rowNumber.') {
      throw new Error('Vui lòng Deploy phiên bản mới (New Deployment) cho Google Apps Script.');
    }
    throw new Error(result.error || 'Lỗi Apps Script');
  }

  if (result.html) {
    return {
      code: extractOtpCode(result.html),
      sender: result.sender,
      subject: result.subject
    };
  }
  return null;
}

async function fetchGetnadaViaAllOrigins(email) {
  const inboxUrl = encodeURIComponent(`https://inboxes.com/api/v2/inbox/${email}`);
  const res = await fetch(`https://api.allorigins.win/get?url=${inboxUrl}`);
  if (!res.ok) throw new Error("Kết nối AllOrigins thất bại");
  const wrapper = await res.json();
  
  let data;
  try {
    data = JSON.parse(wrapper.contents);
  } catch (e) {
    if (String(wrapper.contents || '').includes('cloudflare') || String(wrapper.contents || '').includes('<html')) {
      throw new Error("Bị chặn bởi bảo mật Cloudflare của inboxes.com. Hãy dùng Apps Script Proxy.");
    }
    throw new Error("Không thể phân tích dữ liệu hòm thư.");
  }
  
  if (data.msgs && data.msgs.length > 0) {
    const latestMsg = data.msgs[0];
    const msgUrl = encodeURIComponent(`https://inboxes.com/api/v2/message/${latestMsg.uid}`);
    const msgRes = await fetch(`https://api.allorigins.win/get?url=${msgUrl}`);
    if (!msgRes.ok) throw new Error("AllOrigins tải nội dung thư thất bại");
    const msgWrapper = await msgRes.json();
    
    let msgData;
    try {
      msgData = JSON.parse(msgWrapper.contents);
    } catch (e) {
      throw new Error("Không thể phân tích chi tiết thư.");
    }
    
    return {
      code: extractOtpCode(msgData.html || msgData.text),
      sender: latestMsg.f || msgData.from,
      subject: latestMsg.s || msgData.subject
    };
  }
  return null;
}

export async function fetchOtpFromApi(email, scriptUrl = '') {
  const errors = [];

  if (scriptUrl) {
    try {
      return await fetchGetnadaViaAppsScriptJsonp(scriptUrl, email);
    } catch (err) {
      console.warn("Apps Script proxy failed:", err);
      errors.push(`Apps Script Proxy: ${err.message}`);
      if (err.message.includes('New Deployment')) {
        throw err;
      }
    }
  } else {
    errors.push("Apps Script Proxy: URL trá»‘ng");
  }

  throw new Error(errors.join(' | ') || 'Apps Script proxy failed.');

  // Level 1: Direct Fetch
  try {
    const data = await fetchGetnadaDirect(email);
    // Nếu kết nối thành công (dù có mail hay trống), trả về kết quả ngay
    return data;
  } catch (err) {
    console.warn("Direct fetch failed:", err);
    errors.push("Kết nối trực tiếp bị CORS chặn");
  }

  // Level 2: Apps Script proxy
  if (scriptUrl) {
    try {
      const data = await fetchGetnadaViaAppsScript(scriptUrl, email);
      // Nếu proxy chạy thành công (dù có mail hay trống), trả về kết quả ngay
      return data;
    } catch (err) {
      console.warn("Apps Script proxy failed:", err);
      errors.push(`Apps Script Proxy: ${err.message}`);
      if (err.message.includes('Deploy phiên bản mới')) {
        throw err;
      }
    }
  } else {
    errors.push("Apps Script Proxy: URL trống");
  }

  // Level 3: AllOrigins proxy
  try {
    const data = await fetchGetnadaViaAllOrigins(email);
    return data;
  } catch (err) {
    console.warn("AllOrigins proxy failed:", err);
    errors.push(`AllOrigins Proxy: ${err.message}`);
  }

  // Nếu tất cả các phương thức kết nối đều bị lỗi mạng/CORS
  const errorMsg = errors.join(' | ');
  throw new Error(errorMsg || "Không kết nối được hòm thư.");
}

export function shouldWriteRecoveryEmail(row) {
  return Boolean(row?.recoveryEmail && row.recoveryEmailGenerated && !row.recoveryEmailSynced);
}

export function mustWriteRecoveryBeforeLeaving(row) {
  return shouldWriteRecoveryEmail(row);
}

export function markRecoveryEmailSynced(row) {
  if (row) {
    row.recoveryEmailSynced = true;
  }
}

export function markRowDone(row) {
  if (!row) {
    return false;
  }

  row.done = true;

  return true;
}

export function getDoneLabel(row) {
  return row?.recoveryEmailFromSheet ? 'Đã xong' : '';
}

export function getRecoveryConfirmationMessage(row) {
  const accountLabel = row?.name
    ? `${row.name} - ${row.email || ''}`.trim()
    : row?.email || 'dòng hiện tại';

  return `Bạn đã add mail khôi phục cho ${accountLabel} chưa?`;
}

export function getSheetRowNumber(row) {
  if (!row) {
    return '';
  }

  return Number(row.sourceIndex) + 2;
}

export function getSourcePositionLabel(row, totalRows) {
  const total = Number(totalRows) || 0;

  if (!row) {
    return `0/${total}`;
  }

  return `${Number(row.sourceIndex) + 1}/${total}`;
}

export function buildSheetUpdatePayload(row, sheetUrl) {
  if (!row?.recoveryEmail) {
    throw new Error('Không có mail khôi phục để ghi vào sheet.');
  }

  let spreadsheetId = '';
  let gid = '0';

  if (sheetUrl) {
    try {
      const parsed = parseGoogleSheetLink(sheetUrl);
      spreadsheetId = parsed.id;
      gid = parsed.gid;
    } catch (e) {
      // Ignore URL parsing errors for backwards compatibility in tests
    }
  }

  return {
    spreadsheetId,
    gid,
    rowNumber: getSheetRowNumber(row),
    recoveryEmail: row.recoveryEmail
  };
}

export function filterByName(rows, query) {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) {
    return rows;
  }

  return rows.filter((row) => normalizeText(row.name).includes(normalizedQuery));
}

export function filterByEmail(rows, query) {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) {
    return rows;
  }

  return rows.filter((row) => normalizeText(row.email).includes(normalizedQuery));
}

export function filterRows(rows, { nameQuery = '', emailQuery = '' } = {}) {
  return filterByEmail(filterByName(rows, nameQuery), emailQuery);
}

export function getAdjacentIndex(currentIndex, total, direction) {
  if (!total) {
    return 0;
  }

  return (currentIndex + direction + total) % total;
}

export function getAdjacentRow(rows, currentIndex, direction) {
  if (!rows.length) {
    return null;
  }

  return rows[getAdjacentIndex(currentIndex, rows.length, direction)] ?? null;
}

export function getNavigationContext(allRows, filteredRows, currentIndex, direction) {
  const currentRows = filteredRows ?? [];
  const sourceRows = allRows ?? [];

  if (!currentRows.length) {
    return {
      rows: currentRows,
      index: 0,
      resetSearch: false
    };
  }

  if (currentRows.length === 1 && sourceRows.length > 1) {
    const sourceIndex = Math.max(0, sourceRows.indexOf(currentRows[currentIndex]));

    return {
      rows: sourceRows,
      index: getAdjacentIndex(sourceIndex, sourceRows.length, direction),
      resetSearch: true
    };
  }

  return {
    rows: currentRows,
    index: getAdjacentIndex(currentIndex, currentRows.length, direction),
    resetSearch: false
  };
}

export function getNavigationStep(allRows, filteredRows, currentIndex, direction) {
  const currentRows = filteredRows ?? [];
  const navigation = getNavigationContext(allRows, currentRows, currentIndex, direction);

  return {
    rowToWrite: currentRows[currentIndex] ?? null,
    rows: navigation.rows,
    index: navigation.index,
    rowToShow: navigation.rows[navigation.index] ?? null,
    resetSearch: navigation.resetSearch
  };
}

function setText(element, value) {
  if (element) {
    element.textContent = value || '-';
  }
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function initApp() {
  const elements = {
    toggleConfig: document.querySelector('#toggleConfig'),
    sheetConfigPanel: document.querySelector('#sheetConfigPanel'),
    sheetUrl: document.querySelector('#sheetUrl'),
    scriptUrl: document.querySelector('#scriptUrl'),
    webmailUrl: document.querySelector('#webmailUrl'),
    loadSheet: document.querySelector('#loadSheet'),
    filterName: document.querySelector('#filterName'),
    filterStatus: document.querySelector('#filterStatus'),
    filterLimit: document.querySelector('#filterLimit'),
    searchQuery: document.querySelector('#searchQuery'),
    displayedCount: document.querySelector('#displayedCount'),
    doneCount: document.querySelector('#doneCount'),
    doingCount: document.querySelector('#doingCount'),
    refreshBtn: document.querySelector('#refreshBtn'),
    webmailBtn: document.querySelector('#webmailBtn'),
    status: document.querySelector('#status'),
    cardsGrid: document.querySelector('#cardsGrid')
  };

  let allRows = [];
  let filteredRows = [];
  let matchedCount = 0;

  const showStatus = (message, type = 'info') => {
    elements.status.textContent = message;
    elements.status.dataset.type = type;
    elements.status.classList.add('show');
    if (type === 'success' || type === 'info') {
      setTimeout(() => {
        if (elements.status.textContent === message) {
          elements.status.classList.remove('show');
        }
      }, 5000);
    }
  };

  const isRowDone = (row) => {
    return Boolean(row.recoveryEmailFromSheet || row.recoveryEmailSynced || row.done);
  };

  const copyText = async (text, button) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      if (button) {
        const originalIcon = button.innerHTML;
        button.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" style="color:var(--green);width:15px;height:15px;">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        `;
        setTimeout(() => {
          button.innerHTML = originalIcon;
        }, 1500);
      }
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  const createCardField = (label, value, isInput = false, onInput = null) => {
    const field = document.createElement('div');
    field.className = 'card-field';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'card-field-label';
    labelSpan.textContent = label;
    field.appendChild(labelSpan);

    const rowDiv = document.createElement('div');
    rowDiv.className = 'card-field-row';

    let valueEl;
    if (isInput) {
      valueEl = document.createElement('input');
      valueEl.className = 'card-field-value';
      valueEl.value = value || '';
      if (onInput) {
        valueEl.addEventListener('input', (e) => onInput(e.target.value));
      }
    } else {
      valueEl = document.createElement('span');
      valueEl.className = 'card-field-value';
      valueEl.textContent = value || '-';
    }
    rowDiv.appendChild(valueEl);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn-copy';
    copyBtn.type = 'button';
    copyBtn.title = 'Copy';
    copyBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
      </svg>
    `;

    const performCopy = () => {
      const currentValue = valueEl.tagName === 'INPUT' ? valueEl.value : valueEl.textContent;
      if (valueEl.tagName === 'INPUT') {
        valueEl.select();
      }
      copyText(currentValue, copyBtn);
    };

    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      performCopy();
    });

    valueEl.addEventListener('click', () => {
      performCopy();
    });

    rowDiv.appendChild(copyBtn);
    field.appendChild(rowDiv);
    return field;
  };

  const updateCardOtpDom = (row) => {
    const card = elements.cardsGrid.querySelector(`.card[data-source-index="${row.sourceIndex}"]`);
    if (!card) return;

    const valueEl = card.querySelector('.otp-value-input');
    const getOtpBtn = card.querySelector('.btn-fetch-otp');
    const copyBtn = card.querySelector('.otp-copy-btn');
    const infoDiv = card.querySelector('.otp-info-div');

    if (valueEl) valueEl.value = row.otpCode || '';
    if (getOtpBtn) {
      if (row.isFetchingOtp) {
        getOtpBtn.disabled = true;
        getOtpBtn.textContent = `Lần ${row.otpPollCount || 1}`;
      } else {
        getOtpBtn.disabled = false;
        getOtpBtn.textContent = row.otpCode ? 'Lấy lại' : 'Lấy mã';
      }
    }
    if (copyBtn) {
      copyBtn.style.display = row.otpCode ? 'flex' : 'none';
    }
    if (infoDiv) {
      infoDiv.innerHTML = row.otpStatusText || '';
      infoDiv.style.color = row.otpStatusColor || 'var(--text-muted)';
    }
  };

  const startPollingOtp = async (row) => {
    if (!row.recoveryEmail) {
      showStatus('Chưa có email khôi phục!', 'warn');
      return;
    }

    const scriptUrl = elements.scriptUrl.value.trim();
    if (!scriptUrl) {
      row.otpStatusText = 'Lỗi: Chưa cấu hình Apps Script Web App URL.';
      row.otpStatusColor = 'var(--red)';
      updateCardOtpDom(row);
      showStatus('Vui lòng click "Đổi link Google Sheet" để điền Apps Script Web App URL.', 'error');
      return;
    }

    if (row.isFetchingOtp) return;

    row.isFetchingOtp = true;
    row.otpPollCount = 0;
    row.otpCode = '';
    row.otpStatusText = 'Đang chờ mã OTP...';
    row.otpStatusColor = 'var(--text-muted)';
    updateCardOtpDom(row);
    showStatus('Đang chờ mã OTP, hệ thống sẽ tự kiểm tra đến khi có mã.', 'info');

    try {
      while (row.isFetchingOtp) {
        row.otpPollCount += 1;
        row.otpStatusText = `Đang kiểm tra inbox... lần ${row.otpPollCount}`;
        row.otpStatusColor = 'var(--text-muted)';
        updateCardOtpDom(row);

        const otpData = await fetchOtpFromApi(row.recoveryEmail, scriptUrl);
        if (!row.isFetchingOtp) break;

        if (otpData && otpData.code) {
          row.otpCode = otpData.code;
          row.otpStatusText = `<span style="color:var(--green); font-weight: 500;">Tìm thấy từ: ${escapeHtml(otpData.sender || 'Unknown')}</span>`;
          row.otpStatusColor = 'var(--green)';
          row.isFetchingOtp = false;
          updateCardOtpDom(row);

          // Copy to clipboard
          const card = elements.cardsGrid.querySelector(`.card[data-source-index="${row.sourceIndex}"]`);
          const copyBtn = card ? card.querySelector('.otp-copy-btn') : null;
          await copyText(otpData.code, copyBtn);
          showStatus(`Đã lấy và copy mã OTP: ${otpData.code}`, 'success');
          break;
        }

        row.otpStatusText = `Chưa có mã, tiếp tục chờ... lần ${row.otpPollCount}`;
        row.otpStatusColor = 'var(--text-muted)';
        updateCardOtpDom(row);
        await wait(OTP_POLL_INTERVAL_MS);
      }
    } catch (err) {
      row.otpStatusText = 'Không kết nối được inbox.';
      row.otpStatusColor = 'var(--red)';
      row.isFetchingOtp = false;
      updateCardOtpDom(row);
      showStatus(`Không lấy được mã: ${err.message}`, 'error');
    }
  };

  const createOtpField = (row) => {
    const field = document.createElement('div');
    field.className = 'card-field';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'card-field-label';
    labelSpan.textContent = '🔑 Mã OTP (Getnada)';
    field.appendChild(labelSpan);

    const rowDiv = document.createElement('div');
    rowDiv.className = 'card-field-row';

    const valueEl = document.createElement('input');
    valueEl.className = 'card-field-value otp-value-input';
    valueEl.style.fontWeight = '700';
    valueEl.style.color = 'var(--blue)';
    valueEl.readOnly = true;
    valueEl.placeholder = 'Bấm nút "Lấy mã"';
    valueEl.value = row.otpCode || '';
    rowDiv.appendChild(valueEl);

    const getOtpBtn = document.createElement('button');
    getOtpBtn.className = 'btn-fetch-otp';
    getOtpBtn.type = 'button';
    getOtpBtn.title = 'Lấy mã OTP';
    if (row.isFetchingOtp) {
      getOtpBtn.disabled = true;
      getOtpBtn.textContent = `Lần ${row.otpPollCount || 1}`;
    } else {
      getOtpBtn.disabled = false;
      getOtpBtn.textContent = row.otpCode ? 'Lấy lại' : 'Lấy mã';
    }
    rowDiv.appendChild(getOtpBtn);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn-copy otp-copy-btn';
    copyBtn.type = 'button';
    copyBtn.title = 'Copy';
    copyBtn.style.display = row.otpCode ? 'flex' : 'none';
    copyBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
      </svg>
    `;
    rowDiv.appendChild(copyBtn);

    const infoDiv = document.createElement('div');
    infoDiv.className = 'otp-info-div';
    infoDiv.style.fontSize = '11px';
    infoDiv.style.marginTop = '4px';
    infoDiv.style.minHeight = '16px';
    if (row.otpStatusText) {
      infoDiv.innerHTML = row.otpStatusText;
      infoDiv.style.color = row.otpStatusColor || 'var(--text-muted)';
    } else {
      infoDiv.style.color = 'var(--text-muted)';
    }
    field.appendChild(rowDiv);
    field.appendChild(infoDiv);

    getOtpBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      startPollingOtp(row);
    });

    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyText(valueEl.value, copyBtn);
    });

    valueEl.addEventListener('click', (e) => {
      e.stopPropagation();
      if (valueEl.value) {
        valueEl.select();
        copyText(valueEl.value, copyBtn);
      }
    });

    return field;
  };

  const renderCards = () => {
    elements.cardsGrid.innerHTML = '';

    if (!filteredRows.length) {
      elements.cardsGrid.innerHTML = `
        <div class="empty-state">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <p>${allRows.length ? 'Không tìm thấy dòng phù hợp với bộ lọc.' : 'Chưa có dữ liệu. Vui lòng click "Đổi link Google Sheet" để cấu hình liên kết.'}</p>
        </div>
      `;
      return;
    }

    filteredRows.forEach((row) => {
      const card = document.createElement('article');
      card.setAttribute('data-source-index', row.sourceIndex);
      const done = isRowDone(row);
      card.className = `card ${done ? 'done' : 'doing'}`;

      // Header
      const headerDiv = document.createElement('div');
      headerDiv.className = 'card-header';
      headerDiv.innerHTML = `
        <div class="card-info">
          <span class="card-index">#${getSheetRowNumber(row)}</span>
          <span class="card-name">${escapeHtml(row.name)}</span>
        </div>
        <span class="badge ${done ? 'badge-done' : 'badge-doing'}">
          ${done ? '✅ Đã xong' : '⏳ Đang làm'}
        </span>
      `;
      card.appendChild(headerDiv);

      // Body
      const bodyDiv = document.createElement('div');
      bodyDiv.className = 'card-body';
      bodyDiv.appendChild(createCardField('📧 Email Hotmail', row.email));
      bodyDiv.appendChild(createCardField('🔑 Mật khẩu', row.password));

      // Tự động tạo email khôi phục nếu chưa có
      if (!row.recoveryEmail && !done) {
        addRecoveryEmailIfMissing(row);
      }

      if (row.recoveryEmail) {
        const mailField = createCardField('✨ Mail khôi phục đã tạo', row.recoveryEmail);
        bodyDiv.appendChild(mailField);

        if (!done) {
          bodyDiv.appendChild(createOtpField(row));
        }
      }
      card.appendChild(bodyDiv);

      // Footer
      if (!done) {
        const footerDiv = document.createElement('div');
        footerDiv.className = 'card-footer';

        const btnChangeMail = document.createElement('button');
        btnChangeMail.className = 'card-btn btn-stop-otp';
        btnChangeMail.type = 'button';
        btnChangeMail.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          Đổi mail khôi phục
        `;
        btnChangeMail.addEventListener('click', async () => {
          row.recoveryEmail = createRecoveryEmail(row.email, row.sourceIndex);
          row.recoveryEmailGenerated = true;
          row.recoveryEmailSynced = false;
          await copyText(row.recoveryEmail, null);
          showStatus(`Đã đổi mail khôi phục mới cho ${row.name} và copy vào clipboard.`, 'success');
          applySearchAndFilter();
        });

        const btnSave = document.createElement('button');
        btnSave.className = 'card-btn btn-save-complete';
        btnSave.type = 'button';
        btnSave.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Hoàn thành & Lưu
        `;
        btnSave.addEventListener('click', async () => {
          btnSave.disabled = true;
          btnChangeMail.disabled = true;
          const originalText = btnSave.innerHTML;
          btnSave.innerHTML = 'Đang lưu...';
          
          const currentIndex = filteredRows.indexOf(row);
          const nextRow = (currentIndex !== -1) ? getAdjacentRow(filteredRows, currentIndex, 1) : null;

          try {
            const scriptUrl = elements.scriptUrl.value.trim();
            const sheetUrl = elements.sheetUrl.value.trim();
            if (scriptUrl) {
              const response = await fetch(scriptUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'text/plain;charset=utf-8'
                },
                body: JSON.stringify(buildSheetUpdatePayload(row, sheetUrl))
              });

              if (!response.ok) {
                throw new Error(`Yêu cầu lưu thất bại với mã trạng thái ${response.status}`);
              }

              const result = await response.json();
              if (!result.ok) {
                throw new Error(result.error || 'Lỗi không xác định từ Web App.');
              }

              markRecoveryEmailSynced(row);
              markRowDone(row);
              row.recoveryEmailFromSheet = true;
              showStatus(`Đã lưu thành công mail khôi phục cho ${row.name}!`, 'success');
            } else {
              markRowDone(row);
              showStatus(`Đã đánh dấu hoàn thành cho ${row.name} (chưa cấu hình Web App URL để lưu).`, 'warn');
            }

            // Copy Hotmail email of the next account to clipboard
            if (nextRow && nextRow !== row) {
              await copyText(nextRow.email, null);
            }
          } catch (err) {
            showStatus(`Lỗi khi lưu: ${err.message}`, 'error');
          } finally {
            btnSave.disabled = false;
            btnChangeMail.disabled = false;
            btnSave.innerHTML = originalText;
            applySearchAndFilter();
          }
        });

        footerDiv.appendChild(btnChangeMail);
        footerDiv.appendChild(btnSave);
        card.appendChild(footerDiv);
      }

      elements.cardsGrid.appendChild(card);
    });
  };

  const updateStats = () => {
    elements.displayedCount.textContent = `${filteredRows.length} / ${matchedCount}`;
    const done = allRows.filter(isRowDone).length;
    const doing = allRows.length - done;
    elements.doneCount.textContent = done;
    elements.doingCount.textContent = doing;
  };

  const applySearchAndFilter = () => {
    const selectedName = elements.filterName.value;
    const selectedStatus = elements.filterStatus.value;
    const query = normalizeText(elements.searchQuery.value);
    const selectedLimit = elements.filterLimit.value;

    let tempRows = allRows;

    if (selectedName !== 'all') {
      tempRows = tempRows.filter(row => row.name === selectedName);
    }

    if (selectedStatus === 'doing') {
      tempRows = tempRows.filter(row => !isRowDone(row));
    } else if (selectedStatus === 'done') {
      tempRows = tempRows.filter(row => isRowDone(row));
    }

    if (query) {
      tempRows = tempRows.filter(row =>
        normalizeText(row.name).includes(query) ||
        normalizeText(row.email).includes(query) ||
        (row.recoveryEmail && normalizeText(row.recoveryEmail).includes(query))
      );
    }

    matchedCount = tempRows.length;

    if (selectedLimit !== 'all') {
      const limit = parseInt(selectedLimit, 10);
      filteredRows = tempRows.slice(0, limit);
    } else {
      filteredRows = tempRows;
    }

    updateStats();
    renderCards();
  };

  const populateNameFilter = () => {
    const names = [...new Set(allRows.map(row => row.name).filter(Boolean))].sort();
    elements.filterName.innerHTML = '<option value="all">Tất cả mọi người</option>';
    names.forEach(name => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      elements.filterName.appendChild(option);
    });
  };

  const loadRowsFromSheet = async (sheetUrl) => {
    try {
      const response = await fetch(`${toCsvUrl(sheetUrl)}&cacheBust=${Date.now()}`, {
        cache: 'no-store'
      });
      if (!response.ok) {
        throw new Error('CSV export failed');
      }
      return mapRows(parseCsv(await response.text()));
    } catch {
      return loadRowsWithJsonp(sheetUrl);
    }
  };

  const loadSheetData = async () => {
    const url = elements.sheetUrl.value.trim();
    if (!url) {
      showStatus('Vui lòng cấu hình link Google Sheet.', 'warn');
      elements.sheetConfigPanel.classList.add('show');
      return;
    }
    showStatus('Đang tải sheet...', 'info');
    elements.loadSheet.disabled = true;
    try {
      allRows = await loadRowsFromSheet(url);
      if (!allRows.length) {
        throw new Error('Sheet không có dòng dữ liệu hợp lệ.');
      }
      populateNameFilter();
      applySearchAndFilter();
      showStatus(`Đã tải ${allRows.length} dòng từ sheet.`, 'success');
      elements.sheetConfigPanel.classList.remove('show');
    } catch (error) {
      allRows = [];
      filteredRows = [];
      renderCards();
      showStatus(error.message, 'error');
    } finally {
      elements.loadSheet.disabled = false;
    }
  };

  // Toggle Config Drawer
  elements.toggleConfig.addEventListener('click', () => {
    elements.sheetConfigPanel.classList.toggle('show');
  });

  // Load configuration from LocalStorage
  const savedSheetUrl = localStorage.getItem('sheetUrl');
  const savedWebmailUrl = localStorage.getItem('webmailUrl');
  const savedFilterLimit = localStorage.getItem('filterLimit');

  if (savedSheetUrl) elements.sheetUrl.value = savedSheetUrl;
  elements.scriptUrl.value = DEFAULT_SCRIPT_URL;
  localStorage.setItem('scriptUrl', DEFAULT_SCRIPT_URL);
  if (savedWebmailUrl) elements.webmailUrl.value = savedWebmailUrl;
  if (savedFilterLimit) {
    elements.filterLimit.value = savedFilterLimit;
  } else {
    elements.filterLimit.value = '3';
  }

  // Load Sheet click handler
  elements.loadSheet.addEventListener('click', () => {
    localStorage.setItem('sheetUrl', elements.sheetUrl.value.trim());
    localStorage.setItem('scriptUrl', elements.scriptUrl.value.trim());
    localStorage.setItem('webmailUrl', elements.webmailUrl.value.trim());
    loadSheetData();
  });

  // Refresh handler
  elements.refreshBtn.addEventListener('click', () => {
    loadSheetData();
  });

  // Webmail button handler
  elements.webmailBtn.addEventListener('click', () => {
    const webmail = elements.webmailUrl.value.trim() || 'https://mail.kp.vn';
    window.open(webmail, '_blank');
  });

  // Filters event listeners
  elements.filterName.addEventListener('change', applySearchAndFilter);
  elements.filterStatus.addEventListener('change', applySearchAndFilter);
  elements.filterLimit.addEventListener('change', () => {
    localStorage.setItem('filterLimit', elements.filterLimit.value);
    applySearchAndFilter();
  });
  elements.searchQuery.addEventListener('input', applySearchAndFilter);

  // Auto-load if sheetUrl was saved
  if (savedSheetUrl) {
    loadSheetData();
  } else {
    showStatus('Vui lòng click "Đổi link Google Sheet" để cấu hình liên kết và tải dữ liệu.', 'info');
    elements.sheetConfigPanel.classList.add('show');
  }
}

function loadRowsWithJsonp(sheetUrl) {
  return new Promise((resolve, reject) => {
    const callbackName = `sheetToolCallback_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const script = document.createElement('script');

    const cleanup = () => {
      script.remove();
      delete window[callbackName];
    };

    window[callbackName] = (response) => {
      cleanup();

      if (response?.status === 'error') {
        reject(new Error(response.errors?.[0]?.detailed_message || 'Không tải được sheet.'));
        return;
      }

      const rows = mapGvizTable(response?.table);
      resolve(rows);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('Không tải được sheet. Hãy kiểm tra sheet đã public chưa.'));
    };

    script.src = toGvizUrl(sheetUrl, callbackName);
    document.head.append(script);
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

if (typeof document !== 'undefined') {
  initApp();
}
