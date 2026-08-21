import innerWorker from './worker-v18.js';

const COMMON_ASSETS='<link rel="stylesheet" href="/ehs-common.css?v=2"><script src="/shared/auth.js?v=1"></script><script src="/shared/api.js?v=1"></script><script src="/ehs-common.js?v=3"></script>';
const HOME_BOOT='<style id="ehs-home-boot">#publicPortal{display:none!important}</style><script id="ehs-home-session">try{const s=JSON.parse(sessionStorage.getItem("ipass.session.v10")||"null");if(!s||!s.idToken)location.replace("/?next=%2Fhome")}catch(_){location.replace("/?next=%2Fhome")}</script>';

function rewriteRequest(request,path){
  const u=new URL(request.url);u.pathname=path;u.search='';
  return new Request(u.toString(),{method:request.method,headers:request.headers});
}
function assetRequest(request,path){return rewriteRequest(request,path)}
function injectHead(html,content,marker){if(html.includes(marker))return html;return html.includes('</head>')?html.replace('</head>',content+'</head>'):content+html}
function stabilizeHomeBoot(html){
  const oldBoot='showLatestNotice("login");try{const raw=sessionStorage.getItem(SESSION_KEY);if(raw){session=JSON.parse(raw);const me=await api("/api/me");await routeAfterLogin(me)}}catch{logout()}})();';
  const newBoot='showLatestNotice("login");try{const raw=sessionStorage.getItem(SESSION_KEY);if(raw){session=JSON.parse(raw);const me=await (window.EHSApi?.request?window.EHSApi.request("/api/me"):api("/api/me"));await routeAfterLogin(me)}}catch(e){console.error("session restore failed",e);if(e&&e.status===401)logout();else{try{$("publicPortal").classList.add("hidden");$("app").classList.remove("hidden")}catch(_){}}}})();';
  if(html.includes(oldBoot))html=html.replace(oldBoot,newBoot);
  const oldRoute='showPage("portalHome");\n  loadPortalHome();\n  showLatestNotice("after_login");';
  const newRoute='showPage("portalHome");\n  loadPortalHome();\n  showLatestNotice("after_login");\n  try{const next=new URLSearchParams(location.search).get("next");if(next&&next.startsWith("/")&&!next.startsWith("//")&&next!=="/"&&next!=="/home"){location.replace(next);return}if(location.pathname==="/"||location.pathname==="/index.html")history.replaceState({},"","/home")}catch(_){}';
  if(html.includes(oldRoute))html=html.replace(oldRoute,newRoute);
  return html;
}
function stabilizeBusinessAuth(html){
  const replacements=[
    ["session=JSON.parse(sessionStorage.getItem(KEY)||'null');if(!session){location.replace('/index.html');return}buildYears();const me=await api('/api/me');","session=(window.EHSAuth?.readSession?window.EHSAuth.readSession():JSON.parse(sessionStorage.getItem(KEY)||'null'));if(!session){window.EHSAuth?.redirectToLogin(location.pathname+location.search);return}buildYears();const me=await (window.EHSApi?.request?window.EHSApi.request('/api/me'):api('/api/me'));"],
    ["session=JSON.parse(sessionStorage.getItem(KEY)||'null');if(!session){location.href='/';return}const me=await api('/api/me');","session=(window.EHSAuth?.readSession?window.EHSAuth.readSession():JSON.parse(sessionStorage.getItem(KEY)||'null'));if(!session){window.EHSAuth?.redirectToLogin(location.pathname+location.search);return}const me=await (window.EHSApi?.request?window.EHSApi.request('/api/me'):api('/api/me'));"],
    ["session=JSON.parse(sessionStorage.getItem(KEY)||'null');if(!session){location.replace('/');return}const me=await api('/api/me');","session=(window.EHSAuth?.readSession?window.EHSAuth.readSession():JSON.parse(sessionStorage.getItem(KEY)||'null'));if(!session){window.EHSAuth?.redirectToLogin(location.pathname+location.search);return}const me=await (window.EHSApi?.request?window.EHSApi.request('/api/me'):api('/api/me'));"],
    ["session=JSON.parse(sessionStorage.getItem(KEY)||'null');if(!session){location.href='/';return}const me=await api('/api/me');if(me.auth_state!=='approved'","session=(window.EHSAuth?.readSession?window.EHSAuth.readSession():JSON.parse(sessionStorage.getItem(KEY)||'null'));if(!session){window.EHSAuth?.redirectToLogin(location.pathname+location.search);return}const me=await (window.EHSApi?.request?window.EHSApi.request('/api/me'):api('/api/me'));if(me.auth_state!=='approved'"]
  ];
  for(const [from,to] of replacements)if(html.includes(from))html=html.replace(from,to);
  return html;
}
async function responseFromHtml(response,html){
  const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('content-encoding');headers.set('content-type','text/html;charset=utf-8');headers.set('cache-control','no-store');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}
async function serveAssetHtml(request,env,path,{home=false,business=false}={}){
  const response=await env.ASSETS.fetch(assetRequest(request,path));if(!response.ok)return response;
  let html=stabilizeHomeBoot(await response.text());if(business)html=stabilizeBusinessAuth(html);if(home)html=injectHead(html,HOME_BOOT,'ehs-home-boot');html=injectHead(html,COMMON_ASSETS,'/shared/auth.js?v=1');return responseFromHtml(response,html)
}
async function injectCommon(response,{home=false,business=false}={}){
  const type=response.headers.get('content-type')||'';if(!type.includes('text/html'))return response;
  let html=stabilizeHomeBoot(await response.text());if(business)html=stabilizeBusinessAuth(html);if(home)html=injectHead(html,HOME_BOOT,'ehs-home-boot');html=injectHead(html,COMMON_ASSETS,'/shared/auth.js?v=1');return responseFromHtml(response,html)
}
function isBusinessPage(path){return path==='/ipass'||path==='/ipass/'||path.startsWith('/ipass/')||path==='/committee'||path==='/committee.html'||path==='/evaluation-management.html'||path==='/evaluation-cycle.html'||path==='/evaluation-submit.html'}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url),path=url.pathname;
    if(request.method==='GET'&&path==='/home'){
      const response=await innerWorker.fetch(rewriteRequest(request,'/'),env,ctx);
      return injectCommon(response,{home:true});
    }
    if(request.method==='GET'&&path==='/committee')return serveAssetHtml(request,env,'/committee.html',{business:true});
    const response=await innerWorker.fetch(request,env,ctx);
    if(request.method==='GET'&&(path==='/'||path==='/index.html'))return injectCommon(response);
    if(request.method==='GET'&&isBusinessPage(path))return injectCommon(response,{business:true});
    return response;
  }
};
