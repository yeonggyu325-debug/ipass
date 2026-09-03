import assert from 'node:assert/strict';

const ORIGIN=process.env.IPASS_ORIGIN||'https://ipass.i-pass-eval.workers.dev';
const RETRIES=4;
const RETRY_MS=1500;

const htmlRoutes=[
  '/','/home','/ipass','/ipass/evaluations','/ipass/templates','/ipass/cycles',
  '/admin/approvals','/admin/accounts','/admin/system','/committee','/education','/voc',
  '/notices','/resources','/faq','/evaluation-management.html',
  '/evaluation-cycle.html','/evaluation-submit.html','/evaluation-scoring.html'
];
const protectedApiRoutes=[
  '/api/me','/api/notifications','/api/education','/api/voc',
  '/api/admin/dashboard-bundle','/api/admin/system/summary','/api/my/evaluations'
];
const allowedUnauthed=new Set([200,400,401,403,404]);
const checkedAssets=new Set();
const results=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function request(path,options={}){
  const url=new URL(path,ORIGIN).toString();let lastError;
  for(let attempt=1;attempt<=RETRIES;attempt++){
    try{
      const response=await fetch(url,{redirect:'manual',...options});
      if(response.status<500)return response;
      lastError=new Error(`${path}: HTTP ${response.status}`);
    }catch(error){lastError=error}
    if(attempt<RETRIES)await sleep(RETRY_MS*attempt);
  }
  throw lastError||new Error(`${path}: request failed`);
}

function sameOriginAsset(value){
  if(!value||value.includes('${')||value.startsWith('data:')||value.startsWith('blob:')||value.startsWith('#'))return null;
  const url=new URL(value,ORIGIN);if(url.origin!==new URL(ORIGIN).origin)return null;
  return url.pathname+url.search;
}
async function checkAsset(asset){
  if(!asset||checkedAssets.has(asset))return;checkedAssets.add(asset);
  const response=await request(asset);
  assert.ok(response.status>=200&&response.status<400,`asset ${asset}: HTTP ${response.status}`);
  assert.equal(response.headers.get('x-content-type-options'),'nosniff',`asset ${asset}: nosniff header missing`);
  results.push({type:'asset',path:asset,status:response.status});
}
async function checkHtml(path){
  const response=await request(path,{redirect:'follow'});
  assert.ok(response.status>=200&&response.status<400,`${path}: HTTP ${response.status}`);
  const contentType=response.headers.get('content-type')||'';
  assert.ok(contentType.includes('text/html'),`${path}: expected HTML, got ${contentType}`);
  assert.equal(response.headers.get('x-content-type-options'),'nosniff',`${path}: nosniff header missing`);
  assert.equal(response.headers.get('referrer-policy'),'strict-origin-when-cross-origin',`${path}: referrer policy missing`);
  assert.ok((response.headers.get('content-security-policy')||'').includes("default-src 'self'"),`${path}: CSP missing`);
  const body=await response.text();
  assert.ok(!body.includes('서비스 처리 중 오류가 발생했습니다.'),`${path}: worker error body detected`);
  assert.ok(!body.includes('portal-home-refresh.css'),`${path}: removed home refresh asset detected`);
  assert.ok(!body.includes('worker-v17.js')&&!body.includes('worker-v18.js')&&!body.includes('worker-v19.js')&&!body.includes('worker-v20.js')&&!body.includes('worker-v21.js'),`${path}: legacy worker reference detected`);
  if(path==='/resources'){
    assert.ok(body.includes('/resource-preview-v2.css?v=2'),'/resources: enterprise preview CSS missing');
    assert.ok(body.includes('/resource-preview-v2.js?v=2'),'/resources: enterprise preview JS missing');
  }
  if(path==='/ipass/templates'||path==='/ipass/cycles')assert.ok(!body.includes('embedded=1'),`${path}: iframe embedding marker detected`);
  const markup=body.replace(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi,'');
  const refs=[
    ...markup.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi),
    ...markup.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi),
    ...markup.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)
  ].map(match=>sameOriginAsset(match[1])).filter(Boolean);
  for(const ref of refs)await checkAsset(ref);
  results.push({type:'html',path,status:response.status,final_url:response.url,assets:refs.length});
}

const health=await request('/api/health');
assert.equal(health.status,200,`/api/health: HTTP ${health.status}`);
assert.equal(health.headers.get('x-content-type-options'),'nosniff','/api/health: nosniff header missing');
const healthBody=await health.json();assert.equal(healthBody.success,true,'/api/health: success must be true');
results.push({type:'api',path:'/api/health',status:health.status});

for(const path of htmlRoutes)await checkHtml(path);
for(const path of protectedApiRoutes){
  const response=await request(path);
  assert.ok(allowedUnauthed.has(response.status),`${path}: unexpected unauthenticated HTTP ${response.status}`);
  assert.equal(response.headers.get('x-content-type-options'),'nosniff',`${path}: nosniff header missing`);
  results.push({type:'api',path,status:response.status});
}

console.log(JSON.stringify({
  success:true,origin:ORIGIN,html_routes:htmlRoutes.length,protected_api_routes:protectedApiRoutes.length,
  static_assets:checkedAssets.size,security_headers:true,enterprise_preview:true,iframe_free_routes:true,results
}));
