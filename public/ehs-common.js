(function(){
  const SESSION_KEY='ipass.session.v10';
  const path=location.pathname;

  function readSession(){
    if(window.EHSAuth?.readSession)return window.EHSAuth.readSession();
    try{
      const raw=sessionStorage.getItem(SESSION_KEY);
      if(!raw)return null;
      const s=JSON.parse(raw);
      return s&&s.idToken?s:null;
    }catch{return null}
  }
  function hasSession(){return !!readSession()}
  function goHome(){if(location.pathname!=='/home')location.href='/home'}
  function goLogin(next=location.pathname+location.search){
    const safe=String(next||'').startsWith('/')?String(next):'/home';
    location.replace('/?next='+encodeURIComponent(safe));
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

  function normalizeLegacyLinks(){
    document.querySelectorAll('a[href]').forEach(el=>{
      const href=el.getAttribute('href')||'';
      if(href==='/index.html')el.setAttribute('href','/home');
      else if(href==='/committee.html')el.setAttribute('href','/committee');
      else if(href==='/evaluation-management.html')el.setAttribute('href','/ipass/templates');
      else if(href==='/evaluation-cycle.html')el.setAttribute('href','/ipass/cycles');
    });
  }

  function normalizeCurrentUrl(){
    if(path==='/index.html'&&hasSession())history.replaceState({},'', '/home');
    if(path==='/committee.html')history.replaceState({},'', '/committee');
  }

  function install(){
    normalizeButtons();
    wireBrand();
    normalizeLegacyLinks();
    normalizeCurrentUrl();
  }

  /* Authentication decisions belong to each page during migration, and later to EHSAuth.
     This common shell must never clear sessions or redirect on its own. */
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();

  let tries=0;
  const timer=setInterval(()=>{
    install();
    if(++tries>30)clearInterval(timer);
  },250);

  window.EHSPortal={goHome,goLogin,readSession,hasSession};
})();
