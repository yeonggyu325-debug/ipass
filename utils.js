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
 * @description 공통 유틸리티 모듈
 * @responsibility
 * - 날짜 포맷 변환
 * - 입력값 자동 포맷 (하이픈 삽입 등)
 * - Toast 알림 표시
 * - localStorage 읽기/쓰기 래퍼
 * @sideEffects localStorage 공통 키 읽기/쓰기 및 Toast 표시
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

let appToast;

/**
 * @description 앱에서 사용하는 localStorage 컨테이너의 기본 구조를 보장합니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * initializeStorageContainers();
 */
function initializeStorageContainers() {
  ensureObjectStorage(STORAGE_KEYS.companyProfiles);
  ensureObjectStorage(STORAGE_KEYS.attachmentLinks);
  ensureObjectStorage(STORAGE_KEYS.naCriteria);
  ensureObjectStorage(STORAGE_KEYS.evaluationSubmissions);
  ensureObjectStorage(STORAGE_KEYS.scoringData);
  ensureObjectStorage(STORAGE_KEYS.publicResults);
  ensureArrayStorage(STORAGE_KEYS.evaluationPeriods);
}

/**
 * @description Bootstrap Toast 인스턴스를 초기화합니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * initToast();
 */
function initToast() {
  appToast = new bootstrap.Toast(document.getElementById('appToast'), { delay: 2400 });
}

/**
 * @description 앱 전역 CustomEvent를 발행합니다.
 * @param {*} name - name 값입니다.
 * @param {*} detail - detail 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * emitAppEvent(name, detail);
 */
function emitAppEvent(name, detail = {}) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

/**
 * @description 라우터에 SPA 경로 이동을 요청합니다.
 * @param {*} route - route 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * requestRoute(route);
 */
function requestRoute(route) {
  emitAppEvent('ipass:route', { route });
}

/**
 * @description 라우터에 특정 페이지 표시를 요청합니다.
 * @param {*} pageId - pageId 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * requestPage(pageId);
 */
function requestPage(pageId) {
  emitAppEvent('ipass:page', { pageId });
}

/**
 * @description 라우터에 로그아웃 처리를 요청합니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * requestLogout();
 */
function requestLogout() {
  emitAppEvent('ipass:logout');
}

/**
 * @description 라우터에 특정 화면 갱신을 요청합니다.
 * @param {*} target - target 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * requestRefresh(target);
 */
function requestRefresh(target) {
  emitAppEvent('ipass:refresh', { target });
}

/**
 * @description ensureObjectStorage 함수의 책임을 수행합니다.
 * @param {*} key - key 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * ensureObjectStorage(key);
 */
function ensureObjectStorage(key) {
      try {
        const value = JSON.parse(localStorage.getItem(key));
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          localStorage.setItem(key, JSON.stringify({}));
        }
      } catch (error) {
        localStorage.setItem(key, JSON.stringify({}));
      }
    }

/**
 * @description ensureArrayStorage 함수의 책임을 수행합니다.
 * @param {*} key - key 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * ensureArrayStorage(key);
 */
function ensureArrayStorage(key) {
      try {
        const value = JSON.parse(localStorage.getItem(key));
        if (!Array.isArray(value)) {
          localStorage.setItem(key, JSON.stringify([]));
        }
      } catch (error) {
        localStorage.setItem(key, JSON.stringify([]));
      }
    }

/**
 * @description loadObject 함수의 책임을 수행합니다.
 * @param {*} key - key 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * loadObject(key);
 */
function loadObject(key) {
      try {
        const value = JSON.parse(localStorage.getItem(key));
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
      } catch (error) {
        return {};
      }
    }

/**
 * @description saveObject 함수의 책임을 수행합니다.
 * @param {*} key - key 값입니다.
 * @param {*} value - value 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * saveObject(key, value);
 */
function saveObject(key, value) {
      localStorage.setItem(key, JSON.stringify(value));
    }

/**
 * @description loadPeriods 함수의 책임을 수행합니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * loadPeriods();
 */
function loadPeriods() {
      try {
        const periods = JSON.parse(localStorage.getItem(STORAGE_KEYS.evaluationPeriods));
        return Array.isArray(periods) ? periods : [];
      } catch (error) {
        return [];
      }
    }

/**
 * @description savePeriods 함수의 책임을 수행합니다.
 * @param {*} periods - periods 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * savePeriods(periods);
 */
function savePeriods(periods) {
      localStorage.setItem(STORAGE_KEYS.evaluationPeriods, JSON.stringify(periods));
      syncActivePeriodId();
    }

/**
 * @description getCurrentUserSnapshot 함수의 책임을 수행합니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * getCurrentUserSnapshot();
 */
function getCurrentUserSnapshot() {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.currentUser));
      } catch (error) {
        return null;
      }
    }

/**
 * @description getCurrentUserRecord 함수의 책임을 수행합니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * getCurrentUserRecord();
 */
function getCurrentUserRecord() {
      const currentUser = getCurrentUserSnapshot();
      if (!currentUser || !currentUser.id) {
        return null;
      }
      return loadUsers().find((user) => user.id === currentUser.id) || null;
    }

/**
 * @description setCurrentUser 함수의 책임을 수행합니다.
 * @param {*} user - user 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * setCurrentUser(user);
 */
function setCurrentUser(user) {
      localStorage.setItem(STORAGE_KEYS.currentUser, JSON.stringify({
        id: user.id,
        role: user.role,
        companyName: user.companyName
      }));
    }

/**
 * @description loadUsers 함수의 책임을 수행합니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * loadUsers();
 */
function loadUsers() {
      try {
        const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.users));
        return Array.isArray(users) ? users : [];
      } catch (error) {
        return [];
      }
    }

/**
 * @description saveUsers 함수의 책임을 수행합니다.
 * @param {*} users - users 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * saveUsers(users);
 */
function saveUsers(users) {
      localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(users));
    }

/**
 * @description checkAutoNA 함수의 책임을 수행합니다.
 * @param {*} itemId - itemId 값입니다.
 * @param {*} industryCode - industryCode 값입니다.
 * @param {*} workerCount - workerCount 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * checkAutoNA(itemId, industryCode, workerCount);
 */
function checkAutoNA(itemId, industryCode, workerCount) {
      const criteria = loadObject(STORAGE_KEYS.naCriteria)[itemId];
      if (!criteria) {
        return false;
      }

      const count = Number(workerCount);
      if (!Number.isFinite(count)) {
        return false;
      }

      const industryOnly = Array.isArray(criteria.industryOnly) ? criteria.industryOnly : [];
      if (industryOnly.includes(industryCode)) {
        return true;
      }

      const industryWithWorker = Array.isArray(criteria.industryWithWorker) ? criteria.industryWithWorker : [];
      const matchedIndustryWorker = industryWithWorker.some((rule) => (
        rule.industry === industryCode && count <= Number(rule.maxWorker)
      ));
      if (matchedIndustryWorker) {
        return true;
      }

      const allIndustryMaxWorker = criteria.allIndustryMaxWorker;
      if (allIndustryMaxWorker !== null && allIndustryMaxWorker !== undefined && allIndustryMaxWorker !== '') {
        return count <= Number(allIndustryMaxWorker);
      }

      return false;
    }

/**
 * @description getActivePeriod 함수의 책임을 수행합니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * getActivePeriod();
 */
function getActivePeriod() {
      const activePeriodId = localStorage.getItem(STORAGE_KEYS.activePeriodId);
      return loadPeriods().find((period) => period.id === activePeriodId && period.status === 'active')
        || loadPeriods().find((period) => period.status === 'active')
        || null;
    }

/**
 * @description canSubmitNow 함수의 책임을 수행합니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * canSubmitNow();
 */
function canSubmitNow() {
      const period = getActivePeriod();
      return Boolean(period && !isPastPeriodEnd(period));
    }

/**
 * @description getSubmitBlockMessage 함수의 책임을 수행합니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * getSubmitBlockMessage();
 */
function getSubmitBlockMessage() {
      const period = getActivePeriod();
      if (!period) {
        return '현재 진행 중인 평가가 없습니다.';
      }
      if (isPastPeriodEnd(period)) {
        return '제출 기간이 마감되었습니다.';
      }
      return '';
    }

/**
 * @description isPastPeriodEnd 함수의 책임을 수행합니다.
 * @param {*} period - period 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * isPastPeriodEnd(period);
 */
function isPastPeriodEnd(period) {
      if (!period || !period.endDate) {
        return false;
      }
      return new Date() > new Date(`${period.endDate}T23:59:59`);
    }

/**
 * @description getSubmissionKey 함수의 책임을 수행합니다.
 * @param {*} companyId - companyId 값입니다.
 * @param {*} periodId - periodId 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * getSubmissionKey(companyId, periodId);
 */
function getSubmissionKey(companyId, periodId) {
      return `${companyId}_${periodId}`;
    }

/**
 * @description formatBizNumber 함수의 책임을 수행합니다.
 * @param {*} value - value 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * formatBizNumber(value);
 */
function formatBizNumber(value) {
      const digits = value.replace(/\D/g, '').slice(0, 10);
      if (digits.length <= 3) {
        return digits;
      }
      if (digits.length <= 5) {
        return `${digits.slice(0, 3)}-${digits.slice(3)}`;
      }
      return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
    }

/**
 * @description formatPhoneNumber 함수의 책임을 수행합니다.
 * @param {*} value - value 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * formatPhoneNumber(value);
 */
function formatPhoneNumber(value) {
      const digits = value.replace(/\D/g, '').slice(0, 11);
      if (digits.length <= 3) {
        return digits;
      }
      if (digits.length <= 7) {
        return `${digits.slice(0, 3)}-${digits.slice(3)}`;
      }
      return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    }

/**
 * @description autoResizeTextarea 함수의 책임을 수행합니다.
 * @param {*} textarea - textarea 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * autoResizeTextarea(textarea);
 */
function autoResizeTextarea(textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.max(100, textarea.scrollHeight)}px`;
    }

/**
 * @description escapeAttribute 함수의 책임을 수행합니다.
 * @param {*} value - value 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * escapeAttribute(value);
 */
function escapeAttribute(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

/**
 * @description getEmptyCriteria 함수의 책임을 수행합니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * getEmptyCriteria();
 */
function getEmptyCriteria() {
      return {
        industryOnly: [],
        industryWithWorker: [],
        allIndustryMaxWorker: null
      };
    }

/**
 * @description hasNaCriteria 함수의 책임을 수행합니다.
 * @param {*} criteria - criteria 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * hasNaCriteria(criteria);
 */
function hasNaCriteria(criteria) {
      if (!criteria) {
        return false;
      }
      const industryOnly = Array.isArray(criteria.industryOnly) ? criteria.industryOnly : [];
      const industryWithWorker = Array.isArray(criteria.industryWithWorker) ? criteria.industryWithWorker : [];
      const allIndustryMaxWorker = criteria.allIndustryMaxWorker;
      return industryOnly.length > 0 || industryWithWorker.length > 0 || (
        allIndustryMaxWorker !== null && allIndustryMaxWorker !== undefined && allIndustryMaxWorker !== ''
      );
    }

/**
 * @description isValidUrl 함수의 책임을 수행합니다.
 * @param {*} url - url 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * isValidUrl(url);
 */
function isValidUrl(url) {
      try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch (error) {
        return false;
      }
    }

/**
 * @description createCell 함수의 책임을 수행합니다.
 * @param {*} text - text 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * createCell(text);
 */
function createCell(text) {
      const cell = document.createElement('td');
      cell.textContent = text;
      return cell;
    }

/**
 * @description createStatusCell 함수의 책임을 수행합니다.
 * @param {*} statusMeta - statusMeta 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * createStatusCell(statusMeta);
 */
function createStatusCell(statusMeta) {
      const cell = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = `status-badge ${statusMeta.className}`;
      badge.textContent = statusMeta.label;
      cell.appendChild(badge);
      return cell;
    }

/**
 * @description createActionCell 함수의 책임을 수행합니다.
 * @param {*} action - action 값입니다.
 * @param {*} userId - userId 값입니다.
 * @param {*} label - label 값입니다.
 * @param {*} iconClass - iconClass 값입니다.
 * @param {*} buttonClass - buttonClass 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * createActionCell(action, userId, label, iconClass, buttonClass);
 */
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

/**
 * @description createAttachmentActionCell 함수의 책임을 수행합니다.
 * @param {*} itemId - itemId 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * createAttachmentActionCell(itemId);
 */
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

/**
 * @description createPeriodActionCell 함수의 책임을 수행합니다.
 * @param {*} action - action 값입니다.
 * @param {*} periodId - periodId 값입니다.
 * @param {*} label - label 값입니다.
 * @param {*} iconClass - iconClass 값입니다.
 * @param {*} buttonClass - buttonClass 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * createPeriodActionCell(action, periodId, label, iconClass, buttonClass);
 */
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

/**
 * @description appendEmptyRow 함수의 책임을 수행합니다.
 * @param {*} tbody - tbody 값입니다.
 * @param {*} colspan - colspan 값입니다.
 * @param {*} message - message 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * appendEmptyRow(tbody, colspan, message);
 */
function appendEmptyRow(tbody, colspan, message) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = colspan;
      cell.className = 'empty-row';
      cell.textContent = message;
      row.appendChild(cell);
      tbody.appendChild(row);
    }

/**
 * @description showToast 함수의 책임을 수행합니다.
 * @param {*} message - message 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * showToast(message);
 */
function showToast(message) {
      document.getElementById('toastMessage').textContent = message;
      appToast.show();
    }

/**
 * @description formatDate 함수의 책임을 수행합니다.
 * @param {*} date - date 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * formatDate(date);
 */
function formatDate(date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

/**
 * @description formatPeriodRange 함수의 책임을 수행합니다.
 * @param {*} startDate - startDate 값입니다.
 * @param {*} endDate - endDate 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * formatPeriodRange(startDate, endDate);
 */
function formatPeriodRange(startDate, endDate) {
      return `${formatDotDate(startDate)} ~ ${formatDotDate(endDate)}`;
    }

/**
 * @description formatDotDate 함수의 책임을 수행합니다.
 * @param {*} value - value 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * formatDotDate(value);
 */
function formatDotDate(value) {
      if (!value) {
        return '-';
      }
      const [year, month, day] = value.split('-');
      return `${year} . ${month} . ${day}`;
    }

    // 유효배점 = 전체배점(가점제외) - N/A항목 배점 합계
    // 환산점수 = (실제취득점수 ÷ 유효배점) × 100
    // 최종점수 = 환산점수 + 가점 (100점 초과 불가)
    // 등급 기준:
    //   90점 이상           → 안전관리 우수협력사
    //   70점 이상 90점 미만 → 적격협력사
    //   70점 미만           → 역량강화 대상협력사
