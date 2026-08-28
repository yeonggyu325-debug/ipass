import baseWorker from './index.js';
import { handleEvaluationManagement } from './evaluation-management.js';
import { handleEvaluationRuntime } from './evaluation-runtime.js';
import { handlePartnerSubmissionWithQuota } from './partner-submission-quota.js';
import { handleStorageAdmin } from './storage-admin.js';
import { handleSystemAdmin, recordRequestAudit } from './system-admin.js';
import { handleEvaluationScoring } from './evaluation-scoring.js';
import { handleEducationSubmission } from './education-submission.js';
import { handleVocSubmission } from './voc-submission.js';
import { handlePortalContent } from './portal-content.js';
import { createRequestMetrics, finalizeRequestMetrics, handlePerformanceRum, instrumentEnvironment } from './performance.js';

const IPASS_PATHS=new Set(['/ipass','/ipass/','/ipass/evaluations','/ipass/templates','/ipass/cycles']);
const COMMON_STYLE='<link rel="stylesheet" href="/ehs-common.css?v=5">';
const COMMON_AUTH='<script src="/shared/auth.js?v=3"></script>';
const COMMON_API='<script src="/shared/api.js?v=3"></script>';
const COMMON_BEHAVIOR='<script src="/ehs-common.js?v=10"></script>';
const COMMON_PREVIEW='<script src="/attachment-preview.js?v=3"></script>';
const HOME_BOOT='<style id="ehs-home-boot">#publicPortal{display:none!important}</style><script id="ehs-home-session">try{if(!window.EHSAuth||!window.EHSAuth.readSession())window.EHSAuth?window.EHSAuth.redirectToLogin("/home"):location.replace("/?next=%2Fhome")}catch(_){location.replace("/?next=%2Fhome")}</script>';
const SUBMISSION_ASSETS='<link rel="stylesheet" href="/evaluation-submit-enhance.css?v=3"><link rel="stylesheet" href="/evaluation-submit-redesign.css?v=1"><link rel="stylesheet" href="/evaluation-submit-progress.css?v=2"><script src="/evaluation-submit-enhance.js?v=10"></script>';
const EMBED_STYLE='<style id="ipass-embedded-style">body{background:#f5f7f9!important}.header{display:none!important}.layout{min-height:100vh!important}.side{top:0!important;height:100vh!important}.main{padding-top:20px!important}.shell{padding-top:20px!important}.page-head{margin-top:0!important}</style>';
const ROOT_ROUTE_SCRIPT=`<script id="ipass-route-v23">(function(){var tries=0,t=setInterval(function(){try{if(typeof window.openPortalService==='function'&&!window.openPortalService.__ipassRouted){var original=window.openPortalService;var wrapped=function(service){if(service==='ipass'){location.href='/ipass';return}if(service==='training'){location.href='/education';return}if(service==='voc'){location.href='/voc';return}if(service==='notices'){location.href='/notices';return}if(service==='resources'){location.href='/resources';return}return original.apply(this,arguments)};wrapped.__ipassRouted=true;window.openPortalService=wrapped}}catch(_){}if(++tries>40)clearInterval(t)},200);document.addEventListener('click',function(e){var b=e.target&&e.target.closest?e.target.closest('button'):null;if(!b)return;var text=(b.textContent||'').trim();if(text==='i-PaSS 관리'){e.preventDefault();e.stopImmediatePropagation();location.href='/ipass'}else if(text==='평가표 관리'){e.preventDefault();e.stopImmediatePropagation();location.href='/ipass/templates'}else if(text==='평가회차 운영'){e.preventDefault();e.stopImmediatePropagation();location.href='/ipass/cycles'}else if(text.indexOf('안전보건협의체')>=0){e.preventDefault();e.stopImmediatePropagation();location.href='/committee'}else if(text.indexOf('교육 제출')>=0){e.preventDefault();e.stopImmediatePropagation();location.href='/education'}else if(text.indexOf('VOC')>=0){e.preventDefault();e.stopImmediatePropagation();location.href='/voc'}else if(text==='공지사항 관리'||text==='공지사항'){e.preventDefault();e.stopImmediatePropagation();location.href='/notices'}else if(text.indexOf('자료실')>=0){e.preventDefault();e.stopImmediatePropagation();location.href='/resources'}},true)})();</script>`;
const IPASS_GRADE_SCRIPT=`<script id="ipass-grade-v21">(function(){window.getAnnualGrade=function(score,complete,settings){if(complete===false||score==null)return{label:'산정 중',cls:'pending'};var s=settings||{},n=Number(score),excellent=Number(s.excellent_min==null?90:s.excellent_min),qualified=Number(s.qualified_min==null?70:s.qualified_min);if(n>=excellent)return{label:'안전관리 우수협력사',cls:'excellent'};if(n>=qualified)return{label:'적격 협력사',cls:'qualified'};return{label:'역량 강화 협력사',cls:'strengthen'}}})();</script>`;
const PARTNER_ROUTE_SCRIPT=`<script id="partner-eval-route-v20">(function(){var tries=0,t=setInterval(function(){try{if(typeof window.openEvaluation==='function'&&!window.openEvaluation.__partnerSubmissionWrapped){var original=window.openEvaluation;var wrapped=async function(id){try{var role=typeof currentUser!=='undefined'&&currentUser?currentUser.role:null;if(role==='partner'){location.href='/evaluation-submit.html?target='+encodeURIComponent(id);return}if(role==='admin'){location.href='/evaluation-scoring.html?target='+encodeURIComponent(id);return}}catch(_){}return original.apply(this,arguments)};wrapped.__partnerSubmissionWrapped=true;window.openEvaluation=wrapped}}catch(_){}if(++tries>40)clearInterval(t)},250)})();</script>`;

function isApi(path){return path.startsWith('/api/')}
function requestId(request){const incoming=request.headers.get('x-request-id');return incoming&&/^[A-Za-z0-9._:-]{8,100}$/.test(incoming)?incoming:crypto.randomUUID()}
function cors(headers){headers.set('access-control-allow-origin','*');headers.set('access-control-allow-headers','authorization,content-type,x-request-id');headers.set('access-control-allow-methods','GET,POST,PATCH,PUT,DELETE,OPTIONS')}
function rewriteRequest(request,path,{clearSearch=false}={}){const u=new URL(request.url);u.pathname=path;if(clearSearch)u.search='';return new Request(u.toString(),{method:request.method,headers:request.headers})}
function injectHead(html,content,marker){if(html.includes(marker))return html;return html.includes('</head>')?html.replace('</head>',content+'</head>'):content+html}
function injectBody(html,content,marker){if(html.includes(marker))return html;return html.includes('</body>')?html.replace('</body>',content+'</body>'):html+content}
async function htmlResponse(response,html){const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('content-encoding');headers.set('content-type','text/html;charset=utf-8');headers.set('cache-control','no-store');return new Response(html,{status:response.status,statusText:response.statusText,headers})}
async function injectShared(response,{home=false,root=false,submission=false,embedded=false}={}){
  const type=response.headers.get('content-type')||'';if(!type.includes('text/html'))return response;let html=await response.text();
  html=injectHead(html,COMMON_STYLE,'/ehs-common.css?v=5');
  html=injectHead(html,COMMON_AUTH,'/shared/auth.js?v=3');
  html=injectHead(html,COMMON_API,'/shared/api.js?v=3');
  html=injectHead(html,COMMON_BEHAVIOR,'/ehs-common.js?v=10');
  html=injectHead(html,COMMON_PREVIEW,'/attachment-preview.js?v=3');
  if(home)html=injectHead(html,HOME_BOOT,'ehs-home-boot');
  if(root){html=injectBody(html,ROOT_ROUTE_SCRIPT,'ipass-route-v23');html=injectBody(html,PARTNER_ROUTE_SCRIPT,'partner-eval-route-v20');html=injectBody(html,IPASS_GRADE_SCRIPT,'ipass-grade-v21')}
  if(submission)html=injectBody(html,SUBMISSION_ASSETS,'evaluation-submit-enhance.js?v=10');if(embedded)html=injectHead(html,EMBED_STYLE,'ipass-embedded-style');return htmlResponse(response,html)
}
async function serveAsset(request,env,path,options={}){const response=await env.ASSETS.fetch(rewriteRequest(request,path,{clearSearch:true}));return response.ok?injectShared(response,options):response}
function kstToday(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const map=Object.fromEntries(parts.map(p=>[p.type,p.value]));return `${map.year}-${map.month}-${map.day}`}
function submissionState(target,storageAvailable){const today=kstToday(),start=String(target?.start_at||'').slice(0,10),end=String(target?.end_at||'').slice(0,10),active=target?.cycle_status==='active';let reason=null;if(!active)reason='평가회차가 진행중 상태가 아닙니다.';else if(start&&today<start)reason='평가 시작일 전입니다.';else if(end&&today>end)reason='평가기간이 종료되었습니다.';const editable=!reason;return {can_edit:editable,can_submit:editable,can_upload:editable&&storageAvailable,can_delete_file:editable,edit_reason:reason,today_kst:today}}
async function augmentSubmission(response,path,env){if(!response.ok||!/^\/api\/partner\/submission\/[^/]+$/.test(path))return response;const type=response.headers.get('content-type')||'';if(!type.includes('application/json'))return response;const data=await response.clone().json().catch(()=>null);if(!data?.success||!data.workspace?.target)return response;const state=submissionState(data.workspace.target,!!env.EVIDENCE_FILES);data.capabilities={...(data.capabilities||{}),...state,editable:state.can_edit};const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('content-encoding');return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers})}
async function attach(response,id,path){const headers=new Headers(response.headers);headers.set('x-request-id',id);if(isApi(path))cors(headers);const type=headers.get('content-type')||'';if(isApi(path)&&type.includes('application/json')){const text=await response.text();let data;try{data=JSON.parse(text)}catch{return new Response(text,{status:response.status,statusText:response.statusText,headers})}if(data&&typeof data==='object'&&!Array.isArray(data)&&!data.request_id)data.request_id=id;headers.delete('content-length');headers.delete('content-encoding');return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers})}return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}
function shouldAudit(method,path,status){if(!isApi(path)||path==='/api/performance/rum')return false;if(method!=='GET'&&method!=='OPTIONS')return true;return status>=400}

async function core(request,env,ctx){
  const url=new URL(request.url),path=url.pathname;
  const rum=await handlePerformanceRum(request,env);if(rum)return rum;
  if(request.method==='GET'&&IPASS_PATHS.has(path))return serveAsset(request,env,'/ipass.html');
  if(request.method==='GET'&&path==='/evaluation-scoring.html')return serveAsset(request,env,'/evaluation-scoring.html');
  if(request.method==='GET'&&path==='/evaluation-submit.html')return serveAsset(request,env,'/evaluation-submit.html',{submission:true});
  if(request.method==='GET'&&path==='/evaluation-cycle.html')return serveAsset(request,env,'/evaluation-cycle.html',{embedded:url.searchParams.get('embedded')==='1'});
  if(request.method==='GET'&&path==='/committee.html'){const next=new URL(request.url);next.pathname='/committee';return Response.redirect(next.toString(),302)}
  if(request.method==='GET'&&path==='/committee')return serveAsset(request,env,'/committee.html');
  if(request.method==='GET'&&path==='/education.html'){const next=new URL(request.url);next.pathname='/education';return Response.redirect(next.toString(),302)}
  if(request.method==='GET'&&path==='/education')return serveAsset(request,env,'/education.html');
  if(request.method==='GET'&&path==='/voc.html'){const next=new URL(request.url);next.pathname='/voc';return Response.redirect(next.toString(),302)}
  if(request.method==='GET'&&path==='/voc')return serveAsset(request,env,'/voc.html');
  if(request.method==='GET'&&path==='/notices')return serveAsset(request,env,'/content-hub.html');
  if(request.method==='GET'&&path==='/resources')return serveAsset(request,env,'/content-hub.html');
  if(request.method==='GET'&&path==='/home'){
    const rootReq=rewriteRequest(request,'/');let response=await handleEvaluationRuntime(rootReq,env,ctx,baseWorker);if(!response)response=await baseWorker.fetch(rootReq,env,ctx);return injectShared(response,{home:true,root:true});
  }
  const system=await handleSystemAdmin(request,env,ctx,baseWorker);if(system)return system;
  const scoring=await handleEvaluationScoring(request,env,ctx,baseWorker);if(scoring)return scoring;
  const management=await handleEvaluationManagement(request,env,ctx,baseWorker);if(management)return management;
  const storage=await handleStorageAdmin(request,env,ctx,baseWorker);if(storage)return storage;
  const education=await handleEducationSubmission(request,env,ctx,baseWorker);if(education)return education;
  const voc=await handleVocSubmission(request,env,ctx,baseWorker);if(voc)return voc;
  const content=await handlePortalContent(request,env,ctx,baseWorker);if(content)return content;
  const submission=await handlePartnerSubmissionWithQuota(request,env,ctx,baseWorker);if(submission)return request.method==='GET'?augmentSubmission(submission,path,env):submission;
  const runtime=await handleEvaluationRuntime(request,env,ctx,baseWorker);if(runtime){if(request.method==='GET'&&(path==='/'||path==='/index.html'))return injectShared(runtime,{root:true});return runtime}
  const response=await baseWorker.fetch(request,env,ctx);
  if(request.method==='GET'&&(path==='/'||path==='/index.html'))return injectShared(response,{root:true});
  if(request.method==='GET'&&path==='/evaluation-management.html')return injectShared(response,{embedded:url.searchParams.get('embedded')==='1'});
  if(request.method==='GET'&&path==='/committee.html')return injectShared(response);
  if(request.method==='GET'&&path==='/education.html')return injectShared(response);
  if(request.method==='GET'&&path==='/voc.html')return injectShared(response);
  return response;
}

export default {async fetch(request,env,ctx){const url=new URL(request.url),id=requestId(request),started=Date.now(),metrics=createRequestMetrics(request,id),measuredEnv=instrumentEnvironment(env,metrics);if(request.method==='OPTIONS'&&isApi(url.pathname)){const headers=new Headers({'x-request-id':id});cors(headers);return new Response(null,{status:204,headers})}const headers=new Headers(request.headers);headers.set('x-request-id',id);const traced=new Request(request,{headers});try{const raw=await core(traced,measuredEnv,ctx);const response=await attach(raw,id,url.pathname);if(shouldAudit(request.method,url.pathname,response.status)){const task=recordRequestAudit(env,{requestId:id,method:request.method,path:url.pathname,status:response.status,durationMs:Date.now()-started});if(ctx?.waitUntil)ctx.waitUntil(task);else void task}return finalizeRequestMetrics(metrics,response,env)}catch(error){console.error('unhandled request error',{request_id:id,path:url.pathname,method:request.method,error:error?.stack||String(error)});const task=recordRequestAudit(env,{requestId:id,method:request.method,path:url.pathname,status:500,durationMs:Date.now()-started});if(ctx?.waitUntil)ctx.waitUntil(task);else void task;let response;if(!isApi(url.pathname))response=new Response('서비스 처리 중 오류가 발생했습니다.',{status:500,headers:{'content-type':'text/plain;charset=utf-8','x-request-id':id}});else{const h=new Headers({'content-type':'application/json;charset=utf-8','x-request-id':id});cors(h);response=new Response(JSON.stringify({success:false,error:'서버 처리 중 오류가 발생했습니다.',code:'UNHANDLED_SERVER_ERROR',request_id:id}),{status:500,headers:h})}return finalizeRequestMetrics(metrics,response,env)}}};
