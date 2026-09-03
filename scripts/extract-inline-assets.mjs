import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..');
const publicRoot=resolve(root,'public');
const outputRoot=resolve(publicRoot,'page-assets');
const manifestPath=resolve(outputRoot,'manifest.json');
const pages=[
  'index.html','committee.html','content-hub.html','education.html','voc.html','faq.html','ipass.html',
  'evaluation-management.html','evaluation-cycle.html','evaluation-submit.html','evaluation-scoring.html',
  'admin-accounts.html','admin-system.html'
];
const hash=value=>createHash('sha256').update(value).digest('hex').slice(0,12);
const exists=async path=>{try{await access(path);return true}catch{return false}};

if(await exists(manifestPath)){
  const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  for(const asset of manifest.assets||[])if(!await exists(resolve(publicRoot,asset.path)))throw new Error(`Missing extracted page asset: ${asset.path}`);
  console.log(JSON.stringify({success:true,already_extracted:true,pages:manifest.pages?.length||0,assets:manifest.assets?.length||0}));
  process.exit(0);
}

await rm(outputRoot,{recursive:true,force:true});
await mkdir(outputRoot,{recursive:true});
const manifest={version:1,generated_at:new Date().toISOString(),pages:[],assets:[]};

for(const page of pages){
  const sourcePath=resolve(publicRoot,page);
  if(!await exists(sourcePath))continue;
  let html=await readFile(sourcePath,'utf8');
  const stem=basename(page,'.html').replace(/[^a-z0-9-]/gi,'-');
  let styleIndex=0,scriptIndex=0;
  const pageEntry={page,styles:[],scripts:[],before_bytes:Buffer.byteLength(html),after_bytes:0};

  const styles=[...html.matchAll(/<style\s*>([\s\S]*?)<\/style>/gi)];
  for(const match of styles){
    styleIndex+=1;
    const content=match[1].trim()+"\n",file=`${stem}.style-${styleIndex}.${hash(content)}.css`,path=`page-assets/${file}`;
    await writeFile(resolve(outputRoot,file),content);
    html=html.replace(match[0],`<link rel="stylesheet" href="/${path}">`);
    pageEntry.styles.push(path);manifest.assets.push({page,path,type:'style',bytes:Buffer.byteLength(content)});
  }

  const scripts=[...html.matchAll(/<script\s*>([\s\S]*?)<\/script>/gi)];
  for(const match of scripts){
    scriptIndex+=1;
    const content=match[1].trim()+"\n";
    // Syntax validation before replacing the source document.
    new Function(content);
    const file=`${stem}.script-${scriptIndex}.${hash(content)}.js`,path=`page-assets/${file}`;
    await writeFile(resolve(outputRoot,file),content);
    html=html.replace(match[0],`<script src="/${path}"></script>`);
    pageEntry.scripts.push(path);manifest.assets.push({page,path,type:'script',bytes:Buffer.byteLength(content)});
  }

  pageEntry.after_bytes=Buffer.byteLength(html);
  pageEntry.saved_bytes=pageEntry.before_bytes-pageEntry.after_bytes;
  if(pageEntry.styles.length||pageEntry.scripts.length){await writeFile(sourcePath,html);manifest.pages.push(pageEntry)}
}

await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({success:true,already_extracted:false,pages:manifest.pages.length,assets:manifest.assets.length,saved_bytes:manifest.pages.reduce((sum,page)=>sum+page.saved_bytes,0)}));
