(function(){
  'use strict';
  const path=location.pathname;
  const protectedPath=path==='/home'||path==='/committee'||path==='/committee.html'||path==='/education'||path==='/education.html'||path==='/voc'||path==='/voc.html'||path==='/notices'||path==='/resources'||path==='/faq'||path==='/faq.html'||path==='/ipass'||path==='/ipass/'||path.startsWith('/ipass/')||path==='/evaluation-management.html'||path==='/evaluation-cycle.html'||path==='/evaluation-submit.html'||path==='/evaluation-scoring.html';
  if(!protectedPath||new URLSearchParams(location.search).get('embedded')==='1')return;

  const normalize=p=>p==='/committee.html'?'/committee':p==='/education.html'?'/education':p==='/voc.html'?'/voc':p==='/faq.html'?'/faq':p;
  const current=normalize(path);
  const items=[['/home','홈'],['/ipass','i-PaSS'],['/committee','안전보건협의체'],['/education','교육'],['/voc','VOC'],['/notices','공지사항'],['/faq','FAQ'],['/resources','안전자료실']];
  const active=href=>href==='/ipass'?(current.startsWith('/ipass')||current.startsWith('/evaluation-')):current===href;

  function markup(){
    const links=items.map(([href,label])=>`<a class="ehs-global-link ${active(href)?'active':''}" href="${href}">${label}</a>`).join('');
    return `<header class="ehs-global-header ehs-toolbar-v5" id="ehsGlobalHeader">
      <div class="ehs-v5-top"><div class="ehs-v5-top-inner">
        <a class="ehs-global-brand" href="/home" aria-label="협력사 EHS 포털 홈"><img src="/hniruja-logo.png" alt="Hniruja"><span class="ehs-v5-brand-copy"><strong>협력사 EHS 포털</strong><small>Hniruja</small></span></a>
        <div class="ehs-global-actions">
          <button class="ehs-global-mobile" id="ehsGlobalMobile" type="button" aria-label="주요 메뉴 열기"><svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
          <button class="ehs-global-bell" id="ehsGlobalBell" type="button" aria-label="알림"><svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg><span id="ehsGlobalUnread">0</span></button>
          <div class="ehs-global-user" id="ehsGlobalUser"><button class="ehs-global-user-btn" id="ehsGlobalUserBtn" type="button"><span class="ehs-global-avatar" id="ehsGlobalAvatar">U</span><span class="ehs-global-copy"><strong id="ehsGlobalName">사용자</strong><small id="ehsGlobalCompany">협력사</small></span><span class="ehs-global-caret">⌄</span></button><div class="ehs-global-user-menu"><div><strong id="ehsGlobalMenuName">사용자</strong><span id="ehsGlobalRole">계정</span></div><button type="button" data-ehs-logout>로그아웃</button></div></div>
        </div>
      </div></div>
      <div class="ehs-v5-nav-row"><div class="ehs-v5-nav-inner"><nav class="ehs-global-nav" id="ehsGlobalNav" aria-label="주요 메뉴">${links}</nav></div></div>
    </header>`;
  }
  function applyUser(user){
    if(!user)return;
    const name=[user.position,user.name].filter(Boolean).join(' ')||user.email||'사용자';
    const company=user.company_name||(user.role==='admin'?'이루자':'협력사');
    const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v};
    set('ehsGlobalName',name);set('ehsGlobalMenuName',name);set('ehsGlobalCompany',company);set('ehsGlobalRole',user.role==='admin'?'관리자 계정':'협력사 계정');set('ehsGlobalAvatar',name.trim().slice(0,1).toUpperCase());
    const unread=Number(user.unread_notification_count||0),badge=document.getElementById('ehsGlobalUnread');if(badge){badge.textContent=String(unread);badge.classList.toggle('show',unread>0)}
  }
  function bind(){
    const nav=document.getElementById('ehsGlobalNav'),mobile=document.getElementById('ehsGlobalMobile'),user=document.getElementById('ehsGlobalUser'),userBtn=document.getElementById('ehsGlobalUserBtn');
    mobile?.addEventListener('click',e=>{e.stopPropagation();nav?.classList.toggle('open');user?.classList.remove('open')});
    userBtn?.addEventListener('click',e=>{e.stopPropagation();user?.classList.toggle('open');nav?.classList.remove('open')});
    document.getElementById('ehsGlobalBell')?.addEventListener('click',()=>location.href='/home');
    document.querySelectorAll('[data-ehs-logout]').forEach(btn=>btn.addEventListener('click',e=>{e.preventDefault();if(window.EHSAuth?.logout)window.EHSAuth.logout();else location.replace('/')}));
    document.addEventListener('click',()=>{nav?.classList.remove('open');user?.classList.remove('open')});
  }
  function install(){
    if(!document.body)return;
    document.getElementById('ehsGlobalHeader')?.remove();
    document.body.insertAdjacentHTML('afterbegin',markup());
    document.body.classList.remove('ehs-toolbar-v4-ready');
    document.body.classList.add('ehs-global-nav-ready','ehs-toolbar-v5-ready');
    bind();
    if(window.__EHS_PAGE_USER)applyUser(window.__EHS_PAGE_USER);
    document.addEventListener('ehs:user-ready',e=>applyUser(e.detail));
    if(!window.__EHS_PAGE_USER&&window.EHSAuth?.requireUser&&path!=='/evaluation-submit.html')window.EHSAuth.requireUser().then(applyUser).catch(()=>{});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
