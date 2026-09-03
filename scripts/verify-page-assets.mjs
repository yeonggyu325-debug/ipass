import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..');
const publicRoot=resolve(root,'public');
const manifest=JSON.parse(await readFile(resolve(publicRoot,'page-assets/manifest.json'),'utf8'));
assert.ok((manifest.pages||[]).length>=10,'at least ten large pages must be modularized');
assert.ok((manifest.assets||[]).length>=20,'page CSS and JS assets must be extracted');

let saved=0;
for(const page of manifest.pages){
  const html=await readFile(resolve(publicRoot,page.page),'utf8');
  assert.ok(!/<style\s*>[\s\S]{2000,}<\/style>/i.test(html),`${page.page}: large inline style remains`);
  assert.ok(!/<script\s*>[\s\S]{2000,}<\/script>/i.test(html),`${page.page}: large inline script remains`);
  for(const asset of [...page.styles,...page.scripts]){
    assert.ok(html.includes(`/${asset}`),`${page.page}: reference missing for ${asset}`);
    const content=await readFile(resolve(publicRoot,asset),'utf8');
    assert.ok(content.trim(),`${asset}: extracted asset is empty`);
    if(asset.endsWith('.js'))new Function(content);
  }
  const info=await stat(resolve(publicRoot,page.page));
  assert.equal(info.size,page.after_bytes,`${page.page}: manifest size mismatch`);
  saved+=Number(page.saved_bytes||0);
}
assert.ok(saved>200000,`expected substantial HTML reduction, got ${saved} bytes`);
console.log(JSON.stringify({success:true,pages:manifest.pages.length,assets:manifest.assets.length,saved_bytes:saved}));
