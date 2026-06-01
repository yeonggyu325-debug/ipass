/* ==========================================================
   scoring.js  —  채점 및 결과 관리 모듈 (Google Sheets 연동 버전)
   ========================================================== */

/* ----------------------------------------------------------
   1. 점수 계산 함수 (순수 함수 — 변경 없음)
   ---------------------------------------------------------- */

function calculateScore(scoringData) {
  if (!scoringData || !scoringData.items) {
    return { 실취득점수: 0, 실배점: 100, 환산점수: 0, 가점: 0, 최종점수: 0, 등급: '', naItems: [] };
  }

  let 실취득 = 0;
  let 실배점 = 0;
  let 가점합계 = 0;
  const naItems = [];

  EVALUATION_ITEMS.forEach(item => {
    const record = scoringData.items[item.id];
    if (!record) return;

    if (item.isBonus) {
      if (!record.isNA && record.score !== null && record.score !== undefined) {
        가점합계 += Number(record.score);
      }
    } else {
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

  가점합계 = Math.min(가점합계, 5);
  const 환산점수 = 실배점 > 0 ? Math.round((실취득 / 실배점) * 100 * 100) / 100 : 0;
  const 최종점수 = Math.round((환산점수 + 가점합계) * 100) / 100;

  return {
    실취득점수: 실취득, 실배점,
    환산점수, 가점: 가점합계,
    최종점수, 등급: getGrade(최종점수),
    naItems
  };
}

function getGrade(finalScore) {
  if (finalScore >= 90) return '안전보건 우수 협력사';
  if (finalScore >= 70) return '적격 협력사';
  return '역량강화 대상 협력사';
}

function getGradeClass(grade) {
  if (grade === '안전보건 우수 협력사') return 'grade-excellent';
  if (grade === '적격 협력사') return 'grade-qualified';
  return 'grade-needs-improvement';
}

/* ----------------------------------------------------------
   2. Sheets DB 헬퍼 (localStorage 완전 대체)
   ---------------------------------------------------------- */

async function getAllScoringData() {
  return await loadObject(STORAGE_KEYS.scoringData);
}

async function saveScoringData(data) {
  const all = await getAllScoringData();
  const key = `${data.companyId}_${data.periodId}`;
  all[key] = data;
  await saveObject(STORAGE_KEYS.scoringData, all);
  clearCache(STORAGE_KEYS.scoringData);
}

async function getScoringData(companyId, periodId) {
  const all = await getAllScoringData();
  return all[`${companyId}_${periodId}`] || null;
}

async function saveItemScore(companyId, periodId, itemId, itemData) {
  const currentUser = getCurrentUserSnapshot();
  let data = await getScoringData(companyId, periodId);

  if (!data) {
    data = {
      companyId,
      periodId,
      companyName: '',
      scoredBy: currentUser ? currentUser.id : 'admin',
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

  await saveScoringData(data);
}

async function publishResult(companyId, periodId) {
  const data = await getScoringData(companyId, periodId);
  if (!data) return false;
  data.isPublished = true;
  data.publishedAt = new Date().toISOString();
  await saveScoringData(data);
  return true;
}

async function unpublishResult(companyId, periodId) {
  const data = await getScoringData(companyId, periodId);
  if (!data) return false;
  data.isPublished = false;
  await saveScoringData(data);
  return true;
}

/* ----------------------------------------------------------
   3. 채점 관리 목록 페이지 렌더링
   ---------------------------------------------------------- */

var _scoringCompanyId = '';
var _scoringCompanyName = '';
var _scoringPeriodId = '';
var _scoringSelectedItemId = '';

async function renderScoringManagePage() {
  const periodSelect = document.getElementById('scoringPeriodSelect');
  const tableBody = document.getElementById('scoringStatusTableBody');
  if (!periodSelect || !tableBody) return;

  const periods = await loadPeriods();

  periodSelect.innerHTML = '<option value="">-- 회차를 선택하세요 --</option>';
  periods.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.title;
    periodSelect.appendChild(opt);
  });

  periodSelect.onchange = function () {
    renderScoringTable(this.value);
  };

  const activePeriod = periods.find(p => p.status === 'active');
  if (activePeriod) {
    periodSelect.value = activePeriod.id;
    await renderScoringTable(activePeriod.id);
  }
}

async function renderScoringTable(periodId) {
  const tableBody = document.getElementById('scoringStatusTableBody');
  if (!tableBody) return;

  const allUsers = await loadUsers();
  const users = allUsers.filter(u => u.role === 'partner');
  const submissionsObj = await loadObject(STORAGE_KEYS.evaluationSubmissions);

  tableBody.innerHTML = '';

  if (!periodId) {
    tableBody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-3">회차를 선택하세요.</td></tr>';
    return;
  }

  if (users.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-3">등록된 협력사가 없습니다.</td></tr>';
    return;
  }

  for (const [idx, user] of users.entries()) {
    const submission = submissionsObj[getSubmissionKey(user.id, periodId)];
    const scoringData = await getScoringData(user.id, periodId);
    const isSubmitted = submission && submission.status === 'submitted';

    let scoringBadge = '';
    if (!isSubmitted) {
      scoringBadge = '<span class="badge bg-secondary">미제출</span>';
    } else if (!scoringData) {
      scoringBadge = '<span class="badge bg-warning text-dark">채점전</span>';
    } else if (scoringData.isPublished) {
      scoringBadge = '<span class="badge bg-primary">공개됨</span>';
    } else {
      scoringBadge = '<span class="badge bg-success">채점완료</span>';
    }

    let 환산점수 = '-';
    let 최종점수 = '-';
    let 등급html = '-';
    if (scoringData) {
      const result = calculateScore(scoringData);
      환산점수 = result.환산점수.toFixed(2);
      최종점수 = result.최종점수.toFixed(2);
      등급html = result.등급
        ? `<span class="badge ${getGradeClass(result.등급)}" style="font-size:11px;">${result.등급}</span>`
        : '-';
    }

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
        <td>${등급html}</td>
        <td>${scoringData
          ? (scoringData.isPublished
            ? '<span class="badge bg-primary">공개</span>'
            : '<span class="badge bg-secondary">비공개</span>')
          : '-'}</td>
        <td>${actionBtn}</td>
      </tr>
    `;
  }
}

async function startScoring(companyId, companyName, periodId) {
  _scoringCompanyId = companyId;
  _scoringCompanyName = companyName;
  _scoringPeriodId = periodId;
  _scoringSelectedItemId = '';

  if (!await getScoringData(companyId, periodId)) {
    const currentUser = getCurrentUserSnapshot();
    await saveScoringData({
      companyId,
      companyName,
      periodId,
      scoredBy: currentUser ? currentUser.id : 'admin',
      scoredAt: new Date().toISOString(),
      isPublished: false,
      items: {}
    });
  }

  navigate('scoring-page');
}

/* ----------------------------------------------------------
   4. 채점 화면 렌더링
   ---------------------------------------------------------- */

async function renderScoringPage() {
  const nameEl = document.getElementById('scoringCompanyName');
  const periodEl = document.getElementById('scoringPeriodLabel');
  if (nameEl) nameEl.textContent = _scoringCompanyName;
  if (periodEl) {
    const periods = await loadPeriods();
    const period = periods.find(p => p.id === _scoringPeriodId);
    periodEl.textContent = period ? period.title : '';
  }

  await renderScoringsSidebar();
  await updateScoringFooter();

  if (!_scoringSelectedItemId && EVALUATION_ITEMS.length > 0) {
    await renderScoringItemPanel(EVALUATION_ITEMS[0].id);
  }
}

async function renderScoringsSidebar() {
  const sidebar = document.getElementById('scoringSidebarContent');
  if (!sidebar) return;

  const scoringData = await getScoringData(_scoringCompanyId, _scoringPeriodId);
  const items = scoringData ? scoringData.items : {};

  const groups = {};
  EVALUATION_ITEMS.forEach(item => {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
  });

  let html = '';
  Object.entries(groups).forEach(([category, categoryItems]) => {
    const scored = categoryItems.filter(item => {
      const r = items[item.id];
      return r && (r.isNA || (r.score !== null && r.score !== undefined));
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
          <span class="item-name">${item.subcategory}</span>
          <span class="item-score">${scoreText}</span>
        </div>
      `;
    });
  });

  sidebar.innerHTML = html;
}

async function renderScoringItemPanel(itemId) {
  _scoringSelectedItemId = itemId;
  await renderScoringsSidebar();

  const panel = document.getElementById('scoringPanelContent');
  if (!panel) return;

  const item = EVALUATION_ITEMS.find(i => i.id === itemId);
  if (!item) return;

  const scoringData = await getScoringData(_scoringCompanyId, _scoringPeriodId);
  const record = (scoringData && scoringData.items[itemId]) || {
    score: null, isNA: false, naReason: '', comment: ''
  };

  const currentIndex = EVALUATION_ITEMS.findIndex(i => i.id === itemId);
  const prevItem = EVALUATION_ITEMS[currentIndex - 1];
  const nextItem = EVALUATION_ITEMS[currentIndex + 1];

  const submissionsObj = await loadObject(STORAGE_KEYS.evaluationSubmissions);
  const submissionKey = getSubmissionKey(_scoringCompanyId, _scoringPeriodId);
  const submission = submissionsObj[submissionKey];
  const submittedAnswer = submission && submission.answers
    ? (submission.answers[itemId] || '') : '';

  const categoryColors = {
    '가점': 'warning text-dark',
    '중대산업재해 예방': 'danger',
    '안전보건 관리 체계': 'primary',
    '유해위험 방지조치': 'warning text-dark',
    '근로자의 보건 관리': 'success',
    '도급시 산업재해 예방': 'info text-dark'
  };
  const badgeClass = categoryColors[item.category] || 'secondary';
  const scoreValues = generateScoreValues(item);

  const scoreButtons = scoreValues.map(v => {
    const isSelected = record.score === v;
    return `
      <button type="button"
        class="score-click-btn ${isSelected ? 'selected' : ''} ${record.isNA ? 'disabled-btn' : ''}"
        data-value="${v}"
        onclick="clickScore('${itemId}', ${v})"
        ${record.isNA ? 'disabled' : ''}>
        ${v}점
      </button>
    `;
  }).join('');

  panel.innerHTML = `
    <div class="scoring-item-header">
      <span class="badge bg-${badgeClass}">${item.category}</span>
      <h5 class="mb-0 ms-2">${item.subcategory}</h5>
      <span class="ms-auto">
        <span class="score-pill">만점 ${item.maxScore}점</span>
      </span>
      ${item.naAllowed
        ? '<span class="badge bg-info text-dark ms-2">N/A 가능</span>'
        : '<span class="badge bg-light text-muted ms-2">N/A 불가</span>'}
    </div>

    <div class="scoring-split-layout">
      <div class="scoring-left-panel">
        <div class="scoring-block-label">📋 판정기준</div>
        <div class="criteria-box mb-3">${(item.criteria || '').replace(/\n/g, '<br>')}</div>
        <div class="scoring-block-label">📁 협력사 제출 자료</div>
        <div class="submitted-answer-box ${submittedAnswer ? '' : 'empty'}">
          ${submittedAnswer
            ? submittedAnswer.replace(/\n/g, '<br>')
            : '<span class="text-muted">제출된 내용이 없습니다.</span>'}
        </div>
      </div>

      <div class="scoring-right-panel">
        ${item.naAllowed ? `
        <div class="na-toggle-card ${record.isNA ? 'na-active' : ''}">
          <div class="form-check">
            <input class="form-check-input" type="checkbox" id="naCheckbox"
              ${record.isNA ? 'checked' : ''}
              onchange="toggleNA('${itemId}', this.checked)">
            <label class="form-check-label fw-bold" for="naCheckbox">
              N/A (해당없음) 처리
            </label>
          </div>
          <div id="naReasonArea" ${record.isNA ? '' : 'style="display:none;"'} class="mt-2">
            <input type="text" class="form-control form-control-sm" id="naReasonInput"
              placeholder="${item.naCondition || 'N/A 사유를 입력하세요'}"
              value="${record.naReason || ''}"
              oninput="saveNAReason('${itemId}', this.value)">
          </div>
        </div>
        ` : ''}

        <div class="scoring-block-label mt-3">🎯 점수 선택 <small class="text-muted">(클릭 즉시 저장)</small></div>
        <div class="score-click-grid" id="scoreClickGrid">
          ${scoreButtons}
        </div>

        ${record.score !== null && record.score !== undefined && !record.isNA ? `
        <div class="score-selected-display">
          선택된 점수: <strong class="text-primary">${record.score}점</strong> / ${item.maxScore}점
        </div>
        ` : record.isNA ? `
        <div class="score-selected-display na">N/A 처리됨</div>
        ` : `
        <div class="score-selected-display empty">점수를 선택하세요</div>
        `}

        <div class="scoring-block-label mt-3">📝 채점 메모 <small class="text-muted">(선택)</small></div>
        <textarea class="form-control" id="scoringComment" rows="4"
          placeholder="특이사항, 감점 사유 등 기록"
          oninput="autoSaveComment('${itemId}', this.value)">${record.comment || ''}</textarea>
      </div>
    </div>

    <div class="scoring-nav-btns">
      <button type="button" class="btn btn-outline-secondary"
        ${!prevItem ? 'disabled' : ''}
        onclick="renderScoringItemPanel('${prevItem ? prevItem.id : ''}')">
        <i class="fa-solid fa-arrow-left me-1"></i>이전 항목
      </button>
      <button type="button" class="btn btn-outline-secondary"
        ${!nextItem ? 'disabled' : ''}
        onclick="renderScoringItemPanel('${nextItem ? nextItem.id : ''}')">
        다음 항목<i class="fa-solid fa-arrow-right ms-1"></i>
      </button>
    </div>
  `;

  const navPrevBtn = document.getElementById('navPrevBtn');
  const navNextBtn = document.getElementById('navNextBtn');
  if (navPrevBtn) navPrevBtn.disabled = currentIndex <= 0;
  if (navNextBtn) navNextBtn.disabled = currentIndex >= EVALUATION_ITEMS.length - 1;
}

function generateScoreValues(item) {
  if (item.isBonus) return [0, item.maxScore];
  const values = [];
  for (let i = 0; i <= item.maxScore; i++) values.push(i);
  return values;
}

async function updateScoringFooter() {
  const scoringData = await getScoringData(_scoringCompanyId, _scoringPeriodId);
  if (!scoringData) return;

  const result = calculateScore(scoringData);
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

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

async function updateScoringProgress() {
  const scoringData = await getScoringData(_scoringCompanyId, _scoringPeriodId);
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
   5. 임시저장 / 공개
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
    publishBtn.onclick = async function () {
      const scoringData = await getScoringData(_scoringCompanyId, _scoringPeriodId);
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
        await publishResult(_scoringCompanyId, _scoringPeriodId);
        showToast('채점 결과가 공개되었습니다.');
        await renderScoringsSidebar();
        await updateScoringFooter();
      }
    };
  }
}

/* ----------------------------------------------------------
   6. 초기화
   ---------------------------------------------------------- */

function initScoringModule() {
  return {
    ready: true,
    itemCount: EVALUATION_ITEMS.length,
    storageKey: STORAGE_KEYS.scoringData
  };
}

/* ----------------------------------------------------------
   7. 즉시 저장 이벤트 핸들러
   ---------------------------------------------------------- */

async function clickScore(itemId, value) {
  const scoringData = await getScoringData(_scoringCompanyId, _scoringPeriodId);
  const record = (scoringData && scoringData.items[itemId]) || {};
  if (record.isNA) return;

  await saveItemScore(_scoringCompanyId, _scoringPeriodId, itemId, {
    score: value,
    isNA: false,
    naReason: record.naReason || '',
    comment: record.comment || ''
  });

  document.querySelectorAll('.score-click-btn').forEach(btn => {
    btn.classList.toggle('selected', Number(btn.dataset.value) === value);
  });

  const display = document.querySelector('.score-selected-display');
  const item = EVALUATION_ITEMS.find(i => i.id === itemId);
  if (display && item) {
    display.className = 'score-selected-display';
    display.innerHTML = `선택된 점수: <strong class="text-primary">${value}점</strong> / ${item.maxScore}점`;
  }

  await renderScoringsSidebar();
  await updateScoringFooter();
  await updateScoringProgress();
  showToast(`${value}점 저장되었습니다.`);
}

async function toggleNA(itemId, isNA) {
  const scoringData = await getScoringData(_scoringCompanyId, _scoringPeriodId);
  const record = (scoringData && scoringData.items[itemId]) || {};

  await saveItemScore(_scoringCompanyId, _scoringPeriodId, itemId, {
    score: isNA ? null : record.score,
    isNA,
    naReason: record.naReason || '',
    comment: record.comment || ''
  });

  const naReasonArea = document.getElementById('naReasonArea');
  const scoreGrid = document.getElementById('scoreClickGrid');
  const naCard = document.querySelector('.na-toggle-card');

  if (naReasonArea) naReasonArea.style.display = isNA ? '' : 'none';
  if (scoreGrid) {
    scoreGrid.querySelectorAll('.score-click-btn').forEach(btn => {
      btn.disabled = isNA;
      btn.classList.toggle('disabled-btn', isNA);
    });
  }
  if (naCard) naCard.classList.toggle('na-active', isNA);

  await renderScoringsSidebar();
  await updateScoringFooter();
  await updateScoringProgress();
}

let _naReasonTimer = null;
function saveNAReason(itemId, value) {
  clearTimeout(_naReasonTimer);
  _naReasonTimer = setTimeout(async () => {
    const scoringData = await getScoringData(_scoringCompanyId, _scoringPeriodId);
    const record = (scoringData && scoringData.items[itemId]) || {};
    await saveItemScore(_scoringCompanyId, _scoringPeriodId, itemId, {
      score: record.score, isNA: true,
      naReason: value, comment: record.comment || ''
    });
  }, 500);
}

let _commentTimer = null;
function autoSaveComment(itemId, value) {
  clearTimeout(_commentTimer);
  _commentTimer = setTimeout(async () => {
    const scoringData = await getScoringData(_scoringCompanyId, _scoringPeriodId);
    const record = (scoringData && scoringData.items[itemId]) || {};
    await saveItemScore(_scoringCompanyId, _scoringPeriodId, itemId, {
      score: record.score !== undefined ? record.score : null,
      isNA: record.isNA || false,
      naReason: record.naReason || '',
      comment: value
    });
  }, 600);
}
