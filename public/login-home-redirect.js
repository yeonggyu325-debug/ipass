(function(){
  'use strict';
  if(location.pathname!=='/'&&location.pathname!=='/index.html')return;

  let done=false;
  let overlay=null;
  const style=document.createElement('style');
  style.id='ehs-login-transition-guard';
  style.textContent=`
    html.ehs-root-login #app{display:none!important;visibility:hidden!important}
    #ehsLoginConnecting{position:fixed;inset:0;z-index:9999;display:none;place-items:center;background:rgba(255,255,255,.96);font-family:"Pretendard Variable","Pretendard","Noto Sans KR",sans-serif}
    html.ehs-login-connecting #ehsLoginConnecting{display:grid}
    #ehsLoginConnecting .box{display:flex;flex-direction:column;align-items:center;gap:14px;color:#2e3b44;font-size:14px;font-weight:760;letter-spacing:-.02em}
    #ehsLoginConnecting .spinner{width:28px;height:28px;border:3px solid #e4ebef;border-top-color:#2878b5;border-radius:50%;animation:ehsLoginSpin .75s linear infinite}
    @keyframes ehsLoginSpin{to{transform:rotate(360deg)}}
  `;
  document.head.appendChild(style);
  document.documentElement.classList.add('ehs-root-login');

  function ensureOverlay(){
    if(overlay||!document.body)return overlay;
    overlay=document.createElement('div');overlay.id='ehsLoginConnecting';overlay.setAttribute('role','status');overlay.setAttribute('aria-live','polite');overlay.innerHTML='<div class="box"><span class="spinner" aria-hidden="true"></span><span>접속중입니다.</span></div>';document.body.appendChild(overlay);return overlay;
  }
  function showConnecting(){ensureOverlay();document.documentElement.classList.add('ehs-login-connecting')}
  function hideConnecting(){document.documentElement.classList.remove('ehs-login-connecting')}
  function normalizeUnavailableMessage(){
    const msg=document.getElementById('loginMessage');
    if(msg&&['사용 중지된 계정입니다.','사용할 수 없는 계정입니다.','등록되지 않은 이메일입니다.'].includes((msg.textContent||'').trim()))msg.textContent='사용할 수 없는 아이디입니다.';
    document.querySelectorAll('.modal-body,.action-message,[role="dialog"] p').forEach(el=>{const text=(el.textContent||'').trim();if(text==='사용 중지된 계정입니다.'||text==='사용할 수 없는 계정입니다.')el.textContent='사용할 수 없는 아이디입니다.'})
  }
  function approvedState(){const app=document.getElementById('app'),publicPortal=document.getElementById('publicPortal');return !!(app&&!app.classList.contains('hidden')&&(!publicPortal||publicPortal.classList.contains('hidden')))}
  function goHomeWhenApproved(){if(done||!approvedState())return;done=true;showConnecting();location.replace('/home')}
  function recoverFailedLogin(){if(done||approvedState())return;normalizeUnavailableMessage();const btn=document.getElementById('loginBtn'),msg=document.getElementById('loginMessage');if(btn&&!btn.disabled&&(msg?.textContent||'').trim())hideConnecting()}
  function boot(){ensureOverlay();const form=document.getElementById('loginForm'),app=document.getElementById('app'),publicPortal=document.getElementById('publicPortal');if(window.EHSAuth?.readSession?.())showConnecting();form?.addEventListener('submit',showConnecting,true);const observer=new MutationObserver(()=>{normalizeUnavailableMessage();goHomeWhenApproved();recoverFailedLogin()});if(app)observer.observe(app,{attributes:true,attributeFilter:['class']});if(publicPortal)observer.observe(publicPortal,{attributes:true,attributeFilter:['class']});const btn=document.getElementById('loginBtn');if(btn)observer.observe(btn,{attributes:true,attributeFilter:['disabled']});const msg=document.getElementById('loginMessage');if(msg)observer.observe(msg,{childList:true,characterData:true,subtree:true});document.body&&observer.observe(document.body,{childList:true,subtree:true});document.addEventListener('ehs:user-ready',()=>setTimeout(goHomeWhenApproved,0));normalizeUnavailableMessage();goHomeWhenApproved()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();