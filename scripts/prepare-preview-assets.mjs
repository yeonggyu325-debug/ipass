import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'public/vendor/attachment-preview');
const assets = [
  ['node_modules/pdfjs-dist/build/pdf.min.mjs', 'pdf.min.mjs'],
  ['node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'pdf.worker.min.mjs'],
  ['node_modules/@aiden0z/pptx-renderer/dist/aiden0z-pptx-renderer.browser.es.js', 'pptx-renderer.es.js'],
  ['node_modules/jszip/dist/jszip.min.js', 'jszip.min.js'],
  ['node_modules/docx-preview/dist/docx-preview.min.js', 'docx-preview.min.js'],
  ['node_modules/pdfjs-dist/LICENSE', 'LICENSE-pdfjs.txt'],
  ['node_modules/@aiden0z/pptx-renderer/LICENSE', 'LICENSE-pptx-renderer.txt'],
  ['node_modules/docx-preview/LICENSE', 'LICENSE-docx-preview.txt'],
  ['node_modules/jszip/LICENSE.markdown', 'LICENSE-jszip.md']
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const [source, target] of assets) {
  await copyFile(resolve(root, source), resolve(output, target));
}

console.log(JSON.stringify({ success: true, preview_assets: assets.map(([, target]) => target) }));
