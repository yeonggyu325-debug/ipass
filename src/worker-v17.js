import baseWorker from './index.js';
import { handleEvaluationManagement } from './evaluation-management.js';
import { handleEvaluationRuntime } from './evaluation-runtime.js';
import { handlePartnerSubmissionWithQuota } from './partner-submission-quota.js';
import { handleStorageAdmin } from './storage-admin.js';

const PORTAL_EXTENSION_SCRIPT = `<script>
(function(){
  function installAdminMenu(){
    var menu=document.querySelector('#adminNavGroup .gnb-menu');
    if(!menu||menu.querySelector('[data-evaluation-template-management]')) return false;
    var templateButton=document.createElement('button');
    templateButton.type='button';
    templateButton.setAttribute('data-evaluation-template-management','1');
    templateButton.textContent='평가표 관리';
    templateButton.addEventListener('click',function(){location.href='/evaluation-management.html';});
    var cycleButton=document.createElement('button');
    cycleButton.type='button';
    cycleButton.setAttribute('data-evaluation-cycle-management','1');
    cycleButton.textContent='평가회차 운영';
    cycleButton.addEventListener('click',function(){location.href='/evaluation-cycle.html';});
    var firstDivider=menu.querySelector('.menu-divider');
    if(firstDivider){menu.insertBefore(templateButton,firstDivider);menu.insertBefore(cycleButton,firstDivider);}
    else{menu.appendChild(templateButton);menu.appendChild(cycleButton);}
    return true;
  }
  function installPartnerEvaluationNavigation(){
    if(typeof window.openEvaluation!=='function'||window.openEvaluation.__partnerSubmissionWrapped) return false;
    var original=window.openEvaluation;
    var wrapped=async function(id){
      try{
        var isPartner=false,apiFn=null;
        try{isPartner=typeof currentUser!=='undefined'&&currentUser&&currentUser.role==='partner'}catch(_){}
        try{apiFn=typeof api==='function'?api:window.api}catch(_){apiFn=window.api}
        if(isPartner&&typeof apiFn==='function'){
          await apiFn('/api/partner/submission/'+encodeURIComponent(id));
          location.href='/evaluation-submit.html?target='+encodeURIComponent(id);
          return;
        }
      }catch(_){}
      return original.apply(this,arguments);
    };
    wrapped.__partnerSubmissionWrapped=true;
    window.openEvaluation=wrapped;
    return true;
  }
  function installAll(){installAdminMenu();installPartnerEvaluationNavigation();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installAll);else installAll();
  var tries=0,t=setInterval(function(){installAll();if(++tries>40)clearInterval(t);},250);
})();
</script>`;

const PORTAL_UI_INLINE = `<style id="portal-ui-v4">
#app{--v4-navy:#203746;--v4-blue:#276f9f;--v4-bg:#eef2f5;--v4-card:#fff;--v4-line:#dce4e9;--v4-muted:#7b8b96;background:var(--v4-bg)!important;min-height:100vh!important}
#app .app-header{height:76px!important;background:#fff!important;border-bottom:1px solid #d8e1e6!important;box-shadow:0 2px 9px rgba(27,47,61,.045)!important;backdrop-filter:none!important}
#app .app-header-inner{width:min(1420px,calc(100% - 56px))!important;gap:38px!important}
#app .app-brand img{height:34px!important}
#app .app-brand-name{font-size:15px!important;font-weight:800!important;color:#203746!important}
#app .app-brand-chip{height:24px!important;border-radius:6px!important;background:#e7f1f7!important;color:#25678f!important;font-weight:800!important}
#app .gnb{gap:6px!important}
#app .gnb-trigger,#app .gnb-home{height:42px!important;padding:0 15px!important;border-radius:7px!important;color:#556875!important;font-size:13px!important;font-weight:700!important}
#app .gnb-trigger:hover,#app .gnb-home:hover,#app .gnb-item.active>.gnb-trigger,#app .gnb-home.active{background:#eaf2f7!important;color:#205f89!important}
#app .header-icon-btn{width:40px!important;height:40px!important;border-radius:8px!important;border-color:#d9e2e7!important}
#app .user-avatar{width:34px!important;height:34px!important;border-radius:8px!important;background:#e8f0f5!important;color:#28698f!important}
#app .user-menu-btn{height:44px!important}
#app .gnb-menu,#app .user-dropdown{border-radius:10px!important;border-color:#dce4e9!important;box-shadow:0 14px 36px rgba(27,47,61,.13)!important}
#app main{width:min(1420px,calc(100% - 56px))!important;padding:42px 0 80px!important;background:transparent!important}
#app .page h1,#app .saas-home-head h1{font-size:30px!important;line-height:1.18!important;font-weight:820!important;color:#1e3341!important;letter-spacing:-.05em!important}
#app .home-eyebrow,#app .portal-home-kicker{font-size:10.5px!important;font-weight:800!important;letter-spacing:.1em!important;color:#688195!important}
#app .home-greeting,#app .page-header .meta,#app .sub{color:#7c8c97!important}
#app .saas-home-head,#app .page-header{margin-bottom:30px!important}
#app .home-section{margin-top:34px!important}
#app .section-head{margin-bottom:14px!important}
#app .section-head h2,#app .section-label{font-size:16px!important;font-weight:800!important;color:#29404f!important}
#app .section-head h2::before{content:''!important;display:inline-block!important;width:4px!important;height:16px!important;margin-right:9px!important;border-radius:2px!important;background:#3179a8!important;vertical-align:-2px!important}
#app .work-grid,#app .kpis{gap:14px!important}
#app .work-card,#app .kpi,#app .action-kpi,#app .committee-score-card{position:relative!important;border:1px solid var(--v4-line)!important;border-radius:14px!important;background:#fff!important;box-shadow:0 5px 18px rgba(28,48,62,.05)!important;overflow:hidden!important}
#app .work-card::before,#app .kpi::before,#app .action-kpi::before{content:''!important;position:absolute!important;left:0!important;right:0!important;top:0!important;height:3px!important;background:#dbe6ed!important}
#app .work-card.clickable::before{background:#4d8db7!important}
#app .work-card{min-height:142px!important;padding:23px 22px!important}
#app .work-card.clickable:hover{transform:translateY(-2px)!important;border-color:#b9cbd6!important;box-shadow:0 10px 28px rgba(28,48,62,.09)!important}
#app .work-label,#app .kpi .label,#app .action-kpi .label{font-size:11.5px!important;font-weight:750!important;color:#657986!important}
#app .work-value,#app .kpi .value,#app .action-kpi .value{font-weight:820!important;color:#1f3847!important}
#app .work-value{font-size:23px!important}
#app .work-meta{color:#8b99a2!important}
#app .service-panel{border:1px solid var(--v4-line)!important;border-radius:14px!important;box-shadow:0 5px 18px rgba(28,48,62,.05)!important;background:#fff!important;overflow:hidden!important}
#app .service-tile{min-height:124px!important;padding:22px 21px!important;background:#fff!important}
#app .service-tile:hover{background:#f5f8fa!important}
#app .service-icon{width:46px!important;height:46px!important;flex-basis:46px!important;border-radius:10px!important;background:#e8f2f7!important;color:#2a7098!important}
#app .service-text strong{font-size:14px!important;font-weight:780!important;color:#2b404d!important}
#app .service-text span{color:#8b98a1!important}
#app .card,#app .info,#app .item,#app .ipass-score-shell,#app .committee-list,#app .committee-editor,#app .committee-partner-list{border:1px solid var(--v4-line)!important;border-radius:14px!important;background:#fff!important;box-shadow:0 5px 18px rgba(28,48,62,.045)!important}
#app .card-title{min-height:60px!important;padding:0 22px!important;background:#f8fafb!important;color:#293f4d!important;font-size:14px!important;font-weight:800!important}
#app table th{padding:13px 16px!important;background:#eef3f6!important;color:#5e7482!important;font-size:11.5px!important;font-weight:800!important;border-bottom:1px solid #d8e1e6!important}
#app table td{padding:15px 16px!important;color:#3c5360!important;border-bottom:1px solid #e6ecef!important}
#app tbody tr:hover td{background:#f7fafb!important}
#app .btn{min-height:40px!important;padding:0 14px!important;border-radius:8px!important;border-color:#d2dde3!important;color:#4b6270!important;font-weight:720!important;background:#fff!important}
#app .btn:hover{background:#f1f5f7!important;border-color:#bccbd4!important}
#app .btn.primary-small,#app .btn.primary{background:#2877aa!important;border-color:#2877aa!important;color:#fff!important}
#app .btn.primary-small:hover,#app .btn.primary:hover{background:#226994!important}
#app .tag,#app .pill,#app .ipass-source,#app .committee-status-badge{border-radius:6px!important;font-weight:760!important}
#app .ipass-score-shell{overflow:hidden!important}
#app .ipass-score-top{min-height:170px!important;padding:30px!important;background:#fff!important}
#app .ipass-total-score{font-size:50px!important;font-weight:840!important;color:#17384c!important}
#app .ipass-formula{padding:19px 20px!important;background:#eef4f7!important;border:1px solid #dce5ea!important;border-radius:10px!important}
#app .ipass-metric{min-height:132px!important;padding:21px 19px!important;background:#fff!important}
#app .ipass-metric:hover{background:#f6f9fa!important}
#app .ipass-metric-value{font-size:24px!important;font-weight:800!important;color:#263f4e!important}
#app input,#app select,#app textarea{border-color:#d4dfe5!important;border-radius:8px!important;background:#fff!important}
#app input:focus,#app select:focus,#app textarea:focus{border-color:#74a5c2!important;box-shadow:0 0 0 3px rgba(45,117,164,.10)!important}
@media(max-width:900px){#app .app-header-inner,#app main{width:calc(100% - 32px)!important}#app main{padding-top:30px!important}}
@media(max-width:640px){#app .app-header{height:64px!important}#app .app-header-inner,#app main{width:calc(100% - 24px)!important}#app .page h1,#app .saas-home-head h1{font-size:24px!important}#app .work-card{min-height:120px!important;padding:17px!important}}
</style>`;

const SUBMISSION_UI_ASSETS = '<link rel="stylesheet" href="/evaluation-submit-enhance.css?v=2"><script src="/evaluation-submit-enhance.js?v=2"></script>';

async function injectHtml(response,content,marker){
  const type=response.headers.get('content-type')||'';if(!type.includes('text/html'))return response;
  const html=await response.text();
  const next=html.includes(marker)?html:(html.includes('</body>')?html.replace('</body>',`${content}</body>`):html+content);
  const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('content-encoding');
  return new Response(next,{status:response.status,statusText:response.statusText,headers});
}
async function injectPortalExtensions(response){return injectHtml(response,PORTAL_UI_INLINE+PORTAL_EXTENSION_SCRIPT,'portal-ui-v4')}
async function injectSubmissionExtensions(response){return injectHtml(response,SUBMISSION_UI_ASSETS,'evaluation-submit-enhance.js')}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const management = await handleEvaluationManagement(request, env, ctx, baseWorker);
    if (management) return management;

    const storageAdmin = await handleStorageAdmin(request, env, ctx, baseWorker);
    if (storageAdmin) return storageAdmin;

    const submission = await handlePartnerSubmissionWithQuota(request, env, ctx, baseWorker);
    if (submission) return submission;

    const runtime = await handleEvaluationRuntime(request, env, ctx, baseWorker);
    if (runtime) {
      if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) return injectPortalExtensions(runtime);
      return runtime;
    }

    const response = await baseWorker.fetch(request, env, ctx);
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) return injectPortalExtensions(response);
    if (request.method === 'GET' && url.pathname === '/evaluation-submit.html') return injectSubmissionExtensions(response);
    return response;
  }
};
