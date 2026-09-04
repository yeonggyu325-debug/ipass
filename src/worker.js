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
import { handlePortalShellApi } from './portal-shell-api.js';
import { createRequestMetrics, finalizeRequestMetrics, handlePerformanceRum, instrumentEnvironment } from './performance.js';

const IPASS_PATHS=new Set(['/ipass','/ipass/','/ipass/evaluations','/ipass/templates','/ipass/cycles']);
const PROTECTED_PATHS=new Set(['/home','/committee','/education','/voc','/notices','/resources','/faq','/admin/approvals','/admin/accounts','/evaluation-management.html','/evaluation-cycle.html','/evaluation-submit.html','/evaluation-scoring.html']);
const COMMON_STYLE='<link rel="stylesheet" href="/ehs-common.css?v=11">';
const UI_FOUNDATION='<link rel="stylesheet" href="/ehs-ui-foundation.css?v=2">';
const PERFORMANCE_STYLE='<link rel="stylesheet" href="/performance-loading-v1.css?v=1">';
const TOOLBAR_STYLE='<link rel="stylesheet" href="/global-toolbar-v5.css?v=5" data-global-toolbar-v5="true">';
const PORTAL_SHELL_STYLE='<link rel="stylesheet" href="/portal-shell-v1.css?v=1">';
const COMMON_AUTH='<script src="/shared/auth.js?v=4"></script>';
const COMMON_API='<script src="/shared/api.js?v=6"></script>';
const COMMON_BEHAVIOR='<script src="/ehs-common.js?v=13"></script>';
const COMMON_PREVIEW='<script src="/attachment-preview.js?v=3"></script>';
const TOOLBAR_SCRIPT='<script src="/global-toolbar-v5.js?v=7" data-global-toolbar-v5="true"></script>';
const HOME_STYLE='<link rel="stylesheet" href="/portal-home-v3.css?v=4" data-portal-home-v3="true">';
const HOME_SCRIPT='<script src="/portal-home-v3.js?v=7" data-portal-home-v3="true"></script>';
const LOGIN_SCRIPT='<script src="/login-home-redirect.js?v=2" data-login-home-redirect="true"></script>';
const IPASS_STYLE='<link rel="stylesheet" href="/ipass-ui-v2.css?v=2" data-ipass-ui-v2="true">';
const IPASS_SCRIPT='<script src="/ipass-ui-v2.js?v=2" data-ipass-ui-v2="true"></script>';
const SUBMISSION_STYLE='<link rel="stylesheet" href="/evaluation-submit.css?v=1">';
const SUBMISSION_SCRIPT='<script src="/evaluation-submit-enhance.js?v=16"></script><script src="/evaluation-submit-nav-v2.js?v=2"></script>';
const RESOURCE_PREVIEW_V3_STYLE='<link rel="stylesheet" href="/resource-preview-v2.css?v=11"><link rel="stylesheet" href="/resource-preview-v3.css?v=11">';
const RESOURCE_PREVIEW_V3_SCRIPT='<script src="/resource-preview-v2.js?v=11"></script><script src="/resource-preview-v3.js?v=11"></script>'; 
const HOME_BOOT='<style id="ehs-home-boot">#publicPortal{display:none!important}</style><script id="ehs-home-session">try{if(!window.EHSAuth||!window.EHSAuth.readSession())window.EHSAuth?window.EHSAuth.redirectToLogin("/home"):location.replace("/?next=%2Fhome")}catch(_){location.replace("/?next=%2Fhome")}</script>';
const EMBED_STYLE='<style id="ipass-embedded-style">body{background:#f5f7f9!important}.header{display:none!important}.layout{min-height:100vh!important}.side{top:0!important;height:100vh!important}.main{padding-top:20px!important}.shell{padding-top:20px!important}.page-head{margin-top:0!important}</style>';
const ROOT_ROUTE_SCRIPT=`<script id="ipass-route-v24">(function(){var tries=0,t=setInterval(function(){try{if(typeof window.openPortalService==='function'&&!window.openPortalService.__ipassRouted){var original=window.openPortalService;var wrapped=function(service){var map={ipass:'/ipass',training:'/education',voc:'/voc',notices:'/notices',resources:'/resources'};if(map[service]){location.href=map[service];return}return original.apply(this,arguments)};wrapped.__ipassRouted=true;window.openPortalService=wrapped}}catch(_){}if(++tries>40)clearInterval(t)},200)})();</script>`;
const IPASS_GRADE_SCRIPT=`<script id="ipass-grade-v21">(function(){window.getAnnualGrade=function(score,complete,settings){if(complete===false||score==null)return{label:'산정 중',cls:'pending'};var s=settings||{},n=Number(score),excellent=Number(s.excellent_min==null?90:s.excellent_min),qualified=Number(s.qualified_min==null?70:s.qualified_min);if(n>=excellent)return{label:'안전관리 우수협력사',cls:'excellent'};if(n>=qualified)return{label:'적격 협력사',cls:'qualified'};return{label:'역량 강화 협력사',cls:'strengthen'}}})();</script>`;
const PARTNER_ROUTE_SCRIPT=`<script id="partner-eval-route-v21">(function(){var tries=0,t=setInterval(function(){try{if(typeof window.openEvaluation==='function'&&!window.openEvaluation.__partnerSubmissionWrapped){var original=window.openEvaluation;var wrapped=async function(id){try{var role=typeof currentUser!=='undefined'&&currentUser?currentUser.role:null;if(role==='partner'){location.href='/evaluation-submit.html?target='+encodeURIComponent(id);return}if(role==='admin'){location.href='/evaluation-scoring.html?target='+encodeURIComponent(id);return}}catch(_){}return original.apply(this,arguments)};wrapped.__partnerSubmissionWrapped=true;window.openEvaluation=wrapped}}catch(_){}if(++tries>40)clearInterval(t)},250)})();</script>`;

function isApi(path){return path.startsWith('/api/')}
function isProtected(path){return PROTECTED_PATHS.has(path)||IPASS_PATHS.has(path)}
function requestId(request){const incoming=request.headers.get('x-request-id');return incoming&&/^[A-Za-z0-9._:-]{8,100}$/.test(incoming)?incoming:crypto.randomUUID()}
function cors(headers){headers.set('access-control-allow-origin','*');headers.set('access-control-allow-headers','authorization,content-type,x-request-id');headers.set('access-control-allow-methods','GET,POST,PATCH,PUT,DELETE,OPTIONS')}
function rewriteRequest(request,path,{clearSearch=false}={}){const u=new URL(request.url);u.pathname=path;if(clearSearch)u.search='';return new Request(u.toString(),{method:request.method,headers:request.headers})}
function injectHead(html,content,marker){if(html.includes(marker))return html;return html.includes('</head>')?html.replace('</head>',content+'</head>'):content+html}
function injectBody(html,content,marker){if(html.includes(marker))return html;return html.includes('</body>')?html.replace('</body>',content+'</body>'):html+content}
function stripLegacyShared(html){return html
  .replace(/<script[^>]+src=["']\/shared\/auth\.js\?v=\d+["'][^>]*><\/script>/gi,'')
  .replace(/<script[^>]+src=["']\/shared\/api\.js\?v=\d+["'][^>]*><\/script>/gi,'')
  .replace(/<link[^>]+href=["']\/global-toolbar-v4\.css[^"']*["'][^>]*>/gi,'')
  .replace(/<script[^>]+src=["']\/global-toolbar-v4\.js[^"']*["'][^>]*><\/script>/gi,'');}
async function htmlResponse(response,html){const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('content-encoding');headers.set('content-type','text/html;charset=utf-8');headers.set('cache-control','no-store');return new Response(html,{status:response.status,statusText:response.statusText,headers})}
async function injectShared(response,{path='/',home=false,root=false,submission=false,embedded=false}={}){
  const type=response.headers.get('content-type')||'';if(!type.includes('text/html'))return response;let html=stripLegacyShared(await response.text());
  html=injectHead(html,COMMON_STYLE,'/ehs-common.css?v=11');
  html=injectHead(html,UI_FOUNDATION,'/ehs-ui-foundation.css?v=2');
  html=injectHead(html,PERFORMANCE_STYLE,'/performance-loading-v1.css?v=1');
  html=injectHead(html,COMMON_AUTH,'/shared/auth.js?v=4');
  html=injectHead(html,COMMON_API,'/shared/api.js?v=6');
  html=injectHead(html,COMMON_BEHAVIOR,'/ehs-common.js?v=13');
  html=injectHead(html,COMMON_PREVIEW,'/attachment-preview.js?v=3');
  if(isProtected(path)){
    html=injectHead(html,TOOLBAR_STYLE,'/global-toolbar-v5.css?v=5');
    html=injectHead(html,PORTAL_SHELL_STYLE,'/portal-shell-v1.css?v=1');
    html=injectBody(html,TOOLBAR_SCRIPT,'/global-toolbar-v5.js?v=7');
  }
  if(root){html=injectBody(html,LOGIN_SCRIPT,'/login-home-redirect.js?v=2');html=injectBody(html,ROOT_ROUTE_SCRIPT,'ipass-route-v24');html=injectBody(html,PARTNER_ROUTE_SCRIPT,'partner-eval-route-v21');html=injectBody(html,IPASS_GRADE_SCRIPT,'ipass-grade-v21')}
  if(home){html=injectHead(html,HOME_BOOT,'ehs-home-boot');html=injectHead(html,HOME_STYLE,'/portal-home-v3.css?v=4');html=injectBody(html,HOME_SCRIPT,'/portal-home-v3.js?v=7')}
  if(path.startsWith('/ipass')){html=injectHead(html,IPASS_STYLE,'/ipass-ui-v2.css?v=2');html=injectBody(html,IPASS_SCRIPT,'/ipass-ui-v2.js?v=2')}
  if(submission){html=injectHead(html,SUBMISSION_STYLE,'/evaluation-submit.css?v=1');html=injectBody(html,SUBMISSION_SCRIPT,'/evaluation-submit-enhance.js?v=16')}
  if(path==='/resources'){html=injectHead(html,RESOURCE_PREVIEW_V3_STYLE,'/resource-preview-v2.css?v=11');html=injectBody(html,RESOURCE_PREVIEW_V3_SCRIPT,'/resource-preview-v2.js?v=11')}
  if(embedded)html=injectHead(html,EMBED_STYLE,'ipass-embedded-style');
  return htmlResponse(response,html);
}

async function dispatch(request,env,ctx){
  const url=new URL(request.url),path=url.pathname;
  if(request.method==='OPTIONS'){const headers=new Headers();cors(headers);return new Response(null,{status:204,headers})}
  if(path==='/api/health')return new Response(JSON.stringify({success:true}),{headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store'}});
  let response;
  if(path.startsWith('/api/evaluations')||path.startsWith('/api/templates')||path.startsWith('/api/cycles'))response=await handleEvaluationManagement(request,env,ctx);
  else if(path.startsWith('/api/runtime'))response=await handleEvaluationRuntime(request,env,ctx);
  else if(path.startsWith('/api/partner-submission'))response=await handlePartnerSubmissionWithQuota(request,env,ctx);
  else if(path.startsWith('/api/storage-admin'))response=await handleStorageAdmin(request,env,ctx);
  else if(path.startsWith('/api/system-admin'))response=await handleSystemAdmin(request,env,ctx);
  else if(path.startsWith('/api/evaluation-scoring'))response=await handleEvaluationScoring(request,env,ctx);
  else if(path.startsWith('/api/education'))response=await handleEducationSubmission(request,env,ctx);
  else if(path.startsWith('/api/voc'))response=await handleVocSubmission(request,env,ctx);
  else if(path.startsWith('/api/portal-content'))response=await handlePortalContent(request,env,ctx);
  else if(path.startsWith('/api/portal-shell'))response=await handlePortalShellApi(request,env,ctx);
  else response=await baseWorker.fetch(request,env,ctx);
  if(isApi(path)){const headers=new Headers(response.headers);cors(headers);headers.set('x-request-id',requestId(request));return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}
  return injectShared(response,{path,home:path==='/home',root:path==='/',submission:path==='/evaluation-submit.html',embedded:url.searchParams.get('embed')==='1'});
}

export default {
  async fetch(request,env,ctx){
    const metrics=createRequestMetrics(request);
    const instrumentedEnv=instrumentEnvironment(env,metrics);
    try{
      const response=await dispatch(request,instrumentedEnv,ctx);
      finalizeRequestMetrics(ctx,metrics,response.status);
      return response;
    }catch(error){
      recordRequestAudit?.(ctx,env,{request,error});
      finalizeRequestMetrics(ctx,metrics,500,error);
      throw error;
    }
  }
};