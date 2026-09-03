(function(){
  'use strict';
  if(!location.pathname.startsWith('/ipass'))return;

  const DIRECT_ROUTES=new Set(['/ipass/templates','/ipass/cycles']);

  function currentLabel(){
    const active=document.querySelector('#sideNav .nav-btn.active span');
    return active?.textContent?.trim()||'i-PaSS';
  }

  function ensureBreadcrumb(){
    const shell=document.getElementById('ipassShell');
    const title=document.getElementById('workspaceTitle');
    if(!shell||!title||shell.querySelector('.ipass-breadcrumb'))return;
    const wrap=title.parentElement;if(!wrap)return;
    const crumb=document.createElement('div');
    crumb.className='ipass-breadcrumb';
    crumb.innerHTML='<a href="/home">포털 홈</a><span>›</span><a href="/ipass">i-PaSS</a><span>›</span><strong></strong>';
    wrap.insertBefore(crumb,title);
  }

  function ensureMobileNav(){
    const shell=document.getElementById('ipassShell'),nav=document.getElementById('sideNav'),content=document.getElementById('content');
    if(!shell||!nav||!content)return;
    let box=shell.querySelector('.ipass-mobile-nav');
    if(!box){
      box=document.createElement('div');box.className='ipass-mobile-nav';
      box.innerHTML='<label for="ipassMobileSelect">i-PaSS 메뉴</label><select id="ipassMobileSelect" aria-label="i-PaSS 업무 메뉴"></select>';
      content.parentElement?.insertBefore(box,content);
    }
    const select=box.querySelector('select'),buttons=[...nav.querySelectorAll('.nav-btn[data-route]')];
    if(!select||!buttons.length)return;
    const html=buttons.map(button=>{
      const route=button.dataset.route||'/ipass',label=button.textContent.trim();
      return `<option value="${route.replaceAll('&','&amp;').replaceAll('"','&quot;')}"${button.classList.contains('active')?' selected':''}>${label.replaceAll('&','&amp;').replaceAll('<','&lt;')}</option>`;
    }).join('');
    if(select.innerHTML!==html)select.innerHTML=html;
    select.onchange=()=>{
      const target=select.value;
      if(DIRECT_ROUTES.has(target)){location.href=target;return}
      const button=buttons.find(item=>item.dataset.route===target);
      if(button)button.click();else location.href=target;
    };
  }

  function sync(){
    ensureBreadcrumb();ensureMobileNav();
    const strong=document.querySelector('.ipass-breadcrumb strong');if(strong)strong.textContent=currentLabel();
    const select=document.getElementById('ipassMobileSelect'),active=document.querySelector('#sideNav .nav-btn.active[data-route]');
    if(select&&active)select.value=active.dataset.route||'/ipass';
  }

  function interceptDirectRoute(event){
    const button=event.target.closest?.('#sideNav .nav-btn[data-route]');if(!button)return;
    const target=button.dataset.route;if(!DIRECT_ROUTES.has(target))return;
    event.preventDefault();event.stopImmediatePropagation();location.href=target;
  }

  const observer=new MutationObserver(sync);
  function start(){
    document.addEventListener('click',interceptDirectRoute,true);
    sync();
    const nav=document.getElementById('sideNav');
    if(nav)observer.observe(nav,{childList:true,subtree:true,attributes:true,attributeFilter:['class','aria-current']});
    window.addEventListener('popstate',()=>setTimeout(sync,0));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
