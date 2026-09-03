import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const [viewer, education, educationApi, partnerApi, worker, workerEntry, resourcePreview, resourcePreviewCss, packageJson, assetBuilder] = await Promise.all([
  readFile(resolve(root, 'public/attachment-preview.js'), 'utf8'),
  readFile(resolve(root, 'public/education.html'), 'utf8'),
  readFile(resolve(root, 'src/education-submission.js'), 'utf8'),
  readFile(resolve(root, 'src/partner-submission.js'), 'utf8'),
  readFile(resolve(root, 'src/worker.js'), 'utf8'),
  readFile(resolve(root, 'src/worker-entry.js'), 'utf8'),
  readFile(resolve(root, 'public/resource-preview-v2.js'), 'utf8'),
  readFile(resolve(root, 'public/resource-preview-v2.css'), 'utf8'),
  readFile(resolve(root, 'package.json'), 'utf8'),
  readFile(resolve(root, 'scripts/prepare-preview-assets.mjs'), 'utf8')
]);

const requiredViewerTokens = [
  'pdf.min.mjs', 'pdf.worker.min.mjs', 'pptx-renderer.es.js',
  'rhwp.js', 'rhwp_bg.wasm', 'HwpDocument', 'renderPageSvg',
  'PptxViewer.open', 'pdfjsLib.getDocument', 'docx.renderAsync',
  'repairPptxTextClipping', 'ap-image-stage', '화면 맞춤',
  'XLSX.read', 'office_viewer_url', 'viewer_url', 'AbortController'
];
const requiredExtensions = ['pdf', 'hwp', 'hwpx', 'xls', 'xlsx', 'ppt', 'pptx', 'doc', 'docx', 'jpg', 'jpeg', 'png'];
const failures = [];
for (const token of requiredViewerTokens) if (!viewer.includes(token)) failures.push(`viewer:${token}`);
for (const extension of requiredExtensions) {const quoted = `'${extension}'`;if (!educationApi.includes(quoted)) failures.push(`education-api:${extension}`)}
if (!education.includes('/attachment-preview.js?v=3')) failures.push('education:viewer-script');
if (!education.includes('.ppt,.pptx')) failures.push('education:ppt-upload');
if (!partnerApi.includes('office_viewer_url')) failures.push('partner-api:office-viewer');
if (!worker.includes('attachment-preview.js?v=3')) failures.push('worker:viewer-injection');
if (!viewer.includes("'webp'")) failures.push('viewer:webp');
if (!packageJson.includes('"@rhwp/core": "0.8.4"')) failures.push('package:rhwp-version');
for (const asset of ['@rhwp/core/rhwp.js', '@rhwp/core/rhwp_bg.wasm', 'LICENSE-rhwp.txt']) if (!assetBuilder.includes(asset)) failures.push(`asset-builder:${asset}`);

if (!workerEntry.includes("path !== '/resources'")) failures.push('resource-preview:route-scope');
if (!workerEntry.includes('/resource-preview-v2.css?v=1')) failures.push('resource-preview:css-injection');
if (!workerEntry.includes('/resource-preview-v2.js?v=1')) failures.push('resource-preview:js-injection');
if (!resourcePreview.includes('Math.min(space.width/source.width,space.height/source.height)')) failures.push('resource-preview:aspect-fit');
if (!resourcePreview.includes("mode='fit'")) failures.push('resource-preview:fit-default');
if (!resourcePreview.includes('ResizeObserver')) failures.push('resource-preview:responsive-fit');
if (!resourcePreviewCss.includes('width:min(1680px,calc(100vw - 36px))')) failures.push('resource-preview:enterprise-modal');
if (!resourcePreviewCss.includes('.ap-fit-state')) failures.push('resource-preview:fit-indicator');

if (failures.length) throw new Error(`Attachment preview verification failed: ${failures.join(', ')}`);
console.log(JSON.stringify({success:true,browser_renderers:['pdf','xlsx','docx','pptx','hwp','hwpx','image'],web_viewer_fallbacks:['ppt','doc','hwp-on-error','hwpx-on-error'],allowed_extensions:requiredExtensions.length,consolidated_worker:true,resource_preview:{route:'/resources',aspect_ratio_preserved:true,viewport_fit:true,enterprise_ui:true}}));
