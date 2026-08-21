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

const SUBMISSION_UI_ASSETS = '<link rel="stylesheet" href="/evaluation-submit-enhance.css?v=2"><script src="/evaluation-submit-enhance.js?v=2"></script>';

async function injectHtml(response,content,marker){
  const type=response.headers.get('content-type')||'';if(!type.includes('text/html'))return response;
  const html=await response.text();
  const next=html.includes(marker)?html:(html.includes('</body>')?html.replace('</body>',`${content}</body>`):html+content);
  const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('content-encoding');
  return new Response(next,{status:response.status,statusText:response.statusText,headers});
}
async function injectPortalExtensions(response){return injectHtml(response,PORTAL_EXTENSION_SCRIPT,'__partnerSubmissionWrapped')}
async function injectSubmissionExtensions(response){return injectHtml(response,SUBMISSION_UI_ASSETS,'evaluation-submit-enhance.js')}

export default {
  async fetch(request, env, ctx) {
    const management = await handleEvaluationManagement(request, env, ctx, baseWorker);
    if (management) return management;

    const storageAdmin = await handleStorageAdmin(request, env, ctx, baseWorker);
    if (storageAdmin) return storageAdmin;

    const submission = await handlePartnerSubmissionWithQuota(request, env, ctx, baseWorker);
    if (submission) return submission;

    const runtime = await handleEvaluationRuntime(request, env, ctx, baseWorker);
    if (runtime) {
      const url = new URL(request.url);
      if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) return injectPortalExtensions(runtime);
      return runtime;
    }

    const response = await baseWorker.fetch(request, env, ctx);
    const url = new URL(request.url);
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) return injectPortalExtensions(response);
    if (request.method === 'GET' && url.pathname === '/evaluation-submit.html') return injectSubmissionExtensions(response);
    return response;
  }
};
