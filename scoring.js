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
          <span class="item-score">${scoreText
