(function(){
  'use strict';

  function buildPortalHome(){
    const page=document.getElementById('page-portalHome');
    if(!page||page.dataset.homeV3==='1')return;

    page.dataset.homeV3='1';
    page.innerHTML=`
      <div class="home-v3-shell">
        <section class="home-v3-welcome" aria-labelledby="homeV3Title">
          <div class="home-v3-welcome-copy">
            <div class="home-eyebrow">EHS WORKSPACE</div>
            <h1 id="homeV3Title">안녕하세요, <span id="homeUserName">사용자</span>님</h1>
            <div class="home-greeting" id="portalWelcome"></div>
          </div>
          <div class="home-date" id="homeDate"></div>
        </section>

        <div class="important-banner" id="homeImportantBanner" onclick="openPortalService('notices')">
          <span class="important-badge">중요공지</span>
          <span class="important-title" id="homeImportantTitle"></span>
          <span class="important-date" id="homeImportantDate"></span>
        </div>

        <section class="home-v3-section home-v3-actions" aria-labelledby="homeActionTitle">
          <div class="home-v3-section-head">
            <div>
              <h2 id="homeActionTitle">해야 할 일</h2>
              <p>지금 확인해야 할 주요 업무로 바로 이동합니다.</p>
            </div>
          </div>
          <div class="home-action-grid">
            <button class="home-action-card" type="button" onclick="openPortalService('ipass')">
              <span class="home-action-index">01</span>
              <span class="home-action-copy"><strong>평가자료 확인</strong><small>i-PaSS 제출 현황과 평가자료를 확인합니다.</small></span>
              <span class="home-action-arrow">›</span>
            </button>
            <button class="home-action-card" type="button" onclick="location.href='/committee.html'">
              <span class="home-action-index">02</span>
              <span class="home-action-copy"><strong>협의체 확인</strong><small>협의체 일정과 관련 자료를 확인합니다.</small></span>
              <span class="home-action-arrow">›</span>
            </button>
            <button class="home-action-card" type="button" onclick="location.href='/education.html'">
              <span class="home-action-index">03</span>
              <span class="home-action-copy"><strong>교육자료 확인</strong><small>교육 제출과 진행 현황을 확인합니다.</small></span>
              <span class="home-action-arrow">›</span>
            </button>
            <button class="home-action-card home-admin-option hidden" type="button" onclick="navigatePage('dashboard')">
              <span class="home-action-index">04</span>
              <span class="home-action-copy"><strong>관리자 현황</strong><small>평가대상과 진행상태를 한 번에 확인합니다.</small></span>
              <span class="home-action-arrow">›</span>
            </button>
          </div>
        </section>

        <section class="home-v3-section" aria-labelledby="homeIpassTitle">
          <div class="home-v3-section-head">
            <div>
              <h2 id="homeIpassTitle">i-PaSS 현황</h2>
              <p>연간 안전보건 종합점수와 평가 진행상태입니다.</p>
            </div>
            <button class="home-v3-text-link" type="button" onclick="openPortalService('ipass')">평가 상세 ›</button>
          </div>
          <div id="portalIpassOverview" class="ipass-score-shell">
            <div class="loading">i-PaSS 점수를 불러오는 중...</div>
          </div>
        </section>

        <section class="home-v3-section" aria-labelledby="homeServiceTitle">
          <div class="home-v3-section-head">
            <div>
              <h2 id="homeServiceTitle">업무메뉴</h2>
              <p>자주 사용하는 EHS 업무를 빠르게 실행합니다.</p>
            </div>
          </div>
          <div class="service-panel">
            <button class="service-tile" type="button" onclick="openPortalService('ipass')">
              <span class="service-icon"><svg viewBox="0 0 24 24"><path d="M7 3h10v4H7z"/><path d="M5 5v16h14V5"/><path d="M8 11h8M8 15h5"/></svg></span>
              <span class="service-text"><strong>i-PaSS</strong><span>안전보건 이행수준평가</span></span>
            </button>
            <button class="service-tile" type="button" onclick="location.href='/committee.html'">
              <span class="service-icon"><svg viewBox="0 0 24 24"><path d="M4 5h16v14H4z"/><path d="M8 3v4M16 3v4M7 11h10M7 15h6"/></svg></span>
              <span class="service-text"><strong>안전보건협의체</strong><span>회의 일정 및 자료</span></span>
            </button>
            <button class="service-tile" type="button" onclick="location.href='/education.html'">
              <span class="service-icon"><svg viewBox="0 0 24 24"><path d="M4 6h16v12H4z"/><path d="M8 10h8M8 14h5"/></svg></span>
              <span class="service-text"><strong>교육자료</strong><span>교육 제출 및 확인</span></span>
            </button>
            <button class="service-tile" type="button" onclick="location.href='/voc.html'">
              <span class="service-icon"><svg viewBox="0 0 24 24"><path d="M4 5h16v12H8l-4 4z"/><path d="M8 9h8M8 13h5"/></svg></span>
              <span class="service-text"><strong>VOC</strong><span>문의 및 개선의견</span></span>
            </button>
            <button class="service-tile" type="button" onclick="openPortalService('notices')">
              <span class="service-icon"><svg viewBox="0 0 24 24"><path d="M6 4h12v16H6z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg></span>
              <span class="service-text"><strong>공지사항</strong><span>주요 안내 및 공지</span></span>
            </button>
            <button class="service-tile" type="button" onclick="openPortalService('faq')">
              <span class="service-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.7 2c-1 .7-1.5 1.1-1.5 2.2M12 17h.01"/></svg></span>
              <span class="service-text"><strong>FAQ</strong><span>자주 묻는 질문</span></span>
            </button>
            <button class="service-tile" type="button" onclick="openPortalService('resources')">
              <span class="service-icon"><svg viewBox="0 0 24 24"><path d="M4 6h6l2 2h8v10H4z"/><path d="M8 12h8"/></svg></span>
              <span class="service-text"><strong>자료실</strong><span>공통 양식 및 자료</span></span>
            </button>
          </div>
        </section>

        <section class="home-v3-section home-v3-notices" aria-labelledby="homeNoticeTitle">
          <div class="home-v3-section-head">
            <div>
              <h2 id="homeNoticeTitle">공지</h2>
              <p>업무에 필요한 최신 안내를 확인합니다.</p>
            </div>
            <button class="home-v3-text-link" type="button" onclick="openPortalService('notices')">전체보기 ›</button>
          </div>
          <div class="home-panel home-v3-notice-panel">
            <div class="notice-home-list" id="homeNoticeList"><div class="loading">공지사항을 불러오는 중...</div></div>
          </div>
        </section>
      </div>`;
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',buildPortalHome,{once:true});
  else buildPortalHome();
})();
