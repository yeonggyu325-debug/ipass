(function(){
  'use strict';
  const path=location.pathname;
  const PROTECTED=path==='/home'||path==='/committee'||path==='/committee.html'||path==='/education'||path==='/education.html'||path==='/voc'||path==='/voc.html'||path==='/notices'||path==='/resources'||path==='/faq'||path==='/faq.html'||path==='/ipass'||path==='/ipass/'||path.startsWith('/ipass/')||path==='/evaluation-management.html'||path==='/evaluation-cycle.html'||path==='/evaluation-submit.html'||path==='/evaluation-scoring.html';
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

  function skeletonKind(el){
    const id=String(el.id||el.parentElement?.id||'').toLowerCase();
    if(path==='/evaluation-submit.html'||path==='/evaluation-scoring.html'||path==='/evaluation-management.html'||path==='/evaluation-cycle.html')return'page';
    if(id.includes('month'))return'cards';
    if(id.includes('table')||id.includes('list')||id.includes('notice')||id.includes('annual'))return'rows';
    return el.closest('.content,.workspace,#content,#workspace,#app')?'page':'rows';
  }

  function skeletonMarkup(kind,label){
    const block='<span class="ehs-skeleton-block"></span>',sr=`<span class="ehs-skeleton-sr">${String(label||'화면 준비 중').replace(/[<>&"]/g,'')}</span>`;
    if(kind==='page')return `${sr}<div class="ehs-skeleton-cards">${Array.from({length:3},()=>`<div class="ehs-skeleton-card">${block}</div>`).join('')}</div><div class="ehs-skeleton-panel">${block.repeat(5)}</div>`;
    if(kind==='cards')return `${sr}<div class="ehs-skeleton-cards">${Array.from({length:3},()=>`<div class="ehs-skeleton-card">${block}</div>`).join('')}</div>`;
    return `${sr}<div class="ehs-skeleton-rows">${Array.from({length:4},()=>`<div class="ehs-skeleton-row">${block}${block}</div>`).join('')}</div>`;
  }

  function hydrateSkeletons(root=document){
    const nodes=[];
    if(root?.nodeType===1&&root.matches?.('.loading'))nodes.push(root);
    root?.querySelectorAll?.('.loading').forEach(el=>nodes.push(el));
    for(const el of nodes){
      if(el.classList.contains('error')||el.querySelector('.ehs-skeleton-block'))continue;
      const label=(el.textContent||'').trim()||el.getAttribute('aria-label')||'화면 준비 중';
      el.classList.add('ehs-skeleton-loading');el.dataset.ehsSkeletonActive='1';el.setAttribute('aria-busy','true');el.setAttribute('role','status');
      el.innerHTML=skeletonMarkup(skeletonKind(el),label);
    }
  }

  function clearSkeletonState(el){
    if(el?.dataset?.ehsSkeletonActive!=='1')return;
    el.classList.remove('loading','ehs-skeleton-loading');delete el.dataset.ehsSkeletonActive;el.removeAttribute('aria-busy');el.removeAttribute('role');
  }

  function installSkeletons(){
    hydrateSkeletons(document);
    if(document.documentElement.dataset.ehsSkeletonObserver==='1')return;
    document.documentElement.dataset.ehsSkeletonObserver='1';
    const pending=new Set();let frame=0;
    const flush=()=>{frame=0;for(const node of pending)hydrateSkeletons(node);pending.clear()};
    new MutationObserver(records=>{for(const record of records){const target=record.target?.nodeType===1?record.target:null;if(target?.dataset?.ehsSkeletonActive==='1'&&!target.querySelector('.ehs-skeleton-block'))clearSkeletonState(target);for(const node of record.addedNodes)if(node.nodeType===1)pending.add(node)}if(pending.size&&!frame)frame=requestAnimationFrame(flush)}).observe(document.body,{childList:true,subtree:true});
  }

  function commonHeaderHtml(){
    const servicePath=path==='/committee.html'?'/committee':path==='/education.html'?'/education':path==='/voc.html'?'/voc':path==='/faq.html'?'/faq':path;
    const services=[['/ipass','i-PaSS'],['/committee','안전보건협의체'],['/education','교육 제출'],['/voc','VOC'],['/notices','공지사항'],['/faq','FAQ'],['/resources','안전자료실']];
    const links=services.map(([href,label])=>`<a class="ehs-global-link ${(href==='/ipass'?servicePath.startsWith('/ipass')||servicePath.startsWith('/evaluation-'):servicePath===href)?'active':''}" href="${href}">${label}</a>`).join('');
    return `<header class="ehs-global-header" id="ehsGlobalHeader"><div class="ehs-global-inner">
      <a class="ehs-global-brand" href="/home" aria-label="EHS 포털 홈"><img src="/hniruja-logo.png" alt="Hniruja"><span>협력사 EHS 포털</span><em>EHS</em></a>
      <button class="ehs-global-mobile" id="ehsGlobalMobile" type="button" aria-label="메뉴 열기"><svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
      <nav class="ehs-global-nav" id="ehsGlobalNav" aria-label="주요 메뉴">${links}</nav>
      <div class="ehs-global-actions">
        <button class="ehs-global-bell" id="ehsGlobalBell" type="button" aria-label="알림"><svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg><span id="ehsGlobalUnread">0</span></button>
        <div class="ehs-global-user" id="ehsGlobalUser"><button class="ehs-global-user-btn" id="ehsGlobalUserBtn" type="button"><span class="ehs-global-avatar" id="ehsGlobalAvatar">U</span><span class="ehs-global-copy"><strong id="ehsGlobalName">사용자</strong><small id="ehsGlobalCompany">협력사</small></span><span class="ehs-global-caret">⌄</span></button><div class="ehs-global-user-menu"><div><strong id="ehsGlobalMenuName">사용자</strong><span id="ehsGlobalRole">계정</span></div><button type="button" data-ehs-logout>로그아웃</button></div></div>
      </div>
    </div></header>`;
  }

  function applyCommonHeaderUser(user){
    if(!user)return;
      const name=[user.position,user.name].filter(Boolean).join(' ')||user.email||'사용자';
      const company=user.company_name||(user.role==='admin'?'이루자':'협력사');
      const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value};
      set('ehsGlobalName',name);set('ehsGlobalMenuName',name);set('ehsGlobalCompany',company);set('ehsGlobalRole',user.role==='admin'?'관리자 계정':'협력사 계정');set('ehsGlobalAvatar',name.trim().slice(0,1).toUpperCase());
      const unread=Number(user.unread_notification_count||0),badge=document.getElementById('ehsGlobalUnread');if(badge){badge.textContent=String(unread);badge.classList.toggle('show',unread>0)}
      document.querySelectorAll('.ehs-admin-only').forEach(el=>el.classList.toggle('hidden',user.role!=='admin'));
  }

  function populateCommonHeader(){
    if(!STANDALONE)return;
    if(document.documentElement.dataset.ehsUserListener!=='1'){
      document.documentElement.dataset.ehsUserListener='1';
      document.addEventListener('ehs:user-ready',event=>applyCommonHeaderUser(event.detail));
    }
    if(window.__EHS_PAGE_USER){applyCommonHeaderUser(window.__EHS_PAGE_USER);return}
    if(path==='/evaluation-submit.html'||!window.EHSAuth?.requireUser)return;
    window.EHSAuth.requireUser().then(applyCommonHeaderUser).catch(()=>{});
  }

  function storageText(bytes){
    const value=Number(bytes||0);
    if(value>=1073741824)return`${(value/1073741824).toFixed(value>=10737418240?1:2)} GB`;
    if(value>=1048576)return`${(value/1048576).toFixed(value>=104857600?0:1)} MB`;
    if(value>=1024)return`${Math.round(value/1024)} KB`;
    return`${value} B`;
  }

  async function showAdminStorage(user){
    if((!STANDALONE&&path!=='/home')||user?.role!=='admin'||document.getElementById('ehsStorageCapacity'))return;
    const anchor=document.getElementById('ehsGlobalHeader')||document.querySelector('#app>.app-header,body>.app-header');
    if(!anchor)return;
    anchor.insertAdjacentHTML('afterend',`<section class="ehs-storage-capacity" id="ehsStorageCapacity" aria-label="Cloudflare R2 저장공간"><div class="ehs-storage-inner"><div class="ehs-storage-heading"><span class="ehs-storage-cloud">☁</span><div><strong>Cloudflare R2 저장공간</strong><small>포털 첨부파일 사용량 집계 중</small></div></div><div class="ehs-storage-meter"><div><strong id="ehsStorageUsed">확인 중</strong><span id="ehsStorageMeta"></span></div><div class="ehs-storage-track"><i id="ehsStorageBar"></i></div></div></div></section>`);
    try{
      const data=await window.EHSApi.request('/api/admin/storage-status');
      const storage=data.storage||{},global=storage.global||{},percent=Math.max(0,Math.min(100,Number(global.percent||0)));
      document.getElementById('ehsStorageUsed').textContent=`${storageText(global.used_bytes)} / ${Number(global.limit_gb||8.5)} GB`;
      document.getElementById('ehsStorageMeta').textContent=`남음 ${storageText(global.remaining_bytes)} · 파일 ${Number(storage.file_count||0).toLocaleString('ko-KR')}개`;
      const bar=document.getElementById('ehsStorageBar');bar.style.width=`${percent}%`;bar.classList.toggle('warning',percent>=75);bar.classList.toggle('danger',percent>=90);
    }catch(error){
      const used=document.getElementById('ehsStorageUsed'),meta=document.getElementById('ehsStorageMeta');
      if(used)used.textContent='사용량 확인 불가';if(meta)meta.textContent=error?.message||'잠시 후 다시 확인하세요.';
    }
  }

  function installAdminStorage(){
    if(document.documentElement.dataset.ehsStorageListener==='1')return;
    document.documentElement.dataset.ehsStorageListener='1';
    document.addEventListener('ehs:user-ready',event=>showAdminStorage(event.detail));
    if(window.__EHS_PAGE_USER)showAdminStorage(window.__EHS_PAGE_USER);
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

  function installPerformanceTelemetry(){
    if(document.documentElement.dataset.ehsPerformanceTelemetry==='1'||!window.performance)return;
    document.documentElement.dataset.ehsPerformanceTelemetry='1';
    let latestLcp=0,apiReady=0,sent=false;
    try{new PerformanceObserver(list=>{for(const entry of list.getEntries())latestLcp=Math.max(latestLcp,Number(entry.startTime||0))}).observe({type:'largest-contentful-paint',buffered:true})}catch(_){}
    document.addEventListener('ehs:user-ready',()=>{apiReady=Math.round(performance.now())},{once:true});
    const metricPage=()=>{
      if(path==='/index.html')return'/';
      return path;
    };
    const send=()=>{
      if(sent)return;sent=true;
      const nav=performance.getEntriesByType('navigation')[0];
      const fcp=performance.getEntriesByName('first-contentful-paint')[0];
      const payload={
        page:metricPage(),
        navigation:nav?.type||'navigate',
        page_load:Math.round(nav?.loadEventEnd||performance.now()),
        ttfb:Math.round(nav?.responseStart||0),
        dom_ready:Math.round(nav?.domContentLoadedEventEnd||0),
        fcp:Math.round(fcp?.startTime||0),
        lcp:Math.round(latestLcp||0),
        api_ready:apiReady,
        resource_count:performance.getEntriesByType('resource').length
      };
      const body=JSON.stringify(payload);
      try{if(navigator.sendBeacon&&navigator.sendBeacon('/api/performance/rum',new Blob([body],{type:'application/json'})))return}catch(_){}
      fetch('/api/performance/rum',{method:'POST',headers:{'content-type':'application/json'},body,keepalive:true,credentials:'same-origin'}).catch(()=>{});
    };
    const afterLoad=()=>setTimeout(send,2000);
    if(document.readyState==='complete')afterLoad();else window.addEventListener('load',afterLoad,{once:true});
    window.addEventListener('pagehide',send,{once:true});
  }

  function install(){
    installPerformanceTelemetry();
    installCommonHeader();
    installAdminStorage();
    installSkeletons();
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

  if(path!=='/evaluation-submit.html'){
    let tries=0;
    const timer=setInterval(()=>{
      install();
      if(++tries>30)clearInterval(timer);
    },250);
  }

  window.EHSPortal={goHome,goLogin,logout,readSession,hasSession};
})();
