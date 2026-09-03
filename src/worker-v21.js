import mainWorker from './worker-v20.js';
import { handlePortalShellApi } from './portal-shell-api.js';

export default {
  async fetch(request,env,ctx){
    const shell=await handlePortalShellApi(request,env,ctx,mainWorker);
    if(shell)return shell;
    return mainWorker.fetch(request,env,ctx);
  }
};
