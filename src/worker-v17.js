import baseWorker from './index.js';
import { handleEvaluationManagement } from './evaluation-management.js';
import { handleEvaluationRuntime } from './evaluation-runtime.js';

const EVALUATION_MANAGEMENT_MENU_SCRIPT = `<script>
(function(){
  function installEvaluationManagementMenu(){
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
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',function(){
      if(installEvaluationManagementMenu()) return;
      var observer=new MutationObserver(function(){if(installEvaluationManagementMenu()) observer.disconnect();});
      observer.observe(document.documentElement,{childList:true,subtree:true});
      setTimeout(function(){observer.disconnect();},10000);
    });
  }else if(!installEvaluationManagementMenu()){
    var observer=new MutationObserver(function(){if(installEvaluationManagementMenu()) observer.disconnect();});
    observer.observe(document.documentElement,{childList:true,subtree:true});
    setTimeout(function(){observer.disconnect();},10000);
  }
})();
</script>`;

async function injectAdminMenu(response) {
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) return response;
  const html = await response.text();
  if (html.includes('data-evaluation-template-management')) {
    return new Response(html,{status:response.status,statusText:response.statusText,headers:response.headers});
  }
  const next = html.includes('</body>')
    ? html.replace('</body>', `${EVALUATION_MANAGEMENT_MENU_SCRIPT}</body>`)
    : html + EVALUATION_MANAGEMENT_MENU_SCRIPT;
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

    const runtime = await handleEvaluationRuntime(request, env, ctx, baseWorker);
    if (runtime) {
      const url = new URL(request.url);
      if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        return injectAdminMenu(runtime);
      }
      return runtime;
    }

    const response = await baseWorker.fetch(request, env, ctx);
    const url = new URL(request.url);
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      return injectAdminMenu(response);
    }
    return response;
  }
};
