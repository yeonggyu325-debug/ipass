import fs from 'node:fs';

const files={
  committee:'public/committee.html',
  management:'public/evaluation-management.html',
  cycle:'public/evaluation-cycle.html',
  submit:'public/evaluation-submit.html',
  index:'public/index.html',
  worker:'src/worker-v20.js'
};

function read(path){return fs.readFileSync(path,'utf8')}
function write(path,text){fs.writeFileSync(path,text)}
function addShared(html){
  if(html.includes('/shared/auth.js?v=2'))return html;
  return html.replace('</head>','<script src="/shared/auth.js?v=2"></script>\n<script src="/shared/api.js?v=2"></script>\n</head>');
}
function replaceRequired(text,from,to,label){
  if(text.includes(to))return text;
  if(!text.includes(from))throw new Error(`missing replacement marker: ${label}`);
  return text.replace(from,to);
}
function replaceRange(text,start,end,replacement,label){
  const a=text.indexOf(start);const b=text.indexOf(end,a);
  if(a<0||b<0)throw new Error(`missing range marker: ${label}`);
  return text.slice(0,a)+replacement+text.slice(b);
}

function cleanCommittee(){
  let s=addShared(read(files.committee));
  s=s.replace('<link rel="preconnect" href="https://identitytoolkit.googleapis.com" crossorigin>\n','').replace('<link rel="preconnect" href="https://securetoken.googleapis.com" crossorigin>\n','');
  s=s.replace("const API_ORIGIN=location.hostname==='ipass.i-pass-eval.workers.dev'?'':'https://ipass.i-pass-eval.workers.dev';\n",'')
     .replace("const FIREBASE_API_KEY='AIzaSyC0s7buQaayKr84QA_wFNyF6rcs6w1-IoU';\n",'')
     .replace("const KEY='ipass.session.v10';\n",'')
     .replace("let session=null,currentUser=null,annualData=null,activeMonth=null,activeTab='partner',filterState='all',searchText='',editDirty=false;","let currentUser=null,annualData=null,activeMonth=null,activeTab='partner',filterState='all',searchText='',editDirty=false;");
  s=replaceRange(s,'async function refreshToken()','function buildYears()',"const api=(path,opt={})=>window.EHSApi.request(path,opt);\n",'committee api');
  s=replaceRequired(s,"function goHome(){if(editDirty&&!confirm('저장하지 않은 변경사항이 있습니다. 이동할까요?'))return;try{if(document.referrer&&new URL(document.referrer).origin===location.origin){history.back();return}}catch{}location.replace('/index.html')}","function goHome(){if(editDirty&&!confirm('저장하지 않은 변경사항이 있습니다. 이동할까요?'))return;location.href='/home'}",'committee home');
  const oldBoot="(async()=>{try{session=JSON.parse(sessionStorage.getItem(KEY)||'null');if(!session){location.replace('/index.html');return}buildYears();const me=await api('/api/me');if(me.auth_state!=='approved')throw Object.assign(new Error('로그인 또는 계정 승인이 필요합니다.'),{status:403});currentUser=me.user;$('userLabel').textContent=currentUser.name||currentUser.email||'';await loadYear()}catch(e){$('months').innerHTML=`<div class=\"error\" style=\"grid-column:1/-1\">${esc(e.message)}</div>`;$('detail').innerHTML=`<div class=\"error\">${esc(e.message)}</div>`}})();";
  const newBoot="(async()=>{try{currentUser=await window.EHSAuth.requireUser();buildYears();$('userLabel').textContent=currentUser.name||currentUser.email||'';await loadYear()}catch(e){if(e?.status===401)return;const msg=window.EHSApi.describe(e);$('months').innerHTML=`<div class=\"error\" style=\"grid-column:1/-1\">${esc(msg)}</div>`;$('detail').innerHTML=`<div class=\"error\">${esc(msg)}</div>`}})();";
  s=replaceRequired(s,oldBoot,newBoot,'committee boot');
  write(files.committee,s);
}

function cleanManagement(){
  let s=addShared(read(files.management));
  s=s.replace("const API_ORIGIN=location.hostname==='ipass.i-pass-eval.workers.dev'?'':'https://ipass.i-pass-eval.workers.dev';\n",'')
     .replace("const FIREBASE_API_KEY='AIzaSyC0s7buQaayKr84QA_wFNyF6rcs6w1-IoU';const KEY='ipass.session.v10';\n",'')
     .replace('let session=null,user=null,data=null,current=null,dirty=false;','let user=null,data=null,current=null,dirty=false;');
  s=replaceRange(s,'async function refreshToken()','function goHome()',"const api=(path,opt={})=>window.EHSApi.request(path,opt);\n",'management api');
  s=s.replace("function goHome(){if(dirty&&!confirm('저장하지 않은 변경사항이 있습니다. 이동할까요?'))return;location.href='/'}","function goHome(){if(dirty&&!confirm('저장하지 않은 변경사항이 있습니다. 이동할까요?'))return;location.href='/home'}");
  const old="async function load(){dirty=false;try{session=JSON.parse(sessionStorage.getItem(KEY)||'null');if(!session){location.href='/';return}const me=await api('/api/me');if(me.auth_state!=='approved'||me.user?.role!=='admin'){alert('관리자만 사용할 수 있습니다.');location.href='/';return}user=me.user;$('userLabel').textContent=user.name||user.email||'';await refreshBundle()}catch(e){$('workspace').innerHTML=`<div class=\"card\"><div class=\"empty\">${esc(e.message)}</div></div>`}}";
  const next="async function load(){dirty=false;try{user=await window.EHSAuth.requireUser({role:'admin'});$('userLabel').textContent=user.name||user.email||'';await refreshBundle()}catch(e){if(e?.status===401)return;$('workspace').innerHTML=`<div class=\"card\"><div class=\"empty\">${esc(window.EHSApi.describe(e))}</div></div>`}}";
  s=replaceRequired(s,old,next,'management boot');
  write(files.management,s);
}

function cleanCycle(){
  let s=addShared(read(files.cycle));
  s=s.replace(/const API_ORIGIN=.*?FIREBASE_API_KEY='[^']+';let session=null,user=null,data=null,current=null,targets=\[\],dirty=false;/,"let user=null,data=null,current=null,targets=[],dirty=false;");
  s=replaceRange(s,'async function refreshToken()','function renderList()',"const api=(path,opt={})=>window.EHSApi.request(path,opt);\n",'cycle api');
  s=s.replace("$('homeBtn').onclick=()=>{if(!dirty||confirm('저장하지 않은 변경사항이 있습니다. 이동할까요?'))location.href='/'};","$('homeBtn').onclick=()=>{if(!dirty||confirm('저장하지 않은 변경사항이 있습니다. 이동할까요?'))location.href='/home'};");
  const old="(async()=>{try{session=JSON.parse(sessionStorage.getItem(KEY)||'null');if(!session){location.href='/';return}const me=await api('/api/me');if(me.auth_state!=='approved'||me.user?.role!=='admin'){alert('관리자만 사용할 수 있습니다.');location.href='/';return}user=me.user;$('userLabel').textContent=user.name||user.email||'';await loadBundle()}catch(e){$('workspace').innerHTML=`<div class=\"empty\">${esc(e.message)}</div>`}})();";
  const next="(async()=>{try{user=await window.EHSAuth.requireUser({role:'admin'});$('userLabel').textContent=user.name||user.email||'';await loadBundle()}catch(e){if(e?.status===401)return;$('workspace').innerHTML=`<div class=\"empty\">${esc(window.EHSApi.describe(e))}</div>`}})();";
  s=replaceRequired(s,old,next,'cycle boot');
  write(files.cycle,s);
}

function cleanSubmit(){
  let s=addShared(read(files.submit));
  s=s.replace(/const ORIGIN=.*?FIREBASE_API_KEY='[^']+';\n/,'')
     .replace("let session=null,user=null,targetId='',data=null,dirty=new Set();","let user=null,targetId='',data=null,dirty=new Set();");
  s=replaceRange(s,'async function refreshToken()','function modal(',"const api=(path,opt={})=>window.EHSApi.request(path,opt);\n",'submit api');
  s=s.replace("function goHome(){if(dirty.size&&!confirm('저장하지 않은 변경사항이 있습니다. 이동할까요?'))return;location.href='/'}","function goHome(){if(dirty.size&&!confirm('저장하지 않은 변경사항이 있습니다. 이동할까요?'))return;location.href='/home'}");
  const old="(async function boot(){try{targetId=new URLSearchParams(location.search).get('target')||'';if(!targetId)throw new Error('평가 대상 정보가 없습니다.');session=JSON.parse(sessionStorage.getItem(KEY)||'null');if(!session){location.href='/';return}const me=await api('/api/me');if(me.auth_state!=='approved'||me.user?.role!=='partner'){location.href='/';return}user=me.user;$('userLabel').textContent=[user.company_name,user.name].filter(Boolean).join(' · ');await load()}catch(e){$('app').innerHTML=`<div class=\"loading error-text\">${esc(e.message)}</div>`}})();";
  const next="(async function boot(){try{targetId=new URLSearchParams(location.search).get('target')||'';if(!targetId)throw new Error('평가 대상 정보가 없습니다.');user=await window.EHSAuth.requireUser({role:'partner'});$('userLabel').textContent=[user.company_name,user.name].filter(Boolean).join(' · ');await load()}catch(e){if(e?.status===401)return;$('app').innerHTML=`<div class=\"loading error-text\">${esc(window.EHSApi.describe(e))}</div>`}})();";
  s=replaceRequired(s,old,next,'submit boot');
  write(files.submit,s);
}

function cleanIndex(){
  let s=addShared(read(files.index));
  s=replaceRange(s,'async function refreshToken()','async function publicApi(',"async function refreshToken(){return window.EHSAuth.token({forceRefresh:true})}\nasync function token(){return window.EHSAuth.token()}\nasync function api(path,options={}){return window.EHSApi.request(path,options)}\n",'index shared api');
  const oldLogin='const d=await firebasePost("accounts:signInWithPassword",{email,password:$("loginPassword").value,returnSecureToken:true});\n    session={idToken:d.idToken,refreshToken:d.refreshToken,expiresAt:Date.now()+Number(d.expiresIn||3600)*1000,email:d.email,uid:d.localId};\n    sessionStorage.setItem(SESSION_KEY,JSON.stringify(session));\n    const me=await api("/api/me");';
  const newLogin='await window.EHSAuth.signIn(email,$("loginPassword").value);\n    session=window.EHSAuth.readSession();\n    const me=await window.EHSApi.request("/api/me");';
  s=replaceRequired(s,oldLogin,newLogin,'index sign in');
  const oldLogout='function logout(){session=null;currentUser=null;GET_CACHE.clear();GET_INFLIGHT.clear();sessionStorage.removeItem(SESSION_KEY);$("app").classList.add("hidden");$("publicPortal").classList.remove("hidden");$("loginPassword").value=""}';
  const newLogout='function logout(){session=null;currentUser=null;GET_CACHE.clear();GET_INFLIGHT.clear();window.EHSAuth.logout()}';
  s=replaceRequired(s,oldLogout,newLogout,'index logout');
  const oldBoot='showLatestNotice("login");try{const raw=sessionStorage.getItem(SESSION_KEY);if(raw){session=JSON.parse(raw);const me=await api("/api/me");await routeAfterLogin(me)}}catch{logout()}})();';
  const newBoot='showLatestNotice("login");try{if(window.EHSAuth.readSession()){session=window.EHSAuth.readSession();const me=await window.EHSApi.request("/api/me");await routeAfterLogin(me)}}catch(e){if(e?.status===401){window.EHSAuth.clearSession();location.replace("/")}else console.error("session restore failed",e)}})();';
  s=replaceRequired(s,oldBoot,newBoot,'index boot');
  write(files.index,s);
}

function cleanWorker(){
  let s=read(files.worker);
  const start=s.indexOf('function replaceRange(');
  const end=s.indexOf('async function htmlResponse',start);
  if(start<0||end<0)throw new Error('worker auth patch block not found');
  s=s.slice(0,start)+s.slice(end);
  s=s.replace("  html=stabilizeHome(html);html=injectHead(html,COMMON_ASSETS,'/shared/auth.js?v=2');if(page)html=unifyProtectedPageAuth(html,page);if(home)html=injectHead(html,HOME_BOOT,'ehs-home-boot');","  html=injectHead(html,COMMON_ASSETS,'/shared/auth.js?v=2');if(home)html=injectHead(html,HOME_BOOT,'ehs-home-boot');")
     .replace('async function injectShared(response,{home=false,page=\'\',root=false,submission=false,embedded=false}={}){','async function injectShared(response,{home=false,root=false,submission=false,embedded=false}={}){')
     .replace('return response.ok?injectShared(response,{...options,page:path}):response','return response.ok?injectShared(response,options):response')
     .replace("injectShared(response,{page:path,submission:true})","injectShared(response,{submission:true})")
     .replace("injectShared(response,{page:path,embedded:url.searchParams.get('embedded')==='1'})","injectShared(response,{embedded:url.searchParams.get('embedded')==='1'})")
     .replace("injectShared(response,{page:path})","injectShared(response)");
  write(files.worker,s);
}

cleanCommittee();cleanManagement();cleanCycle();cleanSubmit();cleanIndex();cleanWorker();

const protectedFiles=[files.committee,files.management,files.cycle,files.submit,'public/ipass.html'];
const forbidden=[/FIREBASE_API_KEY/,/securetoken\.googleapis\.com/,/sessionStorage\.getItem\(['\"]ipass\.session\.v10/,/async function refreshToken\(/];
for(const path of protectedFiles){
  const text=read(path);
  if(!text.includes('/shared/auth.js?v=2')||!text.includes('/shared/api.js?v=2'))throw new Error(`${path}: shared auth modules missing`);
  for(const pattern of forbidden)if(pattern.test(text))throw new Error(`${path}: forbidden auth pattern ${pattern}`);
}
const worker=read(files.worker);
for(const name of ['unifyProtectedPageAuth','replaceProtectedBoot','replaceLegacyApiFunctions','stabilizeHome'])if(worker.includes(name))throw new Error(`worker legacy auth patch remains: ${name}`);
console.log('Authentication source cleanup completed and verified.');
