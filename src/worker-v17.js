import baseWorker from './index.js';
import { handleEvaluationManagement } from './evaluation-management.js';

const EVALUATION_MANAGEMENT_MENU_SCRIPT = `<script>
(function(){
  function installEvaluationManagementMenu(){
    var menu=document.querySelector('#adminNavGroup .gnb-menu');
    if(!menu||menu.querySelector('[data-evaluation-template-management]')) return false;
    var button=document.createElement('button');
    button.type='button';
    button.setAttribute('data-evaluation-template-management','1');
    button.textContent='평가표 관리';
    button.addEventListener('click',function(){location.href='/evaluation-management.html';});
    var firstDivider=menu.querySelector('.menu-divider');
    if(firstDivider) menu.insertBefore(button,firstDivider);
    else menu.appendChild(button);
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

function injectAdminMenu(response) {
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) return response;
  return response.text().then(html => {
    if (html.includes('data-evaluation-template-management')) return response;
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
  });
}

export default {
  async fetch(request, env, ctx) {
    const handled = await handleEvaluationManagement(request, env, ctx, baseWorker);
    if (handled) return handled;

    const response = await baseWorker.fetch(request, env, ctx);
    const url = new URL(request.url);
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      return injectAdminMenu(response);
    }
    return response;
  }
};
