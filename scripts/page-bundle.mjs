import { readFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..');

function localReference(value){
  if(!value||!value.startsWith('/')||value.startsWith('//'))return null;
  return value.split('?')[0].replace(/^\//,'');
}

export async function readPageBundle(relativePath){
  const absolute=resolve(root,relativePath),html=await readFile(absolute,'utf8');
  const directory=dirname(relativePath);
  const refs=[
    ...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*><\/script>/gi),
    ...html.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi),
    ...html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["']stylesheet["'][^>]*>/gi)
  ].map(match=>localReference(match[1])).filter(Boolean);
  const assets=[];
  for(const ref of [...new Set(refs)]){
    if(!ref.startsWith('page-assets/'))continue;
    assets.push({path:ref,content:await readFile(resolve(root,'public',ref),'utf8')});
  }
  const scripts=assets.filter(asset=>asset.path.endsWith('.js')).map(asset=>asset.content);
  const styles=assets.filter(asset=>asset.path.endsWith('.css')).map(asset=>asset.content);
  return{
    path:relativePath,
    name:basename(relativePath),
    html,
    assets,
    scripts,
    styles,
    source:[html,...styles,...scripts].join('\n')
  };
}
