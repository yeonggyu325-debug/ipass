/**
 * @file utils.js
 * @description 공통 유틸리티 모듈 (Google Sheets 연동 + 캐시 최적화 버전)
 */

// ── Google Apps Script API 설정 ──
const API_URL = 'https://script.google.com/macros/s/AKfycbxvAwQipNVn7GRgjgRrQaTvp4gGwqkPMUFhU4ZVzxbjCSSUcA3WTmspIeBjkjBu-8IfKw/exec';

// ── 인메모리 캐시 (TTL: 5분) ──
const _cache = {};
const CACHE_TTL = 5 * 60 * 1000;

function getCached(key) {
  const entry = _cache[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    delete _cache[key];
    return null;
  }
  return entry.data;
}

function setCached(key, data) {
  _cache[key] = { data, ts: Date.now() };
}

function clearCache(key) {
  if (key) {
    delete _cache[key];
  } else {
    Object.keys(_cache).forEach((k) => delete _cache[k]);
  }
}

// ── API 공통 호출 함수 ──
async function apiGet(action, params = {}) {
  const url = new URL(API_URL);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

async function apiPost(action, params = {}, body = {}) {
  const url = new URL(API_URL);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    method: 'POST',
    body: JSON.stringify(body)
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

// ── GAS 워밍업 (콜드스타트 방지) ──
function warmupApi() {
  apiGet('ping').catch(() => {});
}

// ── Sheets DB 함수 ──
async function dbGetAll(sheetName) {
  return await apiGet('getSheet', { sheet: sheetName });
}

async function dbGet(sheetName, key, value) {
  return await apiGet('getRow', { sheet: sheetName, key, value });
}

async function dbSave(sheetName, keyField, data) {
  return await apiPost('upsertRow', { sheet: sheetName, key: keyField }, data);
}

async function dbDelete(sheetName, keyField, value) {
  return await apiGet('deleteRow', { sheet: sheetName, key: keyField, value });
}

// ── 파일 업로드 ──
async function uploadFileToDrive(file, subFolder = '') {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const base64 = e.target.result.split(',')[1];
        const url = new URL(API_URL);
        url.searchParams.set('action', 'uploadFile');
        url.searchParams.set('fileName', file.name);
        url.searchParams.set('mimeType', file.type);
        url.searchParams.set('subFolder', subFolder);
        const res = await fetch(url.toString(), {
          method: 'POST',
          body: base64
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
        resolve(json.data);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsDataURL(file);
  });
}

// ── STORAGE_KEYS ──
const STORAGE_KEYS = {
  users: 'users',
  currentUser: 'currentUser',
  companyProfiles: 'companyProfiles',
  attachmentLinks: 'attachmentLinks',
  naCriteria: 'naCriteria',
  evaluationPeriods: 'evaluationPeriods',
  activePeriodId: 'activePeriodId',
  evaluationSubmissions: 'evaluationSubmissions',
  scoringData: 'scoringData',
  publicResults: 'publicResults'
};

// ── 시트명 매핑 ──
const SHEET_MAP = {
  [STORAGE_KEYS.users]:                'users',
  [STORAGE_KEYS.companyProfiles]:      'company_profiles',
  [STORAGE_KEYS.attachmentLinks]:      'attachments',
  [STORAGE_KEYS.naCriteria]:           'na_criteria',
  [STORAGE_KEYS.evaluationPeriods]:    'evaluation_periods',
  [STORAGE_KEYS.evaluationSubmissions]:'evaluation_submissions',
  [STORAGE_KEYS.scoringData]:          'scoring_data',
  [STORAGE_KEYS.publicResults]:        'public_results'
};

let appToast;

// ── Toast ──
function initToast() {
  appToast = new bootstrap.Toast(document.getElementById('appToast'), { delay: 2400 });
}

function showToast(message) {
  document.getElementById('toastMessage').textContent = message;
  appToast.show();
}

// ── CustomEvent 헬퍼 ──
function emitAppEvent(name, detail = {}) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function requestRoute(route) { emitAppEvent('ipass:route', { route }); }
function requestPage(pageId) { emitAppEvent('ipass:page', { pageId }); }
function requestLogout()     { emitAppEvent('ipass:logout'); }
function requestRefresh(target) { emitAppEvent('ipass:refresh', { target }); }

// ── Object 형태 데이터 (naCriteria, attachmentLinks 등) ──
// Sheets에 { key, value } 형태 1행으로 JSON 직렬화하여 저장
async function loadObject(storageKey) {
  const cached = getCached(storageKey);
  if (cached) return cached;

  try {
    const sheetName = SHEET_MAP[storageKey];
    if (!sheetName) return {};
    const rows = await dbGetAll(sheetName);
    // rows: [{ key: 'xxx', value: '{"..."}' }, ...]
    const result = {};
    if (Array.isArray(rows)) {
      rows.forEach((row) => {
        if (row.key) {
          try { result[row.key] = JSON.parse(row.value); }
          catch { result[row.key] = row.value; }
        }
      });
    }
    setCached(storageKey, result);
    return result;
  } catch {
    return {};
  }
}

async function saveObject(storageKey, obj) {
  const sheetName = SHEET_MAP[storageKey];
  if (!sheetName) return;

  // 각 키를 개별 행으로 upsert
  const entries = Object.entries(obj);
  await Promise.all(
    entries.map(([key, value]) =>
      dbSave(sheetName, 'key', { key, value: JSON.stringify(value) })
    )
  );
  setCached(storageKey, obj);
}

// ── Users ──
async function loadUsers() {
  const cached = getCached(STORAGE_KEYS.users);
  if (cached) return cached;

  try {
    const rows = await dbGetAll(SHEET_MAP[STORAGE_KEYS.users]);
    const users = Array.isArray(rows) ? rows : [];
    setCached(STORAGE_KEYS.users, users);
    return users;
  } catch {
    return [];
  }
}

async function saveUsers(users) {
  await Promise.all(
    users.map((user) => dbSave(SHEET_MAP[STORAGE_KEYS.users], 'id', user))
  );
  setCached(STORAGE_KEYS.users, users);
}

// ── currentUser (세션 — localStorage 유지) ──
function getCurrentUserSnapshot() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.currentUser));
  } catch {
    return null;
  }
}

async function getCurrentUserRecord() {
  const currentUser = getCurrentUserSnapshot();
  if (!currentUser || !currentUser.id) return null;
  const users = await loadUsers();
  return users.find((user) => user.id === currentUser.id) || null;
}

function setCurrentUser(user) {
  localStorage.setItem(STORAGE_KEYS.currentUser, JSON.stringify({
    id: user.id,
    role: user.role,
    companyName: user.companyName
  }));
}

// ── Periods ──
async function loadPeriods() {
  const cached = getCached(STORAGE_KEYS.evaluationPeriods);
  if (cached) return cached;

  try {
    const rows = await dbGetAll(SHEET_MAP[STORAGE_KEYS.evaluationPeriods]);
    const periods = Array.isArray(rows) ? rows : [];
    setCached(STORAGE_KEYS.evaluationPeriods, periods);
    return periods;
  } catch {
    return [];
  }
}

async function savePeriods(periods) {
  await Promise.all(
    periods.map((period) =>
      dbSave(SHEET_MAP[STORAGE_KEYS.evaluationPeriods], 'id', period)
    )
  );
  setCached(STORAGE_KEYS.evaluationPeriods, periods);
  await syncActivePeriodId();
}

async function syncActivePeriodId() {
  const periods = await loadPeriods();
  const active = periods.find((p) => p.status === 'active');
  if (active) {
    localStorage.setItem(STORAGE_KEYS.activePeriodId, active.id);
  } else {
    localStorage.removeItem(STORAGE_KEYS.activePeriodId);
  }
}

// ── 활성 회차 ──
async function getActivePeriod() {
  const activePeriodId = localStorage.getItem(STORAGE_KEYS.activePeriodId);
  const periods = await loadPeriods();
  return periods.find((p) => p.id === activePeriodId && p.status === 'active')
    || periods.find((p) => p.status === 'active')
    || null;
}

async function canSubmitNow() {
  const period = await getActivePeriod();
  return Boolean(period && !isPastPeriodEnd(period));
}

async function getSubmitBlockMessage() {
  const period = await getActivePeriod();
  if (!period) return '현재 진행 중인 평가가 없습니다.';
  if (isPastPeriodEnd(period)) return '제출 기간이 마감되었습니다.';
  return '';
}

function isPastPeriodEnd(period) {
  if (!period || !period.endDate) return false;
  return new Date() > new Date(`${period.endDate}T23:59:59`);
}

// ── 앱 초기화 시 병렬 프리패치 ──
async function prefetchCommonData() {
  await Promise.all([
    loadUsers(),
    loadPeriods(),
    loadObject(STORAGE_KEYS.attachmentLinks),
    loadObject(STORAGE_KEYS.naCriteria)
  ]);
}

// ── N/A 자동 판정 ──
function checkAutoNA(itemId, industryCode, workerCount) {
  // 동기 함수이므로 캐시에서만 읽음 — loadObject 후 사용 필요
  const allCriteria = getCached(STORAGE_KEYS.naCriteria) || {};
  const criteria = allCriteria[itemId];
  if (!criteria) return false;

  const count = Number(workerCount);
  if (!Number.isFinite(count)) return false;

  const industryOnly = Array.isArray(criteria.industryOnly) ? criteria.industryOnly : [];
  if (industryOnly.includes(industryCode)) return true;

  const industryWithWorker = Array.isArray(criteria.industryWithWorker) ? criteria.industryWithWorker : [];
  if (industryWithWorker.some((rule) => rule.industry === industryCode && count <= Number(rule.maxWorker))) return true;

  const allIndustryMaxWorker = criteria.allIndustryMaxWorker;
  if (allIndustryMaxWorker !== null && allIndustryMaxWorker !== undefined && allIndustryMaxWorker !== '') {
    return count <= Number(allIndustryMaxWorker);
  }
  return false;
}

function getSubmissionKey(companyId, periodId) {
  return `${companyId}_${periodId}`;
}

// ── 입력 포맷 ──
function formatBizNumber(value) {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

function formatPhoneNumber(value) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

// ── DOM 유틸 ──
function autoResizeTextarea(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.max(100, textarea.scrollHeight)}px`;
}

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function createCell(text) {
  const cell = document.createElement('td');
  cell.textContent = text;
  return cell;
}

function createStatusCell(statusMeta) {
  const cell = document.createElement('td');
  const badge = document.createElement('span');
  badge.className = `status-badge ${statusMeta.className}`;
  badge.textContent = statusMeta.label;
  cell.appendChild(badge);
  return cell;
}

function createActionCell(action, userId, label, iconClass, buttonClass) {
  const cell = document.createElement('td');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `btn btn-sm ${buttonClass}`;
  button.dataset.action = action;
  button.dataset.userId = userId;
  button.innerHTML = `<i class="fa-solid ${iconClass} me-1"></i>${label}`;
  cell.appendChild(button);
  return cell;
}

function createAttachmentActionCell(itemId) {
  const cell = document.createElement('td');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-sm btn-outline-primary';
  button.dataset.attachmentId = itemId;
  button.innerHTML = '<i class="fa-solid fa-link me-1"></i>링크 등록/수정';
  cell.appendChild(button);
  return cell;
}

function createPeriodActionCell(action, periodId, label, iconClass, buttonClass) {
  const cell = document.createElement('td');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `btn btn-sm ${buttonClass}`;
  button.dataset.periodAction = action;
  button.dataset.periodId = periodId;
  button.innerHTML = `<i class="fa-solid ${iconClass} me-1"></i>${label}`;
  cell.appendChild(button);
  return cell;
}

function appendEmptyRow(tbody, colspan, message) {
  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.colSpan = colspan;
  cell.className = 'empty-row';
  cell.textContent = message;
  row.appendChild(cell);
  tbody.appendChild(row);
}

// ── 날짜 포맷 ──
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatPeriodRange(startDate, endDate) {
  return `${formatDotDate(startDate)} ~ ${formatDotDate(endDate)}`;
}

function formatDotDate(value) {
  if (!value) return '-';
  const [year, month, day] = value.split('-');
  return `${year} . ${month} . ${day}`;
}

// ── N/A 기준 헬퍼 ──
function getEmptyCriteria() {
  return { industryOnly: [], industryWithWorker: [], allIndustryMaxWorker: null };
}

function hasNaCriteria(criteria) {
  if (!criteria) return false;
  const industryOnly = Array.isArray(criteria.industryOnly) ? criteria.industryOnly : [];
  const industryWithWorker = Array.isArray(criteria.industryWithWorker) ? criteria.industryWithWorker : [];
  const allIndustryMaxWorker = criteria.allIndustryMaxWorker;
  return industryOnly.length > 0 || industryWithWorker.length > 0
    || (allIndustryMaxWorker !== null && allIndustryMaxWorker !== undefined && allIndustryMaxWorker !== '');
}

function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// 유효배점 = 전체배점(가점제외) - N/A항목 배점 합계
// 환산점수 = (실제취득점수 ÷ 유효배점) × 100
// 최종점수 = 환산점수 + 가점 (100점 초과 불가)
// 등급 기준:
//   90점 이상           → 안전관리 우수협력사
//   70점 이상 90점 미만 → 적격협력사
//   70점 미만           → 역량강화 대상협력사
