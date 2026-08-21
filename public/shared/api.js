(function(global){
  'use strict';
  const ORIGIN=location.hostname==='ipass.i-pass-eval.workers.dev'?'':'https://ipass.i-pass-eval.workers.dev';

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

  async function request(path,options={},retry=true){
    const url=/^https?:\/\//.test(path)?path:ORIGIN+path;
    const headers=new Headers(options.headers||{});
    headers.set('Accept',headers.get('Accept')||'application/json');
    const body=options.body;
    const isForm=typeof FormData!=='undefined'&&body instanceof FormData;
    if(body&&!isForm&&!headers.has('content-type'))headers.set('content-type','application/json');

    if(global.EHSAuth){
      const session=global.EHSAuth.readSession();
      if(session){
        try{headers.set('Authorization','Bearer '+await global.EHSAuth.token())}
        catch(error){if(error.status===401)throw error}
      }
    }

    let response;
    try{response=await fetch(url,{...options,headers})}
    catch(error){throw makeError('서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.',0,'NETWORK_ERROR',null,{cause:error})}

    const data=await parse(response);
    const requestId=response.headers.get('x-request-id')||data.request_id||null;

    if(response.status===401&&retry&&global.EHSAuth?.readSession()){
      try{
        await global.EHSAuth.refresh();
        return request(path,options,false);
      }catch(refreshError){
        if(refreshError.status===401)global.EHSAuth.clearSession();
        throw refreshError;
      }
    }

    if(!response.ok){
      const message=data.error||data.message||`요청 처리 중 오류가 발생했습니다. (HTTP ${response.status})`;
      const error=makeError(message,response.status,data.code||data.error_code,requestId,data);
      if(response.status===401&&global.EHSAuth)global.EHSAuth.clearSession();
      throw error;
    }
    return data;
  }

  async function download(path,filename){
    const headers=new Headers();
    if(global.EHSAuth?.readSession())headers.set('Authorization','Bearer '+await global.EHSAuth.token());
    let response;
    try{response=await fetch(ORIGIN+path,{headers})}
    catch{throw makeError('파일 다운로드 서버에 연결할 수 없습니다.',0,'NETWORK_ERROR')}
    if(response.status===401&&global.EHSAuth?.readSession()){
      await global.EHSAuth.refresh();
      return download(path,filename);
    }
    if(!response.ok){
      const data=await parse(response);throw makeError(data.error||'파일을 다운로드할 수 없습니다.',response.status,data.code,response.headers.get('x-request-id'),data);
    }
    const blob=await response.blob();
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

  global.EHSApi={ORIGIN,request,download,describe,makeError};
})(window);
