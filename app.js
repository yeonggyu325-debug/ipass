// localStorage 전체 키 구조
    const STORAGE_KEYS = {
      users: 'users',
      currentUser: 'currentUser',
      companyProfiles: 'companyProfiles',
      attachmentLinks: 'attachmentLinks',
      naCriteria: 'naCriteria',
      evaluationPeriods: 'evaluationPeriods',
      activePeriodId: 'activePeriodId',
      evaluationSubmissions: 'evaluationSubmissions'
    };

    // 첨부파일 항목은 배열만 수정하면 쉽게 추가할 수 있습니다.
    
    const INDUSTRIES = [
      { code: 'SEM', name: '다이오드·트랜지스터 및 유사 반도체소자 제조업' },
      { code: 'ELE', name: '전기장비 제조업' },
      { code: 'MCH', name: '기타 기계 및 장비 제조업' },
      { code: 'TRP', name: '기타운송장비 제조업' },
      { code: 'WOD', name: '목재 및 나무제품 제조업' },
      { code: 'CON', name: '전문직별 공사업' },
      { code: 'TRN', name: '운수업' }
    ];

    // 2단계 평가항목이 확정되면 이 배열만 실제 소분류 목록으로 교체합니다.
    let NA_ITEMS = [
      { id: 'ITEM_001', name: '평가항목 1' },
      { id: 'ITEM_002', name: '평가항목 2' },
      { id: 'ITEM_003', name: '평가항목 3' },
      { id: 'ITEM_004', name: '평가항목 4' },
      { id: 'ITEM_005', name: '평가항목 5' }
    ];

    
    NA_ITEMS = EVALUATION_ITEMS.map((item) => ({
      id: item.id,
      name: item.subcategory
    }));

    const STATUS_META = {
      not_submitted: { label: '미제출', className: 'status-muted' },
      submitted: { label: '제출완료', className: 'status-reviewing' },
      reviewing: { label: '제출완료', className: 'status-reviewing' },
      published: { label: '결과공개', className: 'status-success' }
    };

    const PERIOD_STATUS_META = {
      draft: { label: '준비중', className: 'status-muted' },
      active: { label: '진행중', className: 'status-success' },
      closed: { label: '마감', className: 'status-danger' }
    };

    let accountModal;
    let attachmentModal;
    let periodModal;
    let submitConfirmModal;
    let appToast;
    let duplicateCheckPassed = false;
    let selectedNaItemId = NA_ITEMS[0].id;
    let tempIndustryWorkerRules = [];

    document.addEventListener('DOMContentLoaded', () => {
      initStorage();
      initBootstrapComponents();
      populateStaticSelects();
      bindEvents();

      const currentUser = getCurrentUserRecord();
      if (currentUser) {
        routeByUser(currentUser);
      } else {
        showPage('loginPage');
      }
    });

    // 비밀번호는 localStorage 저장 전 btoa로 인코딩합니다.
    function encodePassword(password) {
      const bytes = new TextEncoder().encode(password);
      let binary = '';
      bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
      });
      return btoa(binary);
    }

    function initStorage() {
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

      ensureObjectStorage(STORAGE_KEYS.companyProfiles);
      ensureObjectStorage(STORAGE_KEYS.attachmentLinks);
      ensureObjectStorage(STORAGE_KEYS.naCriteria);
      ensureObjectStorage(STORAGE_KEYS.evaluationSubmissions);
      ensureArrayStorage(STORAGE_KEYS.evaluationPeriods);
      syncActivePeriodId();
    }

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

    function initBootstrapComponents() {
      accountModal = new bootstrap.Modal(document.getElementById('accountModal'));
      attachmentModal = new bootstrap.Modal(document.getElementById('attachmentModal'));
      periodModal = new bootstrap.Modal(document.getElementById('periodModal'));
      submitConfirmModal = new bootstrap.Modal(document.getElementById('submitConfirmModal'));
      appToast = new bootstrap.Toast(document.getElementById('appToast'), { delay: 2400 });
    }

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
        duplicateCheckPassed = false;
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

    function handleLoginLogoError(event) {
      event.target.style.display = 'none';
      document.getElementById('loginLogoFallback').style.display = 'inline-block';
    }

    function loadUsers() {
      try {
        const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.users));
        return Array.isArray(users) ? users : [];
      } catch (error) {
        return [];
      }
    }

    function saveUsers(users) {
      localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(users));
    }

    function loadObject(key) {
      try {
        const value = JSON.parse(localStorage.getItem(key));
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
      } catch (error) {
        return {};
      }
    }

    function saveObject(key, value) {
      localStorage.setItem(key, JSON.stringify(value));
    }

    function loadPeriods() {
      try {
        const periods = JSON.parse(localStorage.getItem(STORAGE_KEYS.evaluationPeriods));
        return Array.isArray(periods) ? periods : [];
      } catch (error) {
        return [];
      }
    }

    function savePeriods(periods) {
      localStorage.setItem(STORAGE_KEYS.evaluationPeriods, JSON.stringify(periods));
      syncActivePeriodId();
    }

    function getCurrentUserSnapshot() {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.currentUser));
      } catch (error) {
        return null;
      }
    }

    function getCurrentUserRecord() {
      const currentUser = getCurrentUserSnapshot();
      if (!currentUser || !currentUser.id) {
        return null;
      }
      return loadUsers().find((user) => user.id === currentUser.id) || null;
    }

    function setCurrentUser(user) {
      localStorage.setItem(STORAGE_KEYS.currentUser, JSON.stringify({
        id: user.id,
        role: user.role,
        companyName: user.companyName
      }));
    }

    function handleLogin(event) {
      event.preventDefault();
      const loginId = document.getElementById('loginId').value.trim();
      const loginPassword = document.getElementById('loginPassword').value;
      const encodedPassword = encodePassword(loginPassword);
      const user = loadUsers().find((item) => item.id === loginId && item.password === encodedPassword);

      if (!user) {
        document.getElementById('loginError').classList.remove('d-none');
        return;
      }

      document.getElementById('loginError').classList.add('d-none');
      setCurrentUser(user);
      routeByUser(user);
    }

    function routeByUser(user) {
      if (user.role === 'admin') {
        renderAdminDashboard();
        showPage('adminMainPage');
        return;
      }
      renderPartnerMain();
      showPage('partnerMainPage');
    }

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

    function showPage(pageId) {
      updateNavUserNames();
      document.querySelectorAll('.page').forEach((page) => {
        page.classList.toggle('active', page.id === pageId);
      });
      window.scrollTo(0, 0);
    }

    function updateNavUserNames() {
      const user = getCurrentUserRecord();
      document.querySelectorAll('.current-user-name').forEach((element) => {
        element.textContent = user ? user.companyName : '';
      });
    }

    function logout() {
      localStorage.removeItem(STORAGE_KEYS.currentUser);
      document.getElementById('loginForm').reset();
      document.getElementById('loginError').classList.add('d-none');
      showPage('loginPage');
    }

    function renderAdminDashboard() {
      const tbody = document.getElementById('partnerStatusTableBody');
      const partners = loadUsers().filter((user) => user.role === 'partner');
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

    function openCreateAccountModal() {
      duplicateCheckPassed = false;
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

    function checkDuplicateId() {
      const accountIdInput = document.getElementById('accountId');
      const accountId = accountIdInput.value.trim();

      if (!isValidAccountId(accountId)) {
        duplicateCheckPassed = false;
        setIdCheckMessage('아이디는 영문, 숫자, 마침표, 밑줄, 하이픈 3~30자로 입력해 주세요.', 'danger');
        accountIdInput.focus();
        return;
      }

      const isDuplicate = loadUsers().some((user) => user.id === accountId);
      if (isDuplicate) {
        duplicateCheckPassed = false;
        setIdCheckMessage('이미 사용 중인 아이디입니다.', 'danger');
        return;
      }

      duplicateCheckPassed = true;
      setIdCheckMessage('사용 가능한 아이디입니다.', 'success');
    }

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
          duplicateCheckPassed = false;
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
      renderAdminDashboard();
      showToast('저장되었습니다.');
    }

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
      renderAdminDashboard();
      showToast('삭제되었습니다.');
    }

    function renderAttachmentTable() {
      const tbody = document.getElementById('attachmentTableBody');
      const links = loadObject(STORAGE_KEYS.attachmentLinks);
      tbody.innerHTML = '';

      ATTACHMENT_FILES.forEach((item) => {
        const link = links[item.id];
        const row = document.createElement('tr');
        row.append(
          createCell(item.id),
          createCell(item.name),
          createStatusCell(link ? { label: '등록완료', className: 'status-success' } : { label: '미등록', className: 'status-muted' }),
          createCell(link ? link.displayName : '-'),
          createAttachmentActionCell(item.id)
        );
        tbody.appendChild(row);
      });
    }

    function handleAttachmentTableClick(event) {
      const button = event.target.closest('button[data-attachment-id]');
      if (!button) {
        return;
      }
      openAttachmentModal(button.dataset.attachmentId);
    }

    function openAttachmentModal(itemId) {
      const item = ATTACHMENT_FILES.find((entry) => entry.id === itemId);
      const link = loadObject(STORAGE_KEYS.attachmentLinks)[itemId];
      if (!item) {
        alert('첨부파일 항목을 찾을 수 없습니다.');
        return;
      }

      document.getElementById('attachmentForm').reset();
      document.getElementById('attachmentItemId').value = item.id;
      document.getElementById('attachmentItemName').value = item.name;
      document.getElementById('attachmentDisplayName').value = link ? link.displayName : '';
      document.getElementById('attachmentUrl').value = link ? link.url : '';
      document.getElementById('attachmentDescription').value = link ? (link.description || '') : '';
      attachmentModal.show();
    }

    function saveAttachmentLink() {
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

      const links = loadObject(STORAGE_KEYS.attachmentLinks);
      links[itemId] = {
        itemId,
        itemName: item.name,
        displayName,
        url,
        description,
        savedAt: new Date().toISOString()
      };
      saveObject(STORAGE_KEYS.attachmentLinks, links);
      attachmentModal.hide();
      renderAttachmentTable();
      showToast('저장되었습니다.');
    }

    function renderNaCriteriaPage() {
      renderNaItemList();
      loadSelectedNaCriteria();
    }

    function renderNaItemList() {
      const list = document.getElementById('naItemList');
      const criteria = loadObject(STORAGE_KEYS.naCriteria);
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
        button.addEventListener('click', () => {
          selectedNaItemId = item.id;
          renderNaCriteriaPage();
        });
        list.appendChild(button);
      });
    }

    function loadSelectedNaCriteria() {
      const criteria = loadObject(STORAGE_KEYS.naCriteria)[selectedNaItemId] || getEmptyCriteria();
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
      if (!button) {
        return;
      }
      tempIndustryWorkerRules = tempIndustryWorkerRules.filter((rule) => rule.industry !== button.dataset.removeRule);
      renderIndustryWorkerTags();
    }

    function saveNaCriteriaForSelectedItem() {
      const selectedIndustryOnly = Array.from(document.querySelectorAll('#industryOnlyCheckboxes input[type="checkbox"]:checked'))
        .map((checkbox) => checkbox.value);
      const allWorkerValue = document.getElementById('naAllWorkerInput').value;

      if (allWorkerValue !== '' && (!Number.isInteger(Number(allWorkerValue)) || Number(allWorkerValue) < 0)) {
        alert('전체 인원 기준은 0 이상의 정수로 입력해 주세요.');
        document.getElementById('naAllWorkerInput').focus();
        return;
      }

      const criteria = loadObject(STORAGE_KEYS.naCriteria);
      criteria[selectedNaItemId] = {
        industryOnly: selectedIndustryOnly,
        industryWithWorker: tempIndustryWorkerRules.map((rule) => ({
          industry: rule.industry,
          maxWorker: Number(rule.maxWorker)
        })),
        allIndustryMaxWorker: allWorkerValue === '' ? null : Number(allWorkerValue)
      };

      saveObject(STORAGE_KEYS.naCriteria, criteria);
      renderNaItemList();
      showToast('저장되었습니다.');
    }

    // 추후 협력사 평가 폼 렌더링 시 항목별 자동 N/A 여부를 판단하는 함수입니다.
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

    function openCreatePeriodModal() {
      document.getElementById('periodForm').reset();
      document.getElementById('periodMode').value = 'create';
      document.getElementById('periodId').value = '';
      document.getElementById('periodModalTitle').textContent = '신규 회차 생성';
      periodModal.show();
    }

    function openEditPeriodModal(periodId) {
      const period = loadPeriods().find((item) => item.id === periodId);
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

    function savePeriod() {
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

      let periods = loadPeriods();
      const id = mode === 'edit' ? existingId : createPeriodId(title, periods);
      const previousActiveCount = periods.filter((period) => period.status === 'active' && period.id !== id).length;

      if (status === 'active') {
        periods = periods.map((period) => (
          period.id !== id && period.status === 'active'
            ? { ...period, status: 'closed' }
            : period
        ));
      }

      const nextPeriod = {
        id,
        title,
        startDate,
        endDate,
        status,
        createdAt: mode === 'edit'
          ? (periods.find((period) => period.id === id)?.createdAt || new Date().toISOString())
          : new Date().toISOString()
      };

      if (mode === 'edit') {
        periods = periods.map((period) => period.id === id ? nextPeriod : period);
      } else {
        periods.push(nextPeriod);
      }

      savePeriods(periods);
      periodModal.hide();
      renderPeriodTable();
      showToast(status === 'active' && previousActiveCount > 0
        ? '기존 진행중 회차가 마감 처리되었습니다.'
        : '저장되었습니다.');
    }

    function createPeriodId(title, periods) {
      const yearMatch = title.match(/(\d{4})년/);
      const year = yearMatch ? yearMatch[1] : String(new Date().getFullYear());
      let baseId = `PERIOD_${Date.now()}`;
      if (title.includes('상반기')) {
        baseId = `${year}_1`;
      }
      if (title.includes('하반기')) {
        baseId = `${year}_2`;
      }
      if (!periods.some((period) => period.id === baseId)) {
        return baseId;
      }
      return `${baseId}_${String(Date.now()).slice(-4)}`;
    }

    function renderPeriodTable() {
      const tbody = document.getElementById('periodTableBody');
      const periods = loadPeriods();
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
      if (!button) {
        return;
      }

      const { periodAction, periodId } = button.dataset;
      if (periodAction === 'edit-period') {
        openEditPeriodModal(periodId);
      }
      if (periodAction === 'delete-period') {
        deletePeriod(periodId);
      }
    }

    function deletePeriod(periodId) {
      if (!confirm('정말 삭제하시겠습니까?')) {
        return;
      }

      const periods = loadPeriods().filter((period) => period.id !== periodId);
      savePeriods(periods);
      renderPeriodTable();
      showToast('삭제되었습니다.');
    }

    function syncActivePeriodId() {
      const active = loadPeriods().find((period) => period.status === 'active');
      if (active) {
        localStorage.setItem(STORAGE_KEYS.activePeriodId, active.id);
      } else {
        localStorage.removeItem(STORAGE_KEYS.activePeriodId);
      }
    }

    function getActivePeriod() {
      const activePeriodId = localStorage.getItem(STORAGE_KEYS.activePeriodId);
      return loadPeriods().find((period) => period.id === activePeriodId && period.status === 'active')
        || loadPeriods().find((period) => period.status === 'active')
        || null;
    }

    function canSubmitNow() {
      const period = getActivePeriod();
      return Boolean(period && !isPastPeriodEnd(period));
    }

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

    function isPastPeriodEnd(period) {
      if (!period || !period.endDate) {
        return false;
      }
      return new Date() > new Date(`${period.endDate}T23:59:59`);
    }

    function renderActivePeriodBanner(containerId) {
      const container = document.getElementById(containerId);
      const period = getActivePeriod();
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
      if (closed) {
        banner.classList.add('is-closed');
      }

      banner.innerHTML = `
        <div>
          <strong>${period.title}</strong>
          <span>제출기간: ${formatPeriodRange(period.startDate, period.endDate)}</span>
          ${closed ? '<span class="text-danger">제출 기간이 마감되었습니다.</span>' : ''}
        </div>
      `;
      container.appendChild(banner);
    }

    function renderPartnerMain() {
      const user = getCurrentUserRecord();
      if (!user || user.role !== 'partner') {
        logout();
        return;
      }

      setCurrentUser(user);
      renderActivePeriodBanner('partnerActivePeriodBanner');
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

        const blockMessage = getSubmitBlockMessage();
        if (blockMessage) {
          button.disabled = true;
          const blocked = document.createElement('p');
          blocked.className = 'mb-0 text-danger fw-bold';
          blocked.textContent = blockMessage;
          content.append(message, button, blocked);
          return;
        }

        button.addEventListener('click', () => navigate('profile'));
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

    function renderProfileForm() {
      const user = getCurrentUserRecord();
      if (!user || user.role !== 'partner') {
        logout();
        return;
      }

      renderActivePeriodBanner('profileActivePeriodBanner');
      const profiles = loadObject(STORAGE_KEYS.companyProfiles);
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
      document.getElementById('profileSubmitBtn').disabled = !canSubmitNow();
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

    function saveProfile(event) {
      event.preventDefault();
      const user = getCurrentUserRecord();
      if (!user || user.role !== 'partner') {
        logout();
        return;
      }

      if (!canSubmitNow()) {
        alert(getSubmitBlockMessage());
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

      const profiles = loadObject(STORAGE_KEYS.companyProfiles);
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

      saveObject(STORAGE_KEYS.companyProfiles, profiles);
      renderEvaluationForm();
      showPage('evaluationFormPage');
    }

    function renderEvaluationForm() {
      const user = getCurrentUserRecord();
      const period = getActivePeriod();
      const profile = getCurrentCompanyProfile();
      if (!user || user.role !== 'partner' || !period || !profile) {
        alert(!profile ? '사업장 현황을 먼저 입력해 주세요.' : getSubmitBlockMessage());
        renderPartnerMain();
        showPage('partnerMainPage');
        return;
      }

      renderActivePeriodBanner('evaluationActivePeriodBanner');
      const submission = getEvaluationSubmission(user.id, period.id);
      const categories = [...new Set(EVALUATION_ITEMS.map((item) => item.category))];
      const tabs = document.getElementById('evaluationCategoryTabs');
      const content = document.getElementById('evaluationTabContent');
      tabs.innerHTML = '';
      content.innerHTML = '';

      categories.forEach((category, index) => {
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

        EVALUATION_ITEMS
          .filter((item) => item.category === category)
          .forEach((item) => {
            pane.appendChild(createEvaluationItemCard(item, submission.items[item.id] || getEmptyEvaluationItemState(item), profile));
          });
        content.appendChild(pane);
      });

      document.querySelectorAll('.evaluation-record, .na-reason-input').forEach(autoResizeTextarea);
      updateEvaluationProgress();
    }

    function createEvaluationItemCard(item, state, profile) {
      const links = loadObject(STORAGE_KEYS.attachmentLinks);
      const attachment = item.attachmentId ? links[item.attachmentId] : null;
      const isAutoNA = checkAutoNA(item.id, profile.industryCode, profile.workerCount);
      const isManualNA = !isAutoNA && Boolean(state.isManualNA);
      const card = document.createElement('article');
      card.className = `evaluation-item-card ${isAutoNA ? 'is-auto-na' : ''} ${isManualNA ? 'is-manual-na' : ''}`;
      card.dataset.itemId = item.id;
      card.dataset.autoNa = String(isAutoNA);
      card.dataset.maxScore = String(item.maxScore);
      card.dataset.isBonus = String(item.isBonus);

      const collapseId = `criteria_${item.id}`;
      card.innerHTML = `
        <div class="evaluation-item-head">
          <div>
            <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
              <h2 class="evaluation-item-title">${item.subcategory}</h2>
              ${item.isBonus ? '<span class="status-badge status-primary">가점</span>' : ''}
              <span class="status-badge ${isAutoNA ? 'status-primary' : isManualNA ? 'status-reviewing' : 'status-muted'} na-state-badge">${isAutoNA ? '자동 N/A' : isManualNA ? '수동 N/A' : '작성대상'}</span>
            </div>
            <div class="small-muted">${item.category}</div>
          </div>
          <div class="d-flex flex-column align-items-end gap-2">
            <span class="score-pill">${item.maxScore}점</span>
            <button type="button" class="btn btn-sm btn-outline-primary manual-na-btn" data-manual-na="${item.id}" ${isAutoNA ? 'disabled' : ''}>N/A 처리</button>
          </div>
        </div>
        <div class="evaluation-item-body">
          <button class="btn btn-sm btn-outline-primary mb-2" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="true" aria-controls="${collapseId}">
            판정기준 접기/펼치기
          </button>
          <div class="collapse show mb-3" id="${collapseId}">
            <div class="criteria-box">${item.criteria}</div>
          </div>
          <div class="row g-3">
            <div class="col-12 col-lg-6">
              <div class="fw-bold mb-2">세부 체크항목</div>
              <div class="check-item-list"></div>
            </div>
            <div class="col-12 col-lg-6">
              <div class="fw-bold mb-2">배점 안내</div>
              <div class="evaluation-guide mb-3">${item.scoreGuide}</div>
              <label class="form-label" for="record_${item.id}">평가내용 기록</label>
              <textarea class="form-control evaluation-record" id="record_${item.id}" data-record-content="${item.id}" placeholder="${escapeAttribute(item.recordGuide)}" ${isAutoNA || isManualNA ? 'disabled' : ''}></textarea>
              <div class="na-reason-wrap mt-3">
                <label class="form-label" for="naReason_${item.id}">N/A 사유 <span class="required-mark">*</span></label>
                <textarea class="form-control na-reason-input" id="naReason_${item.id}" data-na-reason="${item.id}" placeholder="N/A 사유를 입력해 주세요." ${isAutoNA || !isManualNA ? 'disabled' : 'required'}></textarea>
              </div>
            </div>
          </div>
          <div class="attachment-area mt-3"></div>
        </div>
      `;

      const list = card.querySelector('.check-item-list');
      item.checkItems.forEach((checkItem, index) => {
        const id = `check_${item.id}_${index}`;
        const wrap = document.createElement('div');
        wrap.className = 'form-check mb-2';
        wrap.innerHTML = `
          <input class="form-check-input evaluation-check" type="checkbox" id="${id}" data-check-item="${item.id}" data-check-index="${index}" ${state.checkResults[index] ? 'checked' : ''} ${isAutoNA || isManualNA ? 'disabled' : ''}>
          <label class="form-check-label" for="${id}">${checkItem}</label>
        `;
        list.appendChild(wrap);
      });

      card.querySelector('[data-record-content]').value = state.recordContent || '';
      card.querySelector('[data-na-reason]').value = state.naReason || '';

      if (attachment && attachment.url) {
        const area = card.querySelector('.attachment-area');
        const link = document.createElement('a');
        link.className = 'btn btn-sm btn-outline-primary';
        link.href = attachment.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = `📎 ${attachment.displayName} 다운로드`;
        area.appendChild(link);
      }

      return card;
    }

    function handleEvaluationInput(event) {
      if (event.target.matches('.evaluation-record, .na-reason-input')) {
        autoResizeTextarea(event.target);
      }
      updateEvaluationProgress();
    }

    function handleEvaluationClick(event) {
      const button = event.target.closest('[data-manual-na]');
      if (!button) {
        return;
      }

      const card = button.closest('.evaluation-item-card');
      if (!card || card.dataset.autoNa === 'true') {
        return;
      }

      const enabled = !card.classList.contains('is-manual-na');
      applyManualNAState(card, enabled);
      updateEvaluationProgress();
    }

    function applyManualNAState(card, enabled) {
      card.classList.toggle('is-manual-na', enabled);
      const badge = card.querySelector('.na-state-badge');
      badge.className = `status-badge ${enabled ? 'status-reviewing' : 'status-muted'} na-state-badge`;
      badge.textContent = enabled ? '수동 N/A' : '작성대상';

      card.querySelectorAll('.evaluation-check, .evaluation-record').forEach((input) => {
        input.disabled = enabled;
      });

      const reason = card.querySelector('.na-reason-input');
      reason.disabled = !enabled;
      reason.required = enabled;
      if (enabled) {
        reason.focus();
      }
    }

    function updateEvaluationProgress() {
      const cards = Array.from(document.querySelectorAll('#evaluationTabContent .evaluation-item-card'));
      const total = cards.length;
      const completed = cards.filter(isEvaluationCardCompleted).length;
      const percent = total ? Math.round((completed / total) * 100) : 0;

      document.getElementById('evaluationProgressText').textContent = `전체 ${total}항목 중 ${completed}항목 작성 완료`;
      document.getElementById('evaluationProgressPercent').textContent = `${percent}%`;
      const bar = document.getElementById('evaluationProgressBar');
      bar.style.width = `${percent}%`;
      bar.textContent = `${percent}%`;
      bar.parentElement.setAttribute('aria-valuenow', String(percent));
    }

    function isEvaluationCardCompleted(card) {
      if (card.dataset.autoNa === 'true') {
        return true;
      }
      if (card.classList.contains('is-manual-na')) {
        return Boolean(card.querySelector('.na-reason-input').value.trim());
      }
      const hasChecked = Array.from(card.querySelectorAll('.evaluation-check')).some((input) => input.checked);
      const hasRecord = Boolean(card.querySelector('.evaluation-record').value.trim());
      return hasChecked || hasRecord;
    }

    function collectEvaluationSubmission(status) {
      const user = getCurrentUserRecord();
      const period = getActivePeriod();
      const existing = getEvaluationSubmission(user.id, period.id);
      const items = {};

      document.querySelectorAll('#evaluationTabContent .evaluation-item-card').forEach((card) => {
        const itemId = card.dataset.itemId;
        items[itemId] = {
          checkResults: Array.from(card.querySelectorAll('.evaluation-check')).map((input) => input.checked),
          recordContent: card.querySelector('.evaluation-record').value.trim(),
          isManualNA: card.classList.contains('is-manual-na'),
          naReason: card.querySelector('.na-reason-input').value.trim()
        };
      });

      return {
        companyId: user.id,
        periodId: period.id,
        status,
        submittedAt: status === 'submitted' ? new Date().toISOString() : (existing.submittedAt || ''),
        savedAt: new Date().toISOString(),
        items
      };
    }

    function saveEvaluationDraft() {
      const submission = collectEvaluationSubmission('draft');
      const submissions = loadObject(STORAGE_KEYS.evaluationSubmissions);
      submissions[getSubmissionKey(submission.companyId, submission.periodId)] = submission;
      saveObject(STORAGE_KEYS.evaluationSubmissions, submissions);
      showToast('임시저장 완료');
    }

    function openSubmitConfirmModal() {
      if (!validateManualNAReasons()) {
        return;
      }
      submitConfirmModal.show();
    }

    function validateManualNAReasons() {
      const missingCard = Array.from(document.querySelectorAll('#evaluationTabContent .evaluation-item-card.is-manual-na'))
        .find((card) => !card.querySelector('.na-reason-input').value.trim());

      if (missingCard) {
        const title = missingCard.querySelector('.evaluation-item-title').textContent;
        alert(`${title} 항목의 N/A 사유를 입력해 주세요.`);
        missingCard.querySelector('.na-reason-input').focus();
        return false;
      }
      return true;
    }

    function submitEvaluation() {
      if (!validateManualNAReasons()) {
        return;
      }

      const submission = collectEvaluationSubmission('submitted');
      const submissions = loadObject(STORAGE_KEYS.evaluationSubmissions);
      submissions[getSubmissionKey(submission.companyId, submission.periodId)] = submission;
      saveObject(STORAGE_KEYS.evaluationSubmissions, submissions);

      const users = loadUsers().map((user) => (
        user.id === submission.companyId
          ? { ...user, submissionStatus: 'submitted' }
          : user
      ));
      saveUsers(users);
      setCurrentUser(users.find((user) => user.id === submission.companyId));
      submitConfirmModal.hide();
      renderPartnerMain();
      showPage('partnerMainPage');
      showToast('제출되었습니다.');
    }

    function getCurrentCompanyProfile() {
      const user = getCurrentUserRecord();
      if (!user) {
        return null;
      }
      return loadObject(STORAGE_KEYS.companyProfiles)[user.id] || null;
    }

    function getEvaluationSubmission(companyId, periodId) {
      const submissions = loadObject(STORAGE_KEYS.evaluationSubmissions);
      return submissions[getSubmissionKey(companyId, periodId)] || {
        companyId,
        periodId,
        status: 'draft',
        submittedAt: '',
        items: {}
      };
    }

    function getSubmissionKey(companyId, periodId) {
      return `${companyId}_${periodId}`;
    }

    function getEmptyEvaluationItemState(item) {
      return {
        checkResults: item.checkItems.map(() => false),
        recordContent: '',
        isManualNA: false,
        naReason: ''
      };
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
      return {
        industryOnly: [],
        industryWithWorker: [],
        allIndustryMaxWorker: null
      };
    }

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

    function isValidAccountId(accountId) {
      return /^[A-Za-z0-9._-]{3,30}$/.test(accountId);
    }

    function isValidUrl(url) {
      try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch (error) {
        return false;
      }
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

    function showToast(message) {
      document.getElementById('toastMessage').textContent = message;
      appToast.show();
    }

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
