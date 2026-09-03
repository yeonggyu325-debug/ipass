import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { normalizeInjectedBodyScripts } from '../src/worker-entry.js';

const worker = await readFile(new URL('../src/worker.js', import.meta.url), 'utf8');
const entry = await readFile(new URL('../src/worker-entry.js', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const toolbar = await readFile(new URL('../public/global-toolbar-v5.js', import.meta.url), 'utf8');
const api = await readFile(new URL('../public/shared/api.js', import.meta.url), 'utf8');
const submitCss = await readFile(new URL('../public/evaluation-submit.css', import.meta.url), 'utf8');

assert.ok(wrangler.includes('"main": "src/worker-entry.js"'), 'production entrypoint must use the html injection guard');
assert.ok(entry.includes("import worker from './worker.js'"), 'guard entry must delegate to consolidated worker');
assert.ok(worker.includes("'/admin/approvals'") && worker.includes("'/admin/accounts'"), 'dedicated admin routes must exist');
assert.ok(toolbar.includes('/admin/approvals') && toolbar.includes('/admin/accounts'), 'toolbar must use dedicated admin routes');
assert.ok(!api.includes('global-toolbar-v5.js') && !api.includes('portal-home-v3.js') && !api.includes('ipass-ui-v2.js'), 'shared API module must not inject UI assets');
assert.ok(worker.includes('evaluation-submit.css?v=1') && submitCss.includes('.submit-progress-ring'), 'submission CSS must be consolidated');

const regression = '<!doctype html><html><body><script>const exportHtml=`<html><body>sheet</body></html>`;<script src="/global-toolbar-v5.js?v=7" data-global-toolbar-v5="true"></script>window.after=true;</script><main>page</main></body></html>';
const normalized = normalizeInjectedBodyScripts(regression);
assert.ok(normalized.includes('const exportHtml=`<html><body>sheet</body></html>`;window.after=true;</script>'), 'injected toolbar must be removed from inline script payload');
assert.ok(normalized.lastIndexOf('/global-toolbar-v5.js?v=7') > normalized.lastIndexOf('<main>page</main>'), 'toolbar must be moved to the real document body end');
assert.equal((normalized.match(/global-toolbar-v5\.js\?v=7/g)||[]).length,1,'toolbar must remain exactly once after normalization');

const removed = [
  'src/worker-v17.js','src/worker-v18.js','src/worker-v19.js','src/worker-v20.js','src/worker-v21.js',
  'public/global-toolbar-v4.css','public/global-toolbar-v4.js',
  'public/portal-enhance.css','public/portal-home-refresh.css','public/portal-home-refresh-v2.css',
  'public/evaluation-submit-enhance.css','public/evaluation-submit-redesign.css','public/evaluation-submit-progress.css','public/evaluation-submit-nav-v2.css'
];
for (const path of removed) {
  let exists=true;
  try { await access(new URL('../'+path, import.meta.url)); } catch { exists=false; }
  assert.equal(exists,false,`legacy file must be removed: ${path}`);
}

console.log(JSON.stringify({success:true,consolidated_worker:true,html_injection_guard:true,dedicated_admin_routes:true,ui_asset_injection:'worker-only',submission_css:'single-file',legacy_files_removed:removed.length}));
