(function(global){
  'use strict';

  const SAME_ORIGIN_API=location.hostname==='ipass.i-pass-eval.workers.dev'||location.hostname.endsWith('.workers.dev')||location.hostname==='localhost'||location.hostname==='127.0.0.1';
  const ORIGIN=SAME_ORIGIN_API?'':'https://ipass.i-pass-eval.workers.dev';
  const API_ORIGIN=new URL(ORIGIN||location.origin,location.origin).origin;
  const DEFAULT_TIMEOUT_MS=15000;
  const CACHE_PREFIX='ehs.api.v3:';
  const MAX_CACHE_CHARS=350000;
  const inflight=new Map();
  const memoryCache=new Map();

  async function timedFetch(url,options={},timeoutMs=DEFAULT_TIMEOUT_MS){
    const controller=new AbortController(),external=options.signal;
    const timer=setTimeout(()=>controller.abort(),Math.max(1000,Number(timeoutMs)||DEFAULT_TIMEOUT_MS));
    const abort=()=>controller.abort();
    if(external){if(external.aborted)controller.abort();else external.addEventListener('abort',abort,{once:true})}
    try{return await fetch(url,{...options,signal:controller.signal})}
    catch(error){
      if(error?.name==='AbortError')throw makeError('요청 시간이 초과되었습니다. 처리 상태를 확인해 주세요.',0,'REQUEST_TIMEOUT',null,{cause:error});
      throw error;
    }finally{clearTimeout(timer);external?.removeEventListener?.('abort',abort)}
  }
  function isTrustedApiUrl(url){try{return new URL(url,location.href).origin===API_ORIGIN}catch{return false}}
  function makeError(message,status,code,requestId,data){
    const error=new Error(message||`HTTP ${status||0}`);
    error.status=Number(status||0);error.code=code||null;error.requestId=requestId||null;error.data=data||null;
    error.isNetwork=error.status===0;error.isAuth=error.status===401;error.isForbidden=error.status===403;error.isServer=error.status>=500;
    return error;
  }
  async function parse(response){
    const contentType=response.headers.get('content-type')||'';
    if(contentType.includes('application/json'))return response.json().catch(()=>({}));
    const text=await response.text().catch(()=>'');return text?{message:text}:{};
  }
  function sessionUid(){try{return String(global.EHSAuth?.readSession?.()?.uid||'')}catch{return''}}
  function cacheKey(url){const u=new URL(url,location.href);return CACHE_PREFIX+(sessionUid()||'anon')+':'+u.pathname+u.search}

  function cachePolicy(url){
    let u;try{u=new URL(url,location.href)}catch{return null}
    if(u.origin!==API_ORIGIN)return null;
    const p=u.pathname;
    if(p==='/api/me')return{fresh:30000,stale:240000,tags:['auth','notifications']};
    if(p==='/api/notifications')return{fresh:10000,stale:60000,tags:['notifications']};
    if(p==='/api/admin/dashboard-bundle')return{fresh:15000,stale:90000,tags:['ipass']};
    if(p==='/api/my/evaluations'||p==='/api/annual-ipass')return{fresh:15000,stale:120000,tags:['ipass']};
    if(p.startsWith('/api/partner/submission/'))return{fresh:8000,stale:45000,tags:['ipass','submission']};
    if(p.startsWith('/api/admin/evaluation-scoring/'))return{fresh:6000,stale:30000,tags:['ipass','scoring']};
    if(p==='/api/committee')return{fresh:15000,stale:120000,tags:['committee','ipass']};
    if(p==='/api/education')return{fresh:15000,stale:120000,tags:['education']};
    if(p==='/api/voc')return{fresh:15000,stale:120000,tags:['voc']};
    if(p==='/api/content/notices')return{fresh:15000,stale:120000,tags:['notices']};
    if(p==='/api/content/resources')return{fresh:15000,stale:120000,tags:['resources']};
    if(p==='/api/admin/storage-status')return{fresh:30000,stale:180000,tags:['storage']};
    if(p.startsWith('/api/admin/system/'))return{fresh:5000,stale:30000,tags:['system']};
    return null;
  }
  function mutationTags(url){
    const p=new URL(url,location.href).pathname;
    if(p==='/api/notifications')return['notifications','auth'];
    if(p==='/api/profile/display-name')return['auth'];
    if(p.startsWith('/api/partner/submission/'))return['ipass','submission','scoring','notifications','auth','storage'];
    if(p.startsWith('/api/admin/evaluation-scoring/'))return['ipass','scoring','notifications','auth'];
    if(p.startsWith('/api/admin/evaluation-'))return['ipass','submission','scoring','notifications','auth'];
    if(p.startsWith('/api/admin/committee')||p==='/api/committee')return['committee','ipass','notifications','auth'];
    if(p.startsWith('/api/admin/education')||p==='/api/education')return['education','storage','notifications','auth'];
    if(p.startsWith('/api/admin/voc')||p==='/api/voc')return['voc','storage','notifications','auth'];
    if(p.includes('/content/notices'))return['notices','notifications','auth','storage'];
    if(p.includes('/content/resources')||p.includes('/content/files'))return['resources','storage'];
    if(p.startsWith('/api/admin/registrations'))return['auth','notifications'];
    return[];
  }
  function readStored(key){
    const memory=memoryCache.get(key);if(memory)return memory;
    try{const raw=sessionStorage.getItem(key);if(!raw)return null;const saved=JSON.parse(raw);memoryCache.set(key,saved);return saved}catch{return null}
  }
  function readCache(url,policy){
    if(!policy)return null;
    const key=cacheKey(url),saved=readStored(key);if(!saved)return null;
    const age=Date.now()-Number(saved.ts||0);
    if(age<=policy.fresh)return{state:'fresh',data:saved.data,key};
    if(age<=policy.stale)return{state:'stale',data:saved.data,key};
    memoryCache.delete(key);try{sessionStorage.removeItem(key)}catch(_){}
    return null;
  }
  function writeCache(url,data,policy){
    if(!policy)return;
    const key=cacheKey(url),saved={ts:Date.now(),data,tags:policy.tags||[]};memoryCache.set(key,saved);
    try{const raw=JSON.stringify(saved);if(raw.length<=MAX_CACHE_CHARS)sessionStorage.setItem(key,raw)}catch(_){}
  }
  function removeKey(key){memoryCache.delete(key);try{sessionStorage.removeItem(key)}catch(_){}}
  function invalidate(tags=[]){
    const wanted=new Set(Array.isArray(tags)?tags:[tags]);
    if(!wanted.size)return;
    for(const [key,value] of memoryCache)if((value.tags||[]).some(tag=>wanted.has(tag)))removeKey(key);
    try{
      for(let i=sessionStorage.length-1;i>=0;i--){
        const key=sessionStorage.key(i);if(!key?.startsWith(CACHE_PREFIX))continue;
        const value=readStored(key);if((value?.tags||[]).some(tag=>wanted.has(tag)))removeKey(key);
      }
    }catch(_){}
    try{document.dispatchEvent(new CustomEvent('ehs:api-invalidated',{detail:{tags:[...wanted]}}))}catch(_){}
  }
  function clearResponseCache(){
    memoryCache.clear();inflight.clear();
    try{for(let i=sessionStorage.length-1;i>=0;i--){const key=sessionStorage.key(i);if(key?.startsWith(CACHE_PREFIX))sessionStorage.removeItem(key)}}catch(_){}
  }
  function authFailed(error){
    if(error?.status!==401)return;
    clearResponseCache();try{global.EHSAuth?.clearSession()}catch(_){}
    try{sessionStorage.removeItem('ipass.session.v10')}catch(_){}
    const current=location.pathname+location.search;
    if(location.pathname!=='/'&&location.pathname!=='/index.html'){
      const safe=current.startsWith('/')&&!current.startsWith('//')?current:'/home';location.replace('/?next='+encodeURIComponent(safe));
    }
  }

  async function networkRequest(path,options={},retry=true){
    const url=/^https?:\/\//.test(path)?path:ORIGIN+path;
    const {timeoutMs,ehsNoCache,ehsCacheTtl,ehsStaleTtl,ehsCacheTags,ehsRevalidate,...fetchOptions}=options;
    const headers=new Headers(options.headers||{});headers.set('Accept',headers.get('Accept')||'application/json');
    const body=options.body,isForm=typeof FormData!=='undefined'&&body instanceof FormData;
    if(body&&!isForm&&!headers.has('content-type'))headers.set('content-type','application/json');
    if(global.EHSAuth&&isTrustedApiUrl(url)){
      const session=global.EHSAuth.readSession();
      if(session){try{headers.set('Authorization','Bearer '+await global.EHSAuth.token())}catch(error){authFailed(error);throw error}}
    }
    let response;
    try{response=await timedFetch(url,{...fetchOptions,headers},timeoutMs||(isForm?60000:DEFAULT_TIMEOUT_MS))}
    catch(error){if(error?.code==='REQUEST_TIMEOUT')throw error;throw makeError('서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.',0,'NETWORK_ERROR',null,{cause:error})}
    const data=await parse(response),requestId=response.headers.get('x-request-id')||data.request_id||null;
    if(response.status===401&&retry&&global.EHSAuth?.readSession()){
      try{await global.EHSAuth.refresh();return networkRequest(path,options,false)}catch(refreshError){authFailed(refreshError);throw refreshError}
    }
    if(!response.ok){
      const message=data.error||data.message||`요청 처리 중 오류가 발생했습니다. (HTTP ${response.status})`;
      const error=makeError(message,response.status,data.code||data.error_code,requestId,data);authFailed(error);throw error;
    }
    return data;
  }
  function emitUser(data){
    if(data?.auth_state!=='approved'||!data.user)return;
    global.__EHS_PAGE_USER=data.user;
    try{document.dispatchEvent(new CustomEvent('ehs:user-ready',{detail:data.user}))}catch(_){}
  }
  function effectivePolicy(url,options){
    const base=cachePolicy(url);if(!base)return null;
    return{
      fresh:Number(options.ehsCacheTtl??base.fresh),
      stale:Number(options.ehsStaleTtl??base.stale),
      tags:Array.isArray(options.ehsCacheTags)?options.ehsCacheTags:base.tags
    };
  }
  function revalidate(path,url,options,policy,key){
    const inflightKey=`GET:${key}`;if(inflight.has(inflightKey))return inflight.get(inflightKey);
    const run=networkRequest(path,{...options,ehsNoCache:true,ehsRevalidate:true}).then(data=>{
      writeCache(url,data,policy);
      if(new URL(url,location.href).pathname==='/api/me')emitUser(data);
      try{document.dispatchEvent(new CustomEvent('ehs:api-revalidated',{detail:{url:new URL(url,location.href).pathname,data}}))}catch(_){}
      return data;
    }).finally(()=>inflight.delete(inflightKey));
    inflight.set(inflightKey,run);return run;
  }
  async function request(path,options={},retry=true){
    const url=/^https?:\/\//.test(path)?path:ORIGIN+path,method=String(options.method||'GET').toUpperCase();
    const policy=effectivePolicy(url,options),useCache=method==='GET'&&!options.ehsNoCache&&policy&&policy.fresh>0&&isTrustedApiUrl(url);
    const key=cacheKey(url);
    if(useCache){
      const cached=readCache(url,policy);
      if(cached){
        if(new URL(url,location.href).pathname==='/api/me')emitUser(cached.data);
        if(cached.state==='stale')void revalidate(path,url,options,policy,key).catch(()=>{});
        return cached.data;
      }
    }
    const inflightKey=useCache?`GET:${key}`:null;
    if(inflightKey&&inflight.has(inflightKey))return inflight.get(inflightKey);
    const run=networkRequest(path,options,retry).then(data=>{
      if(method==='GET'){
        if(useCache)writeCache(url,data,policy);
        if(new URL(url,location.href).pathname==='/api/me')emitUser(data);
      }else invalidate(mutationTags(url));
      return data;
    }).finally(()=>{if(inflightKey)inflight.delete(inflightKey)});
    if(inflightKey)inflight.set(inflightKey,run);
    return run;
  }
  function prefetch(path,options={}){
    const url=/^https?:\/\//.test(path)?path:ORIGIN+path,policy=effectivePolicy(url,options);
    if(!policy||!global.EHSAuth?.readSession?.())return Promise.resolve(null);
    const cached=readCache(url,policy);if(cached?.state==='fresh')return Promise.resolve(cached.data);
    return revalidate(path,url,options,policy,cacheKey(url)).catch(()=>null);
  }
  function warmCurrentPage(){
    if(!global.EHSAuth?.readSession?.())return;
    const p=location.pathname,year=new Date().getFullYear();
    if(p==='/committee'||p==='/committee.html')prefetch(`/api/committee?year=${year}`);
    else if(p==='/education'||p==='/education.html')prefetch(`/api/education?year=${year}`);
    else if(p==='/voc'||p==='/voc.html')prefetch('/api/voc');
    else if(p==='/resources')prefetch('/api/content/resources?q=&category=');
    else if(p==='/notices')prefetch('/api/content/notices?q=');
    else if(p==='/ipass'||p==='/ipass/evaluations'){
      prefetch(`/api/annual-ipass?year=${year}`);prefetch('/api/my/evaluations');prefetch('/api/admin/dashboard-bundle');
    }
  }

  async function authorizedBlob(path,retry=true){
    const url=/^https?:\/\//.test(path)?path:ORIGIN+path,headers=new Headers();
    if(global.EHSAuth?.readSession()&&isTrustedApiUrl(url)){
      try{headers.set('Authorization','Bearer '+await global.EHSAuth.token())}catch(error){authFailed(error);throw error}
    }
    let response;
    try{response=await timedFetch(url,{headers},30000)}catch(error){if(error?.code==='REQUEST_TIMEOUT')throw error;throw makeError('파일 서버에 연결할 수 없습니다.',0,'NETWORK_ERROR')}
    if(response.status===401&&retry&&global.EHSAuth?.readSession()){
      try{await global.EHSAuth.refresh();return authorizedBlob(path,false)}catch(error){authFailed(error);throw error}
    }
    if(!response.ok){const data=await parse(response),error=makeError(data.error||'파일을 다운로드할 수 없습니다.',response.status,data.code,response.headers.get('x-request-id'),data);authFailed(error);throw error}
    return response.blob();
  }
  async function download(path,filename){
    const blob=await authorizedBlob(path),objectUrl=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=objectUrl;a.download=filename||'download';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),30000);
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

  global.EHSApi={ORIGIN,request,prefetch,invalidate,clearCache:clearResponseCache,blob:authorizedBlob,download,describe,makeError};
  if(global.EHSAuth?.readSession?.()){request('/api/me').catch(()=>{});warmCurrentPage()}
})(window);
