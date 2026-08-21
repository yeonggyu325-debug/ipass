import app from './worker-v19.js';

function isApi(path){return path.startsWith('/api/')}
function requestId(request){
  const incoming=request.headers.get('x-request-id');
  if(incoming&&/^[A-Za-z0-9._:-]{8,100}$/.test(incoming))return incoming;
  return crypto.randomUUID();
}
function cors(headers){
  headers.set('access-control-allow-origin','*');
  headers.set('access-control-allow-headers','authorization,content-type,x-request-id');
  headers.set('access-control-allow-methods','GET,POST,PATCH,PUT,DELETE,OPTIONS');
}
async function attach(response,id,path){
  const headers=new Headers(response.headers);
  headers.set('x-request-id',id);
  if(isApi(path))cors(headers);
  const type=headers.get('content-type')||'';
  if(isApi(path)&&type.includes('application/json')){
    const text=await response.text();
    let data;
    try{data=JSON.parse(text)}catch{return new Response(text,{status:response.status,statusText:response.statusText,headers})}
    if(data&&typeof data==='object'&&!Array.isArray(data)&&!data.request_id)data.request_id=id;
    headers.delete('content-length');headers.delete('content-encoding');
    return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
  }
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url),id=requestId(request);
    if(request.method==='OPTIONS'&&isApi(url.pathname)){
      const headers=new Headers({'x-request-id':id});cors(headers);return new Response(null,{status:204,headers});
    }
    try{
      const nextHeaders=new Headers(request.headers);nextHeaders.set('x-request-id',id);
      const traced=new Request(request,{headers:nextHeaders});
      const response=await app.fetch(traced,env,ctx);
      return attach(response,id,url.pathname);
    }catch(error){
      console.error('unhandled request error',{request_id:id,path:url.pathname,method:request.method,error:error?.stack||String(error)});
      if(!isApi(url.pathname))return new Response('서비스 처리 중 오류가 발생했습니다.',{status:500,headers:{'content-type':'text/plain;charset=utf-8','x-request-id':id}});
      const headers=new Headers({'content-type':'application/json;charset=utf-8','x-request-id':id});cors(headers);
      return new Response(JSON.stringify({success:false,error:'서버 처리 중 오류가 발생했습니다.',code:'UNHANDLED_SERVER_ERROR',request_id:id}),{status:500,headers});
    }
  }
};
