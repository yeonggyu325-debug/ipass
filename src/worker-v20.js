import baseWorker from './index.js';
import { handleEvaluationManagement } from './evaluation-management.js';
import { handleEvaluationRuntime } from './evaluation-runtime.js';
import { handlePartnerSubmissionWithQuota } from './partner-submission-quota.js';
import { handleStorageAdmin } from './storage-admin.js';
import { ensureEvaluationManagementSchema } from './evaluation-schema.js';
import { handleSystemAdmin, recordRequestAudit } from './system-admin.js';
import { handleEvaluationScoring } from './evaluation-scoring.js';

const IPASS_PATHS=new Set(['/ipass','/ipass/','/ipass/evaluations','/ipass/templates','/ipass/cycles']);
const COMMON_ASSETS='<link rel="stylesheet" href="/ehs-common.css?v=2"><script src="/shared/auth.js?v=1"></script><script src="/shared/api.js?v=1"></script><script src="/ehs-common.js?v=3"></script>';
const HOME_BOOT='<style id="ehs-home-boot">#publicPortal{display:none!important}</style><script id="ehs-home-session">try{const s=JSON.parse(sessionStorage.getItem("ipass.session.v10")||"null");if(!s||!s.idToken)location.replace("/?next=%2Fhome")}catch(_){location.replace("/?next=%2Fhome")}</script>';
const SUBMISSION_ASSETS='<link rel="stylesheet" href="/evaluation-submit-enhance.css?v=2"><script src="/evaluation-submit-enhance.js?v=3"></script>';
const EMBED_STYLE='<style id="ipass-embedded-style">body{background:#f5f7f9!important}.header{display:none!important}.layout{min-height:100vh!important}.side{top:0!important;height:100vh!important}.main{padding-top:20px!important}.shell{padding-top:20px!important}.page-head{margin-top:0!important}</style>';
const ROOT_ROUTE_SCRIPT=`<script id="ipass-route-v20">(function(){var tries=0,t=setInterval(function(){try{if(typeof window.openPortalService==='function'&&!window.openPortalService.__ipassRouted){var original=window.openPortalService;var wrapped=function(service){if(service==='ipass'){location.href='/ipass';return}return original.apply(this,arguments)};wrapped.__ipassRouted=true;window.openPortalService=wrapped}}catch(_){}if(++tries>40)clearInterval(t)},200);document.addEventListener('click',function(e){var b=e.target&&e.target.closest?e.target.closest('button'):null;if(!b)return;var text=(b.textContent||'').trim();if(text==='i-PaSS 관리'){e.preventDefault();e.stopImmediatePropagation();location.href='/ipass'}else if(text==='평가표 관리'){e.preventDefault();e.stopImmediatePropagation();location.href='/ipass/templates'}else if(text==='평가회차 운영'){e.preventDefault();e.stopImmediatePropagation();location.href='/ipass/cycles'}},true)})();</script>`;
const PARTNER_ROUTE_SCRIPT=`<script id="partner-eval-route-v20">(function(){var tries=0,t=setInterval(function(){try{if(typeof window.openEvaluation==='function'&&!window.openEvaluation.__partnerSubmissionWrapped){var original=window.openEvaluation;var wrapped=async function(id){try{var isPartner=typeof currentUser!=='undefined'&&currentUser&&currentUser.role==='partner';if(isPartner){location.href='/evaluation-submit.html?target='+encodeURIComponent(id);return}}catch(_){}return original.apply(this,arguments)};wrapped.__partnerSubmissionWrapped=true;window.openEvaluation=wrapped}}catch(_){}if(++tries>40)clearInterval(t)},250)})();</script>`;

function isApi(path){return path.startsWith('/api/')}
function requestId(request){const incoming=request.headers.get('x-request-id');return incoming&&/^[A-Za-z0-9._:-]{8,100}$/.test(incoming)?incoming:crypto.randomUUID()}
function cors(headers){headers.set('access-control-allow-origin','*');headers.set('access-control-allow-headers','authorization,content-type,x-request-id');headers.set('access-control-allow-methods','GET,POST,PATCH,PUT,DELETE,OPTIONS')}
function rewriteRequest(request,path,{clearSearch=false}={}){const u=new URL(request.url);u.pathname=path;if(clearSearch)u.search='';return new Request(u.toString(),{method:request.method,headers:request.headers})}
function injectHead(html,content,marker){if(html.includes(marker))return html;return html.includes('</head>')?html.replace('</head>',content+'</head>'):content+html}
function injectBody(html,content,marker){if(html.includes(marker))return html;return html.includes('</body>')?html.replace('</body>',content+'</body>'):html+content}
function stabilizeHome(html){
  const oldBoot='showLatestNotice("login");try{const raw=sessionStorage.getItem(SESSION_KEY);if(raw){session=JSON.parse(raw);const me=await api("/api/me");await routeAfterLogin(me)}}catch{logout()}})();';
  const newBoot='showLatestNotice("login");try{const raw=sessionStorage.getItem(SESSION_KEY);if(raw){session=JSON.parse(raw);const me=await (window.EHSApi?.request?window.EHSApi.request("/api/me"):api("/api/me"));await routeAfterLogin(me)}}catch(e){console.error("session restore failed",e);if(e&&e.status===401)logout();else{try{$("publicPortal").classList.add("hidden");$("app").classList.remove("hidden")}catch(_){}}}})();';
  if(html.includes(oldBoot))html=html.replace(oldBoot,newBoot);
  const oldRoute='showPage("portalHome");\n  loadPortalHome();\n  showLatestNotice("after_login");';
  const newRoute='showPage("portalHome");\n  loadPortalHome();\n  showLatestNotice("after_login");\n  try{const next=new URLSearchParams(location.search).get("next");if(next&&next.startsWith("/")&&!next.startsWith("//")&&next!=="/"&&next!=="/home"){location.replace(next);return}if(location.pathname==="/"||location.pathname==="/index.html")history.replaceState({},"","/home")}catch(_){}';
  if(html.includes(oldRoute))html=html.replace(oldRoute,newRoute);
  return html;
}
function stabilizeBusinessAuth(html){
  const pairs=[
    ["session=JSON.parse(sessionStorage.getItem(KEY)||'null');if(!session){location.replace('/index.html');return}buildYears();const me=await api('/api/me');","session=(window.EHSAuth?.readSession?window.EHSAuth.readSession():JSON.parse(sessionStorage.getItem(KEY)||'null'));if(!session){window.EHSAuth?.redirectToLogin(location.pathname+location.search);return}buildYears();const me=await (window.EHSApi?.request?window.EHSApi.request('/api/me'):api('/api/me'));"],
    ["session=JSON.parse(sessionStorage.getItem(KEY)||'null');if(!session){location.href='/';return}const me=await api('/api/me');","session=(window.EHSAuth?.readSession?window.EHSAuth.readSession():JSON.parse(sessionStorage.getItem(KEY)||'null'));if(!session){window.EHSAuth?.redirectToLogin(location.pathname+location.search);return}const me=await (window.EHSApi?.request?window.EHSApi.request('/api/me'):api('/api/me'));"],
    ["session=JSON.parse(sessionStorage.getItem(KEY)||'null');if(!session){location.replace('/');return}const me=await api('/api/me');","session=(window.EHSAuth?.readSession?window.EHSAuth.readSession():JSON.parse(sessionStorage.getItem(KEY)||'null'));if(!session){window.EHSAuth?.redirectToLogin(location.pathname+location.search);return}const me=await (window.EHSApi?.request?window.EHSApi.request('/api/me'):api('/api/me'));"],
    ["function goHome(){location.href='/'}","function goHome(){location.href='/home'}"],
    ["location.replace('/index.html')","location.replace('/home')"]
  ];for(const [from,to] of pairs)if(html.includes(from))html=html.replace(from,to);return html;
}
async function htmlResponse(response,html){const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('content-encoding');headers.set('content-type','text/html;charset=utf-8');headers.set('cache-control','no-store');return new Response(html,{status:response.status,statusText:response.statusText,headers})}
async function injectShared(response,{home=false,business=false,root=false,submission=false,embedded=false}={}){
  const type=response.headers.get('content-type')||'';if(!type.includes('text/html'))return response;let html=await response.text();
  html=stabilizeHome(html);if(business)html=stabilizeBusinessAuth(html);if(home)html=injectHead(html,HOME_BOOT,'ehs-home-boot');html=injectHead(html,COMMON_ASSETS,'/shared/auth.js?v=1');
  if(root){html=injectBody(html,ROOT_ROUTE_SCRIPT,'ipass-route-v20');html=injectBody(html,PARTNER_ROUTE_SCRIPT,'partner-eval-route-v20')}
  if(submission)html=injectBody(html,SUBMISSION_ASSETS,'evaluation-submit-enhance.js?v=3');if(embedded)html=injectHead(html,EMBED_STYLE,'ipass-embedded-style');return htmlResponse(response,html)
}
async function serveAsset(request,env,path,options={}){const response=await env.ASSETS.fetch(rewriteRequest(request,path,{clearSearch:true}));return response.ok?injectShared(response,options):response}
function needsEvaluationSchema(path){return path.startsWith('/api/admin/evaluation-management')||path.startsWith('/api/admin/evaluation-runtime')||path.startsWith('/api/admin/evaluation-scoring')||path==='/api/admin/dashboard-bundle'||path==='/api/cycles'||path==='/api/dashboard'||path==='/api/targets'||path==='/api/my/evaluations'||path.startsWith('/api/evaluations/')||path==='/api/annual-ipass'||path.startsWith('/api/admin/annual-ipass/')||path.startsWith('/api/partner/submission')}
function kstToday(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const map=Object.fromEntries(parts.map(p=>[p.type,p.value]));return `${map.year}-${map.month}-${map.day}`}
function submissionState(target,storageAvailable){const today=kstToday(),start=String(target?.start_at||'').slice(0,10),end=String(target?.end_at||'').slice(0,10),active=target?.cycle_status==='active';let reason=null;if(!active)reason='평가회차가 진행중 상태가 아닙니다.';else if(start&&today<start)reason='평가 시작일 전입니다.';else if(end&&today>end)reason='평가기간이 종료되었습니다.';const editable=!reason;return {can_edit:editable,can_submit:editable,can_upload:editable&&storageAvailable,can_delete_file:editable,edit_reason:reason,today_kst:today}}
async function augmentSubmission(response,path,env){if(!response.ok||!/^\/api\/partner\/submission\/[^/]+$/.test(path))return response;const type=response.headers.get('content-type')||'';if(!type.includes('application/json'))return response;const data=await response.clone().json().catch(()=>null);if(!data?.success||!data.workspace?.target)return response;data.capabilities={...(data.capabilities||{}),...submissionState(data.workspace.target,!!env.EVIDENCE_FILES)};const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('content-encoding');return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers})}
async function attach(response,id,path){const headers=new Headers(response.headers);headers.set('x-request-id',id);if(isApi(path))cors(headers);const type=headers.get('content-type')||'';if(isApi(path)&&type.includes('application/json')){const text=await response.text();let data;try{data=JSON.parse(text)}catch{return new Response(text,{status:response.status,statusText:response.statusText,headers})}if(data&&typeof data==='object'&&!Array.isArray(data)&&!data.request_id)data.request_id=id;headers.delete('content-length');headers.delete('content-encoding');return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers})}return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}
function shouldAudit(method,path,status){if(!isApi(path))return false;if(method!=='GET'&&method!=='OPTIONS')return true;return status>=400}

async function core(request,env,ctx){
  const url=new URL(request.url),path=url.pathname;
  if(request.method==='GET'&&IPASS_PATHS.has(path))return serveAsset(request,env,'/ipass.html',{business:true});
  if(request.method==='GET'&&path==='/committee')return serveAsset(request,env,'/committee.html',{business:true});
  if(request.method==='GET'&&path==='/home'){
    const rootReq=rewriteRequest(request,'/');let response=await handleEvaluationRuntime(rootReq,env,ctx,baseWorker);if(!response)response=await baseWorker.fetch(rootReq,env,ctx);return injectShared(response,{home:true,root:true});
  }
  if(needsEvaluationSchema(path)){try{await ensureEvaluationManagementSchema(env)}catch(error){console.error('evaluation schema init failed',error);return new Response(JSON.stringify({success:false,error:'평가 시스템 초기화 중 오류가 발생했습니다.',code:'EVALUATION_SCHEMA_INIT_FAILED'}),{status:503,headers:{'content-type':'application/json;charset=utf-8'}})}}
  const system=await handleSystemAdmin(request,env,ctx,baseWorker);if(system)return system;
  const scoring=await handleEvaluationScoring(request,env,ctx,baseWorker);if(scoring)return scoring;
  const management=await handleEvaluationManagement(request,env,ctx,baseWorker);if(management)return management;
  const storage=await handleStorageAdmin(request,env,ctx,baseWorker);if(storage)return storage;
  const submission=await handlePartnerSubmissionWithQuota(request,env,ctx,baseWorker);if(submission)return request.method==='GET'?augmentSubmission(submission,path,env):submission;
  const runtime=await handleEvaluationRuntime(request,env,ctx,baseWorker);if(runtime){if(request.method==='GET'&&(path==='/'||path==='/index.html'))return injectShared(runtime,{root:true});return runtime}
  const response=await baseWorker.fetch(request,env,ctx);
  if(request.method==='GET'&&(path==='/'||path==='/index.html'))return injectShared(response,{root:true});
  if(request.method==='GET'&&path==='/evaluation-submit.html')return injectShared(response,{business:true,submission:true});
  if(request.method==='GET'&&(path==='/evaluation-management.html'||path==='/evaluation-cycle.html'))return injectShared(response,{business:true,embedded:url.searchParams.get('embedded')==='1'});
  if(request.method==='GET'&&path==='/committee.html')return injectShared(response,{business:true});
  return response;
}

export default {async fetch(request,env,ctx){const url=new URL(request.url),id=requestId(request),started=Date.now();if(request.method==='OPTIONS'&&isApi(url.pathname)){const headers=new Headers({'x-request-id':id});cors(headers);return new Response(null,{status:204,headers})}const headers=new Headers(request.headers);headers.set('x-request-id',id);const traced=new Request(request,{headers});try{const raw=await core(traced,env,ctx);const response=await attach(raw,id,url.pathname);if(shouldAudit(request.method,url.pathname,response.status)){const task=recordRequestAudit(env,{requestId:id,method:request.method,path:url.pathname,status:response.status,durationMs:Date.now()-started});if(ctx?.waitUntil)ctx.waitUntil(task);else void task}return response}catch(error){console.error('unhandled request error',{request_id:id,path:url.pathname,method:request.method,error:error?.stack||String(error)});const task=recordRequestAudit(env,{requestId:id,method:request.method,path:url.pathname,status:500,durationMs:Date.now()-started});if(ctx?.waitUntil)ctx.waitUntil(task);else void task;if(!isApi(url.pathname))return new Response('서비스 처리 중 오류가 발생했습니다.',{status:500,headers:{'content-type':'text/plain;charset=utf-8','x-request-id':id}});const h=new Headers({'content-type':'application/json;charset=utf-8','x-request-id':id});cors(h);return new Response(JSON.stringify({success:false,error:'서버 처리 중 오류가 발생했습니다.',code:'UNHANDLED_SERVER_ERROR',request_id:id}),{status:500,headers:h})}}};
