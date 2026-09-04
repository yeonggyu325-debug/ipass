import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const [viewer, education, educationApi, partnerApi, worker, workerEntry, resourcePreview, resourcePreviewCss, resourcePreviewV3, resourcePreviewV3Css, packageJson, assetBuilder] = await Promise.all([
  readFile(resolve(root, 'public/attachment-preview.js'), 'utf8'),
  readFile(resolve(root, 'public/education.html'), 'utf8'),
  readFile(resolve(root, 'src/education-submission.js'), 'utf8'),
  readFile(resolve(root, 'src/partner-submission.js'), 'utf8'),
  readFile(resolve(root, 'src/worker.js'), 'utf8'),
  readFile(resolve(root, 'src/worker-entry.js'), 'utf8'),
  readFile(resolve(root, 'public/resource-preview-v2.js'), 'utf8'),
  readFile(resolve(root, 'public/resource-preview-v2.css'), 'utf8'),
  readFile(resolve(root, 'public/resource-preview-v3.js'), 'utf8'),
  readFile(resolve(root, 'public/resource-preview-v3.css'), 'utf8'),
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

if (!worker.includes("if(path==='/resources')")) failures.push('resource-preview:route-scope');
if (workerEntry.includes('resource-preview-v2') || workerEntry.includes('resource-preview-v3')) failures.push('resource-preview:duplicate-entry-injection');
if (!resourcePreview.includes('Math.min(space.width/source.width,space.height/source.height)')) failures.push('resource-preview:aspect-fit');
if (!resourcePreview.includes('fittedTargets')) failures.push('resource-preview:one-shot-fit');
if (!resourcePreview.includes('ResizeObserver')) failures.push('resource-preview:responsive-fit');
if (!resourcePreviewCss.includes('width:min(1680px,calc(100vw - 36px))')) failures.push('resource-preview:enterprise-modal');
if (resourcePreviewCss.includes('원본 비율 유지')) failures.push('resource-preview:legacy-original-ratio-label');
if (!resourcePreviewV3.includes("document.addEventListener('wheel'")) failures.push('resource-preview:wheel-zoom');
if (!resourcePreviewV3.includes('ap-zoom-input')) failures.push('resource-preview:editable-zoom');
if (!resourcePreviewV3.includes("text==='＋'||text==='－'")) failures.push('resource-preview:legacy-zoom-hide');
if (!resourcePreviewV3Css.includes('.ap-legacy-zoom-control{display:none!important}')) failures.push('resource-preview:legacy-controls-hidden');
if (!resourcePreviewV3Css.includes('.ap-legacy-actual-control{display:none!important}')) failures.push('resource-preview:legacy-actual-hidden');
if (!worker.includes('/resource-preview-v2.js?v=4')) failures.push('resource-preview:v2-cache-bust');
if (!worker.includes('/resource-preview-v3.js?v=4')) failures.push('resource-preview:v3-cache-bust');

if (failures.length) throw new Error(`Attachment preview verification failed: ${failures.join(', ')}`);
console.log(JSON.stringify({success:true,browser_renderers:['pdf','xlsx','docx','pptx','hwp','hwpx','image'],web_viewer_fallbacks:['ppt','doc','hwp-on-error','hwpx-on-error'],allowed_extensions:requiredExtensions.length,consolidated_worker:true,resource_preview:{route:'/resources',single_injection_source:true,aspect_ratio_preserved:true,initial_fit_only:true,wheel_zoom:true,editable_zoom:true,legacy_zoom_controls_hidden:true,legacy_original_ratio_label:false,enterprise_ui:true}}));
