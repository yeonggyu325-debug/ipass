/* ==========================================================
   scoring.js  —  채점 및 결과 관리 모듈
   ========================================================== */

/* ----------------------------------------------------------
   1. 평가 항목 데이터
   ---------------------------------------------------------- */
const EVALUATION_ITEMS = [
  {
    id: "bonus_1",
    category: "가점",
    subCategory: "안전보건경영시스템 구축 및 운영",
    maxScore: 3,
    isBonus: true,
    naAllowed: false
  },
  {
    id: "bonus_2",
    category: "가점",
    subCategory: "환경안전 부문 수상이력",
    maxScore: 2,
    isBonus: true,
    naAllowed: false
  },
  {
    id: "item_1",
    category: "중대산업재해 예방",
    subCategory: "경영책임자 안전보건 의무 이행",
    maxScore: 10,
    isBonus: false,
    naAllowed: true,
    naCondition: "상시근로자 5인 미만"
  },
  {
    id: "item_2",
    category: "안전보건 관리체계",
    subCategory: "안전·보건 업무 전담조직 설치",
    maxScore: 3,
    isBonus: false,
    naAllowed: true,
    naCondition: "상시근로자 5인 미만"
  },
  {
    id: "item_3",
    category: "안전보건 관리체계",
    subCategory: "안전·보건관리자 적정 수 배치",
    maxScore: 5,
    isBonus: false,
    naAllowed: true,
    naCondition: "인원 미만 사업장 또는 비해당 업종"
  },
  {
    id: "item_4",
    category: "안전보건 관리체계",
    subCategory: "안전보건관리책임자·관리감독자 선임",
    maxScore: 5,
    isBonus: false,
    naAllowed: true,
    naCondition: "상시근로자 5인 미만 또는 비해당 업종"
  },
  {
    id: "item_5",
    category: "안전보건 관리체계",
    subCategory: "안전보건방침 및 목표 수립",
    maxScore: 3,
    isBonus: false,
    naAllowed: true,
    naCondition: "상시근로자 5인 미만(중대재해처벌법 비대상)"
  },
  {
    id: "item_6",
    category: "안전보건 관리체계",
    subCategory: "안전보건관리규정",
    maxScore: 3,
    isBonus: false,
    naAllowed: true,
    naCondition: "업종·인원 미해당"
  },
  {
    id: "item_7",
    category: "안전보건 관리체계",
    subCategory: "법령 요지 게시",
    maxScore: 2,
    isBonus: false,
    naAllowed: true,
    naCondition: "업종·인원 미해당"
  },
  {
    id: "item_8",
    category: "안전보건 관리체계",
    subCategory: "산업안전보건위원회 및 안전보건회의",
    maxScore: 5,
    isBonus: false,
    naAllowed: true,
    naCondition: "업종·인원 미해당"
  },
  {
    id: "item_9",
    category: "안전보건 관리체계",
    subCategory: "안전보건교육 실시 (정기)",
    maxScore: 5,
    isBonus: false,
    naAllowed: true,
    naCondition: "안전보건교육 대상 아닌 근거 제시"
  },
  {
    id: "item_10",
    category: "안전보건 관리체계",
    subCategory: "안전보건교육 실시 (채용시·특별교육)",
    maxScore: 5,
    isBonus: false,
    naAllowed: true,
    naCondition: "최근 반기 교육 없음에 대한 사유 작성"
  },
  {
    id: "item_11",
    category: "유해위험 방지조치",
    subCategory: "위험성평가 및 개선절차 마련",
    maxScore: 10,
    isBonus: false,
    naAllowed: false
  },
  {
    id: "item_12",
    category: "유해위험 방지조치",
    subCategory: "작업중지 및 비상조치",
    maxScore: 5,
    isBonus: false,
    naAllowed: true,
    naCondition: "5인 미만 중대재해처벌법 비대상 등"
  },
  {
    id: "item_13",
    category: "유해위험 방지조치",
    subCategory: "재해 발생시 재발방지 대책",
    maxScore: 4,
    isBonus: false,
    naAllowed: false
  },
  {
    id: "item_14",
    category: "근로자 보건관리",
    subCategory: "보호구 관리",
    maxScore: 5,
    isBonus: false,
    naAllowed: false
  },
  {
    id: "item_15",
    category: "근로자 보건관리",
    subCategory: "건강검진",
    maxScore: 5,
    isBonus: false,
    naAllowed: false
  },
  {
    id: "item_16",
    category: "근로자 보건관리",
    subCategory: "작업환경측정",
    maxScore: 3,
    isBonus: false,
    naAllowed: true,
    naCondition: "측정대상 유해인자 없음(경영책임자 확인서 제출)"
  },
  {
    id: "item_17",
    category: "근로자 보건관리",
    subCategory: "근골격계 유해요인 조사",
    maxScore: 3,
    isBonus: false,
    naAllowed: false
  },
  {
    id: "item_18",
    category: "근로자 보건관리",
    subCategory: "물질안전보건자료(MSDS)",
    maxScore: 5,
    isBonus: false,
    naAllowed: true,
    naCondition: "사업장 내 화학물질 미사용(경영책임자 확인서 제출)"
  },
  {
    id: "item_19",
    category: "도급시 산업재해 예방",
    subCategory: "도급사업시의 안전보건조치",
    maxScore: 6,
    isBonus: false,
    naAllowed: true,
    naCondition: "도급관계의 협력사(수급인 없음)"
  },
  {
    id: "item_20",
    category: "도급시 산업재해 예방",
    subCategory: "도급업체 평가 및 비용 확인",
    maxScore: 6,
    isBonus: false,
    naAllowed: true,
    naCondition: "도급관계의 협력사(수급인 없음)"
  },
  {
    id: "item_21",
    category: "도급시 산업재해 예방",
    subCategory: "산안법 도급승인",
    maxScore: 2,
    isBonus: false,
    naAllowed: true,
    naCondition: "이루자와의 업무 중 산안법 도급승인 대상 작업 없음"
  }
];

/* ----------------------------------------------------------
   2. 점수 계산 함수
   ---------------------------------------------------------- */

/**
 * @description 채점 결과 계산
 * @param {object} scoringData
 * @returns {object}
 */
function calculateScore(scoringData) {
  if (!scoringData || !scoringData.items) {
    return {
      실취득점수: 0, 실배점: 100,
      환산점수: 0, 가점: 0,
      최종점수: 0, 등급: '',
      naItems: []
    };
  }

  let 실취득 = 0;
  let 실배점 = 0;
  let 가점합계 = 0;
  const naItems = [];

  EVALUATION_ITEMS.forEach(item => {
    const record = scoringData.items[item.id];
    if (!record) return;

    if (item.isBonus) {
      // 가점 항목
      if (!record.isNA && record.score !== null && record.score !== undefined) {
        가점합계 += Number(record.score);
      }
    } else {
      // 일반 항목
      if (record.isNA) {
        naItems.push(item.id);
      } else {
        실배점 += item.maxScore;
        if (record.score !== null && record.score !== undefined) {
          실취득 += Number(record.score);
        }
      }
    }
  });

  // 가점 최대 5점 제한
  가점합계 = Math.min(가점합계, 5);

  // 환산점수 계산
  const 환산점수 = 실배점 > 0
    ? Math.round((실취득 / 실배점) * 100 * 100) / 100
    : 0;

  // 최종점수 (소수점 2자리, 최대 105점)
  const 최종점수 = Math.round((환산점수 + 가점합계) * 100) / 100;

  return {
    실취득점수: 실취득,
    실배점: 실배점,
    환산점수: 환산점수,
    가점: 가점합계,
    최종점수: 최종점수,
    등급: getGrade(최종점수),
    naItems: naItems
  };
}

/**
 * @description 등급 판정
 * @param {number} finalScore
 * @returns {string}
 */
function getGrade(finalScore) {
  if (finalScore >= 90) return '안전보건 우수 협력사';
  if (finalScore >= 70) return '적격 협력사';
  return '역량강화 대상 협력사';
}

/**
 * @description 등급 CSS 클래스 반환
 * @param {string} grade
 * @returns {string}
 */
function getGradeClass(grade) {
  if (grade === '안전보건 우수 협력사') return 'grade-excellent';
  if (grade === '적격 협력사') return 'grade-qualified';
  return 'grade-needs-improvement';
}

/* ----------------------------------------------------------
   3. localStorage 헬퍼
   ---------------------------------------------------------- */

const SCORING_STORAGE_KEY = 'allScoringData';

/**
 * @description 전체 채점 데이터 배열 반환
 */
function getAllScoringData() {
  try {
    return JSON.parse(localStorage.getItem(SCORING_STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

/**
 * @description 특정 회사/회차 채점 데이터 반환
 * @param {string} companyId
 * @param {string} periodId
 * @returns {object|null}
 */
function getScoringData(companyId, periodId) {
  return getAllScoringData().find(
    d => d.companyId === companyId && d.periodId === periodId
  ) || null;
}

/**
 * @description 채점 데이터 저장 (없으면 생성, 있으면 업데이트)
 * @param {object} scoringData
 */
function saveScoringData(scoringData) {
  const all = getAllScoringData();
  const idx = all.findIndex(
    d => d.companyId === scoringData.companyId && d.periodId === scoringData.periodId
  );
  if (idx >= 0) {
    all[idx] = scoringData;
  } else {
    all.push(scoringData);
  }
  localStorage.setItem(SCORING_STORAGE_KEY, JSON.stringify(all));
}

/**
 * @description 항목별 점수 저장
 * @param {string} companyId
 * @param {string} periodId
 * @param {string} itemId
 * @param {object} itemData  { score, isNA, naReason, comment }
 */
function saveItemScore(companyId, periodId, itemId, itemData) {
  const currentUser = getCurrentUser ? getCurrentUser() : { id: 'admin' };
  let data = getScoringData(companyId, periodId);

  if (!data) {
    data = {
      companyId,
      periodId,
      companyName: '',
      scoredBy: currentUser.id,
      scoredAt: new Date().toISOString(),
      isPublished: false,
      items: {}
    };
  }

  data.items[itemId] = {
    score: itemData.score !== undefined ? itemData.score : null,
    isNA: itemData.isNA || false,
    naReason: itemData.naReason || '',
    comment: itemData.comment || ''
  };
  data.scoredAt = new Date().toISOString();

  saveScoringData(data);
}

/**
 * @description 채점 결과 공개 처리
 * @param {string} companyId
 * @param {string} periodId
 * @returns {boolean}
 */
function publishResult(companyId, periodId) {
  const data = getScoringData(companyId, periodId);
  if (!data) return false;
  data.isPublished = true;
  data.publishedAt = new Date().toISOString();
  saveScoringData(data);
  return true;
}

/**
 * @description 채점 결과 비공개 처리
 * @param {string} companyId
 * @param {string} periodId
 * @returns {boolean}
 */
function unpublishResult(companyId, periodId) {
  const data = getScoringData(companyId, periodId);
  if (!data) return false;
  data.isPublished = false;
  saveScoringData(data);
  return true;
}

/* ----------------------------------------------------------
   4. 채점 관리 목록 페이지 렌더링
   ---------------------------------------------------------- */

// 현재 채점 중인 회사/회차 전역 상태
let _scoringCompanyId = '';
let _scoringCompanyName = '';
let _scoringPeriodId = '';
let _scoringSelectedItemId = '';

/**
 * @description 채점 관리 목록 페이지 렌더링
 */
function renderScoringManagePage() {
  const periodSelect = document.getElementById('scoringPeriodSelect');
  const tableBody = document.getElementById('scoringStatusTableBody');
  if (!periodSelect || !tableBody) return;

  // 회차 목록 로드
  const periods = JSON.parse(localStorage.getItem('periods') || '[]');
  periodSelect.innerHTML = '<option value="">-- 회차를 선택하세요 --</option>';
  periods.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.title;
    periodSelect.appendChild(opt);
  });

  // 진행중 회차 자동 선택
  const activePeriod = periods.find(p => p.status === 'active');
  if (activePeriod) periodSelect.value = activePeriod.id;

  // 회차 변경 이벤트
  periodSelect.onchange = () => renderScoringTable(periodSelect.value);

  // 초기 렌더링
  if (activePeriod) renderScoringTable(activePeriod.id);
}

/**
 * @description 회차별 채점 현황 테이블 렌더링
 * @param {string} periodId
 */
function renderScoringTable(periodId) {
  const tableBody = document.getElementById('scoringStatusTableBody');
  if (!tableBody) return;

  const users = JSON.parse(localStorage.getItem('users') || '[]')
    .filter(u => u.role === 'company');
  const submissions = JSON.parse(localStorage.getItem('submissions') || '[]');

  tableBody.innerHTML = '';

  if (!periodId) {
    tableBody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-3">회차를 선택하세요.</td></tr>';
    return;
  }

  if (users.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-3">등록된 협력사가 없습니다.</td></tr>';
    return;
  }

  users.forEach((user, idx) => {
    const submission = submissions.find(
      s => s.companyId === user.id && s.periodId === periodId
    );
    const scoringData = getScoringData(user.id, periodId);
    const isSubmitted = submission && submission.status === 'submitted';

    // 채점 상태 판단
    let scoringStatus = '';
    let scoringBadge = '';
    if (!isSubmitted) {
      scoringStatus = 'none';
      scoringBadge = '<span class="badge bg-secondary">미제출</span>';
    } else if (!scoringData) {
      scoringStatus = 'ready';
      scoringBadge = '<span class="badge bg-warning text-dark">채점전</span>';
    } else if (scoringData.isPublished) {
      scoringStatus = 'published';
      scoringBadge = '<span class="badge bg-primary">공개됨</span>';
    } else {
      scoringStatus = 'scored';
      scoringBadge = '<span class="badge bg-success">채점완료</span>';
    }

    // 점수 계산
    let 환산점수 = '-';
    let 최종점수 = '-';
    let 등급 = '-';
    if (scoringData) {
      const result = calculateScore(scoringData);
      환산점수 = result.환산점수.toFixed(2);
      최종점수 = result.최종점수.toFixed(2);
      등급 = result.등급
        ? `<span class="badge ${getGradeClass(result.등급)}" style="font-size:11px;">${result.등급}</span>`
        : '-';
    }

    // 채점 버튼
    let actionBtn = '';
    if (isSubmitted) {
      const label = scoringData ? '수정' : '채점하기';
      const btnClass = scoringData ? 'btn-outline-primary' : 'btn-primary';
      actionBtn = `<button class="btn ${btnClass} btn-sm"
        onclick="startScoring('${user.id}','${user.companyName}','${periodId}')">
        ${label}
      </button>`;
    } else {
      actionBtn = '<span class="text-muted small">제출 대기</span>';
    }

    tableBody.innerHTML += `
      <tr>
        <td>${idx + 1}</td>
        <td>${user.companyName}</td>
        <td>${isSubmitted
          ? '<span class="badge bg-success">제출완료</span>'
          : '<span class="badge bg-secondary">미제출</span>'}</td>
        <td>${scoringBadge}</td>
        <td>${환산점수}</td>
        <td>${최종점수}</td>
        <td>${등급}</td>
        <td>${scoringData
          ? (scoringData.isPublished
            ? '<span class="badge bg-primary">공개</span>'
            : '<span class="badge bg-secondary">비공개</span>')
          : '-'}</td>
        <td>${actionBtn}</td>
      </tr>
    `;
  });
}

/**
 * @description 채점 시작 — 채점 페이지로 이동
 * @param {string} companyId
 * @param {string} companyName
 * @param {string} periodId
 */
function startScoring(companyId, companyName, periodId) {
  _scoringCompanyId = companyId;
  _scoringCompanyName = companyName;
  _scoringPeriodId = periodId;
  _scoringSelectedItemId = '';

  // 채점 데이터 없으면 초기 생성
  if (!getScoringData(companyId, periodId)) {
    saveScoringData({
      companyId,
      companyName,
      periodId,
      scoredBy: getCurrentUser ? getCurrentUser().id : 'admin',
      scoredAt: new Date().toISOString(),
      isPublished: false,
      items: {}
    });
  }

  navigate('scoring-page');
}

/* ----------------------------------------------------------
   5. 채점 화면 렌더링
   ---------------------------------------------------------- */

/**
 * @description 채점 화면 전체 렌더링
 */
function renderScoringPage() {
  const companyId = _scoringCompanyId;
  const companyName = _scoringCompanyName;
  const periodId = _scoringPeriodId;

  // 헤더 정보
  const nameEl = document.getElementById('scoringCompanyName');
  const periodEl = document.getElementById('scoringPeriodLabel');
  if (nameEl) nameEl.textContent = companyName;
  if (periodEl) {
    const periods = JSON.parse(localStorage.getItem('periods') || '[]');
    const period = periods.find(p => p.id === periodId);
    if (periodEl) periodEl.textContent = period ? period.title : '';
  }

  // 사이드바 렌더링
  renderScoringsSidebar();

  // 하단 점수 현황 업데이트
  updateScoringFooter();

  // 첫 번째 항목 자동 선택
  if (!_scoringSelectedItemId && EVALUATION_ITEMS.length > 0) {
    renderScoringItemPanel(EVALUATION_ITEMS[0].id);
  }
}

/**
 * @description 사이드바 항목 목록 렌더링
 */
function renderScoringsSidebar() {
  const sidebar = document.getElementById('scoringSidebarContent');
  if (!sidebar) return;

  const scoringData = getScoringData(_scoringCompanyId, _scoringPeriodId);
  const items = scoringData ? scoringData.items : {};

  // 대분류별 그룹핑
  const groups = {};
  EVALUATION_ITEMS.forEach(item => {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
  });

  let html = '';
  Object.entries(groups).forEach(([category, categoryItems]) => {
    const scored = categoryItems.filter(item => {
      const r = items[item.id];
      return r && (r.isNA || r.score !== null && r.score !== undefined);
    }).length;

    html += `
      <div class="category-header">
        <span>${category}</span>
        <span>${scored}/${categoryItems.length}</span>
      </div>
    `;

    categoryItems.forEach(item => {
      const record = items[item.id];
      let statusIcon = '⬜';
      let scoreText = `0/${item.maxScore}`;

      if (record) {
        if (record.isNA) {
          statusIcon = '🔵';
          scoreText = 'N/A';
        } else if (record.score !== null && record.score !== undefined) {
          statusIcon = item.isBonus ? '🌟' : '✅';
          scoreText = `${record.score}/${item.maxScore}`;
        }
      }

      const isActive = _scoringSelectedItemId === item.id ? 'active' : '';

      html += `
        <div class="item-row ${isActive}" onclick="renderScoringItemPanel('${item.id}')">
          <span class="item-status">${statusIcon}</span>
          <span class="item-name">${item.subCategory}</span>
          <span class="item-score">${scoreText}</span>
        </div>
      `;
    });
  });

  sidebar.innerHTML = html;
}

/**
 * @description 오른쪽 채점 패널 렌더링
 * @param {string} itemId
 */
function renderScoringItemPanel(itemId) {
  _scoringSelectedItemId = itemId;
  renderScoringsSidebar(); // 사이드바 active 상태 업데이트

  const panel = document.getElementById('scoringPanelContent');
  if (!panel) return;

  const item = EVALUATION_ITEMS.find(i => i.id === itemId);
  if (!item) return;

  const scoringData = getScoringData(_scoringCompanyId, _scoringPeriodId);
  const record = (scoringData && scoringData.items[itemId]) || {
    score: null, isNA: false, naReason: '', comment: ''
  };

  const currentIndex = EVALUATION_ITEMS.findIndex(i => i.id === itemId);
  const prevItem = EVALUATION_ITEMS[currentIndex - 1];
  const nextItem = EVALUATION_ITEMS[currentIndex + 1];

  // 카테고리 뱃지 색상
  const categoryColors = {
    '가점': 'warning text-dark',
    '중대산업재해 예방': 'danger',
    '안전보건 관리체계': 'primary',
    '유해위험 방지조치': 'warning text-dark',
    '근로자 보건관리': 'success',
    '도급시 산업재해 예방': 'info text-dark'
  };
  const badgeClass = categoryColors[item.category] || 'secondary';

  // 점수 퀵버튼 생성
  const scoreValues = generateScoreValues(item);
  const scoreButtons = scoreValues.map(v => `
    <button type="button"
      class="btn btn-sm ${record.score === v ? 'btn-primary' : 'btn-outline-secondary'} scoring-score-btn"
      data-value="${v}" ${record.isNA ? 'disabled' : ''}>
      ${v}
    </button>
  `).join('');

  panel.innerHTML = `
    <!-- 항목 헤더 -->
    <div class="scoring-item-header">
      <span class="badge bg-${badgeClass}">${item.category}</span>
      <h5 class="mb-0 ms-2">${item.subCategory}</h5>
      <span class="ms-auto text-muted">만점: <strong>${item.maxScore}점</strong></span>
      ${item.naAllowed
        ? '<span class="badge bg-info text-dark ms-2">N/A 가능</span>'
        : '<span class="badge bg-secondary ms-2">N/A 불가</span>'}
    </div>

    <!-- N/A 토글 -->
    ${item.naAllowed ? `
    <div class="card mb-3 border-info">
      <div class="card-body py-2">
        <div class="form-check mb-2">
          <input class="form-check-input" type="checkbox" id="naCheckbox"
            ${record.isNA ? 'checked' : ''}>
          <label class="form-check-label fw-bold" for="naCheckbox">
            N/A (해당없음) 처리
          </label>
        </div>
        <div id="naReasonArea" ${record.isNA ? '' : 'style="display:none;"'}>
          <input type="text" class="form-control form-control-sm" id="naReasonInput"
            placeholder="${item.naCondition}"
            value="${record.naReason || ''}">
        </div>
      </div>
    </div>
    ` : ''}

    <!-- 점수 입력 -->
    <div class="card mb-3" id="scoreInputArea" ${record.isNA ? 'style="opacity:0.4;pointer-events:none;"' : ''}>
      <div class="card-body">
        <label class="form-label fw-bold">취득 점수</label>
        <div class="d-flex align-items-center gap-3 mb-3">
          <input type="number" class="form-control" id="scoreDirectInput"
            min="0" max="${item.maxScore}" step="1"
            value="${record.score !== null && record.score !== undefined ? record.score : ''}"
            style="width: 100px;"
            placeholder="0">
          <span class="text-muted">/ ${item.maxScore}점</span>
        </div>
        <div class="scoring-score-buttons">
          ${scoreButtons}
        </div>
      </div>
    </div>

    <!-- 채점 메모 -->
    <div class="mb-3">
      <label class="form-label fw-bold">채점 메모 <span class="text-muted fw-normal">(선택)</span></label>
      <textarea class="form-control" id="scoringComment" rows="3"
        placeholder="특이사항, 감점 사유 등 기록">${record.comment || ''}</textarea>
    </div>

    <!-- 이전/저장/다음 버튼 -->
    <div class="scoring-nav-btns">
      <button type="button" class="btn btn-outline-secondary"
        ${!prevItem ? 'disabled' : ''}
        onclick="renderScoringItemPanel('${prevItem ? prevItem.id : ''}')">
        <i class="fa-solid fa-arrow-left me-1"></i>이전 항목
      </button>
      <button type="button" class="btn btn-primary px-4" id="saveItemBtn"
        onclick="saveScoringItem()">
        <i class="fa-solid fa-floppy-disk me-1"></i>저장
      </button>
      <button type="button" class="btn btn-outline-secondary"
        ${!nextItem ? 'disabled' : ''}
        onclick="renderScoringItemPanel('${nextItem ? nextItem.id : ''}')">
        다음 항목<i class="fa-solid fa-arrow-right ms-1"></i>
      </button>
    </div>
  `;

  // 이벤트 바인딩
  bindScoringPanelEvents(item);
}

/**
 * @description 항목별 가능한 점수값 배열 생성
 * @param {object} item
 * @returns {number[]}
 */
function generateScoreValues(item) {
  const max = item.maxScore;
  // 가점 항목: 0 또는 만점만
  if (item.isBonus) return [0, max];

  // 일반 항목: 0 ~ max 전체
  const values = [];
  for (let i = 0; i <= max; i++) values.push(i);
  return values;
}

/**
 * @description 채점 패널 이벤트 바인딩
 * @param {object} item
 */
function bindScoringPanelEvents(item) {
  // N/A 체크박스
  const naCheckbox = document.getElementById('naCheckbox');
  const naReasonArea = document.getElementById('naReasonArea');
  const scoreInputArea = document.getElementById('scoreInputArea');

  if (naCheckbox) {
    naCheckbox.addEventListener('change', function () {
      if (naReasonArea) naReasonArea.style.display = this.checked ? '' : 'none';
      if (scoreInputArea) {
        scoreInputArea.style.opacity = this.checked ? '0.4' : '1';
        scoreInputArea.style.pointerEvents = this.checked ? 'none' : '';
      }
    });
  }

  // 점수 퀵버튼
  document.querySelectorAll('.scoring-score-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      const val = Number(this.dataset.value);
      // 직접 입력 업데이트
      const directInput = document.getElementById('scoreDirectInput');
      if (directInput) directInput.value = val;
      // 버튼 선택 상태 업데이트
      document.querySelectorAll('.scoring-score-btn').forEach(b => {
        b.classList.remove('btn-primary');
        b.classList.add('btn-outline-secondary');
      });
      this.classList.remove('btn-outline-secondary');
      this.classList.add('btn-primary');
    });
  });

  // 직접 입력 → 만점 초과 자동 조정
  const directInput = document.getElementById('scoreDirectInput');
  if (directInput) {
    directInput.addEventListener('input', function () {
      let val = Number(this.value);
      if (val > item.maxScore) { val = item.maxScore; this.value = val; }
      if (val < 0) { val = 0; this.value = 0; }
      // 버튼 선택 상태 동기화
      document.querySelectorAll('.scoring-score-btn').forEach(b => {
        const bVal = Number(b.dataset.value);
        b.classList.toggle('btn-primary', bVal === val);
        b.classList.toggle('btn-outline-secondary', bVal !== val);
      });
    });
  }
}

/**
 * @description 현재 패널의 채점 내용 저장
 */
function saveScoringItem() {
  const itemId = _scoringSelectedItemId;
  if (!itemId) return;

  const naCheckbox = document.getElementById('naCheckbox');
  const naReasonInput = document.getElementById('naReasonInput');
  const scoreDirectInput = document.getElementById('scoreDirectInput');
  const scoringComment = document.getElementById('scoringComment');

  const isNA = naCheckbox ? naCheckbox.checked : false;
  const naReason = naReasonInput ? naReasonInput.value.trim() : '';
  const score = scoreDirectInput && scoreDirectInput.value !== ''
    ? Number(scoreDirectInput.value)
    : null;
  const comment = scoringComment ? scoringComment.value.trim() : '';

  saveItemScore(_scoringCompanyId, _scoringPeriodId, itemId, {
    score: isNA ? null : score,
    isNA,
    naReason,
    comment
  });

  // 사이드바 + 하단 점수 업데이트
  renderScoringsSidebar();
  updateScoringFooter();

  // 진행률 업데이트
  updateScoringProgress();

  // 토스트 메시지
  showToast('저장되었습니다.');
}

/**
 * @description 하단 점수 현황 바 업데이트
 */
function updateScoringFooter() {
  const scoringData = getScoringData(_scoringCompanyId, _scoringPeriodId);
  if (!scoringData) return;

  const result = calculateScore(scoringData);

  const setEl = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setEl('footerRealScore', result.실취득점수);
  setEl('footerRealMax', result.실배점);
  setEl('footerConvertedScore', result.환산점수.toFixed(2));
  setEl('footerBonus', result.가점);
  setEl('footerFinalScore', result.최종점수.toFixed(2));

  const gradeBadge = document.getElementById('footerGradeBadge');
  if (gradeBadge && result.등급) {
    gradeBadge.textContent = result.등급;
    gradeBadge.className = `badge ms-2 ${getGradeClass(result.등급)}`;
  }
}

/**
 * @description 채점 진행률 업데이트
 */
function updateScoringProgress() {
  const scoringData = getScoringData(_scoringCompanyId, _scoringPeriodId);
  const items = scoringData ? scoringData.items : {};

  const total = EVALUATION_ITEMS.length;
  const done = EVALUATION_ITEMS.filter(item => {
    const r = items[item.id];
    return r && (r.isNA || (r.score !== null && r.score !== undefined));
  }).length;

  const pct = Math.round((done / total) * 100);

  const progressText = document.getElementById('scoringProgressText');
  const progressBar = document.getElementById('scoringProgressBar');

  if (progressText) progressText.textContent = `${done}/${total} (${pct}%)`;
  if (progressBar) {
    progressBar.style.width = `${pct}%`;
    progressBar.setAttribute('aria-valuenow', pct);
  }
}

/* ----------------------------------------------------------
   6. 임시저장 / 채점완료 및 공개
   ---------------------------------------------------------- */

function initScoringButtons() {
  const saveDraftBtn = document.getElementById('scoringSaveDraftBtn');
  const publishBtn = document.getElementById('scoringPublishBtn');

  if (saveDraftBtn) {
    saveDraftBtn.onclick = function () {
      showToast('임시저장 되었습니다.');
    };
  }

  if (publishBtn) {
    publishBtn.onclick = function () {
      const scoringData = getScoringData(_scoringCompanyId, _scoringPeriodId);
      const items = scoringData ? scoringData.items : {};
      const unscored = EVALUATION_ITEMS.filter(item => {
        const r = items[item.id];
        return !r || (!r.isNA && (r.score === null || r.score === undefined));
      });

      let confirmMsg = '채점을 완료하고 협력사에 결과를 공개하시겠습니까?';
      if (unscored.length > 0) {
        confirmMsg = `미채점 항목이 ${unscored.length}개 있습니다.\n그래도 공개하시겠습니까?`;
      }

      if (confirm(confirmMsg)) {
        publishResult(_scoringCompanyId, _scoringPeriodId);
        showToast('채점 결과가 공개되었습니다.');
        renderScoringsSidebar();
        updateScoringFooter();
      }
    };
  }
}

/* ----------------------------------------------------------
   7. 초기화
   ---------------------------------------------------------- */

/**
 * @description 채점 모듈 초기화
 */
function initScoringModule() {
  return {
    ready: true,
    itemCount: EVALUATION_ITEMS.length,
    storageKey: SCORING_STORAGE_KEY
  };
}
