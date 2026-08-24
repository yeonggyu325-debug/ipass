(function(){
  'use strict';
  const path=location.pathname;
  const PROTECTED=path==='/home'||path==='/committee'||path==='/committee.html'||path==='/ipass'||path==='/ipass/'||path.startsWith('/ipass/')||path==='/evaluation-management.html'||path==='/evaluation-cycle.html'||path==='/evaluation-submit.html';
  const STANDALONE=PROTECTED&&path!=='/home'&&new URLSearchParams(location.search).get('embedded')!=='1';

  function readSession(){return window.EHSAuth?.readSession?.()||null}
  function hasSession(){return !!readSession()}
  function goHome(){if(location.pathname!=='/home')location.href='/home'}
  function goLogin(next=location.pathname+location.search){
    if(window.EHSAuth?.redirectToLogin){window.EHSAuth.redirectToLogin(next);return}
    const safe=String(next||'').startsWith('/')&&!String(next).startsWith('//')?String(next):'/home';
    location.replace('/?next='+encodeURIComponent(safe));
  }
  function logout(){
    if(window.EHSAuth?.logout){window.EHSAuth.logout();return}
    location.replace('/');
  }

  function normalizeButtons(){
    document.querySelectorAll('button,a').forEach(el=>{
      if(el.closest('#ehsGlobalHeader'))return;
      const text=(el.textContent||'').replace(/\s+/g,' ').trim();
      const aria=(el.getAttribute('aria-label')||'').trim();
      const tip=(el.getAttribute('data-tip')||'').trim();
      if(text==='포털 홈'||aria==='포털 홈'||tip==='포털 홈'){
        el.classList.add('ehs-common-home-button','ehs-home-control');
        el.setAttribute('aria-hidden','true');
        el.tabIndex=-1;
      }
    });
  }

  function wireBrand(){
    const selectors=['.brand','.app-brand','#brandBtn','#homeBrand','[data-ehs-brand]','.header .brand','.app-header .app-brand'];
    document.querySelectorAll(selectors.join(',')).forEach(el=>{
      if(el.dataset.ehsHomeBound==='1')return;
      el.dataset.ehsHomeBound='1';
      el.setAttribute('title','EHS 포털 홈');
      el.addEventListener('click',function(e){
        if(e.button!==undefined&&e.button!==0)return;
        e.preventDefault();
        e.stopImmediatePropagation();
        goHome();
      },true);
    });
  }

  function wireLogout(){
    document.querySelectorAll('#logoutBtn,[data-ehs-logout]').forEach(el=>{
      if(el.dataset.ehsLogoutBound==='1')return;
      el.dataset.ehsLogoutBound='1';
      el.addEventListener('click',function(e){
        e.preventDefault();
        e.stopImmediatePropagation();
        logout();
      },true);
    });
  }

  function normalizeLegacyLinks(){
    document.querySelectorAll('a[href]').forEach(el=>{
      const href=el.getAttribute('href')||'';
      if(href==='/index.html')el.setAttribute('href','/home');
      else if(href==='/committee.html')el.setAttribute('href','/committee');
      else if(href==='/evaluation-management.html')el.setAttribute('href','/ipass/templates');
      else if(href==='/evaluation-cycle.html')el.setAttribute('href','/ipass/cycles');
    });
  }

  function normalizeLegacyButtons(){
    document.querySelectorAll('button[onclick]').forEach(el=>{
      const code=el.getAttribute('onclick')||'';
      if(code.includes("'/committee.html'")||code.includes('"/committee.html"'))el.setAttribute('onclick',"location.href='/committee'");
      else if(code.includes("'/evaluation-management.html'")||code.includes('"/evaluation-management.html"'))el.setAttribute('onclick',"location.href='/ipass/templates'");
      else if(code.includes("'/evaluation-cycle.html'")||code.includes('"/evaluation-cycle.html"'))el.setAttribute('onclick',"location.href='/ipass/cycles'");
    });
  }

  function normalizeCurrentUrl(){
    if(path==='/index.html'&&hasSession())history.replaceState({},'', '/home');
  }

  function commonHeaderHtml(){
    const committeeActive=path==='/committee'||path==='/committee.html';
    const ipassActive=path==='/ipass'||path==='/ipass/'||path.startsWith('/ipass/')||path==='/evaluation-management.html'||path==='/evaluation-cycle.html'||path==='/evaluation-submit.html';
    return `<header class="ehs-global-header" id="ehsGlobalHeader"><div class="ehs-global-inner">
      <a class="ehs-global-brand" href="/home" aria-label="EHS 포털 홈"><img src="/hniruja-logo.png" alt="Hniruja"><span>협력사 EHS 포털</span><em>EHS</em></a>
      <button class="ehs-global-mobile" id="ehsGlobalMobile" type="button" aria-label="메뉴 열기"><svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
      <nav class="ehs-global-nav" id="ehsGlobalNav" aria-label="주요 메뉴">
        <a class="ehs-global-home" href="/home">홈</a>
        <div class="ehs-global-nav-item ${committeeActive?'active':''}"><button type="button">EHS 업무</button><div class="ehs-global-menu"><a href="/committee">안전보건협의체</a></div></div>
        <div class="ehs-global-nav-item ${ipassActive?'active':''}"><button type="button">평가·교육</button><div class="ehs-global-menu"><a href="/ipass">i-PaSS</a><a class="ehs-admin-only hidden" href="/ipass/templates">평가표 관리</a><a class="ehs-admin-only hidden" href="/ipass/cycles">평가회차 운영</a></div></div>
      </nav>
      <div class="ehs-global-actions">
        <button class="ehs-global-bell" id="ehsGlobalBell" type="button" aria-label="알림"><svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg><span id="ehsGlobalUnread">0</span></button>
        <div class="ehs-global-user" id="ehsGlobalUser"><button class="ehs-global-user-btn" id="ehsGlobalUserBtn" type="button"><span class="ehs-global-avatar" id="ehsGlobalAvatar">U</span><span class="ehs-global-copy"><strong id="ehsGlobalName">사용자</strong><small id="ehsGlobalCompany">협력사</small></span><span class="ehs-global-caret">⌄</span></button><div class="ehs-global-user-menu"><div><strong id="ehsGlobalMenuName">사용자</strong><span id="ehsGlobalRole">계정</span></div><a href="/home">포털 홈</a><a href="/ipass">i-PaSS</a><button type="button" data-ehs-logout>로그아웃</button></div></div>
      </div>
    </div></header>`;
  }

  function populateCommonHeader(){
    if(!STANDALONE||!window.EHSAuth?.requireUser)return;
    window.EHSAuth.requireUser().then(user=>{
      const name=[user.position,user.name].filter(Boolean).join(' ')||user.email||'사용자';
      const company=user.company_name||(user.role==='admin'?'이루자':'협력사');
      const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value};
      set('ehsGlobalName',name);set('ehsGlobalMenuName',name);set('ehsGlobalCompany',company);set('ehsGlobalRole',user.role==='admin'?'관리자 계정':'협력사 계정');set('ehsGlobalAvatar',name.trim().slice(0,1).toUpperCase());
      const unread=Number(user.unread_notification_count||0),badge=document.getElementById('ehsGlobalUnread');if(badge){badge.textContent=String(unread);badge.classList.toggle('show',unread>0)}
      document.querySelectorAll('.ehs-admin-only').forEach(el=>el.classList.toggle('hidden',user.role!=='admin'));
    }).catch(()=>{});
  }

  function installCommonHeader(){
    if(!STANDALONE||document.getElementById('ehsGlobalHeader')||!document.body)return;
    document.body.insertAdjacentHTML('afterbegin',commonHeaderHtml());
    document.body.classList.add('ehs-global-nav-ready');
    const nav=document.getElementById('ehsGlobalNav'),mobile=document.getElementById('ehsGlobalMobile'),user=document.getElementById('ehsGlobalUser'),userBtn=document.getElementById('ehsGlobalUserBtn');
    mobile?.addEventListener('click',e=>{e.stopPropagation();nav?.classList.toggle('open');user?.classList.remove('open')});
    userBtn?.addEventListener('click',e=>{e.stopPropagation();user?.classList.toggle('open');nav?.classList.remove('open')});
    document.getElementById('ehsGlobalBell')?.addEventListener('click',()=>location.href='/home');
    document.addEventListener('click',()=>{nav?.classList.remove('open');user?.classList.remove('open')});
    populateCommonHeader();
  }

  function install(){
    installCommonHeader();
    normalizeButtons();
    wireBrand();
    wireLogout();
    normalizeLegacyLinks();
    normalizeLegacyButtons();
    normalizeCurrentUrl();
  }

  if(PROTECTED&&!hasSession()){
    goLogin(path+location.search);
    return;
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();

  let tries=0;
  const timer=setInterval(()=>{
    install();
    if(++tries>30)clearInterval(timer);
  },250);

  window.EHSPortal={goHome,goLogin,logout,readSession,hasSession};
})();
