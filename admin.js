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
  document.getElementById
