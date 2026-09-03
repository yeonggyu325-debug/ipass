import baseWorker from './index.js';
import { handleEvaluationManagement } from './evaluation-management.js';
import { handleEvaluationRuntime } from './evaluation-runtime.js';
import { handleFastCycleStart } from './evaluation-cycle-fast.js';
import { reconcileTargetApplicability } from './applicability-engine.js';
import { handlePartnerSubmissionWithQuota } from './partner-submission-quota.js';
import { handleStorageAdmin } from './storage-admin.js';
import { handleSystemAdmin, recordRequestAudit } from './system-admin.js';
import { handleEvaluationScoring } from './evaluation-scoring.js';
import { handleEducationSubmission } from './education-submission.js';
import { handleVocSubmission } from './voc-submission.js';
import { handlePortalContent } from './portal-content.js';
import { handlePortalShellApi } from './portal-shell-api.js';
import { createRequestMetrics, finalizeRequestMetrics, handlePerformanceRum, instrumentEnvironment } from './performance.js';

const IPASS_SHELL_PATHS=new Set(['/ipass','/ipass/','/ipass/evaluations']);
const PROTECTED_PATHS=new Set([
  '/home','/committee','/education','/voc','/notices','/resources','/faq',
  '/admin/approvals','/admin/accounts','/admin/system',
  '/ipass','/ipass/','/ipass/evaluations','/ipass/templates','/ipass/cycles',
  '/evaluation-management.html','/evaluation-cycle.html','/evaluation-submit.html','/evaluation-scoring.html'
]);
const COMMON_STYLE='<link rel="stylesheet" href="/ehs-common.css?v=12">';
const UI_FOUNDATION='<link rel="stylesheet" href="/ehs-ui-foundation.css?v=2">';
const PERFORMANCE_STYLE='<link rel="stylesheet" href="/performance-loading-v1.css?v=1">';
const TOOLBAR_STYLE='<link rel="stylesheet" href="/global-toolbar-v5.css?v=5" data-global-toolbar-v5="true">';
const PORTAL_SHELL_STYLE='<link rel="stylesheet" href="/portal-shell-v1.css?v=1">';
const COMMON_AUTH='<script src="/shared/auth.js?v=5"></script>';
const COMMON_API='<script src="/shared/api.js?v=7"></script>';
const COMMON_BEHAVIOR='<script src="/ehs-common.js?v=14"></script>';
const COMMON_PREVIEW='<script src="/attachment-preview.js?v=4"></script>';
const TOOLBAR_SCRIPT='<script src="/global-toolbar-v5.js?v=8" data-global-toolbar-v5="true"></script>';
const HOME_STYLE='<link rel="stylesheet" href="/portal-home-v3.css?v=4" data-portal-home-v3="true">';
const HOME_SCRIPT='<script src="/portal-home-v3.js?v=8" data-portal-home-v3="true"></script>';
const LOGIN_SCRIPT='<script src="/login-home-redirect.js?v=3" data-login-home-redirect="true"></script>';
const IPASS_STYLE='<link rel="stylesheet" href="/ipass-ui-v2.css?v=2" data-ipass-ui-v2="true">';
const IPASS_SCRIPT='<script src="/ipass-ui-v2.js?v=3" data-ipass-ui-v2="true"></script>';
const SUBMISSION_STYLE='<link rel="stylesheet" href="/evaluation-submit.css?v=1">';
const SUBMISSION_SCRIPT='<script src="/evaluation-submit-enhance.js?v=17"></script><script src="/evaluation-submit-nav-v2.js?v=3"></script>';
const RESOURCE_PREVIEW_STYLE='<link rel="stylesheet" href="/resource-preview-v2.css?v=2" data-resource-preview-v2="true">';
const RESOURCE_PREVIEW_SCRIPT='<script src="/resource-preview-v2.js?v=2" data-resource-preview-v2="true"></script>';
const HOME_BOOT='<style id="ehs-home-boot">#publicPortal{display:none!important}</style><script id="ehs-home-session">try{if(!window.EHSAuth||!window.EHSAuth.readSession())window.EHSAuth?window.EHSAuth.redirectToLogin("/home"):location.replace("/?next=%2Fhome")}catch(_){location.replace("/?next=%2Fhome")}</script>';
const EMBED_STYLE='<style id="ipass-embedded-style">body{background:#f5f7f9!important}.header{display:none!important}.layout{min-height:100vh!important}.side{top:0!important;height:100vh!important}.main{padding-top:20px!important}.shell{padding-top:20px!important}.page-head{margin-top:0!important}</style>';
const IPASS_GRADE_SCRIPT=`<script id="ipass-grade-v22">(function(){window.getAnnualGrade=function(score,complete,settings){if(complete===false||score==null)return{label:'산정 중',cls:'pending'};var s=settings||{},n=Number(score),excellent=Number(s.excellent_min==null?90:s.excellent_min),qualified=Number(s.qualified_min==null?70:s.qualified_min);if(n>=excellent)return{label:'안전관리 우수협력사',cls:'excellent'};if(n>=qualified)return{label:'적격 협력사',cls:'qualified'};return{label:'역량 강화 협력사',cls:'strengthen'}}})();</script>`;

function isApi(path){return path.startsWith('/api/')}
function isProtected(path){return PROTECTED_PATHS.has(path)}
function requestId(request){const incoming=request.headers.get('x-request-id');return incoming&&/^[A-Za-z0-9._:-]{8,100}$/.test(incoming)?incoming:crypto.randomUUID()}
function rewriteRequest(request,path,{clearSearch=false}={}){const u=new URL(request.url);u.pathname=path;if(clearSearch)u.search='';return new Request(u.toString(),{method:request.method,headers:request.headers})}
function injectBeforeLast(html,content,marker,closingTag){
  if(html.includes(marker))return html;
  const index=html.toLowerCase().lastIndexOf(closingTag);
  if(index<0)return html+content;
  return html.slice(0,index)+content+html.slice(index);
}
function injectHead(html,content,marker){return injectBeforeLast(html,content,marker,'</head>')}
function injectBody(html,content,marker){return injectBeforeLast(html,content,marker,'</body>')}
function stripLegacyShared(html){return html
  .replace(/<script[^>]+src=["']\/shared\/auth\.js\?v=\d+["'][^>]*><\/script>/gi,'')
  .replace(/<script[^>]+src=["']\/shared\/api\.js\?v=\d+["'][^>]*><\/script>/gi,'')
  .replace(/<link[^>]+href=["']\/global-toolbar-v4\.css[^"']*["'][^>]*>/gi,'')
  .replace(/<script[^>]+src=["']\/global-toolbar-v4\.js[^"']*["'][^>]*><\/script>/gi,'')
  .replace(/<link[^>]+href=["']\/portal-home-refresh[^"']*["'][^>]*>/gi,'');
}
function contentSecurityPolicy(){return [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com",
  "frame-src 'self' blob: https://docs.google.com https://view.officeapps.live.com",
  "worker-src 'self' blob:",
  "media-src 'self' blob:"
].join('; ')}
function applySecurity(headers,type){
  headers.set('x-content-type-options','nosniff');
  headers.set('referrer-policy','strict-origin-when-cross-origin');
  headers.set('permissions-policy','camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  headers.set('cross-origin-opener-policy','same-origin');
  if(type.includes('text/html'))headers.set('content-security-policy',contentSecurityPolicy());
}
function clearCorsHeaders(headers){
  for(const name of ['access-control-allow-origin','access-control-allow-headers','access-control-allow-methods','access-control-allow-credentials','access-control-expose-headers'])headers.delete(name);
}
function applyCors(headers,request){
  const origin=request.headers.get('origin');
  if(!origin)return;
  const requestOrigin=new URL(request.url).origin;
  if(origin===requestOrigin||origin==='http://localhost:8787'||origin==='http://127.0.0.1:8787'){
    headers.set('access-control-allow-origin',origin);
    headers.set('vary','Origin');
    headers.set('access-control-allow-headers','authorization,content-type,x-request-id,x-edit-lease');
    headers.set('access-control-allow-methods','GET,POST,PATCH,PUT,DELETE,OPTIONS');
  }
}
async function htmlResponse(response,html){
  const headers=new Headers(response.headers);
  headers.delete('content-length');headers.delete('content-encoding');
  headers.set('content-type','text/html;charset=utf-8');headers.set('cache-control','no-store');
  applySecurity(headers,'text/html');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}
async function injectShared(response,{path='/',home=false,root=false,submission=false,embedded=false}={}){
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html'))return response;
  let html=stripLegacyShared(await response.text());
  html=injectHead(html,COMMON_STYLE,'/ehs-common.css?v=12');
  html=injectHead(html,UI_FOUNDATION,'/ehs-ui-foundation.css?v=2');
  html=injectHead(html,PERFORMANCE_STYLE,'/performance-loading-v1.css?v=1');
  html=injectHead(html,COMMON_AUTH,'/shared/auth.js?v=5');
  html=injectHead(html,COMMON_API,'/shared/api.js?v=7');
  html=injectHead(html,COMMON_BEHAVIOR,'/ehs-common.js?v=14');
  html=injectHead(html,COMMON_PREVIEW,'/attachment-preview.js?v=4');
  if(isProtected(path)){
    html=injectHead(html,TOOLBAR_STYLE,'/global-toolbar-v5.css?v=5');
    html=injectHead(html,PORTAL_SHELL_STYLE,'/portal-shell-v1.css?v=1');
    html=injectBody(html,TOOLBAR_SCRIPT,'/global-toolbar-v5.js?v=8');
  }
  if(root){
    html=injectBody(html,LOGIN_SCRIPT,'/login-home-redirect.js?v=3');
    html=injectBody(html,IPASS_GRADE_SCRIPT,'ipass-grade-v22');
  }
  if(home){
    html=injectHead(html,HOME_BOOT,'ehs-home-boot');
    html=injectHead(html,HOME_STYLE,'/portal-home-v3.css?v=4');
    html=injectBody(html,HOME_SCRIPT,'/portal-home-v3.js?v=8');
  }
  if(path.startsWith('/ipass')){
    html=injectHead(html,IPASS_STYLE,'/ipass-ui-v2.css?v=2');
    html=injectBody(html,IPASS_SCRIPT,'/ipass-ui-v2.js?v=3');
  }
  if(submission){
    html=injectHead(html,SUBMISSION_STYLE,'/evaluation-submit.css?v=1');
    html=injectBody(html,SUBMISSION_SCRIPT,'/evaluation-submit-enhance.js?v=17');
  }
  if(path==='/resources'){
    html=injectHead(html,RESOURCE_PREVIEW_STYLE,'/resource-preview-v2.css?v=2');
    html=injectBody(html,RESOURCE_PREVIEW_SCRIPT,'/resource-preview-v2.js?v=2');
  }
  if(embedded)html=injectHead(html,EMBED_STYLE,'ipass-embedded-style');
  return htmlResponse(response,html);
}
async function serveAsset(request,env,assetPath,options={}){
  const response=await env.ASSETS.fetch(rewriteRequest(request,assetPath,{clearSearch:true}));
  return response.ok?injectShared(response,{...options,path:new URL(request.url).pathname}):response;
}
function kstToday(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const map=Object.fromEntries(parts.map(p=>[p.type,p.value]));return `${map.year}-${map.month}-${map.day}`}
function submissionState(target,storageAvailable){
  const today=kstToday(),start=String(target?.start_at||'').slice(0,10),end=String(target?.end_at||'').slice(0,10),active=target?.cycle_status==='active';
  const leaseUntil=String(target?.edit_lease_expires_at||'');
  const validLease=leaseUntil&&Date.parse(leaseUntil)>Date.now();
  let reason=null;
  if(!active&&!validLease)reason='평가회차가 진행중 상태가 아닙니다.';
  else if(start&&today<start)reason='평가 시작일 전입니다.';
  else if(end&&today>end&&!validLease)reason='평가기간이 종료되었습니다.';
  const editable=!reason;
  return {can_edit:editable,can_submit:editable,can_upload:editable&&storageAvailable,can_delete_file:editable,edit_reason:reason,today_kst:today,edit_lease_expires_at:validLease?leaseUntil:null};
}
async function augmentSubmission(response,path,env){
  if(!response.ok||!/^\/api\/partner\/submission\/[^/]+$/.test(path))return response;
  const type=response.headers.get('content-type')||'';if(!type.includes('application/json'))return response;
  const data=await response.clone().json().catch(()=>null);if(!data?.success||!data.workspace?.target)return response;
  const state=submissionState(data.workspace.target,!!env.EVIDENCE_FILES);
  data.capabilities={...(data.capabilities||{}),...state,editable:state.can_edit};
  const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('content-encoding');
  return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
}
async function attach(response,id,path,request){
  const headers=new Headers(response.headers);headers.set('x-request-id',id);clearCorsHeaders(headers);
  if(isApi(path))applyCors(headers,request);
  const type=headers.get('content-type')||'';applySecurity(headers,type);
  if(isApi(path)&&type.includes('application/json')){
    const text=await response.text();let data;
    try{data=JSON.parse(text)}catch{return new Response(text,{status:response.status,statusText:response.statusText,headers})}
    if(data&&typeof data==='object'&&!Array.isArray(data)&&!data.request_id)data.request_id=id;
    headers.delete('content-length');headers.delete('content-encoding');
    return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
  }
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
function shouldAudit(method,path,status){if(!isApi(path)||path==='/api/performance/rum')return false;if(method!=='GET'&&method!=='OPTIONS')return true;return status>=400}

async function core(request,env,ctx){
  const url=new URL(request.url),path=url.pathname;
  const rum=await handlePerformanceRum(request,env);if(rum)return rum;
  const shell=await handlePortalShellApi(request,env,ctx,baseWorker);if(shell)return shell;

  if(request.method==='GET'&&IPASS_SHELL_PATHS.has(path))return serveAsset(request,env,'/ipass.html');
  if(request.method==='GET'&&path==='/ipass/templates')return serveAsset(request,env,'/evaluation-management.html');
  if(request.method==='GET'&&path==='/ipass/cycles')return serveAsset(request,env,'/evaluation-cycle.html');
  if(request.method==='GET'&&(path==='/admin/approvals'||path==='/admin/accounts'))return serveAsset(request,env,'/admin-accounts.html');
  if(request.method==='GET'&&path==='/admin/system')return serveAsset(request,env,'/admin-system.html');
  if(request.method==='GET'&&path==='/evaluation-scoring.html')return serveAsset(request,env,'/evaluation-scoring.html');
  if(request.method==='GET'&&path==='/evaluation-submit.html')return serveAsset(request,env,'/evaluation-submit.html',{submission:true});
  if(request.method==='GET'&&path==='/evaluation-cycle.html')return serveAsset(request,env,'/evaluation-cycle.html',{embedded:url.searchParams.get('embedded')==='1'});
  if(request.method==='GET'&&path==='/evaluation-management.html')return serveAsset(request,env,'/evaluation-management.html',{embedded:url.searchParams.get('embedded')==='1'});
  if(request.method==='GET'&&path==='/committee.html'){const next=new URL(request.url);next.pathname='/committee';return Response.redirect(next.toString(),302)}
  if(request.method==='GET'&&path==='/committee')return serveAsset(request,env,'/committee.html');
  if(request.method==='GET'&&path==='/education.html'){const next=new URL(request.url);next.pathname='/education';return Response.redirect(next.toString(),302)}
  if(request.method==='GET'&&path==='/education')return serveAsset(request,env,'/education.html');
  if(request.method==='GET'&&path==='/voc.html'){const next=new URL(request.url);next.pathname='/voc';return Response.redirect(next.toString(),302)}
  if(request.method==='GET'&&path==='/voc')return serveAsset(request,env,'/voc.html');
  if(request.method==='GET'&&path==='/notices')return serveAsset(request,env,'/content-hub.html');
  if(request.method==='GET'&&path==='/resources')return serveAsset(request,env,'/content-hub.html');
  if(request.method==='GET'&&path==='/faq.html'){const next=new URL(request.url);next.pathname='/faq';return Response.redirect(next.toString(),302)}
  if(request.method==='GET'&&path==='/faq')return serveAsset(request,env,'/faq.html');
  if(request.method==='GET'&&path==='/home'){
    const rootReq=rewriteRequest(request,'/');
    let response=await handleEvaluationRuntime(rootReq,env,ctx,baseWorker);
    if(!response)response=await baseWorker.fetch(rootReq,env,ctx);
    return injectShared(response,{path,home:true,root:false});
  }

  const fastCycleStart=await handleFastCycleStart(request,env,ctx,baseWorker);if(fastCycleStart)return fastCycleStart;
  const scoringTarget=path.match(/^\/api\/admin\/evaluation-scoring\/([^/]+)/);if(scoringTarget)await reconcileTargetApplicability(env,decodeURIComponent(scoringTarget[1]));
  const evaluationTarget=path.match(/^\/api\/evaluations\/([^/]+)$/);if(evaluationTarget&&request.method==='GET')await reconcileTargetApplicability(env,decodeURIComponent(evaluationTarget[1]));
  const system=await handleSystemAdmin(request,env,ctx,baseWorker);if(system)return system;
  const scoring=await handleEvaluationScoring(request,env,ctx,baseWorker);if(scoring)return scoring;
  const management=await handleEvaluationManagement(request,env,ctx,baseWorker);if(management)return management;
  const storage=await handleStorageAdmin(request,env,ctx,baseWorker);if(storage)return storage;
  const education=await handleEducationSubmission(request,env,ctx,baseWorker);if(education)return education;
  const voc=await handleVocSubmission(request,env,ctx,baseWorker);if(voc)return voc;
  const content=await handlePortalContent(request,env,ctx,baseWorker);if(content)return content;
  const submission=await handlePartnerSubmissionWithQuota(request,env,ctx,baseWorker);if(submission)return request.method==='GET'?augmentSubmission(submission,path,env):submission;
  const runtime=await handleEvaluationRuntime(request,env,ctx,baseWorker);
  if(runtime){if(request.method==='GET'&&(path==='/'||path==='/index.html'))return injectShared(runtime,{path,root:true});return runtime}
  const response=await baseWorker.fetch(request,env,ctx);
  if(request.method==='GET'&&(path==='/'||path==='/index.html'))return injectShared(response,{path,root:true});
  return response;
}

export { injectBeforeLast };
export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url),id=requestId(request),started=Date.now(),metrics=createRequestMetrics(request,id),measuredEnv=instrumentEnvironment(env,metrics);
    if(request.method==='OPTIONS'&&isApi(url.pathname)){
      const headers=new Headers({'x-request-id':id});applyCors(headers,request);applySecurity(headers,'');
      return new Response(null,{status:204,headers});
    }
    const headers=new Headers(request.headers);headers.set('x-request-id',id);
    const traced=new Request(request,{headers});
    try{
      const raw=await core(traced,measuredEnv,ctx);
      const response=await attach(raw,id,url.pathname,request);
      if(shouldAudit(request.method,url.pathname,response.status)){
        const task=recordRequestAudit(env,{requestId:id,method:request.method,path:url.pathname,status:response.status,durationMs:Date.now()-started});
        if(ctx?.waitUntil)ctx.waitUntil(task);else void task;
      }
      return finalizeRequestMetrics(metrics,response,env);
    }catch(error){
      console.error('unhandled request error',{request_id:id,path:url.pathname,method:request.method,error:error?.stack||String(error)});
      const task=recordRequestAudit(env,{requestId:id,method:request.method,path:url.pathname,status:500,durationMs:Date.now()-started});
      if(ctx?.waitUntil)ctx.waitUntil(task);else void task;
      let response;
      if(!isApi(url.pathname))response=new Response('서비스 처리 중 오류가 발생했습니다.',{status:500,headers:{'content-type':'text/plain;charset=utf-8','x-request-id':id}});
      else{
        const h=new Headers({'content-type':'application/json;charset=utf-8','x-request-id':id});applyCors(h,request);applySecurity(h,'application/json');
        response=new Response(JSON.stringify({success:false,error:'서버 처리 중 오류가 발생했습니다.',code:'UNHANDLED_SERVER_ERROR',request_id:id}),{status:500,headers:h});
      }
      return finalizeRequestMetrics(metrics,response,env);
    }
  }
};
