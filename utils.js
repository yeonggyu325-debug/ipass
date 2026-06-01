// ── Google Apps Script API 설정 ──
const API_URL = 'https://script.google.com/macros/s/AKfycbxvAwQipNVn7GRgjgRrQaTvp4gGwqkPMUFhU4ZVzxbjCSSUcA3WTmspIeBjkjBu-8IfKw/exec';

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

// ── Sheets DB 함수 (localStorage 대체) ──
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

/**
 * @file utils.js
 * @description 공통 유틸리티 모듈 (Google Sheets 연동 버전)
 */

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

// ── 시트명 매핑 (STORAGE_KEY → Sheets 시트명) ──
const SHEET_MAP = {
  users: 'users',
  companyProfiles: 'company_profiles',
  attachmentLinks: 'attachments',
  naCriteria: 'na_criteria',
  evaluationPeriods: 'evaluation_periods',
  evaluationSubmissions: 'evaluation_submissions',
  scoringData: 'scoring_data',
  publicResults: 'results'
};

// ── 인메모리 캐시 ──
const _cache = {};

let appToast;

// ──────────────────────────────────────────
//  초기화
// ──────────────────────────────────────────

function initializeStorageContainers() {
  // Sheets 연동 버전에서는 별도 초기화 불필요
}

function initToast() {
  appToast = new bootstrap.Toast(document.getElementById('appToast'), { delay: 2400 });
}

// ──────────────────────────────────────────
//  이벤트 헬퍼
// ──────────────────────────────────────────

function emitAppEvent(name, detail = {}) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}
function requestRoute(route) { emitAppEvent('ipass:route', { route }); }
function requestPage(pageId) { emitAppEvent('ipass:page', { pageId }); }
function requestLogout() { emitAppEvent('ipass:logout'); }
function requestRefresh(target) { emitAppEvent('ipass:refresh', { target }); }

// ──────────────────────────────────────────
//  currentUser (세션 전용 — localStorage 유지)
// ──────────────────────────────────────────

function getCurrentUserSnapshot() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.currentUser));
  } catch { return null; }
}

async function getCurrentUserRecord() {
  const snap = getCurrentUserSnapshot();
  if (!snap || !snap.id) return null;
  const users = await loadUsers();
  return users.find(u => u.id === snap.id) || null;
}

function setCurrentUser(user) {
  localStorage.setItem(STORAGE_KEYS.currentUser, JSON.stringify({
    id: user.id,
    role: user.role,
    companyName: user.companyName
  }));
}

// ──────────────────────────────────────────
//  users  (배열, key = id)
// ──────────────────────────────────────────

async function loadUsers() {
  if (_cache.users) return _cache.users;
  try {
    const rows = await dbGetAll(SHEET_MAP.users);
    _cache.users = Array.isArray(rows) ? rows : [];
  } catch { _cache.users = []; }
  return _cache.users;
}

async function saveUsers(users) {
  _cache.users = users;
  for (const user of users) {
    await dbSave(SHEET_MAP.users, 'id', user);
  }
}

// ──────────────────────────────────────────
//  loadObject / saveObject  (객체형 데이터)
// ──────────────────────────────────────────

async function loadObject(key) {
  const sheet = SHEET_MAP[key];
  if (!sheet) return {};
  if (_cache[key]) return _cache[key];
  try {
    const rows = await dbGetAll(sheet);
    if (!Array.isArray(rows) || rows.length === 0) {
      _cache[key] = {};
      return {};
    }
    const keyField = Object.keys(rows[0])[0];
    const obj = {};
    rows.forEach(row => { if (row[keyField]) obj[row[keyField]] = row; });
    _cache[key] = obj;
  } catch { _cache[key] = {}; }
  return _cache[key];
}

async function saveObject(key, value) {
  const sheet = SHEET_MAP[key];
  _cache[key] = value;
  if (!sheet) return;
  for (const row of Object.values(value)) {
    if (row && typeof row === 'object') {
      const keyField = Object.keys(row)[0];
      await dbSave(sheet, keyField, row);
    }
  }
}

// ──────────────────────────────────────────
//  evaluationPeriods  (배열, key = id)
// ──────────────────────────────────────────

async function loadPeriods() {
  if (_cache.periods) return _cache.periods;
  try {
    const rows = await dbGetAll(SHEET_MAP.evaluationPeriods);
    _cache.periods = Array.isArray(rows) ? rows : [];
  } catch { _cache.periods = []; }
  return _cache.periods;
}

async function savePeriods(periods) {
  _cache.periods = periods;
  for (const p of periods) {
    await dbSave(SHEET_MAP.evaluationPeriods, 'id', p);
  }
  await syncActivePeriodId();
}

// ──────────────────────────────────────────
//  activePeriodId  (단일 값 → settings 시트)
// ──────────────────────────────────────────

async function syncActivePeriodId() {
  const periods = await loadPeriods();
  const active = periods.find(p => p.status === 'active');
  const id = active ? active.id : '';
  _cache.activePeriodId = id;
  try {
    await dbSave('settings', 'key', { key: 'activePeriodId', value: id });
  } catch { /* settings 시트 없으면 무시 */ }
}

async function _getActivePeriodId() {
  if (_cache.activePeriodId !== undefined) return _cache.activePeriodId;
  try {
    const row = await dbGet('settings', 'key', 'activePeriodId');
    _cache.activePeriodId = row ? row.value : '';
  } catch { _cache.activePeriodId = ''; }
  return _cache.activePeriodId;
}

// ──────────────────────────────────────────
//  캐시 무효화 (데이터 변경 후 필요시 호출)
// ──────────────────────────────────────────

function clearCache(key) {
  if (key) delete _cache[key];
  else Object.keys(_cache).forEach(k => delete _cache[k]);
}

// ──────────────────────────────────────────
//  getActivePeriod / canSubmitNow
// ──────────────────────────────────────────

async function getActivePeriod() {
  const activePeriodId = await _getActivePeriodId();
  const periods = await loadPeriods();
  return periods.find(p => p.id === activePeriodId && p.status === 'active')
    || periods.find(p => p.status === 'active')
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

// ──────────────────────────────────────────
//  naCriteria
// ──────────────────────────────────────────

async function checkAutoNA(itemId, industryCode, workerCount) {
  const all = await loadObject(STORAGE_KEYS.naCriteria);
  const criteria = all[itemId];
  if (!criteria) return false;

  const count = Number(workerCount);
  if (!Number.isFinite(count)) return false;

  const industryOnly = Array.isArray(criteria.industryOnly) ? criteria.industryOnly : [];
  if (industryOnly.includes(industryCode)) return true;

  const industryWithWorker = Array.isArray(criteria.industryWithWorker) ? criteria.industryWithWorker : [];
  if (industryWithWorker.some(r => r.industry === industryCode && count <= Number(r.maxWorker))) return true;

  const max = criteria.allIndustryMaxWorker;
  if (max !== null && max !== undefined && max !== '') return count <= Number(max);

  return false;
}

// ──────────────────────────────────────────
//  기타 유틸 (변경 없음)
// ──────────────────────────────────────────

function isPastPeriodEnd(period) {
  if (!period || !period.endDate) return false;
  return new Date() > new Date(`${period.endDate}T23:59:59`);
}

function getSubmissionKey(companyId, periodId) {
  return `${companyId}_${periodId}`;
}

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

function getEmptyCriteria() {
  return { industryOnly: [], industryWithWorker: [], allIndustryMaxWorker: null };
}

function hasNaCriteria(criteria) {
  if (!criteria) return false;
  const industryOnly = Array.isArray(criteria.industryOnly) ? criteria.industryOnly : [];
  const industryWithWorker = Array.isArray(criteria.industryWithWorker) ? criteria.industryWithWorker : [];
  const max = criteria.allIndustryMaxWorker;
  return industryOnly.length > 0 || industryWithWorker.length > 0
    || (max !== null && max !== undefined && max !== '');
}

function isValidUrl(url) {
  try {
    const p = new URL(url);
    return p.protocol === 'http:' || p.protocol === 'https:';
  } catch { return false; }
}

function createCell(text) {
  const td = document.createElement('td');
  td.textContent = text;
  return td;
}

function createStatusCell(statusMeta) {
  const td = document.createElement('td');
  const badge = document.createElement('span');
  badge.className = `status-badge ${statusMeta.className}`;
  badge.textContent = statusMeta.label;
  td.appendChild(badge);
  return td;
}

function createActionCell(action, userId, label, iconClass, buttonClass) {
  const td = document.createElement('td');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `btn btn-sm ${buttonClass}`;
  btn.dataset.action = action;
  btn.dataset.userId = userId;
  btn.innerHTML = `<i class="fa-solid ${iconClass} me-1"></i>${label}`;
  td.appendChild(btn);
  return td;
}

function createAttachmentActionCell(itemId) {
  const td = document.createElement('td');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-sm btn-outline-primary';
  btn.dataset.attachmentId = itemId;
  btn.innerHTML = '<i class="fa-solid fa-link me-1"></i>링크 등록/수정';
  td.appendChild(btn);
  return td;
}

function createPeriodActionCell(action, periodId, label, iconClass, buttonClass) {
  const td = document.createElement('td');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `btn btn-sm ${buttonClass}`;
  btn.dataset.periodAction = action;
  btn.dataset.periodId = periodId;
  btn.innerHTML = `<i class="fa-solid ${iconClass} me-1"></i>${label}`;
  td.appendChild(btn);
  return td;
}

function appendEmptyRow(tbody, colspan, message) {
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = colspan;
  td.className = 'empty-row';
  td.textContent = message;
  tr.appendChild(td);
  tbody.appendChild(tr);
}

function showToast(message) {
  document.getElementById('toastMessage').textContent = message;
  appToast.show();
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatPeriodRange(startDate, endDate) {
  return `${formatDotDate(startDate)} ~ ${formatDotDate(endDate)}`;
}

function formatDotDate(value) {
  if (!value) return '-';
  const [y, m, d] = value.split('-');
  return `${y} . ${m} . ${d}`;
}

// 유효배점 = 전체배점(가점제외) - N/A항목 배점 합계
// 환산점수 = (실제취득점수 ÷ 유효배점) × 100
// 최종점수 = 환산점수 + 가점 (100점 초과 불가)
// 등급 기준:
//   90점 이상           → 안전관리 우수협력사
//   70점 이상 90점 미만 → 적격협력사
//   70점 미만           → 역량강화 대상협력사
