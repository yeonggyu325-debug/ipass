import app from './worker-v19.js';
import { handleSystemAdmin, recordRequestAudit } from './system-admin.js';
import { handleEvaluationScoring } from './evaluation-scoring.js';

function isApi(path){return path.startsWith('/api/')}
function requestId(request){
  const incoming=request.headers.get('x-request-id');
  if(incoming&&/^[A-Za-z0-9._:-]{8,100}$/.test(incoming))return incoming;
  return crypto.randomUUID();
}
function cors(headers){
  headers.set('access-control-allow-origin','*');
  headers.set('access-control-allow-headers','authorization,content-type,x-request-id');
  headers.set('access-control-allow-methods','GET,POST,PATCH,PUT,DELETE,OPTIONS');
}
function kstToday(){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const map=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}
function submissionState(target,storageAvailable){
  const today=kstToday(),start=String(target?.start_at||'').slice(0,10),end=String(target?.end_at||'').slice(0,10),active=target?.cycle_status==='active';
  let reason=null;
  if(!active)reason='평가회차가 진행중 상태가 아닙니다.';
  else if(start&&today<start)reason='평가 시작일 전입니다.';
  else if(end&&today>end)reason='평가기간이 종료되었습니다.';
  const editable=!reason;
  return {can_edit:editable,can_submit:editable,can_upload:editable&&storageAvailable,can_delete_file:editable,edit_reason:reason,today_kst:today};
}
async function augmentSubmission(response,path,env){
  if(!response.ok||!/^\/api\/partner\/submission\/[^/]+$/.test(path))return response;
  const type=response.headers.get('content-type')||'';if(!type.includes('application/json'))return response;
  const data=await response.clone().json().catch(()=>null);if(!data?.success||!data.workspace?.target)return response;
  data.capabilities={...(data.capabilities||{}),...submissionState(data.workspace.target,!!env.EVIDENCE_FILES)};
  const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('content-encoding');
  return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
}
async function attach(response,id,path){
  const headers=new Headers(response.headers);
  headers.set('x-request-id',id);
  if(isApi(path))cors(headers);
  const type=headers.get('content-type')||'';
  if(isApi(path)&&type.includes('application/json')){
    const text=await response.text();
    let data;
    try{data=JSON.parse(text)}catch{return new Response(text,{status:response.status,statusText:response.statusText,headers})}
    if(data&&typeof data==='object'&&!Array.isArray(data)&&!data.request_id)data.request_id=id;
    headers.delete('content-length');headers.delete('content-encoding');
    return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
  }
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
function shouldAudit(method,path,status){
  if(!isApi(path))return false;
  if(method!=='GET'&&method!=='OPTIONS')return true;
  return status>=400;
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url),id=requestId(request),started=Date.now();
    if(request.method==='OPTIONS'&&isApi(url.pathname)){
      const headers=new Headers({'x-request-id':id});cors(headers);return new Response(null,{status:204,headers});
    }
    const nextHeaders=new Headers(request.headers);nextHeaders.set('x-request-id',id);
    const traced=new Request(request,{headers:nextHeaders});
    try{
      const systemResponse=await handleSystemAdmin(traced,env,ctx,app);
      const scoringResponse=systemResponse?null:await handleEvaluationScoring(traced,env,ctx,app);
      let raw=systemResponse||scoringResponse||await app.fetch(traced,env,ctx);
      if(request.method==='GET')raw=await augmentSubmission(raw,url.pathname,env);
      const response=await attach(raw,id,url.pathname);
      if(shouldAudit(request.method,url.pathname,response.status)){
        const task=recordRequestAudit(env,{requestId:id,method:request.method,path:url.pathname,status:response.status,durationMs:Date.now()-started});
        if(ctx?.waitUntil)ctx.waitUntil(task);else void task;
      }
      return response;
    }catch(error){
      console.error('unhandled request error',{request_id:id,path:url.pathname,method:request.method,error:error?.stack||String(error)});
      const task=recordRequestAudit(env,{requestId:id,method:request.method,path:url.pathname,status:500,durationMs:Date.now()-started});
      if(ctx?.waitUntil)ctx.waitUntil(task);else void task;
      if(!isApi(url.pathname))return new Response('서비스 처리 중 오류가 발생했습니다.',{status:500,headers:{'content-type':'text/plain;charset=utf-8','x-request-id':id}});
      const headers=new Headers({'content-type':'application/json;charset=utf-8','x-request-id':id});cors(headers);
      return new Response(JSON.stringify({success:false,error:'서버 처리 중 오류가 발생했습니다.',code:'UNHANDLED_SERVER_ERROR',request_id:id}),{status:500,headers});
    }
  }
};
