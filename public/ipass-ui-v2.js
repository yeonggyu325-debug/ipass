(function(){
  'use strict';
  if(!location.pathname.startsWith('/ipass'))return;

  function currentLabel(){
    const active=document.querySelector('#sideNav .nav-btn.active span');
    return active?.textContent?.trim()||'i-PaSS';
  }

  function ensureBreadcrumb(){
    const shell=document.getElementById('ipassShell');
    const title=document.getElementById('workspaceTitle');
    if(!shell||!title||shell.querySelector('.ipass-breadcrumb'))return;
    const wrap=title.parentElement;
    if(!wrap)return;
    const crumb=document.createElement('div');
    crumb.className='ipass-breadcrumb';
    crumb.innerHTML='<a href="/home">포털 홈</a><span>›</span><a href="/ipass">i-PaSS</a><span>›</span><strong></strong>';
    wrap.insertBefore(crumb,title);
  }

  function ensureMobileNav(){
    const shell=document.getElementById('ipassShell');
    const nav=document.getElementById('sideNav');
    const content=document.getElementById('content');
    if(!shell||!nav||!content)return;
    let box=shell.querySelector('.ipass-mobile-nav');
    if(!box){
      box=document.createElement('div');
      box.className='ipass-mobile-nav';
      box.innerHTML='<label for="ipassMobileSelect">i-PaSS 메뉴</label><select id="ipassMobileSelect" aria-label="i-PaSS 업무 메뉴"></select>';
      content.parentElement?.insertBefore(box,content);
    }
    const select=box.querySelector('select');
    const buttons=[...nav.querySelectorAll('.nav-btn[data-route]')];
    if(!select||!buttons.length)return;
    const html=buttons.map(btn=>{
      const route=btn.dataset.route||'/ipass';
      const label=btn.textContent.trim();
      return `<option value="${route.replaceAll('&','&amp;').replaceAll('"','&quot;')}"${btn.classList.contains('active')?' selected':''}>${label.replaceAll('&','&amp;').replaceAll('<','&lt;')}</option>`;
    }).join('');
    if(select.innerHTML!==html)select.innerHTML=html;
    select.onchange=()=>{
      const target=select.value;
      const button=buttons.find(btn=>btn.dataset.route===target);
      if(button)button.click();
      else location.href=target;
    };
  }

  function sync(){
    ensureBreadcrumb();
    ensureMobileNav();
    const label=currentLabel();
    const strong=document.querySelector('.ipass-breadcrumb strong');
    if(strong)strong.textContent=label;
    const select=document.getElementById('ipassMobileSelect');
    const active=document.querySelector('#sideNav .nav-btn.active[data-route]');
    if(select&&active)select.value=active.dataset.route||'/ipass';
  }

  const observer=new MutationObserver(sync);
  function start(){
    sync();
    const nav=document.getElementById('sideNav');
    if(nav)observer.observe(nav,{childList:true,subtree:true,attributes:true,attributeFilter:['class','aria-current']});
    window.addEventListener('popstate',()=>setTimeout(sync,0));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
