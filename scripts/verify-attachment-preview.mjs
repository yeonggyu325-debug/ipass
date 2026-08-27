import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const [viewer, education, educationApi, partnerApi, worker] = await Promise.all([
  readFile(resolve(root, 'public/attachment-preview.js'), 'utf8'),
  readFile(resolve(root, 'public/education.html'), 'utf8'),
  readFile(resolve(root, 'src/education-submission.js'), 'utf8'),
  readFile(resolve(root, 'src/partner-submission.js'), 'utf8'),
  readFile(resolve(root, 'src/worker-v20.js'), 'utf8')
]);

const requiredViewerTokens = [
  'pdf.min.mjs', 'pdf.worker.min.mjs', 'pptx-renderer.es.js',
  'PptxViewer.open', 'pdfjsLib.getDocument', 'docx.renderAsync',
  'XLSX.read', 'office_viewer_url', 'viewer_url', 'AbortController'
];
const requiredExtensions = ['pdf', 'hwp', 'hwpx', 'xls', 'xlsx', 'ppt', 'pptx', 'doc', 'docx', 'jpg', 'jpeg', 'png'];
const failures = [];

for (const token of requiredViewerTokens) if (!viewer.includes(token)) failures.push(`viewer:${token}`);
for (const extension of requiredExtensions) {
  const quoted = `'${extension}'`;
  if (!educationApi.includes(quoted)) failures.push(`education-api:${extension}`);
}
if (!education.includes('/attachment-preview.js?v=1')) failures.push('education:viewer-script');
if (!education.includes('.ppt,.pptx')) failures.push('education:ppt-upload');
if (!partnerApi.includes('office_viewer_url')) failures.push('partner-api:office-viewer');
if (!worker.includes('attachment-preview.js?v=1')) failures.push('worker:viewer-injection');
if (failures.length) throw new Error(`Attachment preview verification failed: ${failures.join(', ')}`);

console.log(JSON.stringify({
  success: true,
  browser_renderers: ['pdf', 'xlsx', 'docx', 'pptx', 'image'],
  web_viewer_fallbacks: ['ppt', 'doc', 'hwp', 'hwpx'],
  allowed_extensions: requiredExtensions.length
}));
