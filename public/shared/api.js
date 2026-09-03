(function(global){
  'use strict';
  const ORIGIN=location.hostname==='ipass.i-pass-eval.workers.dev'?'':'https://ipass.i-pass-eval.workers.dev';
  const API_ORIGIN=new URL(ORIGIN||location.origin,location.origin).origin;
  const DEFAULT_TIMEOUT_MS=15000;

  async function timedFetch(url,options={},timeoutMs=DEFAULT_TIMEOUT_MS){
    const controller=new AbortController(),external=options.signal,timer=setTimeout(()=>controller.abort(),Math.max(1000,Number(timeoutMs)||DEFAULT_TIMEOUT_MS));
    const abort=()=>controller.abort();if(external){if(external.aborted)controller.abort();else external.addEventListener('abort',abort,{once:true})}
    try{return await fetch(url,{...options,signal:controller.signal})}
    catch(error){if(error?.name==='AbortError')throw makeError('요청 시간이 초과되었습니다. 처리 상태를 확인해 주세요.',0,'REQUEST_TIMEOUT',null,{cause:error});throw error}
    finally{clearTimeout(timer);external?.removeEventListener?.('abort',abort)}
  }

  function isTrustedApiUrl(url){try{return new URL(url,location.href).origin===API_ORIGIN}catch{return false}}

  function makeError(message,status,code,requestId,data){
    const error=new Error(message||`HTTP ${status||0}`);
    error.status=Number(status||0);
    error.code=code||null;
    error.requestId=requestId||null;
    error.data=data||null;
    error.isNetwork=error.status===0;
    error.isAuth=error.status===401;
    error.isForbidden=error.status===403;
    error.isServer=error.status>=500;
    return error;
  }

  async function parse(response){
    const contentType=response.headers.get('content-type')||'';
    if(contentType.includes('application/json'))return response.json().catch(()=>({}));
    const text=await response.text().catch(()=>'');
    return text?{message:text}:{};
  }

  function authFailed(error){
    if(error?.status!==401)return;
    try{global.EHSAuth?.clearSession()}catch(_){}
    try{sessionStorage.removeItem('ipass.session.v10')}catch(_){}
    const path=location.pathname+location.search;
    const protectedPath=location.pathname!=='/'&&location.pathname!=='/index.html';
    if(protectedPath){
      const safe=path.startsWith('/')&&!path.startsWith('//')?path:'/home';
      location.replace('/?next='+encodeURIComponent(safe));
    }
  }

  async function request(path,options={},retry=true){
    const url=/^https?:\/\//.test(path)?path:ORIGIN+path;
    const {timeoutMs,...fetchOptions}=options;
    const headers=new Headers(options.headers||{});
    headers.set('Accept',headers.get('Accept')||'application/json');
    const body=options.body;
    const isForm=typeof FormData!=='undefined'&&body instanceof FormData;
    if(body&&!isForm&&!headers.has('content-type'))headers.set('content-type','application/json');

    if(global.EHSAuth&&isTrustedApiUrl(url)){
      const session=global.EHSAuth.readSession();
      if(session){
        try{headers.set('Authorization','Bearer '+await global.EHSAuth.token())}
        catch(error){authFailed(error);throw error}
      }
    }

    let response;
    try{response=await timedFetch(url,{...fetchOptions,headers},timeoutMs||(isForm?60000:DEFAULT_TIMEOUT_MS))}
    catch(error){if(error?.code==='REQUEST_TIMEOUT')throw error;throw makeError('서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.',0,'NETWORK_ERROR',null,{cause:error})}

    const data=await parse(response);
    const requestId=response.headers.get('x-request-id')||data.request_id||null;

    if(response.status===401&&retry&&global.EHSAuth?.readSession()){
      try{
        await global.EHSAuth.refresh();
        return request(path,options,false);
      }catch(refreshError){
        authFailed(refreshError);
        throw refreshError;
      }
    }

    if(!response.ok){
      const message=data.error||data.message||`요청 처리 중 오류가 발생했습니다. (HTTP ${response.status})`;
      const error=makeError(message,response.status,data.code||data.error_code,requestId,data);
      authFailed(error);
      throw error;
    }
    return data;
  }

  async function authorizedBlob(path,retry=true){
    const url=/^https?:\/\//.test(path)?path:ORIGIN+path;
    const headers=new Headers();
    if(global.EHSAuth?.readSession()&&isTrustedApiUrl(url)){
      try{headers.set('Authorization','Bearer '+await global.EHSAuth.token())}
      catch(error){authFailed(error);throw error}
    }
    let response;
    try{response=await timedFetch(url,{headers},30000)}
    catch(error){if(error?.code==='REQUEST_TIMEOUT')throw error;throw makeError('파일 서버에 연결할 수 없습니다.',0,'NETWORK_ERROR')}
    if(response.status===401&&retry&&global.EHSAuth?.readSession()){
      try{await global.EHSAuth.refresh();return authorizedBlob(path,false)}catch(error){authFailed(error);throw error}
    }
    if(!response.ok){
      const data=await parse(response);const error=makeError(data.error||'파일을 다운로드할 수 없습니다.',response.status,data.code,response.headers.get('x-request-id'),data);authFailed(error);throw error;
    }
    return response.blob();
  }

  async function download(path,filename){
    const blob=await authorizedBlob(path);
    const objectUrl=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=objectUrl;a.download=filename||'download';document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(objectUrl),30000);
  }

  function describe(error){
    if(!error)return'알 수 없는 오류입니다.';
    const suffix=error.requestId?`\n요청 ID: ${error.requestId}`:'';
    if(error.status===0)return`서버 연결에 실패했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.${suffix}`;
    if(error.status===401)return`로그인 세션이 만료되었습니다. 다시 로그인해 주세요.${suffix}`;
    if(error.status===403)return`${error.message||'접근 권한이 없습니다.'}${suffix}`;
    if(error.status>=500)return`서버 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.${suffix}`;
    return`${error.message||'요청 처리 중 오류가 발생했습니다.'}${suffix}`;
  }

  global.EHSApi={ORIGIN,request,blob:authorizedBlob,download,describe,makeError};

  if(!document.querySelector('link[data-portal-home-v3]')){
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='/portal-home-v3.css?v=1';
    link.dataset.portalHomeV3='true';
    document.head.appendChild(link);
  }
  if(!document.querySelector('script[data-portal-home-v3]')){
    const script=document.createElement('script');
    script.src='/portal-home-v3.js?v=1';
    script.dataset.portalHomeV3='true';
    document.head.appendChild(script);
  }

  if(location.pathname.startsWith('/ipass')){
    if(!document.querySelector('link[data-ipass-ui-v2]')){
      const link=document.createElement('link');
      link.rel='stylesheet';
      link.href='/ipass-ui-v2.css?v=1';
      link.dataset.ipassUiV2='true';
      document.head.appendChild(link);
    }
    if(!document.querySelector('script[data-ipass-ui-v2]')){
      const script=document.createElement('script');
      script.src='/ipass-ui-v2.js?v=1';
      script.dataset.ipassUiV2='true';
      document.head.appendChild(script);
    }
  }
})(window);
