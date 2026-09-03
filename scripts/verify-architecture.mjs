import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { injectBeforeLast } from '../src/worker.js';

const worker=await readFile(new URL('../src/worker.js',import.meta.url),'utf8');
const wrangler=await readFile(new URL('../wrangler.jsonc',import.meta.url),'utf8');
const toolbar=await readFile(new URL('../public/global-toolbar-v5.js',import.meta.url),'utf8');
const api=await readFile(new URL('../public/shared/api.js',import.meta.url),'utf8');
const auth=await readFile(new URL('../public/shared/auth.js',import.meta.url),'utf8');
const common=await readFile(new URL('../public/ehs-common.js',import.meta.url),'utf8');
const home=await readFile(new URL('../public/portal-home-v3.js',import.meta.url),'utf8');
const submitCss=await readFile(new URL('../public/evaluation-submit.css',import.meta.url),'utf8');

assert.ok(wrangler.includes('"main": "src/worker.js"'),'production entrypoint must be the consolidated worker');
assert.ok(worker.includes("'/admin/approvals'")&&worker.includes("'/admin/accounts'")&&worker.includes("'/admin/system'"),'dedicated admin routes must exist');
assert.ok(worker.includes("path==='/ipass/templates'")&&worker.includes("path==='/ipass/cycles'"),'i-PaSS management routes must be first-class pages');
assert.ok(toolbar.includes('/admin/approvals')&&toolbar.includes('/admin/accounts')&&toolbar.includes('/admin/system'),'toolbar must expose administrator operations');
assert.ok(!api.includes('global-toolbar-v5.js')&&!api.includes('portal-home-v3.js')&&!api.includes('ipass-ui-v2.js'),'shared API module must not inject UI assets');
assert.ok(!auth.includes('portal-home-refresh.css'),'auth module must not load removed UI assets');
assert.ok(!common.includes('setInterval('),'common runtime must be event driven');
assert.ok(!worker.includes('ROOT_ROUTE_SCRIPT')&&!worker.includes('PARTNER_ROUTE_SCRIPT'),'home must not load legacy route polling');
assert.ok(worker.includes('evaluation-submit.css?v=1')&&submitCss.includes('.submit-progress-ring'),'submission CSS must remain consolidated');
assert.ok(api.includes('ehs.api.v3:')&&api.includes('function invalidate(')&&api.includes('ehs:api-revalidated'),'API cache must use tagged stale-while-revalidate');
assert.ok(home.includes("location.pathname!=='/home'"),'canonical home renderer must stay isolated to /home');
assert.ok(worker.includes("content-security-policy")&&worker.includes("x-content-type-options")&&worker.includes("permissions-policy"),'security headers must be applied centrally');

const html='<!doctype html><html><head><title>x</title></head><body><script>const exportHtml=`<html><body>sheet</body></html>`;</script><main>page</main></body></html>';
const script='<script src="/global-toolbar-v5.js?v=8" data-global-toolbar-v5="true"></script>';
const injected=injectBeforeLast(html,script,'/global-toolbar-v5.js?v=8','</body>');
assert.ok(injected.includes('const exportHtml=`<html><body>sheet</body></html>`;'),'inline export template must remain intact');
assert.ok(injected.lastIndexOf('/global-toolbar-v5.js?v=8')>injected.lastIndexOf('<main>page</main>'),'script must be inserted before the real final body tag');
assert.equal((injected.match(/global-toolbar-v5\.js\?v=8/g)||[]).length,1,'injected asset must remain unique');

const removed=[
  'src/worker-entry.js','src/worker-v17.js','src/worker-v18.js','src/worker-v19.js','src/worker-v20.js','src/worker-v21.js',
  'public/global-toolbar-v4.css','public/global-toolbar-v4.js',
  'public/portal-enhance.css','public/portal-home-refresh.css','public/portal-home-refresh-v2.css',
  'public/evaluation-submit-enhance.css','public/evaluation-submit-redesign.css','public/evaluation-submit-progress.css','public/evaluation-submit-nav-v2.css'
];
for(const path of removed){let exists=true;try{await access(new URL('../'+path,import.meta.url))}catch{exists=false}assert.equal(exists,false,`legacy file must be removed: ${path}`)}

console.log(JSON.stringify({
  success:true,
  consolidated_worker:true,
  safe_html_injection:true,
  event_driven_runtime:true,
  canonical_admin_routes:true,
  iframe_routes_removed:true,
  tagged_swr_cache:true,
  security_headers:true,
  legacy_files_removed:removed.length
}));
