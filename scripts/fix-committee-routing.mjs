import fs from 'node:fs';

const path='src/worker-v20.js';
let s=fs.readFileSync(path,'utf8');

const oldCommon=`const COMMON_ASSETS='<link rel="stylesheet" href="/ehs-common.css?v=2"><script src="/shared/auth.js?v=2"></script><script src="/shared/api.js?v=2"></script><script src="/ehs-common.js?v=4"></script>';`;
const newCommon=`const COMMON_STYLE='<link rel="stylesheet" href="/ehs-common.css?v=2">';\nconst COMMON_AUTH='<script src="/shared/auth.js?v=2"></script>';\nconst COMMON_API='<script src="/shared/api.js?v=2"></script>';\nconst COMMON_BEHAVIOR='<script src="/ehs-common.js?v=5"></script>';`;
if(!s.includes(oldCommon))throw new Error('COMMON_ASSETS marker not found');
s=s.replace(oldCommon,newCommon);

const oldInject=`  html=injectHead(html,COMMON_ASSETS,'/shared/auth.js?v=2');if(home)html=injectHead(html,HOME_BOOT,'ehs-home-boot');`;
const newInject=`  html=injectHead(html,COMMON_STYLE,'/ehs-common.css?v=2');\n  html=injectHead(html,COMMON_AUTH,'/shared/auth.js?v=2');\n  html=injectHead(html,COMMON_API,'/shared/api.js?v=2');\n  html=injectHead(html,COMMON_BEHAVIOR,'/ehs-common.js?v=5');\n  if(home)html=injectHead(html,HOME_BOOT,'ehs-home-boot');`;
if(!s.includes(oldInject))throw new Error('injectShared marker not found');
s=s.replace(oldInject,newInject);

const oldCommittee=`  if(request.method==='GET'&&path==='/committee')return serveAsset(request,env,'/committee.html');`;
const newCommittee=`  if(request.method==='GET'&&path==='/committee.html'){const next=new URL(request.url);next.pathname='/committee';return Response.redirect(next.toString(),302)}\n  if(request.method==='GET'&&path==='/committee')return serveAsset(request,env,'/committee.html');`;
if(!s.includes(oldCommittee))throw new Error('committee route marker not found');
s=s.replace(oldCommittee,newCommittee);

const oldRoot=`if(text==='i-PaSS 관리'){e.preventDefault();e.stopImmediatePropagation();location.href='/ipass'}else if(text==='평가표 관리'){e.preventDefault();e.stopImmediatePropagation();location.href='/ipass/templates'}else if(text==='평가회차 운영'){e.preventDefault();e.stopImmediatePropagation();location.href='/ipass/cycles'}`;
const newRoot=`if(text==='i-PaSS 관리'){e.preventDefault();e.stopImmediatePropagation();location.href='/ipass'}else if(text==='평가표 관리'){e.preventDefault();e.stopImmediatePropagation();location.href='/ipass/templates'}else if(text==='평가회차 운영'){e.preventDefault();e.stopImmediatePropagation();location.href='/ipass/cycles'}else if(text.indexOf('안전보건협의체')>=0){e.preventDefault();e.stopImmediatePropagation();location.href='/committee'}`;
if(!s.includes(oldRoot))throw new Error('root route marker not found');
s=s.replace(oldRoot,newRoot);

if(s.includes('COMMON_ASSETS'))throw new Error('legacy COMMON_ASSETS remains');
if(!s.includes("COMMON_BEHAVIOR,'/ehs-common.js?v=5'"))throw new Error('common behavior injection missing');
if(!s.includes("path==='/committee.html'"))throw new Error('committee redirect missing');
fs.writeFileSync(path,s);
console.log('committee routing and common asset injection fixed');
