(function(global){
  'use strict';
  const SESSION_KEY='ipass.session.v10';
  const FIREBASE_API_KEY='AIzaSyC0s7buQaayKr84QA_wFNyF6rcs6w1-IoU';
  let refreshPromise=null;

  function readSession(){
    try{
      const raw=sessionStorage.getItem(SESSION_KEY);
      if(!raw)return null;
      const session=JSON.parse(raw);
      return session&&session.idToken?session:null;
    }catch{return null}
  }
  function writeSession(session){
    if(!session){sessionStorage.removeItem(SESSION_KEY);return null}
    sessionStorage.setItem(SESSION_KEY,JSON.stringify(session));
    return session;
  }
  function clearSession(){sessionStorage.removeItem(SESSION_KEY)}
  function currentPath(){return location.pathname+location.search+location.hash}
  function loginUrl(next=currentPath()){
    const safe=String(next||'').startsWith('/')?String(next):'/home';
    return '/?next='+encodeURIComponent(safe);
  }
  function redirectToLogin(next=currentPath()){location.replace(loginUrl(next))}

  async function refresh(){
    if(refreshPromise)return refreshPromise;
    refreshPromise=(async()=>{
      const session=readSession();
      if(!session?.refreshToken){clearSession();throw Object.assign(new Error('로그인 세션이 만료되었습니다.'),{status:401,code:'AUTH_SESSION_EXPIRED'})}
      const body=new URLSearchParams({grant_type:'refresh_token',refresh_token:session.refreshToken});
      let response;
      try{
        response=await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(FIREBASE_API_KEY)}`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});
      }catch(error){throw Object.assign(new Error('인증 서버 연결에 실패했습니다.'),{status:0,code:'AUTH_NETWORK_ERROR',cause:error})}
      const data=await response.json().catch(()=>({}));
      if(!response.ok){clearSession();throw Object.assign(new Error('로그인 세션이 만료되었습니다.'),{status:401,code:'AUTH_REFRESH_FAILED'})}
      const next={...session,idToken:data.id_token,refreshToken:data.refresh_token||session.refreshToken,expiresAt:Date.now()+Number(data.expires_in||3600)*1000};
      writeSession(next);
      return next;
    })().finally(()=>{refreshPromise=null});
    return refreshPromise;
  }

  async function token({forceRefresh=false}={}){
    let session=readSession();
    if(!session)throw Object.assign(new Error('로그인이 필요합니다.'),{status:401,code:'AUTH_REQUIRED'});
    const expiresAt=Number(session.expiresAt||0);
    if(forceRefresh||!session.idToken||(expiresAt&&Date.now()>expiresAt-60000))session=await refresh();
    return session.idToken;
  }

  function accountStateMessage(state){
    if(state==='pending_approval')return'가입 승인 대기중입니다.';
    if(state==='email_verification_required')return'이메일 인증이 필요합니다.';
    if(state==='suspended')return'사용 중지된 계정입니다.';
    return'사용할 수 없는 계정입니다.';
  }

  async function requireUser(options={}){
    const {role=null,redirect=true,next=currentPath()}=options;
    if(!readSession()){
      if(redirect)redirectToLogin(next);
      throw Object.assign(new Error('로그인이 필요합니다.'),{status:401,code:'AUTH_REQUIRED'});
    }
    if(!global.EHSApi?.request)throw new Error('공통 API 모듈이 초기화되지 않았습니다.');
    const me=await global.EHSApi.request('/api/me');
    if(me.auth_state!=='approved'){
      const error=Object.assign(new Error(accountStateMessage(me.auth_state)),{status:403,code:'ACCOUNT_NOT_APPROVED',auth_state:me.auth_state});
      if(me.auth_state==='suspended')clearSession();
      throw error;
    }
    if(role&&me.user?.role!==role)throw Object.assign(new Error('접근 권한이 없습니다.'),{status:403,code:'ROLE_FORBIDDEN'});
    return me.user;
  }

  function logout({redirect=true}={}){
    clearSession();
    if(redirect)location.replace('/');
  }

  global.EHSAuth={SESSION_KEY,readSession,writeSession,clearSession,refresh,token,requireUser,logout,loginUrl,redirectToLogin,currentPath};
})(window);
