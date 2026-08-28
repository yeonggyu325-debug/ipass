const METRIC_DATASET_VERSION='ipass-performance-v1';

function now(){return performance.now()}
function round(value){return Math.round(Number(value||0)*10)/10}
function finite(value,max=120000){const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.min(max,n)):0}

export function normalizeMetricPath(path){
  const routes=[
    [/^\/api\/education\/preview\/[^/]+(?:\/[^/]+)?$/,'/api/education/preview/:ticket/:file'],
    [/^\/api\/partner\/submission\/preview\/[^/]+(?:\/[^/]+)?$/,'/api/partner/submission/preview/:ticket/:file'],
    [/^\/api\/partner\/submission\/files\/[^/]+\/preview-ticket$/,'/api/partner/submission/files/:file/preview-ticket'],
    [/^\/api\/partner\/submission\/files\/[^/]+$/,'/api/partner/submission/files/:file'],
    [/^\/api\/partner\/submission\/[^/]+\/items\/bulk$/,'/api/partner/submission/:target/items/bulk'],
    [/^\/api\/partner\/submission\/[^/]+\/items\/[^/]+\/files$/,'/api/partner/submission/:target/items/:item/files'],
    [/^\/api\/partner\/submission\/[^/]+\/items\/[^/]+$/,'/api/partner/submission/:target/items/:item'],
    [/^\/api\/partner\/submission\/[^/]+\/submit$/,'/api/partner/submission/:target/submit'],
    [/^\/api\/partner\/submission\/[^/]+$/,'/api/partner/submission/:target'],
    [/^\/api\/admin\/evaluation-scoring\/[^/]+\/items\/[^/]+$/,'/api/admin/evaluation-scoring/:target/items/:item'],
    [/^\/api\/admin\/evaluation-scoring\/[^/]+\/(complete|publish)$/,'/api/admin/evaluation-scoring/:target/:action'],
    [/^\/api\/admin\/evaluation-scoring\/[^/]+$/,'/api/admin/evaluation-scoring/:target'],
    [/^\/api\/admin\/evaluation-runtime\/cycles\/[^/]+\/(start|close)$/,'/api/admin/evaluation-runtime/cycles/:cycle/:action'],
    [/^\/api\/admin\/evaluation-runtime\/cycles\/[^/]+$/,'/api/admin/evaluation-runtime/cycles/:cycle'],
    [/^\/api\/admin\/annual-ipass\/[^/]+\/\d{4}$/,'/api/admin/annual-ipass/:company/:year'],
    [/^\/api\/education\/months\/\d{4}\/\d{1,2}\/(files|submit)$/,'/api/education/months/:year/:month/:action'],
    [/^\/api\/education\/months\/\d{4}\/\d{1,2}$/,'/api/education/months/:year/:month'],
    [/^\/api\/education\/files\/[^/]+\/preview-ticket$/,'/api/education/files/:file/preview-ticket'],
    [/^\/api\/education\/files\/[^/]+$/,'/api/education/files/:file'],
    [/^\/api\/education\/submissions\/[^/]+$/,'/api/education/submissions/:submission'],
    [/^\/api\/admin\/education\/[^/]+\/review$/,'/api/admin/education/:submission/review'],
    [/^\/api\/voc\/images\/[^/]+\/preview-ticket$/,'/api/voc/images/:image/preview-ticket'],
    [/^\/api\/voc\/images\/[^/]+$/,'/api/voc/images/:image'],
    [/^\/api\/voc\/[^/]+\/images$/,'/api/voc/:case/images'],
    [/^\/api\/voc\/[^/]+\/submit$/,'/api/voc/:case/submit'],
    [/^\/api\/admin\/voc\/[^/]+$/,'/api/admin/voc/:case'],
    [/^\/api\/voc\/[^/]+$/,'/api/voc/:case'],
    [/^\/api\/evaluations\/[^/]+$/,'/api/evaluations/:target']
  ];
  for(const [pattern,label] of routes)if(pattern.test(path))return label;
  const safe=String(path||'/').split('/').map(segment=>{
    if(/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment))return ':id';
    if(/^[A-Za-z0-9_-]{20,}$/.test(segment))return ':id';
    if(/^\d+$/.test(segment))return segment.length===4?':year':':number';
    return segment;
  }).join('/');
  return safe.slice(0,180);
}

export function createRequestMetrics(request,requestId){
  const url=new URL(request.url);
  return {
    version:METRIC_DATASET_VERSION,
    requestId,
    method:request.method,
    route:normalizeMetricPath(url.pathname),
    startedAt:now(),
    d1WallMs:0,
    d1EngineMs:0,
    d1RoundTrips:0,
    d1Statements:0,
    rowsRead:0,
    rowsWritten:0,
    country:String(request.cf?.country||'ZZ').slice(0,8),
    colo:String(request.cf?.colo||'unknown').slice(0,16)
  };
}

function collectMeta(metrics,result){
  const values=Array.isArray(result)?result:[result];
  for(const value of values){
    const meta=value?.meta;if(!meta)continue;
    metrics.d1EngineMs+=finite(meta.duration);
    metrics.rowsRead+=finite(meta.rows_read,Number.MAX_SAFE_INTEGER);
    metrics.rowsWritten+=finite(meta.rows_written,Number.MAX_SAFE_INTEGER);
  }
}

function measured(metrics,statementCount,operation){
  const started=now();metrics.d1RoundTrips+=1;metrics.d1Statements+=statementCount;
  try{
    const pending=operation();
    return Promise.resolve(pending).then(result=>{
      metrics.d1WallMs+=now()-started;collectMeta(metrics,result);return result;
    },error=>{metrics.d1WallMs+=now()-started;throw error});
  }catch(error){metrics.d1WallMs+=now()-started;throw error}
}

function instrumentDatabase(database,metrics){
  const nativeStatements=new WeakMap();
  const wrapStatement=statement=>{
    const wrapped={
      bind(...values){return wrapStatement(statement.bind(...values))},
      first(column){return measured(metrics,1,()=>statement.first(column))},
      run(){return measured(metrics,1,()=>statement.run())},
      all(){return measured(metrics,1,()=>statement.all())},
      raw(options){return measured(metrics,1,()=>statement.raw(options))}
    };
    nativeStatements.set(wrapped,statement);return wrapped;
  };
  return new Proxy(database,{get(target,property){
    if(property==='prepare')return sql=>wrapStatement(target.prepare(sql));
    if(property==='batch')return statements=>measured(metrics,Array.isArray(statements)?statements.length:1,()=>target.batch(statements.map(statement=>nativeStatements.get(statement)||statement)));
    if(property==='exec')return sql=>measured(metrics,1,()=>target.exec(sql));
    const value=target[property];return typeof value==='function'?value.bind(target):value;
  }});
}

export function instrumentEnvironment(env,metrics){
  if(!env?.partner_evaluation_db)return env;
  const database=instrumentDatabase(env.partner_evaluation_db,metrics);
  return new Proxy(env,{get(target,property){return property==='partner_evaluation_db'?database:target[property]}});
}

function analyticsWrite(env,payload){
  try{env.PERFORMANCE_ANALYTICS?.writeDataPoint(payload)}catch(error){console.warn('performance analytics write failed',error)}
}

export function finalizeRequestMetrics(metrics,response,env){
  const totalMs=now()-metrics.startedAt,status=Number(response.status||0);
  const headers=new Headers(response.headers);
  headers.set('server-timing',[
    `app;dur=${round(totalMs)}`,
    `d1;dur=${round(metrics.d1WallMs)};desc="${metrics.d1RoundTrips} round trips"`,
    `d1sql;dur=${round(metrics.d1EngineMs)};desc="${metrics.d1Statements} statements"`
  ].join(', '));
  if(metrics.route.startsWith('/api/')&&metrics.route!=='/api/performance/rum'){
    const event={event:'request_performance',version:metrics.version,request_id:metrics.requestId,route:metrics.route,method:metrics.method,status,total_ms:round(totalMs),d1_wall_ms:round(metrics.d1WallMs),d1_engine_ms:round(metrics.d1EngineMs),d1_round_trips:metrics.d1RoundTrips,d1_statements:metrics.d1Statements,rows_read:metrics.rowsRead,rows_written:metrics.rowsWritten,country:metrics.country,colo:metrics.colo};
    console.log(JSON.stringify(event));
    analyticsWrite(env,{indexes:[metrics.route],blobs:['server',metrics.method,metrics.country,metrics.colo,String(status)],doubles:[round(totalMs),round(metrics.d1WallMs),round(metrics.d1EngineMs),metrics.d1RoundTrips,metrics.d1Statements,metrics.rowsRead,metrics.rowsWritten,status]});
  }
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

export async function handlePerformanceRum(request,env){
  const url=new URL(request.url);if(url.pathname!=='/api/performance/rum')return null;
  if(request.method==='OPTIONS')return new Response(null,{status:204});
  if(request.method!=='POST')return new Response(null,{status:405});
  const origin=request.headers.get('origin');if(origin!==url.origin)return new Response(null,{status:403});
  const length=Number(request.headers.get('content-length')||0);if(length>4096)return new Response(null,{status:413});
  const body=await request.json().catch(()=>null);if(!body||typeof body!=='object')return new Response(null,{status:400});
  const allowedPages=new Set(['/','/home','/committee','/education','/ipass','/ipass/templates','/ipass/cycles','/evaluation-management.html','/evaluation-cycle.html','/evaluation-submit.html','/evaluation-scoring.html']);
  const requestedPage=body.page==='/index.html'?'/':body.page==='/committee.html'?'/committee':body.page==='/ipass/'?'/ipass':body.page;
  const page=allowedPages.has(requestedPage)?requestedPage:'/other';
  const country=String(request.cf?.country||'ZZ').slice(0,8),colo=String(request.cf?.colo||'unknown').slice(0,16),navigation=String(body.navigation||'navigate').slice(0,24);
  analyticsWrite(env,{indexes:[page],blobs:['client',navigation,country,colo,'page'],doubles:[finite(body.page_load),finite(body.ttfb),finite(body.dom_ready),finite(body.fcp),finite(body.lcp),finite(body.api_ready),finite(body.resource_count,10000),1]});
  return new Response(null,{status:204,headers:{'cache-control':'no-store'}});
}
