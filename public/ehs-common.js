(function(){
  'use strict';

  const path=location.pathname;
  const protectedPath=path==='/home'||path==='/committee'||path==='/committee.html'||path==='/education'||path==='/education.html'||path==='/voc'||path==='/voc.html'||path==='/notices'||path==='/resources'||path==='/faq'||path==='/faq.html'||path==='/admin/approvals'||path==='/admin/accounts'||path==='/admin/system'||path==='/ipass'||path==='/ipass/'||path.startsWith('/ipass/')||path==='/evaluation-management.html'||path==='/evaluation-cycle.html'||path==='/evaluation-submit.html'||path==='/evaluation-scoring.html';
  const skeletonTimers=new WeakMap();

  function readSession(){return window.EHSAuth?.readSession?.()||null}
  function hasSession(){return !!readSession()}
  function goHome(){if(location.pathname!=='/home')location.href='/home'}
  function goLogin(next=location.pathname+location.search){
    if(window.EHSAuth?.redirectToLogin){window.EHSAuth.redirectToLogin(next);return}
    const value=String(next||'');
    const safe=value.startsWith('/')&&!value.startsWith('//')?value:'/home';
    location.replace('/?next='+encodeURIComponent(safe));
  }
  function logout(){
    if(window.EHSAuth?.logout){window.EHSAuth.logout();return}
    location.replace('/');
  }

  function skeletonKind(el){
    const id=String(el.id||el.parentElement?.id||'').toLowerCase();
    if(path==='/evaluation-submit.html'||path==='/evaluation-scoring.html'||path==='/evaluation-management.html'||path==='/evaluation-cycle.html')return'page';
    if(id.includes('month')||id.includes('card'))return'cards';
    if(id.includes('table')||id.includes('list')||id.includes('notice')||id.includes('annual'))return'rows';
    return el.closest('.content,.workspace,#content,#workspace,#app')?'page':'rows';
  }
  function skeletonMarkup(kind,label){
    const block='<span class="ehs-skeleton-block"></span>';
    const safeLabel=String(label||'화면 준비 중').replace(/[<>&"]/g,'');
    const sr=`<span class="ehs-skeleton-sr">${safeLabel}</span>`;
    if(kind==='page')return `${sr}<div class="ehs-skeleton-cards">${Array.from({length:3},()=>`<div class="ehs-skeleton-card">${block}</div>`).join('')}</div><div class="ehs-skeleton-panel">${block.repeat(5)}</div>`;
    if(kind==='cards')return `${sr}<div class="ehs-skeleton-cards">${Array.from({length:3},()=>`<div class="ehs-skeleton-card">${block}</div>`).join('')}</div>`;
    return `${sr}<div class="ehs-skeleton-rows">${Array.from({length:4},()=>`<div class="ehs-skeleton-row">${block}${block}</div>`).join('')}</div>`;
  }
  function clearSkeletonTimer(el){
    const timer=skeletonTimers.get(el);
    if(timer){clearTimeout(timer);skeletonTimers.delete(el)}
  }
  function scheduleSkeleton(el){
    if(!(el instanceof Element)||!el.classList.contains('loading')||el.classList.contains('error')||el.dataset.ehsSkeletonActive==='1'||skeletonTimers.has(el))return;
    const label=(el.textContent||'').trim()||el.getAttribute('aria-label')||'화면 준비 중';
    const timer=setTimeout(()=>{
      skeletonTimers.delete(el);
      if(!el.isConnected||!el.classList.contains('loading')||el.classList.contains('error'))return;
      el.dataset.ehsSkeletonActive='1';
      el.classList.add('ehs-skeleton-loading');
      el.setAttribute('aria-busy','true');
      el.setAttribute('role','status');
      el.innerHTML=skeletonMarkup(skeletonKind(el),label);
    },180);
    skeletonTimers.set(el,timer);
  }
  function scanLoading(root=document){
    if(root instanceof Element&&root.matches('.loading'))scheduleSkeleton(root);
    root.querySelectorAll?.('.loading').forEach(scheduleSkeleton);
  }
  function installSkeletonObserver(){
    if(!document.body||document.documentElement.dataset.ehsSkeletonObserver==='1')return;
    document.documentElement.dataset.ehsSkeletonObserver='1';
    scanLoading(document);
    const observer=new MutationObserver(records=>{
      for(const record of records){
        if(record.type==='attributes'){
          const el=record.target;
          if(el.classList.contains('loading'))scheduleSkeleton(el);
          else clearSkeletonTimer(el);
          continue;
        }
        for(const node of record.addedNodes)if(node.nodeType===1)scanLoading(node);
        const target=record.target instanceof Element?record.target:null;
        if(target?.dataset.ehsSkeletonActive==='1'&&!target.classList.contains('loading')){
          target.classList.remove('ehs-skeleton-loading');
          target.removeAttribute('aria-busy');
          target.removeAttribute('role');
          delete target.dataset.ehsSkeletonActive;
        }
      }
    });
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  }

  function storageText(bytes){
    const value=Number(bytes||0);
    if(value>=1073741824)return`${(value/1073741824).toFixed(value>=10737418240?1:2)} GB`;
    if(value>=1048576)return`${(value/1048576).toFixed(value>=104857600?0:1)} MB`;
    if(value>=1024)return`${Math.round(value/1024)} KB`;
    return`${value} B`;
  }
  async function showAdminStorage(user){
    if(!['/home','/admin/system'].includes(path)||user?.role!=='admin'||document.getElementById('ehsStorageCapacity'))return;
    const anchor=document.getElementById('ehsGlobalHeader')||document.querySelector('#app>.app-header,body>.app-header');
    if(!anchor||!window.EHSApi?.request)return;
    anchor.insertAdjacentHTML('afterend',`<section class="ehs-storage-capacity" id="ehsStorageCapacity" aria-label="Cloudflare R2 저장공간"><div class="ehs-storage-inner"><div class="ehs-storage-heading"><span class="ehs-storage-cloud">☁</span><div><strong>Cloudflare R2 저장공간</strong><small>포털 첨부파일 사용량 확인</small></div></div><div class="ehs-storage-meter"><div><strong id="ehsStorageUsed">확인 중</strong><span id="ehsStorageMeta"></span></div><div class="ehs-storage-track"><i id="ehsStorageBar"></i></div></div></div></section>`);
    try{
      const data=await window.EHSApi.request('/api/admin/storage-status');
      const storage=data.storage||{},summary=storage.global||{},percent=Math.max(0,Math.min(100,Number(summary.percent||0)));
      const used=document.getElementById('ehsStorageUsed'),meta=document.getElementById('ehsStorageMeta'),bar=document.getElementById('ehsStorageBar');
      if(used)used.textContent=`${storageText(summary.used_bytes)} / ${Number(summary.limit_gb||8.5)} GB`;
      if(meta)meta.textContent=`남음 ${storageText(summary.remaining_bytes)} · 파일 ${Number(storage.file_count||0).toLocaleString('ko-KR')}개`;
      if(bar){bar.style.width=`${percent}%`;bar.classList.toggle('warning',percent>=75);bar.classList.toggle('danger',percent>=90)}
    }catch(error){
      const used=document.getElementById('ehsStorageUsed'),meta=document.getElementById('ehsStorageMeta');
      if(used)used.textContent='사용량 확인 불가';
      if(meta)meta.textContent=error?.message||'잠시 후 다시 확인하세요.';
    }
  }
  function installAdminStorage(){
    if(!['/home','/admin/system'].includes(path)||document.documentElement.dataset.ehsStorageListener==='1')return;
    document.documentElement.dataset.ehsStorageListener='1';
    document.addEventListener('ehs:user-ready',event=>showAdminStorage(event.detail));
    if(window.__EHS_PAGE_USER)showAdminStorage(window.__EHS_PAGE_USER);
  }

  function installDelegatedActions(){
    if(document.documentElement.dataset.ehsDelegatedActions==='1')return;
    document.documentElement.dataset.ehsDelegatedActions='1';
    document.addEventListener('click',event=>{
      const logoutButton=event.target.closest?.('[data-ehs-logout]');
      if(logoutButton){event.preventDefault();logout();return}
      const canonical=event.target.closest?.('[data-ehs-home]');
      if(canonical){event.preventDefault();goHome()}
    });
  }

  function installDialogAccessibility(){
    if(document.documentElement.dataset.ehsDialogA11y==='1'||!document.body)return;document.documentElement.dataset.ehsDialogA11y='1';let active=null,opener=null;
    const focusable=dialog=>[...dialog.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(el=>el.offsetParent!==null);
    const activate=dialog=>{if(active===dialog)return;active=dialog;opener=document.activeElement;dialog.setAttribute('aria-modal','true');if(!dialog.hasAttribute('role'))dialog.setAttribute('role','dialog');requestAnimationFrame(()=>focusable(dialog)[0]?.focus())};
    const deactivate=()=>{if(!active)return;active=null;if(opener?.isConnected)opener.focus();opener=null};
    const scan=()=>{const dialog=[...document.querySelectorAll('[role="dialog"],.ap-overlay:not(.ap-hidden) .ap-modal,.modal:not(.hidden) .modal-card')].find(el=>el.offsetParent!==null);if(dialog)activate(dialog);else deactivate()};
    document.addEventListener('keydown',event=>{if(!active||event.key!=='Tab')return;const nodes=focusable(active);if(!nodes.length){event.preventDefault();return}const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}});
    new MutationObserver(scan).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','aria-hidden']});scan();
  }

  function installPerformanceTelemetry(){
    if(document.documentElement.dataset.ehsPerformanceTelemetry==='1'||!window.performance)return;
    document.documentElement.dataset.ehsPerformanceTelemetry='1';
    let latestLcp=0,apiReady=0,sent=false;
    try{new PerformanceObserver(list=>{for(const entry of list.getEntries())latestLcp=Math.max(latestLcp,Number(entry.startTime||0))}).observe({type:'largest-contentful-paint',buffered:true})}catch(_){}
    document.addEventListener('ehs:user-ready',()=>{apiReady=Math.round(performance.now())},{once:true});
    const send=()=>{
      if(sent)return;sent=true;
      const nav=performance.getEntriesByType('navigation')[0];
      const fcp=performance.getEntriesByName('first-contentful-paint')[0];
      const payload={
        page:path==='/index.html'?'/':path,
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
    const afterLoad=()=>setTimeout(send,1600);
    if(document.readyState==='complete')afterLoad();else window.addEventListener('load',afterLoad,{once:true});
    window.addEventListener('pagehide',send,{once:true});
  }

  function install(){
    installPerformanceTelemetry();
    installDialogAccessibility();
    installAdminStorage();
    installSkeletonObserver();
    installDelegatedActions();
  }

  if(protectedPath&&!hasSession()){
    goLogin(path+location.search);
    return;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();

  window.EHSPortal={goHome,goLogin,logout,readSession,hasSession};
})();
