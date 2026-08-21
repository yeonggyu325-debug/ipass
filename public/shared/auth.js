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

  function firebaseMessage(code){
    const messages={
      EMAIL_NOT_FOUND:'등록되지 않은 이메일입니다.',
      INVALID_PASSWORD:'비밀번호가 올바르지 않습니다.',
      INVALID_LOGIN_CREDENTIALS:'이메일 또는 비밀번호가 올바르지 않습니다.',
      USER_DISABLED:'사용 중지된 계정입니다.',
      INVALID_EMAIL:'이메일 형식이 올바르지 않습니다.',
      TOO_MANY_ATTEMPTS_TRY_LATER:'로그인 시도가 너무 많습니다.'
    };
    return messages[code]||'로그인에 실패했습니다.';
  }

  async function signIn(email,password){
    let response;
    try{
      response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(FIREBASE_API_KEY)}`,{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({email:String(email||'').trim(),password:String(password||''),returnSecureToken:true})
      });
    }catch(error){
      throw Object.assign(new Error('인증 서버 연결에 실패했습니다.'),{status:0,code:'AUTH_NETWORK_ERROR',cause:error});
    }
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      const code=data?.error?.message||'AUTH_ERROR';
      throw Object.assign(new Error(firebaseMessage(code)),{status:401,code:'AUTH_SIGN_IN_FAILED',firebase_code:code});
    }
    const session={
      idToken:data.idToken,
      refreshToken:data.refreshToken,
      expiresAt:Date.now()+Number(data.expiresIn||3600)*1000,
      email:data.email,
      uid:data.localId
    };
    writeSession(session);
    return session;
  }

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

  global.EHSAuth={SESSION_KEY,readSession,writeSession,clearSession,signIn,refresh,token,requireUser,logout,loginUrl,redirectToLogin,currentPath};
})(window);
