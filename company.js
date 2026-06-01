/**
 * @file company.js
 * @description 협력사 기능 모듈 (Google Sheets 연동 버전)
 */

let submitConfirmModal;

function initCompanyComponents() {
  submitConfirmModal = new bootstrap.Modal(document.getElementById('submitConfirmModal'));
}

// ──────────────────────────────────────────
//  활성 평가 배너
// ──────────────────────────────────────────

async function renderActivePeriodBanner(containerId) {
  const container = document.getElementById(containerId);
  const period = await getActivePeriod();
  container.innerHTML = '';

  const banner = document.createElement('div');
  banner.className = 'period-banner';

  if (!period) {
    banner.classList.add('is-empty');
    banner.innerHTML = `
      <div>
        <strong>현재 진행 중인 평가가 없습니다.</strong>
        <span>관리자가 평가 회차를 진행중으로 설정하면 제출할 수 있습니다.</span>
      </div>
    `;
    container.appendChild(banner);
    return;
  }

  const closed = isPastPeriodEnd(period);
  if (closed) banner.classList.add('is-closed');

  banner.innerHTML = `
    <div>
      <strong>${period.title}</strong>
      <span>제출기간: ${formatPeriodRange(period.startDate, period.endDate)}</span>
      ${closed ? '<span class="text-danger">제출 기간이 마감되었습니다.</span>' : ''}
    </div>
  `;
  container.appendChild(banner);
}

// ──────────────────────────────────────────
//  협력사 메인
// ──────────────────────────────────────────

async function renderPartnerMain() {
  const user = await getCurrentUserRecord();
  if (!user || user.role !== 'partner') {
    requestLogout();
    return;
  }

  setCurrentUser(user);
  await renderActivePeriodBanner('partnerActivePeriodBanner');

  const statusMeta = STATUS_META[user.submissionStatus] || STATUS_META.not_submitted;
  const badge = document.getElementById('partnerStatusBadge');
  const content = document.getElementById('partnerStatusContent');

  document.getElementById('partnerGreeting').textContent = `안녕하세요, ${user.companyName}님`;
  badge.textContent = statusMeta.label;
  badge.className = `status-badge ${statusMeta.className}`;
  content.innerHTML = '';

  if (!user.submissionStatus || user.submissionStatus === 'not_submitted') {
    const message = document.createElement('p');
    message.className = 'mb-3 fw-bold';
    message.textContent = '아직 평가 자료를 제출하지 않았습니다.';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-primary';
    button.innerHTML = '<i class="fa-solid fa-file-pen me-2"></i>사업장 현황 입력 시작';

    const blockMessage = await getSubmitBlockMessage();
    if (blockMessage) {
      button.disabled = true;
      const blocked = document.createElement('p');
      blocked.className = 'mb-0 text-danger fw-bold';
      blocked.textContent = blockMessage;
      content.append(message, button, blocked);
      return;
    }

    button.addEventListener('click', () => requestRoute('profile'));
    content.append(message, button);
    return;
  }

  if (user.submissionStatus === 'submitted' || user.submissionStatus === 'reviewing') {
    const message = document.createElement('p');
    message.className = 'mb-0 fw-bold';
    message.textContent = '제출이 완료되었습니다. 검토 중입니다.';
    content.appendChild(message);
    return;
  }

  if (user.submissionStatus === 'published') {
    const message = document.createElement('p');
    message.className = 'mb-3 fw-bold';
    message.textContent = '평가 결과가 공개되었습니다.';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-primary';
    button.innerHTML = '<i class="fa-solid fa-square-poll-horizontal me-2"></i>결과 확인';
    button.addEventListener('click', () => alert('결과 확인 기능은 준비 중입니다.'));

    content.append(message, button);
  }
}

// ──────────────────────────────────────────
//  사업장 현황 (프로필 폼)
// ──────────────────────────────────────────

async function renderProfileForm() {
  const user = await getCurrentUserRecord();
  if (!user || user.role !== 'partner') {
    requestLogout();
    return;
  }

  await renderActivePeriodBanner('profileActivePeriodBanner');
  const profiles = await loadObject(STORAGE_KEYS.companyProfiles);
  const profile = profiles[user.id] || {};

  document.getElementById('profileForm').reset();
  document.getElementById('profileCompanyName').value = user.companyName;
  document.getElementById('profileIndustry').value = profile.industryCode || '';
  document.getElementById('profileZipCode').value = profile.zipCode || '';
  document.getElementById('profileRoadAddress').value = profile.roadAddress || profile.address || '';
  document.getElementById('profileDetailAddress').value = profile.detailAddress || '';
  document.getElementById('profileBizNumber').value = profile.bizNumber || '';
  document.getElementById('profileWorkerCount').value = profile.workerCount ?? '';
  document.getElementById('profileManagerName').value = profile.managerName || '';
  document.getElementById('profileManagerPhone').value = profile.managerPhone || '';
  document.getElementById('profileSubmitBtn').disabled = !await canSubmitNow();
}

function openPostcodeSearch() {
  if (!window.daum || !window.daum.Postcode) {
    alert('주소 검색 서비스를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
    return;
  }
  new daum.Postcode({
    oncomplete: (data) => {
      document.getElementById('profileZipCode').value = data.zonecode || '';
      document.getElementById('profileRoadAddress').value = data.roadAddress || data.address || '';
      document.getElementById('profileDetailAddress').focus();
    }
  }).open();
}

function handleBizNumberInput(event) {
  event.target.value = formatBizNumber(event.target.value);
}

function handlePhoneInput(event) {
  event.target.value = formatPhoneNumber(event.target.value);
}

async function saveProfile(event) {
  event.preventDefault();
  const user = await getCurrentUserRecord();
  if (!user || user.role !== 'partner') {
    requestLogout();
    return;
  }

  if (!await canSubmitNow()) {
    alert(await getSubmitBlockMessage());
    return;
  }

  const industryCode = document.getElementById('profileIndustry').value;
  const industry = INDUSTRIES.find((entry) => entry.code === industryCode);
  const zipCode = document.getElementById('profileZipCode').value.trim();
  const roadAddress = document.getElementById('profileRoadAddress').value.trim();
  const detailAddress = document.getElementById('profileDetailAddress').value.trim();
  const bizNumber = document.getElementById('profileBizNumber').value.trim();
  const workerValue = document.getElementById('profileWorkerCount').value;
  const workerCount = Number(workerValue);
  const managerName = document.getElementById('profileManagerName').value.trim();
  const managerPhone = document.getElementById('profileManagerPhone').value.trim();

  if (!industry) {
    alert('업종을 선택해 주세요.');
    document.getElementById('profileIndustry').focus();
    return;
  }

  if (!zipCode || !roadAddress || !detailAddress) {
    alert('사업장 소재지를 입력해 주세요.');
    document.getElementById(!zipCode || !roadAddress ? 'searchAddressBtn' : 'profileDetailAddress').focus();
    return;
  }

  if (!/^\d{3}-\d{2}-\d{5}$/.test(bizNumber)) {
    alert('사업자 등록번호 10자리를 올바르게 입력해 주세요.');
    document.getElementById('profileBizNumber').focus();
    return;
  }

  if (workerValue === '' || !Number.isInteger(workerCount) || workerCount < 0) {
    alert('상시근로자 수를 0 이상의 정수로 입력해 주세요.');
    document.getElementById('profileWorkerCount').focus();
    return;
  }

  if (!managerName) {
    alert('담당자 성명을 입력해 주세요.');
    document.getElementById('profileManagerName').focus();
    return;
  }

  if (!/^\d{3}-\d{4}-\d{4}$/.test(managerPhone)) {
    alert('담당자 연락처를 올바르게 입력해 주세요.');
    document.getElementById('profileManagerPhone').focus();
    return;
  }

  const profiles = await loadObject(STORAGE_KEYS.companyProfiles);
  profiles[user.id] = {
    companyId: user.id,
    companyName: user.companyName,
    industryCode,
    industryName: industry.name,
    zipCode,
    roadAddress,
    detailAddress,
    bizNumber,
    workerCount,
    managerName,
    managerPhone,
    savedAt: new Date().toISOString()
  };

  await saveObject(STORAGE_KEYS.companyProfiles, profiles);
  clearCache(STORAGE_KEYS.companyProfiles);
  await renderEvaluationForm();
  requestPage('evaluationFormPage');
}

// ──────────────────────────────────────────
//  평가 폼
// ──────────────────────────────────────────

async function renderEvaluationForm() {
  const user = await getCurrentUserRecord();
  const period = await getActivePeriod();
  const profile = await getCurrentCompanyProfile();

  if (!user || user.role !== 'partner' || !period || !profile) {
    alert(!profile ? '사업장 현황을 먼저 입력해 주세요.' : await getSubmitBlockMessage());
    await renderPartnerMain();
    requestPage('partnerMainPage');
    return;
  }

  await renderActivePeriodBanner('evaluationActivePeriodBanner');
  const submission = await getEvaluationSubmission(user.id, period.id);
  const categories = [...new Set(EVALUATION_ITEMS.map((item) => item.category))];
  const tabs = document.getElementById('evaluationCategoryTabs');
  const content = document.getElementById('evaluationTabContent');
  tabs.innerHTML = '';
  content.innerHTML = '';

  for (const [index, category] of categories.entries()) {
    const tabId = `evalTab_${index}`;
    const paneId = `evalPane_${index}`;
    const itemCount = EVALUATION_ITEMS.filter((item) => item.category === category).length;

    const tabItem = document.createElement('li');
    tabItem.className = 'nav-item';
    tabItem.role = 'presentation';
    tabItem.innerHTML = `
      <button class="nav-link ${index === 0 ? 'active' : ''}" id="${tabId}" data-bs-toggle="tab" data-bs-target="#${paneId}" type="button" role="tab" aria-controls="${paneId}" aria-selected="${index === 0}">
        ${category} <span class="badge text-bg-light ms-1">${itemCount}</span>
      </button>
    `;
    tabs.appendChild(tabItem);

    const pane = document.createElement('div');
    pane.className = `tab-pane fade ${index === 0 ? 'show active' : ''}`;
    pane.id = paneId;
    pane.role = 'tabpanel';
    pane.setAttribute('aria-labelledby', tabId);

    for (const item of EVALUATION_ITEMS.filter((i) => i.category === category)) {
      const card = await createEvaluationItemCard(
        item,
