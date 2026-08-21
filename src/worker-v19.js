import innerWorker from './worker-v18.js';

const COMMON_ASSETS='<link rel="stylesheet" href="/ehs-common.css?v=2"><script src="/ehs-common.js?v=2"></script>';
const HOME_BOOT='<style id="ehs-home-boot">#publicPortal{display:none!important}</style><script id="ehs-home-session">try{const s=JSON.parse(sessionStorage.getItem("ipass.session.v10")||"null");if(!s||!s.idToken)location.replace("/")}catch(_){location.replace("/")}</script>';

function assetRequest(request,path){
  const u=new URL(request.url);u.pathname=path;u.search='';
  return new Request(u.toString(),{method:'GET',headers:request.headers});
}

function injectHead(html,content,marker){
  if(html.includes(marker))return html;
  return html.includes('</head>')?html.replace('</head>',content+'</head>'):content+html;
}

async function serveAssetHtml(request,env,path,{home=false}={}){
  const response=await env.ASSETS.fetch(assetRequest(request,path));
  if(!response.ok)return response;
  let html=await response.text();
  if(home)html=injectHead(html,HOME_BOOT,'ehs-home-boot');
  html=injectHead(html,COMMON_ASSETS,'/ehs-common.css?v=2');
  const headers=new Headers(response.headers);
  headers.delete('content-length');headers.delete('content-encoding');
  headers.set('content-type','text/html;charset=utf-8');
  headers.set('cache-control','no-store');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

async function injectCommon(response,{home=false}={}){
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html'))return response;
  let html=await response.text();
  if(home)html=injectHead(html,HOME_BOOT,'ehs-home-boot');
  html=injectHead(html,COMMON_ASSETS,'/ehs-common.css?v=2');
  const headers=new Headers(response.headers);
  headers.delete('content-length');headers.delete('content-encoding');headers.set('cache-control','no-store');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

function isBusinessPage(path){
  return path==='/ipass'||path==='/ipass/'||path.startsWith('/ipass/')||
    path==='/committee'||path==='/committee.html'||
    path==='/evaluation-management.html'||path==='/evaluation-cycle.html'||path==='/evaluation-submit.html';
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    const path=url.pathname;

    if(request.method==='GET'&&path==='/home'){
      return serveAssetHtml(request,env,'/index.html',{home:true});
    }
    if(request.method==='GET'&&path==='/committee'){
      return serveAssetHtml(request,env,'/committee.html');
    }

    const response=await innerWorker.fetch(request,env,ctx);

    if(request.method==='GET'&&(path==='/'||path==='/index.html')){
      return injectCommon(response);
    }
    if(request.method==='GET'&&isBusinessPage(path)){
      return injectCommon(response);
    }
    return response;
  }
};
