(function(){
  'use strict';
  if(location.pathname!=='/'&&location.pathname!=='/index.html')return;
  let done=false;
  function goHomeWhenApproved(){
    if(done)return;
    const app=document.getElementById('app');
    const publicPortal=document.getElementById('publicPortal');
    const approved=app&&!app.classList.contains('hidden')&&(!publicPortal||publicPortal.classList.contains('hidden'));
    if(!approved)return;
    done=true;
    location.replace('/home');
  }
  function boot(){
    goHomeWhenApproved();
    const app=document.getElementById('app');
    const publicPortal=document.getElementById('publicPortal');
    const observer=new MutationObserver(goHomeWhenApproved);
    if(app)observer.observe(app,{attributes:true,attributeFilter:['class']});
    if(publicPortal)observer.observe(publicPortal,{attributes:true,attributeFilter:['class']});
    document.addEventListener('ehs:user-ready',()=>setTimeout(goHomeWhenApproved,0));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
