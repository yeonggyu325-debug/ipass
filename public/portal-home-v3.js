(function(){
  'use strict';
  if(location.pathname!=='/home')return;

  const ADMIN_VIEWS=new Set(['dashboard','approvals','accounts']);
  const requestedView=new URLSearchParams(location.search).get('view');

  function shellMarkup(){
    return `<div class="home-v3-shell">
      <section class="home-v3-welcome" aria-labelledby="homeV3Title"><div class="home-v3-welcome-copy"><div class="home-eyebrow">EHS WORKSPACE</div><h1 id="homeV3Title">안녕하세요, <span id="homeUserName">사용자</span>님</h1><div class="home-greeting" id="portalWelcome"></div></div><div class="home-date" id="homeDate"></div></section>
      <div class="important-banner" id="homeImportantBanner" onclick="location.href='/notices'"><span class="important-badge">중요공지</span><span class="important-title" id="homeImportantTitle"></span><span class="important-date" id="homeImportantDate"></span></div>
      <section class="home-v3-section home-v3-ipass" aria-labelledby="homeIpassTitle"><div class="home-v3-section-head"><div><h2 id="homeIpassTitle">i-PaSS 현황</h2><p>연간 안전보건 종합점수와 평가 진행상태입니다.</p></div><button class="home-v3-text-link" type="button" onclick="location.href='/ipass'">평가 상세 ›</button></div><div id="portalIpassOverview" class="ipass-score-shell"><div class="loading">i-PaSS 점수를 불러오는 중...</div></div></section>
      <section class="home-v3-section" aria-labelledby="homeServiceTitle"><div class="home-v3-section-head"><div><h2 id="homeServiceTitle">업무메뉴</h2><p>자주 사용하는 EHS 업무를 빠르게 실행합니다.</p></div></div><div class="service-panel">
        <button class="service-tile" type="button" onclick="location.href='/notices'"><span class="service-icon"><svg viewBox="0 0 24 24"><path d="M6 4h12v16H6z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg></span><span class="service-text"><strong>공지사항</strong><span>주요 안내 및 공지</span></span></button>
        <button class="service-tile" type="button" onclick="location.href='/committee'"><span class="service-icon"><svg viewBox="0 0 24 24"><path d="M4 5h16v14H4z"/><path d="M8 3v4M16 3v4M7 11h10M7 15h6"/></svg></span><span class="service-text"><strong>안전보건협의체</strong><span>회의 일정 및 참석 현황</span></span></button>
        <button class="service-tile" type="button" onclick="location.href='/education'"><span class="service-icon"><svg viewBox="0 0 24 24"><path d="M4 6h16v12H4z"/><path d="M8 10h8M8 14h5"/></svg></span><span class="service-text"><strong>교육자료</strong><span>교육 제출 및 확인</span></span></button>
        <button class="service-tile" type="button" onclick="location.href='/resources'"><span class="service-icon"><svg viewBox="0 0 24 24"><path d="M4 6h6l2 2h8v10H4z"/><path d="M8 12h8"/></svg></span><span class="service-text"><strong>자료실</strong><span>공통 양식 및 안전자료</span></span></button>
        <button class="service-tile" type="button" onclick="location.href='/ipass'"><span class="service-icon"><svg viewBox="0 0 24 24"><path d="M7 3h10v4H7z"/><path d="M5 5v16h14V5"/><path d="M8 11h8M8 15h5"/></svg></span><span class="service-text"><strong>i-PaSS</strong><span>안전보건 이행수준평가</span></span></button>
        <button class="service-tile" type="button" onclick="location.href='/voc'"><span class="service-icon"><svg viewBox="0 0 24 24"><path d="M4 5h16v12H8l-4 4z"/><path d="M8 9h8M8 13h5"/></svg></span><span class="service-text"><strong>VOC</strong><span>문의 및 개선의견</span></span></button>
        <button class="service-tile" type="button" onclick="location.href='/faq'"><span class="service-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.7 2c-1 .7-1.5 1.1-1.5 2.2M12 17h.01"/></svg></span><span class="service-text"><strong>FAQ</strong><span>자주 묻는 질문</span></span></button>
      </div></section>
      <section class="home-v3-section home-v3-notices" aria-labelledby="homeNoticeTitle"><div class="home-v3-section-head"><div><h2 id="homeNoticeTitle">공지</h2><p>업무에 필요한 최신 안내를 확인합니다.</p></div><button class="home-v3-text-link" type="button" onclick="location.href='/notices'">전체보기 ›</button></div><div class="home-panel home-v3-notice-panel"><div class="notice-home-list" id="homeNoticeList"><div class="loading">공지사항을 불러오는 중...</div></div></div></section>
    </div>`;
  }

  function identity(){const user=window.__EHS_PAGE_USER||null;if(!user)return null;const isAdmin=user.role==='admin';let base=String(user.name||'').trim();if(!base||base.includes('@'))base=isAdmin?'관리자':'사용자';return {isAdmin,base,company:isAdmin?'에이치앤이루자':(user.company_name||'협력사')}}
  function applyIdentity(){const value=identity();if(!value)return;const name=document.getElementById('homeUserName'),title=document.getElementById('homeV3Title'),welcome=document.getElementById('portalWelcome');if(name)name.textContent=value.base;if(title)title.textContent=value.isAdmin?`${value.base}님 안녕하세요`:`안녕하세요, ${value.base}님`;if(welcome)welcome.textContent=value.isAdmin?'에이치앤이루자 EHS 업무를 한 화면에서 확인하세요.':`${value.company}의 EHS 업무를 한 화면에서 확인하세요.`}

  function openRequestedAdminView(){
    if(!ADMIN_VIEWS.has(requestedView))return false;
    const user=window.__EHS_PAGE_USER;
    if(!user)return false;
    if(user.role!=='admin'){history.replaceState({},'', '/home');return false}
    if(typeof window.navigatePage!=='function')return false;
    window.navigatePage(requestedView);
    return true;
  }

  function render(){
    if(ADMIN_VIEWS.has(requestedView)&&openRequestedAdminView())return true;
    const page=document.getElementById('page-portalHome');
    if(!page)return false;
    if(!page.querySelector('.home-v3-shell'))page.innerHTML=shellMarkup();
    page.dataset.homeV3='1';
    document.querySelectorAll('#app .page').forEach(el=>el.classList.toggle('active',el===page));
    applyIdentity();
    return true;
  }

  function hydrate(){if(!render())return;if(!ADMIN_VIEWS.has(requestedView)&&typeof window.loadPortalHome==='function'){try{window.loadPortalHome()}catch(_){}}}
  function boot(){hydrate();document.addEventListener('ehs:user-ready',()=>setTimeout(hydrate,0));window.addEventListener('pageshow',()=>setTimeout(hydrate,0));if(ADMIN_VIEWS.has(requestedView)){setTimeout(hydrate,60);setTimeout(hydrate,180)}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
