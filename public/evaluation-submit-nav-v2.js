(function(){
  'use strict';

  function ensureBreadcrumb(){
    const hero=document.querySelector('#app .hero');
    if(!hero||document.querySelector('.submission-breadcrumb'))return;
    const title=hero.querySelector('h1')?.textContent?.trim()||'평가자료 제출';
    const nav=document.createElement('nav');
    nav.className='submission-breadcrumb';
    nav.setAttribute('aria-label','현재 위치');
    nav.innerHTML='<a href="/home">홈</a><span>›</span><a href="/ipass">i-PaSS</a><span>›</span><strong></strong>';
    nav.querySelector('strong').textContent=title;
    hero.parentNode.insertBefore(nav,hero);
  }

  function buildMobileNav(){
    const layout=document.querySelector('#app .layout');
    const list=document.querySelector('#app .nav-list');
    if(!layout||!list)return;
    let wrap=document.querySelector('.submission-mobile-nav');
    if(!wrap){
      wrap=document.createElement('div');
      wrap.className='submission-mobile-nav';
      wrap.innerHTML='<label for="submissionMobileSelect">평가항목 이동</label><select id="submissionMobileSelect" aria-label="평가항목 이동"></select>';
      layout.parentNode.insertBefore(wrap,layout);
    }
    const select=wrap.querySelector('select');
    const items=[...list.querySelectorAll('[data-nav]')];
    const current=select.value;
    select.innerHTML=items.map((btn,index)=>{
      const label=btn.querySelector('.nav-name')?.textContent?.trim()||`평가항목 ${index+1}`;
      return `<option value="${String(btn.dataset.nav||'').replaceAll('"','&quot;')}">${label}</option>`;
    }).join('');
    if(current&&items.some(x=>x.dataset.nav===current))select.value=current;
    select.onchange=()=>{
      const button=list.querySelector(`[data-nav="${CSS.escape(select.value)}"]`);
      button?.click();
    };
    items.forEach(btn=>btn.addEventListener('click',()=>{if(select.value!==btn.dataset.nav)select.value=btn.dataset.nav;}));
  }

  function sync(){ensureBreadcrumb();buildMobileNav();}
  const observer=new MutationObserver(sync);
  function start(){
    sync();
    const app=document.getElementById('app');
    if(app)observer.observe(app,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
