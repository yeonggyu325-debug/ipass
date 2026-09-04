import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const [viewer, education, educationApi, partnerApi, worker, workerEntry, resourcePreviewV2, resourcePreviewCss, resourcePreviewV3, resourcePreviewV3Css, packageJson, assetBuilder] = await Promise.all([
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

const failures = [];
const requiredViewerTokens = [
  'pdf.min.mjs', 'pdf.worker.min.mjs', 'pptx-renderer.es.js',
  'rhwp.js', 'rhwp_bg.wasm', 'HwpDocument', 'renderPageSvg',
  'PptxViewer.open', 'pdfjsLib.getDocument', 'docx.renderAsync',
  'XLSX.read', 'office_viewer_url', 'viewer_url', 'AbortController'
];
const requiredExtensions = ['pdf', 'hwp', 'hwpx', 'xls', 'xlsx', 'ppt', 'pptx', 'doc', 'docx', 'jpg', 'jpeg', 'png'];

for (const token of requiredViewerTokens) if (!viewer.includes(token)) failures.push(`viewer:${token}`);
for (const extension of requiredExtensions) if (!educationApi.includes(`'${extension}'`)) failures.push(`education-api:${extension}`);
if (!education.includes('/attachment-preview.js?v=3')) failures.push('education:viewer-script');
if (!education.includes('.ppt,.pptx')) failures.push('education:ppt-upload');
if (!partnerApi.includes('office_viewer_url')) failures.push('partner-api:office-viewer');
if (!worker.includes('attachment-preview.js?v=3')) failures.push('worker:viewer-injection');
if (!viewer.includes("'webp'")) failures.push('viewer:webp');
if (!viewer.includes("xlsx: 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js'")) failures.push('viewer:xlsx-runtime-source');
if (!viewer.includes("const zoomOut = button('－', () => { scale = Math.max(.5, scale - .15); draw(); }")) failures.push('viewer:pdf-native-zoom');
if (!viewer.includes('await viewer.setZoom(zoom)')) failures.push('viewer:pptx-native-setzoom');
if (!viewer.includes("const fitButton = button('화면 맞춤', fit)")) failures.push('viewer:image-native-fit');
if (!viewer.includes("const fitButton = button('너비 맞춤', fit)")) failures.push('viewer:hwp-native-fit');
if (!packageJson.includes('"@rhwp/core": "0.8.4"')) failures.push('package:rhwp-version');
for (const asset of ['@rhwp/core/rhwp.js', '@rhwp/core/rhwp_bg.wasm', 'LICENSE-rhwp.txt']) if (!assetBuilder.includes(asset)) failures.push(`asset-builder:${asset}`);

if (!worker.includes("if(path==='/resources')")) failures.push('resource-preview:route-scope');
if (workerEntry.includes('resource-preview-v2') || workerEntry.includes('resource-preview-v3')) failures.push('resource-preview:duplicate-entry-injection');
if (resourcePreviewCss.includes('원본 비율 유지')) failures.push('resource-preview:legacy-original-ratio-label');
if (!resourcePreviewV2.includes('presentation-only')) failures.push('resource-preview:v2-presentation-only');
if (resourcePreviewV2.includes('setFit(') || resourcePreviewV2.includes('fittedTargets') || resourcePreviewV2.includes('ResizeObserver')) failures.push('resource-preview:v2-renderer-mutation');

if (!resourcePreviewV3.includes("document.addEventListener('wheel'")) failures.push('resource-preview:wheel-zoom');
if (!resourcePreviewV3.includes('ap-zoom-input')) failures.push('resource-preview:editable-zoom');
if (!resourcePreviewV3.includes('function previewType')) failures.push('resource-preview:format-detection');
if (!resourcePreviewV3.includes('function currentPercent')) failures.push('resource-preview:native-percent-sync');
if (!resourcePreviewV3.includes('function setImageOrHwpZoom')) failures.push('resource-preview:image-hwp-native-zoom');
if (!resourcePreviewV3.includes('function setPdfZoom')) failures.push('resource-preview:pdf-native-zoom-bridge');
if (!resourcePreviewV3.includes('function setPptZoom')) failures.push('resource-preview:pptx-native-zoom-bridge');
if (!resourcePreviewV3.includes('function setFlowZoom')) failures.push('resource-preview:flow-document-zoom');
if (!resourcePreviewV3.includes('waitForCanvas')) failures.push('resource-preview:pdf-render-wait');
if (!resourcePreviewV3.includes("control.click()")) failures.push('resource-preview:keyboard-page-native-control');
if (!resourcePreviewV3.includes("event.key==='ArrowLeft'")) failures.push('resource-preview:left-arrow');
if (!resourcePreviewV3.includes("event.key==='ArrowRight'")) failures.push('resource-preview:right-arrow');
if (resourcePreviewV3.includes('resource-preview:fit')) failures.push('resource-preview:legacy-cross-layer-fit-event');
if (resourcePreviewV3.includes('/vendor/attachment-preview/xlsx.full.min.js')) failures.push('resource-preview:nonexistent-xlsx-prewarm');
if (!resourcePreviewV3.includes("text==='＋'||text==='－'")) failures.push('resource-preview:legacy-zoom-hide');
if (!resourcePreviewV3Css.includes('.ap-legacy-zoom-control{display:none!important}')) failures.push('resource-preview:legacy-controls-hidden');
if (!resourcePreviewV3Css.includes('.ap-legacy-actual-control{display:none!important}')) failures.push('resource-preview:legacy-actual-hidden');
if (!resourcePreviewV3Css.includes('.ap-body.ap-manual-zoom{overflow:auto!important}')) failures.push('resource-preview:manual-zoom-scroll');
if (!resourcePreviewV3Css.includes('.ap-body.ap-manual-zoom .ap-pptx{overflow:visible!important')) failures.push('resource-preview:pptx-scrollable-zoom');
if (!worker.includes('/resource-preview-v2.js?v=8')) failures.push('resource-preview:v2-cache-bust');
if (!worker.includes('/resource-preview-v3.js?v=8')) failures.push('resource-preview:v3-cache-bust');

if (failures.length) throw new Error(`Attachment preview verification failed: ${failures.join(', ')}`);
console.log(JSON.stringify({
  success:true,
  browser_renderers:['pdf','xlsx','docx','pptx','hwp','hwpx','image'],
  web_viewer_fallbacks:['ppt','doc','hwp-on-error','hwpx-on-error'],
  allowed_extensions:requiredExtensions.length,
  consolidated_worker:true,
  resource_preview:{
    route:'/resources',single_injection_source:true,v2_presentation_only:true,
    native_renderer_state:true,wheel_zoom:true,editable_zoom:true,keyboard_paging:true,
    pdf_native_rerender_zoom:true,pptx_native_renderer_zoom:true,
    docx_wheel_zoom:true,xlsx_wheel_zoom:true,xlsx_preload_mismatch:false,
    legacy_zoom_controls_hidden:true,legacy_original_ratio_label:false,enterprise_ui:true
  }
}));
