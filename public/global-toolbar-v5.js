(function(){
  'use strict';
  const path=location.pathname;
  const protectedPath=path==='/home'||path==='/committee'||path==='/committee.html'||path==='/education'||path==='/education.html'||path==='/voc'||path==='/voc.html'||path==='/notices'||path==='/resources'||path==='/faq'||path==='/faq.html'||path==='/admin/approvals'||path==='/admin/accounts'||path==='/admin/system'||path==='/ipass'||path==='/ipass/'||path.startsWith('/ipass/')||path==='/evaluation-management.html'||path==='/evaluation-cycle.html'||path==='/evaluation-submit.html'||path==='/evaluation-scoring.html';
  if(!protectedPath||new URLSearchParams(location.search).get('embedded')==='1')return;
  const normalize=p=>p==='/committee.html'?'/committee':p==='/education.html'?'/education':p==='/voc.html'?'/voc':p==='/faq.html'?'/faq':p;
  const current=normalize(path);
  const items=[['/home','홈'],['/notices','공지사항'],['/committee','안전보건협의체'],['/education','교육자료'],['/resources','자료실'],['/ipass','i-PaSS'],['/voc','VOC'],['/faq','FAQ']];
  const active=href=>href==='/ipass'?(current.startsWith('/ipass')||current.startsWith('/evaluation-')):current===href;
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  let activeUser=null,refreshTimer=0;
  const prefetched=new Set();

  function markup(){
    const links=items.map(([href,label])=>`<a class="ehs-global-link ${active(href)?'active':''}" href="${href}"${active(href)?' aria-current="page"':''}>${label}</a>`).join('');
    return `<header class="ehs-global-header ehs-toolbar-v5" id="ehsGlobalHeader"><div class="ehs-v5-top"><div class="ehs-v5-top-inner"><a class="ehs-global-brand" href="/home" aria-label="협력사 EHS 포털 홈"><img src="/hniruja-logo.png" alt="Hniruja"><span class="ehs-v5-brand-copy"><strong>협력사 EHS 포털</strong><small>Hniruja</small></span></a><button class="ehs-global-mobile" id="ehsGlobalMobile" type="button" aria-label="주요 메뉴 열기" aria-expanded="false"><svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button><nav class="ehs-global-nav" id="ehsGlobalNav" aria-label="주요 메뉴">${links}</nav><div class="ehs-global-actions"><div class="ehs-notification-wrap"><button class="ehs-global-bell" id="ehsGlobalBell" type="button" aria-label="알림" aria-expanded="false"><svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg><span id="ehsGlobalUnread">0</span></button><div class="ehs-notification-panel" id="ehsNotificationPanel" role="dialog" aria-label="알림 목록"><div class="ehs-notification-head"><strong>알림</strong><button id="ehsReadAll" type="button">모두 읽음</button></div><div class="ehs-notification-list" id="ehsNotificationList"><div class="ehs-notification-empty">알림을 불러오는 중...</div></div></div></div><div class="ehs-global-user" id="ehsGlobalUser"><button class="ehs-global-user-btn" id="ehsGlobalUserBtn" type="button" aria-expanded="false"><span class="ehs-global-avatar" id="ehsGlobalAvatar">U</span><span class="ehs-global-copy"><strong id="ehsGlobalName">사용자</strong><small id="ehsGlobalCompany">협력사</small></span><span class="ehs-global-caret">⌄</span></button><div class="ehs-global-user-menu"><div><strong id="ehsGlobalMenuName">사용자</strong><span id="ehsGlobalRole">계정</span></div><button class="ehs-admin-menu hidden" data-admin-route="/ipass" type="button">i-PaSS 관리</button><button class="ehs-admin-menu hidden" data-admin-route="/admin/approvals" type="button">회원가입 승인</button><button class="ehs-admin-menu hidden" data-admin-route="/admin/accounts" type="button">협력사 계정 관리</button><button class="ehs-admin-menu hidden" data-admin-route="/admin/system" type="button">시스템 상태</button><button class="ehs-admin-name-setting hidden" id="ehsAdminNameSetting" type="button">관리자 이름 설정</button><button type="button" data-ehs-logout>로그아웃</button></div></div></div></div></div></header>`;
  }
  function identity(user){
    const isAdmin=user?.role==='admin';
    const saved=isAdmin?String(localStorage.getItem('ehs.adminDisplayName')||'').trim():'';
    let base=saved||String(user?.name||'').trim();if(!base||base.includes('@'))base=isAdmin?'관리자':'사용자';
    const name=[base,String(user?.position||'').trim()].filter(Boolean).join(' ');
    return{name,base,company:isAdmin?'에이치앤이루자':(user?.company_name||'협력사'),isAdmin};
  }
  function syncHome(user){
    const id=identity(user),homeName=document.getElementById('homeUserName'),title=document.getElementById('homeV3Title'),welcome=document.getElementById('portalWelcome');
    if(homeName)homeName.textContent=id.base;
    if(title)title.textContent=id.isAdmin?`${id.base}님 안녕하세요`:`안녕하세요, ${id.base}님`;
    if(welcome)welcome.textContent=id.isAdmin?'에이치앤이루자 EHS 업무를 한 화면에서 확인하세요.':`${id.company}의 EHS 업무를 한 화면에서 확인하세요.`;
  }
  function setUnread(n){const badge=document.getElementById('ehsGlobalUnread'),count=Number(n||0);if(!badge)return;badge.textContent=count>99?'99+':String(count);badge.classList.toggle('show',count>0)}
  function applyUser(user){
    if(!user)return;activeUser=user;const id=identity(user),set=(key,value)=>{const el=document.getElementById(key);if(el)el.textContent=value};
    set('ehsGlobalName',id.name);set('ehsGlobalMenuName',id.name);set('ehsGlobalCompany',id.company);set('ehsGlobalRole',id.isAdmin?'관리자 계정':'협력사 계정');set('ehsGlobalAvatar',id.base.slice(0,1).toUpperCase());
    setUnread(user.unread_notification_count||0);
    document.querySelectorAll('.ehs-admin-menu,#ehsAdminNameSetting').forEach(el=>el.classList.toggle('hidden',!id.isAdmin));
    syncHome(user);
  }
  function warmRoute(href){
    if(!activeUser||!window.EHSApi?.prefetch||prefetched.has(href))return;prefetched.add(href);
    const year=new Date().getFullYear(),admin=activeUser.role==='admin';let calls=[];
    if(href==='/committee')calls=[`/api/committee?year=${year}`];
    else if(href==='/education')calls=[`/api/education?year=${year}`];
    else if(href==='/voc')calls=['/api/voc'];
    else if(href==='/notices')calls=[`/api/content/notices?q=${admin?'&include_inactive=1':''}`];
    else if(href==='/resources')calls=[`/api/content/resources?q=&category=${admin?'&include_inactive=1':''}`];
    else if(href==='/ipass')calls=admin?['/api/admin/dashboard-bundle']:[`/api/annual-ipass?year=${year}`,'/api/my/evaluations'];
    calls.forEach(call=>window.EHSApi.prefetch(call));
  }
  function notificationHref(notification){
    if(!notification?.entity_id)return'';
    if(notification.entity_type==='evaluation_target')return activeUser?.role==='admin'?`/evaluation-scoring.html?target=${encodeURIComponent(notification.entity_id)}`:`/evaluation-submit.html?target=${encodeURIComponent(notification.entity_id)}`;
    if(notification.entity_type==='registration')return'/admin/approvals';
    if(notification.entity_type==='voc')return'/voc';
    if(notification.entity_type==='education')return'/education';
    return'';
  }
  async function loadNotifications(){
    const list=document.getElementById('ehsNotificationList');if(!list)return;
    list.innerHTML='<div class="ehs-notification-empty">알림을 불러오는 중...</div>';
    try{
      const data=await window.EHSApi.request('/api/notifications?limit=50'),rows=data.notifications||[];setUnread(data.unread_count||0);
      list.innerHTML=rows.length?rows.map(n=>`<button class="ehs-notification-item ${n.is_read?'':'unread'}" type="button" data-id="${esc(n.id)}" data-entity-type="${esc(n.entity_type||'')}" data-entity-id="${esc(n.entity_id||'')}"><strong>${esc(n.title||'업무 알림')}</strong>${n.message?`<span>${esc(n.message)}</span>`:''}<small>${esc(String(n.created_at||'').replace('T',' ').slice(0,16))}</small></button>`).join(''):'<div class="ehs-notification-empty">새 알림이 없습니다.</div>';
      list.querySelectorAll('[data-id]').forEach((button,index)=>button.onclick=async()=>{
        const notification=rows[index];
        if(button.classList.contains('unread')){
          const result=await window.EHSApi.request('/api/notifications',{method:'PATCH',body:JSON.stringify({id:button.dataset.id})});setUnread(result.unread_count||0);
        }
        const href=notificationHref(notification);if(href)location.href=href;else button.classList.remove('unread');
      });
    }catch(error){list.innerHTML='<div class="ehs-notification-empty">알림을 불러오지 못했습니다.</div>'}
  }
  async function setAdminName(){
    if(activeUser?.role!=='admin')return;const id=identity(activeUser),name=prompt('상단에 표시할 관리자 이름을 입력하세요.',id.base);if(!name||!name.trim())return;
    const value=name.trim();localStorage.setItem('ehs.adminDisplayName',value);activeUser={...activeUser,name:value};window.__EHS_PAGE_USER=activeUser;applyUser(activeUser);
    try{await window.EHSApi.request('/api/profile/display-name',{method:'PATCH',body:JSON.stringify({name:value})})}catch(_){}
  }
  function closeMenus(){
    const nav=document.getElementById('ehsGlobalNav'),user=document.getElementById('ehsGlobalUser'),panel=document.getElementById('ehsNotificationPanel');
    nav?.classList.remove('open');user?.classList.remove('open');panel?.classList.remove('open');
    document.getElementById('ehsGlobalMobile')?.setAttribute('aria-expanded','false');document.getElementById('ehsGlobalUserBtn')?.setAttribute('aria-expanded','false');document.getElementById('ehsGlobalBell')?.setAttribute('aria-expanded','false');
  }
  function bind(){
    const nav=document.getElementById('ehsGlobalNav'),mobile=document.getElementById('ehsGlobalMobile'),user=document.getElementById('ehsGlobalUser'),userBtn=document.getElementById('ehsGlobalUserBtn'),panel=document.getElementById('ehsNotificationPanel'),bell=document.getElementById('ehsGlobalBell');
    mobile?.addEventListener('click',event=>{event.stopPropagation();const open=!nav?.classList.contains('open');closeMenus();nav?.classList.toggle('open',open);mobile.setAttribute('aria-expanded',String(open))});
    userBtn?.addEventListener('click',event=>{event.stopPropagation();const open=!user?.classList.contains('open');closeMenus();user?.classList.toggle('open',open);userBtn.setAttribute('aria-expanded',String(open))});
    bell?.addEventListener('click',event=>{event.stopPropagation();const open=!panel?.classList.contains('open');closeMenus();panel?.classList.toggle('open',open);bell.setAttribute('aria-expanded',String(open));if(open)loadNotifications()});
    nav?.querySelectorAll('a[href]').forEach(link=>{const warm=()=>warmRoute(link.getAttribute('href'));link.addEventListener('pointerenter',warm,{passive:true});link.addEventListener('focus',warm);link.addEventListener('touchstart',warm,{passive:true})});
    document.querySelectorAll('[data-admin-route]').forEach(button=>button.addEventListener('click',()=>location.href=button.dataset.adminRoute));
    document.getElementById('ehsReadAll')?.addEventListener('click',async event=>{event.stopPropagation();const result=await window.EHSApi.request('/api/notifications',{method:'PATCH',body:JSON.stringify({all:true})});setUnread(result.unread_count||0);await loadNotifications()});
    document.getElementById('ehsAdminNameSetting')?.addEventListener('click',setAdminName);
    document.addEventListener('click',closeMenus);
    document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenus()});
  }
  function scheduleProfileRefresh(){
    clearTimeout(refreshTimer);refreshTimer=setTimeout(async()=>{
      if(document.visibilityState==='visible'&&window.EHSAuth?.readSession()){
        try{const data=await window.EHSApi.request('/api/me',{ehsNoCache:true});if(data?.user)applyUser(data.user)}catch(_){}
      }
      scheduleProfileRefresh();
    },60000);
  }
  function install(){
    if(!document.body)return;document.getElementById('ehsGlobalHeader')?.remove();document.body.insertAdjacentHTML('afterbegin',markup());
    document.body.classList.remove('ehs-toolbar-v4-ready');document.body.classList.add('ehs-global-nav-ready','ehs-toolbar-v5-ready');bind();
    if(window.__EHS_PAGE_USER)applyUser(window.__EHS_PAGE_USER);
    document.addEventListener('ehs:user-ready',event=>applyUser(event.detail));
    if(!window.__EHS_PAGE_USER&&window.EHSApi?.request&&window.EHSAuth?.readSession?.())window.EHSApi.request('/api/me').then(data=>data?.user&&applyUser(data.user)).catch(()=>{});
    scheduleProfileRefresh();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
