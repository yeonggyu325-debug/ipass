/**
 * @file admin.js
 * @description 관리자 기능 모듈 (Google Sheets 연동 버전)
 */

let attachmentModal;
let periodModal;
let selectedNaItemId = NA_ITEMS[0].id;
let tempIndustryWorkerRules = [];

function initAdminComponents() {
  attachmentModal = new bootstrap.Modal(document.getElementById('attachmentModal'));
  periodModal = new bootstrap.Modal(document.getElementById('periodModal'));
}

// ──────────────────────────────────────────
//  대시보드
// ──────────────────────────────────────────

async function renderAdminDashboard() {
  const tbody = document.getElementById('partnerStatusTableBody');
  const users = await loadUsers();
  const partners = users.filter((user) => user.role === 'partner');
  tbody.innerHTML = '';

  if (partners.length === 0) {
    appendEmptyRow(tbody, 5, '등록된 협력사 계정이 없습니다.');
    return;
  }

  partners.forEach((partner, index) => {
    const statusMeta = STATUS_META[partner.submissionStatus] || STATUS_META.not_submitted;
    const row = document.createElement('tr');
    row.append(
      createCell(index + 1),
      createCell(partner.companyName),
      createCell(partner.id),
      createStatusCell(statusMeta),
      createCell(partner.createdAt || '-')
    );
    tbody.appendChild(row);
  });
}

// ──────────────────────────────────────────
//  첨부파일 링크 관리
// ──────────────────────────────────────────

async function renderAttachmentTable() {
  const tbody = document.getElementById('attachmentTableBody');
  const links = await loadObject(STORAGE_KEYS.attachmentLinks);
  tbody.innerHTML = '';

  ATTACHMENT_FILES.forEach((item) => {
    const link = links[item.id];
    const row = document.createElement('tr');
    row.append(
      createCell(item.id),
      createCell(item.name),
      createStatusCell(link
        ? { label: '등록완료', className: 'status-success' }
        : { label: '미등록', className: 'status-muted' }),
      createCell(link ? link.displayName : '-'),
      createAttachmentActionCell(item.id)
    );
    tbody.appendChild(row);
  });
}

function handleAttachmentTableClick(event) {
  const button = event.target.closest('button[data-attachment-id]');
  if (!button) return;
  openAttachmentModal(button.dataset.attachmentId);
}

async function openAttachmentModal(itemId) {
  const item = ATTACHMENT_FILES.find((entry) => entry.id === itemId);
  if (!item) {
    alert('첨부파일 항목을 찾을 수 없습니다.');
    return;
  }
  const links = await loadObject(STORAGE_KEYS.attachmentLinks);
  const link = links[itemId];

  document.getElementById('attachmentForm').reset();
  document.getElementById('attachmentItemId').value = item.id;
  document.getElementById('attachmentItemName').value = item.name;
  document.getElementById('attachmentDisplayName').value = link ? link.displayName : '';
  document.getElementById('attachmentUrl').value = link ? link.url : '';
  document.getElementById('attachmentDescription').value = link ? (link.description || '') : '';
  attachmentModal.show();
}

async function saveAttachmentLink() {
  const itemId = document.getElementById('attachmentItemId').value;
  const item = ATTACHMENT_FILES.find((entry) => entry.id === itemId);
  const displayName = document.getElementById('attachmentDisplayName').value.trim();
  const url = document.getElementById('attachmentUrl').value.trim();
  const description = document.getElementById('attachmentDescription').value.trim();

  if (!displayName) {
    alert('파일 표시명을 입력해 주세요.');
    document.getElementById('attachmentDisplayName').focus();
    return;
  }

  if (!isValidUrl(url)) {
    alert('다운로드 URL을 올바르게 입력해 주세요.');
    document.getElementById('attachmentUrl').focus();
    return;
  }

  const links = await loadObject(STORAGE_KEYS.attachmentLinks);
  links[itemId] = {
    itemId,
    itemName: item.name,
    displayName,
    url,
    description,
    savedAt: new Date().toISOString()
  };
  await saveObject(STORAGE_KEYS.attachmentLinks, links);
  clearCache(STORAGE_KEYS.attachmentLinks);
  attachmentModal.hide();
  await renderAttachmentTable();
  showToast('저장되었습니다.');
}

// ──────────────────────────────────────────
//  N/A 기준 관리
// ──────────────────────────────────────────

async function renderNaCriteriaPage() {
  await renderNaItemList();
  await loadSelectedNaCriteria();
}

async function renderNaItemList() {
  const list = document.getElementById('naItemList');
  const criteria = await loadObject(STORAGE_KEYS.naCriteria);
  list.innerHTML = '';

  NA_ITEMS.forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `criteria-item-btn ${item.id === selectedNaItemId ? 'is-active' : ''}`;
    button.dataset.itemId = item.id;

    const name = document.createElement('span');
    name.className = 'criteria-item-name';
    name.textContent = item.name;

    const hasRules = hasNaCriteria(criteria[item.id]);
    const badge = document.createElement('span');
    badge.className = `status-badge ${hasRules ? 'status-primary' : 'status-muted'}`;
    badge.textContent = hasRules ? '설정' : '미설정';

    button.append(name, badge);
    button.addEventListener('click', async () => {
      selectedNaItemId = item.id;
      await renderNaCriteriaPage();
    });
    list.appendChild(button);
  });
}

async function loadSelectedNaCriteria() {
  const allCriteria = await loadObject(STORAGE_KEYS.naCriteria);
  const criteria = allCriteria[selectedNaItemId] || getEmptyCriteria();
  const item = NA_ITEMS.find((entry) => entry.id === selectedNaItemId);
  const industryOnly = Array.isArray(criteria.industryOnly) ? criteria.industryOnly : [];
  const industryWithWorker = Array.isArray(criteria.industryWithWorker) ? criteria.industryWithWorker : [];

  document.getElementById('selectedNaItemTitle').textContent = `${item.name} N/A 기준 설정`;

  document.querySelectorAll('#industryOnlyCheckboxes input[type="checkbox"]').forEach((checkbox) => {
    checkbox.checked = industryOnly.includes(checkbox.value);
  });

  tempIndustryWorkerRules = industryWithWorker.map((rule) => ({
    industry: rule.industry,
    maxWorker: Number(rule.maxWorker)
  }));
  document.getElementById('naIndustrySelect').value = '';
  document.getElementById('naWorkerInput').value = '';
  document.getElementById('naAllWorkerInput').value = criteria.allIndustryMaxWorker ?? '';
  renderIndustryWorkerTags();
}

function addIndustryWorkerRule() {
  const industry = document.getElementById('naIndustrySelect').value;
  const maxWorkerValue = document.getElementById('naWorkerInput').value;
  const maxWorker = Number(maxWorkerValue);

  if (!industry) {
    alert('업종을 선택해 주세요.');
    document.getElementById('naIndustrySelect').focus();
    return;
  }

  if (maxWorkerValue === '' || !Number.isInteger(maxWorker) || maxWorker < 0) {
    alert('인원 기준을 0 이상의 정수로 입력해 주세요.');
    document.getElementById('naWorkerInput').focus();
    return;
  }

  tempIndustryWorkerRules = tempIndustryWorkerRules.filter((rule) => rule.industry !== industry);
  tempIndustryWorkerRules.push({ industry, maxWorker });
  document.getElementById('naIndustrySelect').value = '';
  document.getElementById('naWorkerInput').value = '';
  renderIndustryWorkerTags();
}

function renderIndustryWorkerTags() {
  const wrap = document.getElementById('industryWorkerTags');
  wrap.innerHTML = '';

  if (tempIndustryWorkerRules.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'small-muted align-self-center';
    empty.textContent = '추가된 조건이 없습니다.';
    wrap.appendChild(empty);
    return;
  }

  tempIndustryWorkerRules.forEach((rule) => {
    const tag = document.createElement('span');
    tag.className = 'rule-tag';
    tag.innerHTML = `
      <span>${rule.industry} ≤ ${rule.maxWorker}명</span>
      <button type="button" data-remove-rule="${rule.industry}" aria-label="${rule.industry} 조건 삭제">✕</button>
    `;
    wrap.appendChild(tag);
  });
}

function handleRuleTagClick(event) {
  const button = event.target.closest('button[data-remove-rule]');
  if (!button) return;
  tempIndustryWorkerRules = tempIndustryWorkerRules.filter((rule) => rule.industry !== button.dataset.removeRule);
  renderIndustryWorkerTags();
}

async function saveNaCriteriaForSelectedItem() {
  const selectedIndustryOnly = Array.from(
    document.querySelectorAll('#industryOnlyCheckboxes input[type="checkbox"]:checked')
  ).map((checkbox) => checkbox.value);

  const allWorkerValue = document.getElementById('naAllWorkerInput').value;

  if (allWorkerValue !== '' && (!Number.isInteger(Number(allWorkerValue)) || Number(allWorkerValue) < 0)) {
    alert('전체 인원 기준은 0 이상의 정수로 입력해 주세요.');
    document.getElementById('naAllWorkerInput').focus();
    return;
  }

  const criteria = await loadObject(STORAGE_KEYS.naCriteria);
  criteria[selectedNaItemId] = {
    industryOnly: selectedIndustryOnly,
    industryWithWorker: tempIndustryWorkerRules.map((rule) => ({
      industry: rule.industry,
      maxWorker: Number(rule.maxWorker)
    })),
    allIndustryMaxWorker: allWorkerValue === '' ? null : Number(allWorkerValue)
  };

  await saveObject(STORAGE_KEYS.naCriteria, criteria);
  clearCache(STORAGE_KEYS.naCriteria);
  await renderNaItemList();
  showToast('저장되었습니다.');
}

// ──────────────────────────────────────────
//  평가 회차 관리
// ──────────────────────────────────────────

function openCreatePeriodModal() {
  document.getElementById('periodForm').reset();
  document.getElementById('periodMode').value = 'create';
  document.getElementById('periodId').value = '';
  document.getElementById('periodModalTitle').textContent = '신규 회차 생성';
  periodModal.show();
}

async function openEditPeriodModal(periodId) {
  const periods = await loadPeriods();
  const period = periods.find((item) => item.id === periodId);
  if (!period) {
    alert('수정할 회차를 찾을 수 없습니다.');
    return;
  }

  document.getElementById('periodForm').reset();
  document.getElementById('periodMode').value = 'edit';
  document.getElementById('periodId').value = period.id;
  document.getElementById('periodTitle').value = period.title;
  document.getElementById('periodStartDate').value = period.startDate;
  document.getElementById('periodEndDate').value = period.endDate;
  document.getElementById('periodStatus').value = period.status;
  document.getElementById('periodModalTitle').textContent = '회차 수정';
  periodModal.show();
}

function fillPeriodTitle(half) {
  const year = new Date().getFullYear();
  document.getElementById('periodTitle').value = half === 'first'
    ? `${year}년 상반기 이행수준평가`
    : `${year}년 하반기 이행수준평가`;
}

async function savePeriod() {
  const mode = document.getElementById('periodMode').value;
  const existingId = document.getElementById('periodId').value;
  const title = document.getElementById('periodTitle').value.trim();
  const startDate = document.getElementById('periodStartDate').value;
  const endDate = document.getElementById('periodEndDate').value;
  const status = document.getElementById('periodStatus').value;

  if (!title) {
    alert('평가명을 입력해 주세요.');
    document.getElementById('periodTitle').focus();
    return;
  }

  if (!startDate || !endDate) {
    alert('제출 시작일과 마감일을 입력해 주세요.');
    return;
  }

  if (startDate > endDate) {
    alert('제출 마감일은 시작일 이후여야 합니다.');
    document.getElementById('periodEndDate').focus();
    return;
  }

  let periods = await loadPeriods();
  const id = mode === 'edit' ? existingId : createPeriodId(title, periods);
  const previousActiveCount = periods.filter((p) => p.status === 'active' && p.id !== id).length;

  if (status === 'active') {
    periods = periods.map((p) =>
      p.id !== id && p.status === 'active' ? { ...p, status: 'closed' } : p
    );
  }

  const nextPeriod = {
    id,
    title,
    startDate,
    endDate,
    status,
    createdAt: mode === 'edit'
      ? (periods.find((p) => p.id === id)?.createdAt || new Date().toISOString())
      : new Date().toISOString()
  };

  if (mode === 'edit') {
    periods = periods.map((p) => p.id === id ? nextPeriod : p);
  } else {
    periods.push(nextPeriod);
  }

  await savePeriods(periods);
  clearCache('periods');
  periodModal.hide();
  await renderPeriodTable();
  showToast(status === 'active' && previousActiveCount > 0
    ? '기존 진행중 회차가 마감 처리되었습니다.'
    : '저장되었습니다.');
}

function createPeriodId(title, periods) {
  const yearMatch = title.match(/(\d{4})년/);
  const year = yearMatch ? yearMatch[1] : String(new Date().getFullYear());
  let baseId = `PERIOD_${Date.now()}`;
  if (title.includes('상반기')) baseId = `${year}_1`;
  if (title.includes('하반기')) baseId = `${year}_2`;
  if (!periods.some((p) => p.id === baseId)) return baseId;
  return `${baseId}_${String(Date.now()).slice(-4)}`;
}

async function renderPeriodTable() {
  const tbody = document.getElementById('periodTableBody');
  const periods = await loadPeriods();
  tbody.innerHTML = '';

  if (periods.length === 0) {
    appendEmptyRow(tbody, 6, '등록된 평가 회차가 없습니다.');
    return;
  }

  periods.forEach((period, index) => {
    const statusMeta = PERIOD_STATUS_META[period.status] || PERIOD_STATUS_META.draft;
    const row = document.createElement('tr');
    row.append(
      createCell(index + 1),
      createCell(period.title),
      createCell(formatPeriodRange(period.startDate, period.endDate)),
      createStatusCell(statusMeta),
      createPeriodActionCell('edit-period', period.id, '수정', 'fa-pen-to-square', 'btn-outline-primary'),
      createPeriodActionCell('delete-period', period.id, '삭제', 'fa-trash-can', 'btn-outline-danger')
    );
    tbody.appendChild(row);
  });
}

function handlePeriodTableClick(event) {
  const button = event.target.closest('button[data-period-action]');
  if (!button) return;

  const { periodAction, periodId } = button.dataset;
  if (periodAction === 'edit-period') openEditPeriodModal(periodId);
  if (periodAction === 'delete-period') deletePeriod(periodId);
}

async function deletePeriod(periodId) {
  if (!confirm('정말 삭제하시겠습니까?')) return;

  const periods = (await loadPeriods()).filter((p) => p.id !== periodId);
  await savePeriods(periods);
  clearCache('periods');
  await renderPeriodTable();
  showToast('삭제되었습니다.');
}

// ──────────────────────────────────────────
//  syncActivePeriodId → utils.js로 이전됨
//  (admin.js에서 직접 호출하지 않음)
// ──────────────────────────────────────────
