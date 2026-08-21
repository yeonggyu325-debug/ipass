import innerWorker from './worker-v17.js';

const IPASS_PATHS = new Set(['/ipass','/ipass/','/ipass/evaluations','/ipass/templates','/ipass/cycles']);

function htmlRequest(request, pathname){
  const u=new URL(request.url);u.pathname=pathname;u.search='';
  return new Request(u.toString(),{method:'GET',headers:request.headers});
}

async function serveIpass(request,env){
  const response=await env.ASSETS.fetch(htmlRequest(request,'/ipass.html'));
  if(!response.ok)return response;
  const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('content-encoding');
  headers.set('content-type','text/html;charset=utf-8');
  headers.set('cache-control','no-store');
  return new Response(await response.text(),{status:response.status,statusText:response.statusText,headers});
}

const ROOT_ROUTE_SCRIPT=`<script id="ipass-route-v18">
(function(){
  function redirectIpass(service){
    if(service==='ipass'){location.href='/ipass';return true}
    return false
  }
  var tries=0,t=setInterval(function(){
    try{
      if(typeof window.openPortalService==='function'&&!window.openPortalService.__ipassRouted){
        var original=window.openPortalService;
        var wrapped=function(service){if(redirectIpass(service))return;return original.apply(this,arguments)};
        wrapped.__ipassRouted=true;window.openPortalService=wrapped;
      }
    }catch(_){}
    if(++tries>40)clearInterval(t)
  },200);
  document.addEventListener('click',function(e){
    var b=e.target&&e.target.closest?e.target.closest('button'):null;if(!b)return;
    var text=(b.textContent||'').trim();
    if(text==='i-PaSS 관리'){e.preventDefault();e.stopImmediatePropagation();location.href='/ipass'}
    else if(text==='평가표 관리'){e.preventDefault();e.stopImmediatePropagation();location.href='/ipass/templates'}
    else if(text==='평가회차 운영'){e.preventDefault();e.stopImmediatePropagation();location.href='/ipass/cycles'}
  },true)
})();
</script>`;

async function injectRootRoutes(response){
  const type=response.headers.get('content-type')||'';if(!type.includes('text/html'))return response;
  const html=await response.text();if(html.includes('ipass-route-v18'))return response;
  const next=html.includes('</body>')?html.replace('</body>',ROOT_ROUTE_SCRIPT+'</body>'):html+ROOT_ROUTE_SCRIPT;
  const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('content-encoding');headers.set('cache-control','no-store');
  return new Response(next,{status:response.status,statusText:response.statusText,headers});
}

const EMBED_STYLE=`<style id="ipass-embedded-style">
body{background:#f5f7f9!important}.header{display:none!important}.layout{min-height:100vh!important}.side{top:0!important;height:100vh!important}.main{padding-top:20px!important}.shell{padding-top:20px!important}.page-head{margin-top:0!important}
</style>`;
async function injectEmbedded(response){
  const type=response.headers.get('content-type')||'';if(!type.includes('text/html'))return response;
  const html=await response.text();if(html.includes('ipass-embedded-style'))return response;
  const next=html.includes('</head>')?html.replace('</head>',EMBED_STYLE+'</head>'):EMBED_STYLE+html;
  const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('content-encoding');headers.set('cache-control','no-store');
  return new Response(next,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&IPASS_PATHS.has(url.pathname))return serveIpass(request,env);
    const response=await innerWorker.fetch(request,env,ctx);
    if(request.method==='GET'&&(url.pathname==='/'||url.pathname==='/index.html'))return injectRootRoutes(response);
    if(request.method==='GET'&&url.searchParams.get('embedded')==='1'&&(url.pathname==='/evaluation-management.html'||url.pathname==='/evaluation-cycle.html'))return injectEmbedded(response);
    return response;
  }
};
