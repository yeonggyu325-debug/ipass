(function(){
  'use strict';
  const path=location.pathname;
  const PROTECTED=path==='/home'||path==='/committee'||path==='/committee.html'||path==='/ipass'||path==='/ipass/'||path.startsWith('/ipass/')||path==='/evaluation-management.html'||path==='/evaluation-cycle.html'||path==='/evaluation-submit.html';

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

  function install(){
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
