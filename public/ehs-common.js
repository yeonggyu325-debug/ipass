(function(){
  const SESSION_KEY='ipass.session.v10';
  const path=location.pathname;

  function hasSession(){
    try{return !!JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null')?.idToken}catch{return false}
  }

  function goHome(){
    if(location.pathname==='/home')return;
    location.href='/home';
  }

  function normalizeButtons(){
    document.querySelectorAll('button,a').forEach(el=>{
      const text=(el.textContent||'').replace(/\s+/g,' ').trim();
      if(text==='포털 홈'){
        el.classList.add('ehs-common-home-button');
        el.setAttribute('aria-hidden','true');
        el.tabIndex=-1;
      }
    });
  }

  function wireBrand(){
    const candidates=[
      '.brand', '.app-brand', '#brandBtn',
      '[data-ehs-brand]', '.header .brand', '.app-header .app-brand'
    ];
    document.querySelectorAll(candidates.join(',')).forEach(el=>{
      if(el.dataset.ehsHomeBound==='1')return;
      el.dataset.ehsHomeBound='1';
      el.setAttribute('title','EHS 포털 홈');
      el.addEventListener('click',function(e){
        e.preventDefault();
        e.stopImmediatePropagation();
        goHome();
      },true);
    });
  }

  function normalizeLegacyLinks(){
    document.querySelectorAll('a[href],button[onclick]').forEach(el=>{
      if(el.tagName==='A'){
        const href=el.getAttribute('href')||'';
        if(href==='/committee.html')el.setAttribute('href','/committee');
        if(href==='/evaluation-management.html')el.setAttribute('href','/ipass/templates');
        if(href==='/evaluation-cycle.html')el.setAttribute('href','/ipass/cycles');
      }
    });
  }

  function syncHomeUrl(){
    if(path!=='/'&&path!=='/index.html')return;
    const app=document.getElementById('app');
    if(app&&!app.classList.contains('hidden')&&hasSession()){
      history.replaceState({},'', '/home');
    }
  }

  function install(){
    normalizeButtons();
    wireBrand();
    normalizeLegacyLinks();
    syncHomeUrl();
  }

  if(path==='/home'&&!hasSession()){
    location.replace('/');
    return;
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);
  else install();

  let tries=0;
  const timer=setInterval(()=>{
    install();
    if(++tries>60)clearInterval(timer);
  },200);

  window.EHSPortal={goHome};
})();
