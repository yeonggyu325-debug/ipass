/**
 * @file app.js
 * @description 애플리케이션 진입점 및 라우팅 모듈
 * - 초기 로딩 최적화: 로그인 화면 즉시 표시 후 백그라운드 초기화
 */

async function initializeApp() {
  // 1. 로그인 화면 즉시 표시 (사용자가 빈 화면을 보지 않음)
  showPage('loginPage');

  // 2. GAS 워밍업 — 백그라운드 실행 (await 없음)
  warmupApi();

  // 3. Bootstrap 컴포넌트 · 정적 UI 즉시 초기화 (네트워크 불필요)
  initBootstrapComponents();
  populateStaticSelects();
  bindAppEvents();
  bindEvents();
  initScoringModule();

  // 4. 스토리지 초기화 + 공통 데이터 프리패치 (백그라운드)
  initStorage().then(async () => {
    const currentUser = await getCurrentUserRecord();
    if (currentUser) {
      await routeByUser(currentUser);
    }
    // 로그인하지 않은 경우 이미 loginPage가 표시 중이므로 추가 처리 불필요
  }).catch((err) => {
    console.error('initStorage 실패:', err);
  });
}

/**
 * 각 모듈의 초기 저장소 세팅을 조율합니다.
 */
async function initStorage() {
  await initAuthStorage();
  await prefetchCommonData();
  await syncActivePeriodId();
}

/**
 * 각 모듈의 Bootstrap 컴포넌트 초기화를 조율합니다.
 */
function initBootstrapComponents() {
  initToast();
  initAuthComponents();
  initAdminComponents();
  initCompanyComponents();
}

/**
 * 모듈에서 발행한 앱 전역 이벤트를 라우터에 연결합니다.
 */
function bindAppEvents() {
  window.addEventListener('ipass:route', handleAppRouteRequest);
  window.addEventListener('ipass:page', handleAppPageRequest);
  window.addEventListener('ipass:logout', handleAppLogoutRequest);
  window.addEventListener('ipass:refresh', handleAppRefreshRequest);
}

function handleAppRouteRequest(event) { navigate(event.detail.route); }
function handleAppPageRequest(event)  { showPage(event.detail.pageId); }
function handleAppLogoutRequest()     { logout(); }

async function handleAppRefreshRequest(event) {
  if (event.detail.target === 'admin-dashboard') {
    await renderAdminDashboard();
  }
}

/**
 * 전역 DOM 이벤트 리스너를 등록합니다.
 */
function bindEvents() {
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('loginCompanyLogo').addEventListener('error', handleLoginLogoError);
  document.getElementById('openCreateAccountBtn').addEventListener('click', openCreateAccountModal);
  document.getElementById('checkDuplicateBtn').addEventListener('click', checkDuplicateId);
  document.getElementById('saveAccountBtn').addEventListener('click', saveAccount);
  document.getElementById('accountTableBody').addEventListener('click', handleAccountTableClick);
  document.getElementById('saveAttachmentBtn').addEventListener('click', saveAttachmentLink);
  document.getElementById('attachmentTableBody').addEventListener('click', handleAttachmentTableClick);
  document.getElementById('addIndustryWorkerRuleBtn').addEventListener('click', addIndustryWorkerRule);
  document.getElementById('industryWorkerTags').addEventListener('click', handleRuleTagClick);
  document.getElementById('saveNaCriteriaBtn').addEventListener('click', saveNaCriteriaForSelectedItem);
  document.getElementById('openCreatePeriodBtn').addEventListener('click', openCreatePeriodModal);
  document.getElementById('fillFirstHalfBtn').addEventListener('click', () => fillPeriodTitle('first'));
  document.getElementById('fillSecondHalfBtn').addEventListener('click', () => fillPeriodTitle('second'));
  document.getElementById('savePeriodBtn').addEventListener('click', savePeriod);
  document.getElementById('periodTableBody').addEventListener('click', handlePeriodTableClick);
  document.getElementById('searchAddressBtn').addEventListener('click', openPostcodeSearch);
  document.getElementById('profileBizNumber').addEventListener('input', handleBizNumberInput);
  document.getElementById('profileManagerPhone').addEventListener('input', handlePhoneInput);
  document.getElementById('profileForm').addEventListener('submit', saveProfile);
  document.getElementById('evaluationTabContent').addEventListener('input', handleEvaluationInput);
  document.getElementById('evaluationTabContent').addEventListener('change', handleEvaluationInput);
  document.getElementById('evaluationTabContent').addEventListener('click', handleEvaluationClick);
  document.getElementById('saveDraftBtn').addEventListener('click', saveEvaluationDraft);
  document.getElementById('openSubmitConfirmBtn').addEventListener('click', openSubmitConfirmModal);
  document.getElementById('confirmSubmitBtn').addEventListener('click', submitEvaluation);

  document.getElementById('accountId').addEventListener('input', () => {
    resetDuplicateCheck();
    setIdCheckMessage('영문, 숫자, 마침표, 밑줄, 하이픈 3~30자', 'muted');
  });

  document.querySelectorAll('.logout-btn').forEach((button) => {
    button.addEventListener('click', logout);
  });

  document.querySelectorAll('[data-route]').forEach((element) => {
    element.addEventListener('click', (event) => {
      event.preventDefault();
      navigate(event.currentTarget.dataset.route);
    });
  });

  document.querySelectorAll('[data-ready-message]').forEach((element) => {
    element.addEventListener('click', () => {
      alert(element.dataset.readyMessage);
    });
  });
}

/**
 * 업종 선택 UI와 N/A 기준 선택 UI의 정적 옵션을 채웁니다.
 */
function populateStaticSelects() {
  const profileIndustry = document.getElementById('profileIndustry');
  profileIndustry.innerHTML = '<option value="" selected disabled>-- 업종을 선택하세요 --</option>';
  INDUSTRIES.forEach((industry) => {
    profileIndustry.appendChild(new Option(industry.name, industry.code));
  });

  const naIndustrySelect = document.getElementById('naIndustrySelect');
  naIndustrySelect.innerHTML = '<option value="">업종 선택</option>';
  INDUSTRIES.forEach((industry) => {
    naIndustrySelect.appendChild(new Option(`${industry.code} - ${industry.name}`, industry.code));
  });

  const checkboxWrap = document.getElementById('industryOnlyCheckboxes');
  checkboxWrap.innerHTML = '';
  INDUSTRIES.forEach((industry) => {
    const item = document.createElement('div');
    item.className = 'form-check';
    item.innerHTML = `
      <input class="form-check-input" type="checkbox" value="${industry.code}" id="industryOnly_${industry.code}">
      <label class="form-check-label" for="industryOnly_${industry.code}">
        <strong>${industry.code}</strong> ${industry.name}
      </label>
    `;
    checkboxWrap.appendChild(item);
  });
}

function handleLoginLogoError(event) {
  event.target.style.display = 'none';
  document.getElementById('loginLogoFallback').style.display = 'inline-block';
}

/**
 * 로그인 폼 제출 처리
 * - 로딩 중일 수 있으므로 prefetch 완료 보장 후 인증
 */
async function handleLogin(event) {
  event.preventDefault();

  const submitBtn = event.target.querySelector('[type="submit"]');
  const originalText = submitBtn ? submitBtn.textContent : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = '로그인 중...';
  }

  try {
    const loginId = document.getElementById('loginId').value.trim();
    const loginPassword = document.getElementById('loginPassword').value;
    const user = await authenticateUser(loginId, loginPassword);
    const error = document.getElementById('loginError');

    if (!user) {
      error.classList.remove('d-none');
      return;
    }

    error.classList.add('d-none');
    setCurrentUser(user);
    await routeByUser(user);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  }
}

async function routeByUser(user) {
  if (user.role === 'admin') {
    await renderAdminDashboard();
    showPage('adminMainPage');
    return;
  }
  await renderPartnerMain();
  showPage('partnerMainPage');
}

async function navigate(route) {
  const user = await getCurrentUserRecord();
  if (!user) { logout(); return; }

  if (route === 'admin-main' && user.role === 'admin') {
    await renderAdminDashboard();
    showPage('adminMainPage');
  }
  if (route === 'account-manage' && user.role === 'admin') {
    await renderAccountTable();
    showPage('accountManagePage');
  }
  if (route === 'attachment-manage' && user.role === 'admin') {
    await renderAttachmentTable();
    showPage('attachmentManagePage');
  }
  if (route === 'na-manage' && user.role === 'admin') {
    await renderNaCriteriaPage();
    showPage('naManagePage');
  }
  if (route === 'period-manage' && user.role === 'admin') {
    await renderPeriodTable();
    showPage('periodManagePage');
  }
  if (route === 'scoring-manage' && user.role === 'admin') {
    await renderScoringManagePage();
    showPage('scoringManagePage');
  }
  if (route === 'scoring-page' && user.role === 'admin') {
    await renderScoringPage();
    initScoringButtons();
    updateScoringProgress();
    showPage('scoringPage');
  }
  if (route === 'partner-main' && user.role === 'partner') {
    await renderPartnerMain();
    showPage('partnerMainPage');
  }
  if (route === 'profile' && user.role === 'partner') {
    if (!await canSubmitNow()) {
      alert(await getSubmitBlockMessage());
      await renderPartnerMain();
      showPage('partnerMainPage');
      return;
    }
    await renderProfileForm();
    showPage('profilePage');
  }
  if (route === 'evaluation-form' && user.role === 'partner') {
    if (!await canSubmitNow()) {
      alert(await getSubmitBlockMessage());
      await renderPartnerMain();
      showPage('partnerMainPage');
      return;
    }
    await renderEvaluationForm();
    showPage('evaluationFormPage');
  }
}

function showPage(pageId) {
  updateNavUserNames();
  document.querySelectorAll('.page').forEach((page) => {
    page.classList.toggle('active', page.id === pageId);
  });
  window.scrollTo(0, 0);
}

async function updateNavUserNames() {
  const user = await getCurrentUserRecord();
  document.querySelectorAll('.current-user-name').forEach((element) => {
    element.textContent = user ? user.companyName : '';
  });
}

function logout() {
  clearCurrentUser();
  clearCache();
  document.getElementById('loginForm').reset();
  document.getElementById('loginError').classList.add('d-none');
  showPage('loginPage');
}

document.addEventListener('DOMContentLoaded', initializeApp);
