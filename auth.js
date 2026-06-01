/**
 * @file auth.js
 * @description 인증 및 계정 관리 모듈 (Google Sheets 연동 버전)
 */

let accountModal;
let duplicateCheckPassed = false;

/**
 * 초기 관리자 계정과 사용자 기본값을 세팅합니다.
 */
async function initAuthStorage() {
  let users = await loadUsers();
  const hasAdmin = users.some((user) => user.id === 'admin');

  if (!hasAdmin) {
    users.unshift({
      id: 'admin',
      password: encodePassword('admin1234'),
      role: 'admin',
      companyName: '관리자',
      createdAt: formatDate(new Date())
    });
  }

  users = users.map((user) => ({
    ...user,
    createdAt: user.createdAt || formatDate(new Date()),
    submissionStatus: user.role === 'partner'
      ? (user.submissionStatus || 'not_submitted')
      : user.submissionStatus
  }));

  await saveUsers(users);
  clearCache('users'); // 캐시 갱신
}

/**
 * 계정 관리 모달 인스턴스를 초기화합니다.
 */
function initAuthComponents() {
  accountModal = new bootstrap.Modal(document.getElementById('accountModal'));
}

/**
 * 아이디와 비밀번호로 사용자 계정을 검증합니다.
 */
async function authenticateUser(loginId, loginPassword) {
  const encodedPassword = encodePassword(loginPassword);
  const users = await loadUsers();
  return users.find((item) => item.id === loginId && item.password === encodedPassword) || null;
}

/**
 * 현재 로그인 사용자 정보를 삭제합니다.
 */
function clearCurrentUser() {
  localStorage.removeItem(STORAGE_KEYS.currentUser);
}

/**
 * 아이디 중복 확인 상태를 초기화합니다.
 */
function resetDuplicateCheck() {
  duplicateCheckPassed = false;
}

/**
 * 비밀번호를 Base64 문자열로 인코딩합니다.
 */
function encodePassword(password) {
  const bytes = new TextEncoder().encode(password);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

/**
 * 협력사 계정 목록 테이블을 렌더링합니다.
 */
async function renderAccountTable() {
  const tbody = document.getElementById('accountTableBody');
  const users = await loadUsers();
  const partners = users.filter((user) => user.role === 'partner');
  tbody.innerHTML = '';

  if (partners.length === 0) {
    appendEmptyRow(tbody, 6, '등록된 협력사 계정이 없습니다.');
    return;
  }

  partners.forEach((partner, index) => {
    const row = document.createElement('tr');
    row.append(
      createCell(index + 1),
      createCell(partner.companyName),
      createCell(partner.id),
      createCell(partner.createdAt || '-'),
      createActionCell('edit', partner.id, '수정', 'fa-pen-to-square', 'btn-outline-primary'),
      createActionCell('delete', partner.id, '삭제', 'fa-trash-can', 'btn-outline-danger')
    );
    tbody.appendChild(row);
  });
}

/**
 * 신규 계정 생성 모달을 엽니다.
 */
function openCreateAccountModal() {
  resetDuplicateCheck();
  document.getElementById('accountForm').reset();
  document.getElementById('accountMode').value = 'create';
  document.getElementById('accountModalTitle').textContent = '신규 계정 생성';
  document.getElementById('accountId').readOnly = false;
  document.getElementById('accountPassword').required = true;
  document.getElementById('accountPassword').placeholder = '';
  document.getElementById('passwordRequiredMark').classList.remove('d-none');
  document.getElementById('passwordHelp').textContent = '4자 이상 입력';
  document.getElementById('checkDuplicateBtn').disabled = false;
  setIdCheckMessage('영문, 숫자, 마침표, 밑줄, 하이픈 3~30자', 'muted');
  accountModal.show();
}

/**
 * 계정 수정 모달을 엽니다.
 */
async function openEditAccountModal(userId) {
  const users = await loadUsers();
  const user = users.find((item) => item.id === userId);
  if (!user || user.role !== 'partner') {
    alert('수정할 협력사 계정을 찾을 수 없습니다.');
    return;
  }

  duplicateCheckPassed = true;
  document.getElementById('accountForm').reset();
  document.getElementById('accountMode').value = 'edit';
  document.getElementById('accountModalTitle').textContent = '계정 수정';
  document.getElementById('accountCompanyName').value = user.companyName;
  document.getElementById('accountId').value = user.id;
  document.getElementById('accountId').readOnly = true;
  document.getElementById('accountPassword').required = false;
  document.getElementById('accountPassword').placeholder = '변경할 비밀번호 입력';
  document.getElementById('passwordRequiredMark').classList.add('d-none');
  document.getElementById('passwordHelp').textContent = '입력하지 않으면 기존 비밀번호가 유지됩니다.';
  document.getElementById('checkDuplicateBtn').disabled = true;
  setIdCheckMessage('아이디는 변경할 수 없습니다.', 'muted');
  accountModal.show();
}

/**
 * 아이디 중복 확인을 수행합니다.
 */
async function checkDuplicateId() {
  const accountIdInput = document.getElementById('accountId');
  const accountId = accountIdInput.value.trim();

  if (!isValidAccountId(accountId)) {
    resetDuplicateCheck();
    setIdCheckMessage('아이디는 영문, 숫자, 마침표, 밑줄, 하이픈 3~30자로 입력해 주세요.', 'danger');
    accountIdInput.focus();
    return;
  }

  const users = await loadUsers();
  const isDuplicate = users.some((user) => user.id === accountId);
  if (isDuplicate) {
    resetDuplicateCheck();
    setIdCheckMessage('이미 사용 중인 아이디입니다.', 'danger');
    return;
  }

  duplicateCheckPassed = true;
  setIdCheckMessage('사용 가능한 아이디입니다.', 'success');
}

/**
 * 계정을 저장(생성/수정)합니다.
 */
async function saveAccount() {
  const mode = document.getElementById('accountMode').value;
  const companyName = document.getElementById('accountCompanyName').value.trim();
  const accountId = document.getElementById('accountId').value.trim();
  const accountPassword = document.getElementById('accountPassword').value;

  if (!companyName) {
    alert('회사명을 입력해 주세요.');
    document.getElementById('accountCompanyName').focus();
    return;
  }

  if (!isValidAccountId(accountId)) {
    alert('아이디는 영문, 숫자, 마침표, 밑줄, 하이픈 3~30자로 입력해 주세요.');
    document.getElementById('accountId').focus();
    return;
  }

  let users = await loadUsers();

  if (mode === 'create') {
    if (users.some((user) => user.id === accountId)) {
      resetDuplicateCheck();
      setIdCheckMessage('이미 사용 중인 아이디입니다.', 'danger');
      return;
    }

    if (!duplicateCheckPassed) {
      alert('아이디 중복 확인을 진행해 주세요.');
      document.getElementById('accountId').focus();
      return;
    }

    if (accountPassword.length < 4) {
      alert('비밀번호는 4자 이상 입력해 주세요.');
      document.getElementById('accountPassword').focus();
      return;
    }

    users.push({
      id: accountId,
      password: encodePassword(accountPassword),
      role: 'partner',
      companyName,
      createdAt: formatDate(new Date()),
      submissionStatus: 'not_submitted'
    });
  } else {
    if (accountPassword && accountPassword.length < 4) {
      alert('비밀번호는 4자 이상 입력해 주세요.');
      document.getElementById('accountPassword').focus();
      return;
    }

    users = users.map((user) => {
      if (user.id !== accountId || user.role !== 'partner') return user;
      return {
        ...user,
        companyName,
        password: accountPassword ? encodePassword(accountPassword) : user.password
      };
    });
  }

  await saveUsers(users);
  clearCache('users');
  accountModal.hide();
  await renderAccountTable();
  requestRefresh('admin-dashboard');
  showToast('저장되었습니다.');
}

/**
 * 계정 테이블 버튼 클릭 이벤트를 처리합니다.
 */
function handleAccountTableClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const { action, userId } = button.dataset;
  if (action === 'edit') openEditAccountModal(userId);
  if (action === 'delete') deleteAccount(userId);
}

/**
 * 계정을 삭제합니다.
 */
async function deleteAccount(userId) {
  if (userId === 'admin') {
    alert('관리자 계정은 삭제할 수 없습니다.');
    return;
  }

  if (!confirm('정말 삭제하시겠습니까?')) return;

  const users = (await loadUsers()).filter((user) => user.id !== userId);
  const profiles = await loadObject(STORAGE_KEYS.companyProfiles);
  delete profiles[userId];

  await saveUsers(users);
  await saveObject(STORAGE_KEYS.companyProfiles, profiles);
  clearCache('users');
  clearCache(STORAGE_KEYS.companyProfiles);

  await renderAccountTable();
  requestRefresh('admin-dashboard');
  showToast('삭제되었습니다.');
}

/**
 * 아이디 확인 메시지를 설정합니다.
 */
function setIdCheckMessage(message, type) {
  const el = document.getElementById('idCheckMessage');
  el.textContent = message;
  el.className = 'form-text';
  if (type === 'success') el.classList.add('text-success', 'fw-bold');
  else if (type === 'danger') el.classList.add('text-danger', 'fw-bold');
  else el.classList.add('text-muted');
}

/**
 * 유효한 계정 아이디 형식인지 검사합니다.
 */
function isValidAccountId(accountId) {
  return /^[A-Za-z0-9._-]{3,30}$/.test(accountId);
}
