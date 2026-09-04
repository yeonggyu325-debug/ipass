import assert from 'node:assert/strict';

const ORIGIN = process.env.IPASS_ORIGIN || 'https://ipass.i-pass-eval.workers.dev';
const RETRIES = 4;
const RETRY_MS = 1500;
const PREVIEW_VERSION = 10;

const htmlRoutes = [
  '/', '/home', '/ipass', '/ipass/evaluations', '/ipass/templates', '/ipass/cycles',
  '/admin/approvals', '/admin/accounts', '/committee', '/education', '/voc',
  '/notices', '/resources', '/faq', '/evaluation-management.html',
  '/evaluation-cycle.html', '/evaluation-submit.html', '/evaluation-scoring.html'
];
const protectedApiRoutes = [
  '/api/me', '/api/notifications', '/api/education', '/api/voc',
  '/api/admin/dashboard-bundle', '/api/my/evaluations'
];
const allowedUnauthed = new Set([200, 400, 401, 403]);
const checkedAssets = new Set();
const htmlBodies = new Map();
const results = [];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const occurrences = (source, needle) => source.split(needle).length - 1;

async function request(path, options = {}) {
  const url = new URL(path, ORIGIN).toString();
  let lastError;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const response = await fetch(url, { redirect: 'manual', ...options });
      if (response.status < 500) return response;
      lastError = new Error(`${path}: HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < RETRIES) await sleep(RETRY_MS * attempt);
  }
  throw lastError || new Error(`${path}: request failed`);
}

function sameOriginAsset(value) {
  if (!value || value.includes('${') || value.startsWith('data:') || value.startsWith('blob:') || value.startsWith('#')) return null;
  const url = new URL(value, ORIGIN);
  if (url.origin !== new URL(ORIGIN).origin) return null;
  return url.pathname + url.search;
}

async function checkAsset(asset) {
  if (!asset || checkedAssets.has(asset)) return;
  checkedAssets.add(asset);
  const response = await request(asset);
  assert.ok(response.status >= 200 && response.status < 400, `asset ${asset}: HTTP ${response.status}`);
  results.push({ type: 'asset', path: asset, status: response.status });
}

async function readProductionAsset(asset) {
  const response = await request(asset, { headers: { 'cache-control': 'no-cache' } });
  assert.ok(response.status >= 200 && response.status < 400, `${asset}: HTTP ${response.status}`);
  return response.text();
}

async function checkHtml(path) {
  const response = await request(path, { redirect: 'follow' });
  assert.ok(response.status >= 200 && response.status < 400, `${path}: HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  assert.ok(contentType.includes('text/html'), `${path}: expected HTML, got ${contentType}`);
  const body = await response.text();
  htmlBodies.set(path, body);
  assert.ok(!body.includes('서비스 처리 중 오류가 발생했습니다.'), `${path}: worker error body detected`);
  const markup = body.replace(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi, '');
  const refs = [
    ...markup.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi),
    ...markup.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi),
    ...markup.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)
  ].map(match => sameOriginAsset(match[1])).filter(Boolean);
  for (const ref of refs) await checkAsset(ref);
  results.push({ type: 'html', path, status: response.status, final_url: response.url, assets: refs.length });
}

async function checkResourcePreviewRuntime() {
  const resourcesHtml = htmlBodies.get('/resources') || '';
  const expectedRefs = [
    `/resource-preview-v2.css?v=${PREVIEW_VERSION}`,
    `/resource-preview-v3.css?v=${PREVIEW_VERSION}`,
    `/resource-preview-v2.js?v=${PREVIEW_VERSION}`,
    `/resource-preview-v3.js?v=${PREVIEW_VERSION}`
  ];
  for (const ref of expectedRefs) assert.equal(occurrences(resourcesHtml, ref), 1, `/resources: expected exactly one ${ref}`);
  assert.ok(!resourcesHtml.includes('원본 비율 유지'), '/resources: legacy original-ratio wording detected');

  const controllerPath = `/resource-preview-v3.js?v=${PREVIEW_VERSION}`;
  const stylePath = `/resource-preview-v3.css?v=${PREVIEW_VERSION}`;
  const controller = await readProductionAsset(controllerPath);
  const style = await readProductionAsset(stylePath);

  for (const token of [
    'function captureZoomAnchor','function restoreZoomAnchor','function settleZoomAnchor',
    'Math.max(0,previewBody.scrollWidth-previewBody.clientWidth)',
    'Math.max(0,previewBody.scrollHeight-previewBody.clientHeight)',
    'event.stopPropagation()','function prewarmForExtension',
    "document.addEventListener('wheel'","event.key==='ArrowLeft'","event.key==='ArrowRight'",'ap-zoom-input'
  ]) assert.ok(controller.includes(token), `${controllerPath}: missing ${token}`);

  assert.ok(style.includes('.ap-body.ap-manual-zoom .ap-pdf-canvas{max-width:none!important}'), `${stylePath}: PDF width remains clamped`);
  assert.ok(style.includes('.ap-body.ap-manual-zoom .ap-pdf-stage{width:max-content!important'), `${stylePath}: PDF scroll extent missing`);
  assert.ok(style.includes('.ap-body.ap-manual-zoom .ap-pptx{width:max-content!important'), `${stylePath}: PPTX scroll extent missing`);
  assert.ok(!controller.includes('/vendor/attachment-preview/xlsx.full.min.js'), `${controllerPath}: nonexistent XLSX preload returned`);

  results.push({type:'preview-runtime',path:'/resources',version:PREVIEW_VERSION,single_injection:true,pointer_anchored_zoom:true,full_scroll_extent:true});
}

const health = await request('/api/health');
assert.equal(health.status, 200, `/api/health: HTTP ${health.status}`);
const healthBody = await health.json();
assert.equal(healthBody.success, true, '/api/health: success must be true');
results.push({ type: 'api', path: '/api/health', status: health.status });

for (const path of htmlRoutes) await checkHtml(path);
await checkResourcePreviewRuntime();
for (const path of protectedApiRoutes) {
  const response = await request(path);
  assert.ok(allowedUnauthed.has(response.status), `${path}: unexpected unauthenticated HTTP ${response.status}`);
  assert.notEqual(response.status, 404, `${path}: protected API route is missing`);
  results.push({ type: 'api', path, status: response.status });
}

console.log(JSON.stringify({success:true,origin:ORIGIN,html_routes:htmlRoutes.length,protected_api_routes:protectedApiRoutes.length,static_assets:checkedAssets.size,preview_runtime_version:PREVIEW_VERSION,results}));
