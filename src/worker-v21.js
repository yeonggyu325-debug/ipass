import mainWorker from './worker-v20.js';
import { handlePortalShellApi } from './portal-shell-api.js';

const API_TAG='<script src="/shared/api.js?v=4"></script>';
const TOOLBAR_TAG='<script src="/global-toolbar-v5.js?v=6" data-global-toolbar-v5="true"></script>';
const HOME_TAG='<script src="/portal-home-v3.js?v=6" data-portal-home-v3="true"></script>';

async function pinFreshUiAssets(response,path){
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html'))return response;
  let html=await response.text();
  if(html.includes(API_TAG)){
    const extra=TOOLBAR_TAG+(path==='/home'?HOME_TAG:'');
    html=html.replace(API_TAG,extra+API_TAG);
  }
  const headers=new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.set('cache-control','no-store');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const shell=await handlePortalShellApi(request,env,ctx,mainWorker);
    if(shell)return shell;
    const response=await mainWorker.fetch(request,env,ctx);
    if(request.method!=='GET')return response;
    return pinFreshUiAssets(response,new URL(request.url).pathname);
  }
};
