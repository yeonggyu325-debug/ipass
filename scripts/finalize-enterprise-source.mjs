import { readFile, writeFile } from 'node:fs/promises';

async function patch(path,transform){
  const before=await readFile(path,'utf8'),after=transform(before);
  if(after===before){console.log(`unchanged ${path}`);return}
  await writeFile(path,after);console.log(`patched ${path}`);
}
function replaceRequired(source,from,to,label){
  if(source.includes(to))return source;
  if(!source.includes(from))throw new Error(`Missing patch target: ${label}`);
  return source.replace(from,to);
}

await patch('src/worker.js',source=>{
  source=source.replace("  \"script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.sheetjs.com\",","  \"script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'\",");
  source=source.replace("  \"connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://cdn.sheetjs.com\",","  \"connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com\",");
  source=replaceRequired(source,"function applyCors(headers,request){",`function clearCorsHeaders(headers){\n  for(const name of ['access-control-allow-origin','access-control-allow-headers','access-control-allow-methods','access-control-allow-credentials','access-control-expose-headers'])headers.delete(name);\n}\nfunction applyCors(headers,request){`,'clear CORS headers helper');
  source=replaceRequired(source,"  const headers=new Headers(response.headers);headers.set('x-request-id',id);\n  if(isApi(path))applyCors(headers,request);","  const headers=new Headers(response.headers);headers.set('x-request-id',id);clearCorsHeaders(headers);\n  if(isApi(path))applyCors(headers,request);",'API CORS normalization');
  return source;
});

await patch('src/index.js',source=>{
  source=source.replaceAll("n.recipient_user_id IN (SELECT id FROM users WHERE role = 'admin')","COALESCE(n.recipient_account_id,n.recipient_user_id) IN (SELECT id FROM portal_accounts WHERE role='admin' AND approval_status='approved')");
  source=source.replaceAll("JOIN users u ON u.id = n.recipient_user_id\n                WHERE n.is_read = 0 AND u.role = 'admin'","JOIN portal_accounts pa ON pa.id = COALESCE(n.recipient_account_id,n.recipient_user_id)\n                WHERE n.is_read = 0 AND pa.role = 'admin' AND pa.approval_status = 'approved'");
  source=source.replaceAll("JOIN users u ON u.id = n.recipient_user_id\n              WHERE n.is_read = 0 AND u.role = 'admin'","JOIN portal_accounts pa ON pa.id = COALESCE(n.recipient_account_id,n.recipient_user_id)\n              WHERE n.is_read = 0 AND pa.role = 'admin' AND pa.approval_status = 'approved'");
  if(source.includes("SELECT id FROM users WHERE role = 'admin'"))throw new Error('legacy admin notification account query remains');
  return source;
});

await patch('public/attachment-preview.js',source=>{
  source=source.replace("xlsx: 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js'","xlsx: '/vendor/attachment-preview/xlsx.full.min.js'");
  if(source.includes('cdn.sheetjs.com'))throw new Error('external SheetJS runtime remains');
  return source;
});

await patch('scripts/prepare-preview-assets.mjs',source=>{
  const marker="  ['node_modules/docx-preview/dist/docx-preview.min.js', 'docx-preview.min.js'],";
  if(!source.includes("vendor/xlsx/xlsx.full.min.js"))source=source.replace(marker,`${marker}\n  ['vendor/xlsx/xlsx.full.min.js', 'xlsx.full.min.js'],`);
  const license="  ['node_modules/jszip/LICENSE.markdown', 'LICENSE-jszip.md']";
  if(!source.includes("vendor/xlsx/LICENSE.txt"))source=source.replace(license,`${license},\n  ['vendor/xlsx/LICENSE.txt', 'LICENSE-sheetjs.txt']`);
  return source;
});

await patch('scripts/verify-attachment-preview.mjs',source=>{
  source=source.replace("if(!worker.includes('attachment-preview.js?v=4'))failures.push('worker:viewer-injection');","if(!worker.includes('attachment-preview.js?v=4'))failures.push('worker:viewer-injection');\nif(!viewer.includes(\"xlsx: '/vendor/attachment-preview/xlsx.full.min.js'\")||viewer.includes('cdn.sheetjs.com'))failures.push('viewer:local-sheetjs');");
  source=source.replace("for(const asset of ['@rhwp/core/rhwp.js','@rhwp/core/rhwp_bg.wasm','LICENSE-rhwp.txt'])if(!assetBuilder.includes(asset))failures.push(`asset-builder:${asset}`);","for(const asset of ['@rhwp/core/rhwp.js','@rhwp/core/rhwp_bg.wasm','LICENSE-rhwp.txt','vendor/xlsx/xlsx.full.min.js','vendor/xlsx/LICENSE.txt'])if(!assetBuilder.includes(asset))failures.push(`asset-builder:${asset}`);");
  return source;
});

await patch('scripts/verify-system-stabilization.mjs',source=>{
  if(!source.includes("external SheetJS runtime must be removed"))source=source.replace("assert.ok(worker.includes('content-security-policy')&&worker.includes('strict-origin-when-cross-origin'),'security response policy missing');","assert.ok(worker.includes('content-security-policy')&&worker.includes('strict-origin-when-cross-origin'),'security response policy missing');assert.ok(!worker.includes('cdn.sheetjs.com')&&!preview.includes('cdn.sheetjs.com'),'external SheetJS runtime must be removed');assert.ok(worker.includes('clearCorsHeaders(headers)'),'upstream wildcard CORS headers must be normalized');");
  return source;
});

console.log(JSON.stringify({success:true,cors_normalized:true,canonical_notification_queries:true,local_sheetjs:true}));
