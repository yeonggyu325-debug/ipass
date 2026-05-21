/**
 * @file app.js
 * @description 애플리케이션 진입점 및 라우팅 모듈
 * @responsibility
 * - 앱 초기화 (DOMContentLoaded)
 * - 페이지 전환 (라우팅)
 * - 전역 이벤트 바인딩
 * - 각 모듈 함수 호출 조율
 * @sideEffects 없음 (각 모듈에 위임)
 * @note 비즈니스 로직을 직접 포함하지 않음
 */

/**
 * @description 애플리케이션을 초기화하고 로그인 상태에 따라 첫 화면을 결정합니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * initializeApp();
 */
function initializeApp() {
  initStorage();
  initBootstrapComponents();
  populateStaticSelects();
  bindAppEvents();
  bindEvents();
  initScoringModule();

  const currentUser = getCurrentUserRecord();
  if (currentUser) {
    routeByUser(currentUser);
  } else {
    showPage('loginPage');
  }
}

/**
 * @description 각 모듈의 초기 저장소 세팅을 조율합니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * initStorage();
 */
function initStorage() {
  initializeStorageContainers();
  initAuthStorage();
  syncActivePeriodId();
}

/**
 * @description 각 모듈의 Bootstrap 컴포넌트 초기화를 조율합니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * initBootstrapComponents();
 */
function initBootstrapComponents() {
  initToast();
  initAuthComponents();
  initAdminComponents();
  initCompanyComponents();
}

/**
 * @description 모듈에서 발행한 앱 전역 이벤트를 라우터에 연결합니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * bindAppEvents();
 */
function bindAppEvents() {
  window.addEventListener('ipass:route', handleAppRouteRequest);
  window.addEventListener('ipass:page', handleAppPageRequest);
  window.addEventListener('ipass:logout', handleAppLogoutRequest);
  window.addEventListener('ipass:refresh', handleAppRefreshRequest);
}

/**
 * @description 전역 라우트 요청 이벤트를 처리합니다.
 * @param {*} event - event 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * handleAppRouteRequest(event);
 */
function handleAppRouteRequest(event) {
  navigate(event.detail.route);
}

/**
 * @description 전역 페이지 표시 요청 이벤트를 처리합니다.
 * @param {*} event - event 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * handleAppPageRequest(event);
 */
function handleAppPageRequest(event) {
  showPage(event.detail.pageId);
}

/**
 * @description 전역 로그아웃 요청 이벤트를 처리합니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * handleAppLogoutRequest();
 */
function handleAppLogoutRequest() {
  logout();
}

/**
 * @description 전역 화면 갱신 요청 이벤트를 처리합니다.
 * @param {*} event - event 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * handleAppRefreshRequest(event);
 */
function handleAppRefreshRequest(event) {
  if (event.detail.target === 'admin-dashboard') {
    renderAdminDashboard();
  }
}

/**
 * @description 전역 DOM 이벤트 리스너를 등록합니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * bindEvents();
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
 * @description 업종 선택 UI와 N/A 기준 선택 UI의 정적 옵션을 채웁니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * populateStaticSelects();
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

/**
 * @description 로그인 로고 이미지 로드 실패 시 텍스트 대체 로고를 표시합니다.
 * @param {*} event - event 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * handleLoginLogoError(event);
 */
function handleLoginLogoError(event) {
      event.target.style.display = 'none';
      document.getElementById('loginLogoFallback').style.display = 'inline-block';
    }

/**
 * @description 로그인 폼 제출을 처리하고 사용자 역할에 맞는 화면으로 이동합니다.
 * @param {*} event - event 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * handleLogin(event);
 */
function handleLogin(event) {
  event.preventDefault();
  const loginId = document.getElementById('loginId').value.trim();
  const loginPassword = document.getElementById('loginPassword').value;
  const user = authenticateUser(loginId, loginPassword);
  const error = document.getElementById('loginError');

  if (!user) {
    error.classList.remove('d-none');
    return;
  }

  error.classList.add('d-none');
  setCurrentUser(user);
  routeByUser(user);
}

/**
 * @description 사용자 역할에 따라 초기 화면으로 이동합니다.
 * @param {*} user - user 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * routeByUser(user);
 */
function routeByUser(user) {
      if (user.role === 'admin') {
        renderAdminDashboard();
        showPage('adminMainPage');
        return;
      }
      renderPartnerMain();
      showPage('partnerMainPage');
    }

/**
 * @description SPA 라우트 문자열에 맞는 화면 렌더링과 페이지 전환을 수행합니다.
 * @param {*} route - route 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * navigate(route);
 */
function navigate(route) {
      const user = getCurrentUserRecord();
      if (!user) {
        logout();
        return;
      }

      if (route === 'admin-main' && user.role === 'admin') {
        renderAdminDashboard();
        showPage('adminMainPage');
      }

      if (route === 'account-manage' && user.role === 'admin') {
        renderAccountTable();
        showPage('accountManagePage');
      }

      if (route === 'attachment-manage' && user.role === 'admin') {
        renderAttachmentTable();
        showPage('attachmentManagePage');
      }

      if (route === 'na-manage' && user.role === 'admin') {
        renderNaCriteriaPage();
        showPage('naManagePage');
      }

      if (route === 'period-manage' && user.role === 'admin') {
        renderPeriodTable();
        showPage('periodManagePage');
      }

      if (route === 'partner-main' && user.role === 'partner') {
        renderPartnerMain();
        showPage('partnerMainPage');
      }

      if (route === 'profile' && user.role === 'partner') {
        if (!canSubmitNow()) {
          alert(getSubmitBlockMessage());
          renderPartnerMain();
          showPage('partnerMainPage');
          return;
        }
        renderProfileForm();
        showPage('profilePage');
      }

      if (route === 'evaluation-form' && user.role === 'partner') {
        if (!canSubmitNow()) {
          alert(getSubmitBlockMessage());
          renderPartnerMain();
          showPage('partnerMainPage');
          return;
        }
        renderEvaluationForm();
        showPage('evaluationFormPage');
      }
    }

/**
 * @description 지정한 페이지 ID만 활성화하여 화면을 전환합니다.
 * @param {*} pageId - pageId 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * showPage(pageId);
 */
function showPage(pageId) {
      updateNavUserNames();
      document.querySelectorAll('.page').forEach((page) => {
        page.classList.toggle('active', page.id === pageId);
      });
      window.scrollTo(0, 0);
    }

/**
 * @description 네비게이션 바의 로그인 사용자명을 갱신합니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * updateNavUserNames();
 */
function updateNavUserNames() {
      const user = getCurrentUserRecord();
      document.querySelectorAll('.current-user-name').forEach((element) => {
        element.textContent = user ? user.companyName : '';
      });
    }

/**
 * @description 로그아웃 후 로그인 화면으로 이동합니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * logout();
 */
function logout() {
      clearCurrentUser();
      document.getElementById('loginForm').reset();
      document.getElementById('loginError').classList.add('d-none');
      showPage('loginPage');
    }

document.addEventListener('DOMContentLoaded', initializeApp);
