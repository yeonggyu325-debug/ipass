import baseWorker from './index.js';
import { handleEvaluationManagement } from './evaluation-management.js';
import { handleEvaluationRuntime } from './evaluation-runtime.js';
import { handlePartnerSubmissionWithQuota } from './partner-submission-quota.js';

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
        if(window.currentUser&&window.currentUser.role==='partner'&&typeof window.api==='function'){
          await window.api('/api/partner/submission/'+encodeURIComponent(id));
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

async function injectPortalExtensions(response) {
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) return response;
  const html = await response.text();
  if (html.includes('__partnerSubmissionWrapped')) {
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
  const next = html.includes('</body>')
    ? html.replace('</body>', `${PORTAL_EXTENSION_SCRIPT}</body>`)
    : html + PORTAL_EXTENSION_SCRIPT;
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  return new Response(next, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default {
  async fetch(request, env, ctx) {
    const management = await handleEvaluationManagement(request, env, ctx, baseWorker);
    if (management) return management;

    const submission = await handlePartnerSubmissionWithQuota(request, env, ctx, baseWorker);
    if (submission) return submission;

    const runtime = await handleEvaluationRuntime(request, env, ctx, baseWorker);
    if (runtime) {
      const url = new URL(request.url);
      if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        return injectPortalExtensions(runtime);
      }
      return runtime;
    }

    const response = await baseWorker.fetch(request, env, ctx);
    const url = new URL(request.url);
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      return injectPortalExtensions(response);
    }
    return response;
  }
};
