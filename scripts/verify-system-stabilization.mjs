import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [worker,auth,api,common,toolbar,systemApi,systemPage,migration,workflow,packageJson,ipass]=await Promise.all([
  read('src/worker.js'),read('public/shared/auth.js'),read('public/shared/api.js'),read('public/ehs-common.js'),
  read('public/global-toolbar-v5.js'),read('src/system-admin.js'),read('public/admin-system.html'),
  read('migrations/0013_enterprise_stabilization.sql'),read('.github/workflows/cloudflare-deploy.yml'),
  read('package.json'),read('public/ipass.html')
]);

assert.ok(!auth.includes('portal-home-refresh.css'),'removed home refresh asset must not be requested');
assert.ok(!common.includes('setInterval('),'common runtime must not poll the DOM');
assert.ok(common.includes('MutationObserver')&&common.includes('setTimeout(()=>'),'skeletons must be delayed and event driven');
assert.ok(api.includes('ehs.api.v3:')&&api.includes('function invalidate('),'tagged cache generation missing');
assert.ok(api.includes("state:'stale'")&&api.includes('ehs:api-revalidated'),'stale-while-revalidate behavior missing');
assert.ok(worker.includes('injectBeforeLast')&&!worker.includes('worker-entry.js'),'worker injection must be consolidated');
assert.ok(worker.includes("path==='/ipass/templates'")&&worker.includes("path==='/ipass/cycles'"),'first-class i-PaSS admin routes missing');
assert.ok(worker.includes('content-security-policy')&&worker.includes('strict-origin-when-cross-origin'),'security response policy missing');
assert.ok(toolbar.includes('/admin/system')&&systemApi.includes('/api/admin/system/summary')&&systemPage.includes('SYSTEM OPERATIONS'),'system operations center missing');
assert.ok(migration.includes('recipient_account_id')&&migration.includes('evaluation_edit_leases_v2')&&migration.includes('applicability_status'),'stabilization migration incomplete');
assert.ok(workflow.includes('npm run migrate:remote')&&workflow.includes('npm run smoke:production'),'production migration/smoke gates missing');
assert.ok(packageJson.includes('"verify:all"')&&packageJson.includes('"smoke:authenticated"'),'full verification commands missing');
assert.ok(ipass.includes('renderIframe'),'legacy iframe function should remain detectable until navigation compatibility shim intercepts it');

console.log(JSON.stringify({
  success:true,
  dead_assets_removed:true,
  event_driven_runtime:true,
  tagged_swr_cache:true,
  consolidated_worker:true,
  security_headers:true,
  canonical_accounts:true,
  edit_lease_schema:true,
  applicability_state_schema:true,
  system_operations_center:true,
  production_migration_gate:true,
  authenticated_smoke_available:true
}));
