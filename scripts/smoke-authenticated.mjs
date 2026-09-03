import assert from 'node:assert/strict';

const ORIGIN=process.env.IPASS_ORIGIN||'https://ipass.i-pass-eval.workers.dev';
const FIREBASE_API_KEY=process.env.IPASS_FIREBASE_API_KEY||'AIzaSyC0s7buQaayKr84QA_wFNyF6rcs6w1-IoU';

async function signIn(email,password){
  assert.ok(email&&password,'authenticated smoke credentials are required');
  const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(FIREBASE_API_KEY)}`,{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})
  });
  const data=await response.json().catch(()=>({}));
  assert.equal(response.status,200,`Firebase sign-in failed: ${data?.error?.message||response.status}`);
  assert.ok(data.idToken,'Firebase idToken missing');
  return data.idToken;
}

async function api(token,path,{status=200}={}){
  const response=await fetch(new URL(path,ORIGIN),{headers:{authorization:`Bearer ${token}`,accept:'application/json'}});
  const data=await response.json().catch(()=>({}));
  assert.equal(response.status,status,`${path}: HTTP ${response.status} ${data?.error||data?.message||''}`);
  if(status>=200&&status<300)assert.notEqual(data.success,false,`${path}: success=false`);
  return data;
}

async function checkAdmin(){
  const token=await signIn(process.env.IPASS_ADMIN_EMAIL,process.env.IPASS_ADMIN_PASSWORD);
  const me=await api(token,'/api/me');
  assert.equal(me.auth_state,'approved','admin account is not approved');
  assert.equal(me.user?.role,'admin','admin smoke account must have admin role');
  const diagnostics=await api(token,'/api/admin/system/diagnostics');
  assert.equal(diagnostics.checks?.d1,true,'admin diagnostics D1 check failed');
  await api(token,'/api/admin/system/database');
  await api(token,'/api/admin/dashboard-bundle');
  await api(token,'/api/admin/registrations');
  await api(token,'/api/notifications?limit=5');
  return {role:'admin',account_id:me.user.id,diagnostics:true};
}

async function checkPartner(){
  const token=await signIn(process.env.IPASS_PARTNER_EMAIL,process.env.IPASS_PARTNER_PASSWORD);
  const me=await api(token,'/api/me');
  assert.equal(me.auth_state,'approved','partner account is not approved');
  assert.equal(me.user?.role,'partner','partner smoke account must have partner role');
  const evaluations=await api(token,'/api/my/evaluations');
  await api(token,`/api/annual-ipass?year=${new Date().getFullYear()}`);
  await api(token,'/api/notifications?limit=5');
  const first=(evaluations.evaluations||[])[0];
  if(first?.id)await api(token,`/api/partner/submission/${encodeURIComponent(first.id)}`);
  return {role:'partner',account_id:me.user.id,evaluation_checked:Boolean(first?.id)};
}

const [admin,partner]=await Promise.all([checkAdmin(),checkPartner()]);
console.log(JSON.stringify({success:true,origin:ORIGIN,admin,partner}));
