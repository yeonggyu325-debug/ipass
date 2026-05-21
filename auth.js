/**
 * @file auth.js
 * @description 인증 및 계정 관리 모듈
 * @responsibility
 * - 로그인 / 로그아웃 처리
 * - 로그인 상태 검증
 * - 계정 생성 / 수정 / 삭제
 * - 초기 관리자 계정 세팅
 * @sideEffects localStorage(users, currentUser) 읽기/쓰기
 */

let accountModal;
let duplicateCheckPassed = false;

/**
 * @description 초기 관리자 계정과 사용자 기본값을 세팅합니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * initAuthStorage();
 */
function initAuthStorage() {
  let users = loadUsers();
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
    submissionStatus: user.role === 'partner' ? (user.submissionStatus || 'not_submitted') : user.submissionStatus
  }));
  saveUsers(users);
}

/**
 * @description 계정 관리 모달 인스턴스를 초기화합니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * initAuthComponents();
 */
function initAuthComponents() {
  accountModal = new bootstrap.Modal(document.getElementById('accountModal'));
}

/**
 * @description 아이디와 비밀번호로 사용자 계정을 검증합니다.
 * @param {*} loginId - loginId 값입니다.
 * @param {*} loginPassword - loginPassword 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * authenticateUser(loginId, loginPassword);
 */
function authenticateUser(loginId, loginPassword) {
  const encodedPassword = encodePassword(loginPassword);
  return loadUsers().find((item) => item.id === loginId && item.password === encodedPassword) || null;
}

/**
 * @description 현재 로그인 사용자 정보를 삭제합니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * clearCurrentUser();
 */
function clearCurrentUser() {
  localStorage.removeItem(STORAGE_KEYS.currentUser);
}

/**
 * @description 아이디 중복 확인 상태를 초기화합니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * resetDuplicateCheck();
 */
function resetDuplicateCheck() {
  duplicateCheckPassed = false;
}

/**
 * @description 비밀번호를 localStorage 저장용 Base64 문자열로 인코딩합니다.
 * @param {*} password - password 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * encodePassword(password);
 */
function encodePassword(password) {
      const bytes = new TextEncoder().encode(password);
      let binary = '';
      bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
      });
      return btoa(binary);
    }

/**
 * @description renderAccountTable 함수의 책임을 수행합니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * renderAccountTable();
 */
function renderAccountTable() {
      const tbody = document.getElementById('accountTableBody');
      const partners = loadUsers().filter((user) => user.role === 'partner');
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
 * @description openCreateAccountModal 함수의 책임을 수행합니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * openCreateAccountModal();
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
 * @description openEditAccountModal 함수의 책임을 수행합니다.
 * @param {*} userId - userId 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * openEditAccountModal(userId);
 */
function openEditAccountModal(userId) {
      const user = loadUsers().find((item) => item.id === userId);
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
 * @description checkDuplicateId 함수의 책임을 수행합니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * checkDuplicateId();
 */
function checkDuplicateId() {
      const accountIdInput = document.getElementById('accountId');
      const accountId = accountIdInput.value.trim();

      if (!isValidAccountId(accountId)) {
        resetDuplicateCheck();
        setIdCheckMessage('아이디는 영문, 숫자, 마침표, 밑줄, 하이픈 3~30자로 입력해 주세요.', 'danger');
        accountIdInput.focus();
        return;
      }

      const isDuplicate = loadUsers().some((user) => user.id === accountId);
      if (isDuplicate) {
        resetDuplicateCheck();
        setIdCheckMessage('이미 사용 중인 아이디입니다.', 'danger');
        return;
      }

      duplicateCheckPassed = true;
      setIdCheckMessage('사용 가능한 아이디입니다.', 'success');
    }

/**
 * @description saveAccount 함수의 책임을 수행합니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * saveAccount();
 */
function saveAccount() {
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

      let users = loadUsers();

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
          if (user.id !== accountId || user.role !== 'partner') {
            return user;
          }
          return {
            ...user,
            companyName,
            password: accountPassword ? encodePassword(accountPassword) : user.password
          };
        });
      }

      saveUsers(users);
      accountModal.hide();
      renderAccountTable();
      requestRefresh('admin-dashboard');
      showToast('저장되었습니다.');
    }

/**
 * @description handleAccountTableClick 함수의 책임을 수행합니다.
 * @param {*} event - event 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * handleAccountTableClick(event);
 */
function handleAccountTableClick(event) {
      const button = event.target.closest('button[data-action]');
      if (!button) {
        return;
      }

      const { action, userId } = button.dataset;
      if (action === 'edit') {
        openEditAccountModal(userId);
      }
      if (action === 'delete') {
        deleteAccount(userId);
      }
    }

/**
 * @description deleteAccount 함수의 책임을 수행합니다.
 * @param {*} userId - userId 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * deleteAccount(userId);
 */
function deleteAccount(userId) {
      if (userId === 'admin') {
        alert('관리자 계정은 삭제할 수 없습니다.');
        return;
      }

      if (!confirm('정말 삭제하시겠습니까?')) {
        return;
      }

      const users = loadUsers().filter((user) => user.id !== userId);
      const profiles = loadObject(STORAGE_KEYS.companyProfiles);
      delete profiles[userId];
      saveUsers(users);
      saveObject(STORAGE_KEYS.companyProfiles, profiles);
      renderAccountTable();
      requestRefresh('admin-dashboard');
      showToast('삭제되었습니다.');
    }

/**
 * @description setIdCheckMessage 함수의 책임을 수행합니다.
 * @param {*} message - message 값입니다.
 * @param {*} type - type 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * setIdCheckMessage(message, type);
 */
function setIdCheckMessage(message, type) {
      const messageElement = document.getElementById('idCheckMessage');
      messageElement.textContent = message;
      messageElement.className = 'form-text';

      if (type === 'success') {
        messageElement.classList.add('text-success', 'fw-bold');
      } else if (type === 'danger') {
        messageElement.classList.add('text-danger', 'fw-bold');
      } else {
        messageElement.classList.add('text-muted');
      }
    }

/**
 * @description isValidAccountId 함수의 책임을 수행합니다.
 * @param {*} accountId - accountId 값입니다.
 * @returns {*} 실행 결과입니다.
 * @example
 * isValidAccountId(accountId);
 */
function isValidAccountId(accountId) {
      return /^[A-Za-z0-9._-]{3,30}$/.test(accountId);
    }
