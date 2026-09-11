import { handleFastEducationOverview } from './education-overview-fast.js';

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=utf-8'}})}
let schemaReady=null;

async function currentUser(request,env,ctx,baseWorker){
  const u=new URL(request.url);u.pathname='/api/me';u.search='';
  const response=await baseWorker.fetch(new Request(u.toString(),{method:'GET',headers:request.headers}),env,ctx);
  if(!response.ok)return {ok:false,response};
  const data=await response.json().catch(()=>null);
  if(!data?.user||data.auth_state!=='approved')return {ok:false,response:json({success:false,error:'로그인이 필요합니다.'},401)};
  return {ok:true,user:data.user};
}

async function columns(env,table){const r=await env.partner_evaluation_db.prepare(`PRAGMA table_info(${table})`).all();return new Set((r?.results||[]).map(x=>x.name))}

async function ensureSchema(env){
  if(schemaReady)return schemaReady;
  schemaReady=(async()=>{
    await env.partner_evaluation_db.prepare(`CREATE TABLE IF NOT EXISTS partner_management(company_id TEXT PRIMARY KEY,is_target INTEGER NOT NULL DEFAULT 1 CHECK(is_target IN(0,1)),signup_enabled INTEGER NOT NULL DEFAULT 1 CHECK(signup_enabled IN(0,1)),updated_by TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
    let c=await columns(env,'partner_management');
    for(const [name,ddl] of [['signup_enabled',`ALTER TABLE partner_management ADD COLUMN signup_enabled INTEGER NOT NULL DEFAULT 1`],['logo_key',`ALTER TABLE partner_management ADD COLUMN logo_key TEXT`],['logo_content_type',`ALTER TABLE partner_management ADD COLUMN logo_content_type TEXT`],['logo_updated_at',`ALTER TABLE partner_management ADD COLUMN logo_updated_at TEXT`]])if(!c.has(name)){try{await env.partner_evaluation_db.prepare(ddl).run()}catch(e){console.warn('optional partner column migration failed',name,e)}}
    c=await columns(env,'portal_accounts');
    if(!c.has('job_title')){try{await env.partner_evaluation_db.prepare(`ALTER TABLE portal_accounts ADD COLUMN job_title TEXT`).run()}catch(e){console.warn('job_title migration failed',e)}}
    await env.partner_evaluation_db.prepare(`CREATE TABLE IF NOT EXISTS committee_target_preferences(entity_type TEXT NOT NULL CHECK(entity_type IN('partner','department')),entity_id TEXT NOT NULL,is_target INTEGER NOT NULL DEFAULT 1 CHECK(is_target IN(0,1)),updated_by TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(entity_type,entity_id))`).run();
    await env.partner_evaluation_db.prepare(`CREATE INDEX IF NOT EXISTS idx_partner_management_target ON partner_management(is_target)`).run();
    await env.partner_evaluation_db.prepare(`CREATE INDEX IF NOT EXISTS idx_partner_management_signup ON partner_management(signup_enabled)`).run();

    try{
      const d=await env.partner_evaluation_db.prepare(`SELECT id FROM companies WHERE company_name='동해산업' AND status='active'`).all();
      for(const row of d?.results||[]){
        try{await env.partner_evaluation_db.prepare(`UPDATE portal_accounts SET approval_status='suspended',updated_at=CURRENT_TIMESTAMP WHERE company_id=? AND role='partner'`).bind(row.id).run()}catch(e){console.warn('donghae account suspend failed',e)}
        try{await env.partner_evaluation_db.prepare(`DELETE FROM portal_accounts WHERE company_id=? AND role='partner'`).bind(row.id).run()}catch(e){console.warn('donghae account delete deferred',e)}
        try{await env.partner_evaluation_db.prepare(`DELETE FROM committee_target_preferences WHERE entity_type='partner' AND entity_id=?`).bind(row.id).run()}catch(e){}
        try{await env.partner_evaluation_db.prepare(`DELETE FROM partner_management WHERE company_id=?`).bind(row.id).run()}catch(e){}
        await env.partner_evaluation_db.prepare(`UPDATE companies SET status='inactive' WHERE id=?`).bind(row.id).run();
      }
    }catch(e){console.warn('donghae cleanup skipped',e)}

    await env.partner_evaluation_db.prepare(`INSERT INTO partner_management(company_id,is_target,signup_enabled,updated_at) SELECT c.id,COALESCE(p.is_target,1),1,CURRENT_TIMESTAMP FROM companies c LEFT JOIN committee_target_preferences p ON p.entity_type='partner' AND p.entity_id=c.id WHERE c.status='active' ON CONFLICT(company_id) DO NOTHING`).run();
    await env.partner_evaluation_db.prepare(`INSERT INTO committee_target_preferences(entity_type,entity_id,is_target,updated_at) SELECT 'partner',company_id,is_target,CURRENT_TIMESTAMP FROM partner_management ON CONFLICT(entity_type,entity_id) DO UPDATE SET is_target=excluded.is_target,updated_at=CURRENT_TIMESTAMP`).run();
  })().catch(e=>{schemaReady=null;throw e});
  return schemaReady;
}

async function hasJobTitle(env){return (await columns(env,'portal_accounts')).has('job_title')}

async function augmentMe(response,env){
  if(!response.ok)return response;const data=await response.clone().json().catch(()=>null);if(!data?.user)return response;
  try{
    await ensureSchema(env);
    if(data.user.id&&await hasJobTitle(env)){const p=await env.partner_evaluation_db.prepare(`SELECT job_title FROM portal_accounts WHERE id=? LIMIT 1`).bind(data.user.id).first();data.user.job_title=p?.job_title||null}
    if(data.user.role==='partner'&&data.user.company_id){const l=await env.partner_evaluation_db.prepare(`SELECT logo_key,logo_updated_at FROM partner_management WHERE company_id=? LIMIT 1`).bind(data.user.company_id).first();if(l?.logo_key)data.user.logo_url=`/api/partner-logo/${encodeURIComponent(data.user.company_id)}?v=${encodeURIComponent(l.logo_updated_at||'1')}`}
    return json(data,response.status);
  }catch(e){console.warn('me augmentation skipped',e);return response}
}

function normalizeNotification(r){return{id:r.id,title:r.title||r.notification_title||r.type||'업무 알림',message:r.message||r.content||r.body||'',type:r.type||r.notification_type||'general',is_read:Number(r.is_read||0)===1,created_at:r.created_at||r.updated_at||null}}

export async function handlePortalShellApi(request,env,ctx,baseWorker){
  const fast=await handleFastEducationOverview(request,env,ctx,baseWorker);if(fast)return fast;
  const url=new URL(request.url),path=url.pathname;
  const partnerMatch=path.match(/^\/api\/admin\/partners(?:\/([^/]+))?$/);
  const logoMatch=path.match(/^\/api\/admin\/partners\/([^/]+)\/logo$/);
  const publicLogoMatch=path.match(/^\/api\/partner-logo\/([^/]+)$/);
  const regMatch=path.match(/^\/api\/admin\/registrations(?:\/([^/]+))?$/);

  if(path==='/api/me'&&request.method==='GET')return augmentMe(await baseWorker.fetch(request,env,ctx),env);

  if(publicLogoMatch&&request.method==='GET'){
    try{await ensureSchema(env);const id=decodeURIComponent(publicLogoMatch[1]);const row=await env.partner_evaluation_db.prepare(`SELECT logo_key,logo_content_type FROM partner_management WHERE company_id=? LIMIT 1`).bind(id).first();if(!row?.logo_key||!env.EVIDENCE_FILES)return new Response(null,{status:404});const obj=await env.EVIDENCE_FILES.get(row.logo_key);if(!obj)return new Response(null,{status:404});return new Response(obj.body,{headers:{'content-type':row.logo_content_type||'image/png','cache-control':'public,max-age=3600'}})}catch(e){return new Response(null,{status:404})}
  }

  if(path==='/api/public/companies'&&request.method==='GET'){
    try{await ensureSchema(env);const {results}=await env.partner_evaluation_db.prepare(`SELECT c.id,c.company_name,c.industry_code,c.industry_name FROM companies c JOIN partner_management pm ON pm.company_id=c.id WHERE c.status='active' AND pm.signup_enabled=1 ORDER BY c.company_name COLLATE NOCASE`).all();return json({success:true,companies:results||[]})}catch(e){console.error('public companies failed',e);return json({success:false,error:'가입 가능한 협력사 목록을 불러오지 못했습니다.'},500)}
  }

  if(path==='/api/auth/register'&&request.method==='POST'){
    try{
      await ensureSchema(env);const body=await request.clone().json().catch(()=>({}));const companyId=String(body.company_id||'').trim();
      const company=companyId?await env.partner_evaluation_db.prepare(`SELECT c.id FROM companies c JOIN partner_management pm ON pm.company_id=c.id WHERE c.id=? AND c.status='active' AND pm.signup_enabled=1 LIMIT 1`).bind(companyId).first():null;
      if(!company)return json({success:false,error:'회원가입이 허용된 협력사만 가입할 수 있습니다.'},400);
      const response=await baseWorker.fetch(request,env,ctx);if(!response.ok)return response;const data=await response.clone().json().catch(()=>null);
      if(data?.account?.id&&await hasJobTitle(env))await env.partner_evaluation_db.prepare(`UPDATE portal_accounts SET job_title=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(String(body.job_title||'').trim().slice(0,80)||null,data.account.id).run();
      return response;
    }catch(e){console.error('register extension failed',e);return json({success:false,error:'회원가입 정보를 저장하지 못했습니다.'},500)}
  }

  const needsAuth=path==='/api/notifications'||path==='/api/profile/display-name'||!!partnerMatch||!!logoMatch||!!regMatch;if(!needsAuth)return null;
  const auth=await currentUser(request,env,ctx,baseWorker);if(!auth.ok)return auth.response;const user=auth.user;

  if(regMatch){
    if(user.role!=='admin')return json({success:false,error:'관리자 권한이 필요합니다.'},403);
    if(request.method==='GET'&&!regMatch[1]){
      try{await ensureSchema(env);const job=await hasJobTitle(env);const {results}=await env.partner_evaluation_db.prepare(`SELECT pa.id,pa.company_id,c.company_name,pa.name,pa.position,${job?'pa.job_title':'NULL AS job_title'},pa.phone,pa.email,pa.email_verified,pa.approval_status,pa.rejection_reason,pa.created_at FROM portal_accounts pa LEFT JOIN companies c ON c.id=pa.company_id WHERE pa.role='partner' ORDER BY CASE pa.approval_status WHEN 'pending' THEN 1 WHEN 'rejected' THEN 2 WHEN 'approved' THEN 3 ELSE 4 END,pa.created_at DESC`).all();return json({success:true,registrations:results||[]})}catch(e){console.error('account list failed',e);return json({success:false,error:'계정 목록을 불러오지 못했습니다.'},500)}
    }
    if(request.method==='DELETE'&&regMatch[1]){
      try{const id=decodeURIComponent(regMatch[1]);const a=await env.partner_evaluation_db.prepare(`SELECT id,email,role FROM portal_accounts WHERE id=? LIMIT 1`).bind(id).first();if(!a||a.role!=='partner')return json({success:false,error:'삭제할 협력사 계정을 찾을 수 없습니다.'},404);await env.partner_evaluation_db.prepare(`DELETE FROM portal_accounts WHERE id=? AND role='partner'`).bind(id).run();return json({success:true,deleted_account_id:id,email:a.email||null})}catch(e){console.error('account delete failed',e);return json({success:false,error:'계정을 삭제하지 못했습니다. 연결된 업무 이력이 있는지 확인해 주세요.'},409)}
    }
    return null;
  }

  if(logoMatch){
    if(user.role!=='admin')return json({success:false,error:'관리자 권한이 필요합니다.'},403);const id=decodeURIComponent(logoMatch[1]);
    try{await ensureSchema(env);const company=await env.partner_evaluation_db.prepare(`SELECT id FROM companies WHERE id=? AND status='active' LIMIT 1`).bind(id).first();if(!company)return json({success:false,error:'협력사를 찾을 수 없습니다.'},404);const cur=await env.partner_evaluation_db.prepare(`SELECT logo_key FROM partner_management WHERE company_id=? LIMIT 1`).bind(id).first();
      if(request.method==='PUT'){if(!env.EVIDENCE_FILES)return json({success:false,error:'로고 저장소를 사용할 수 없습니다.'},503);const form=await request.formData().catch(()=>null),file=form?.get('logo');if(!file||typeof file.arrayBuffer!=='function')return json({success:false,error:'로고 파일을 선택하세요.'},400);const type=String(file.type||'').toLowerCase();if(!['image/png','image/jpeg','image/webp'].includes(type))return json({success:false,error:'PNG, JPG, WEBP 로고만 업로드할 수 있습니다.'},400);if(Number(file.size||0)>2097152)return json({success:false,error:'로고 파일은 2MB 이하만 가능합니다.'},400);const ext=type==='image/png'?'png':type==='image/webp'?'webp':'jpg',key=`partner-logos/${id}/${crypto.randomUUID()}.${ext}`;await env.EVIDENCE_FILES.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:type}});await env.partner_evaluation_db.prepare(`UPDATE partner_management SET logo_key=?,logo_content_type=?,logo_updated_at=CURRENT_TIMESTAMP,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE company_id=?`).bind(key,type,user.id||null,id).run();if(cur?.logo_key&&cur.logo_key!==key)try{await env.EVIDENCE_FILES.delete(cur.logo_key)}catch{}return json({success:true,logo_url:`/api/partner-logo/${encodeURIComponent(id)}?v=${Date.now()}`})}
      if(request.method==='DELETE'){if(cur?.logo_key&&env.EVIDENCE_FILES)try{await env.EVIDENCE_FILES.delete(cur.logo_key)}catch{}await env.partner_evaluation_db.prepare(`UPDATE partner_management SET logo_key=NULL,logo_content_type=NULL,logo_updated_at=NULL,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE company_id=?`).bind(user.id||null,id).run();return json({success:true})}
      return json({success:false,error:'지원하지 않는 로고 요청입니다.'},405);
    }catch(e){console.error('logo update failed',e);return json({success:false,error:'협력사 로고를 저장하지 못했습니다.'},500)}
  }

  if(partnerMatch){
    if(user.role!=='admin')return json({success:false,error:'관리자 권한이 필요합니다.'},403);
    try{await ensureSchema(env)}catch(e){console.error('partner schema failed',e);return json({success:false,error:'협력사 관리정보를 준비하지 못했습니다.'},500)}
    if(request.method==='GET'&&!partnerMatch[1]){try{const {results}=await env.partner_evaluation_db.prepare(`SELECT c.id,c.company_name,c.industry_code,c.industry_name,c.status,pm.is_target,pm.signup_enabled,pm.logo_key,pm.logo_updated_at,COALESCE(a.account_count,0) account_count FROM companies c JOIN partner_management pm ON pm.company_id=c.id LEFT JOIN(SELECT company_id,COUNT(*) account_count FROM portal_accounts WHERE role='partner' AND approval_status IN('pending','approved','suspended') GROUP BY company_id)a ON a.company_id=c.id WHERE c.status='active' ORDER BY c.company_name COLLATE NOCASE`).all();const partners=(results||[]).map(r=>({...r,is_target:Number(r.is_target)!==0,signup_enabled:Number(r.signup_enabled)!==0,has_logo:!!r.logo_key,logo_url:r.logo_key?`/api/partner-logo/${encodeURIComponent(r.id)}?v=${encodeURIComponent(r.logo_updated_at||'1')}`:null,account_count:Number(r.account_count||0)}));return json({success:true,partners,summary:{total:partners.length,target:partners.filter(r=>r.is_target).length,non_target:partners.filter(r=>!r.is_target).length,signup_enabled:partners.filter(r=>r.signup_enabled).length,accounts:partners.reduce((s,r)=>s+r.account_count,0)}})}catch(e){console.error('partner list failed',e);return json({success:false,error:'협력사 목록을 불러오지 못했습니다.'},500)}}
    if(request.method==='POST'&&!partnerMatch[1]){const b=await request.json().catch(()=>({})),name=String(b.company_name||'').trim(),industry=String(b.industry_name||'').trim(),code=String(b.industry_code||'').trim();if(!name)return json({success:false,error:'협력사명을 입력하세요.'},400);try{const ex=await env.partner_evaluation_db.prepare(`SELECT id,status FROM companies WHERE lower(company_name)=lower(?) LIMIT 1`).bind(name).first();if(ex?.status==='active')return json({success:false,error:'이미 등록된 협력사입니다.'},409);const id=ex?.id||crypto.randomUUID();if(ex)await env.partner_evaluation_db.prepare(`UPDATE companies SET company_name=?,industry_name=?,industry_code=?,status='active' WHERE id=?`).bind(name,industry||null,code||null,id).run();else await env.partner_evaluation_db.prepare(`INSERT INTO companies(id,company_name,industry_code,industry_name,status) VALUES(?,?,?,?, 'active')`).bind(id,name,code||null,industry||null).run();await env.partner_evaluation_db.batch([env.partner_evaluation_db.prepare(`INSERT INTO partner_management(company_id,is_target,signup_enabled,updated_by,updated_at) VALUES(?,1,1,?,CURRENT_TIMESTAMP) ON CONFLICT(company_id) DO UPDATE SET is_target=1,signup_enabled=1,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`).bind(id,user.id||null),env.partner_evaluation_db.prepare(`INSERT INTO committee_target_preferences(entity_type,entity_id,is_target,updated_by,updated_at) VALUES('partner',?,1,?,CURRENT_TIMESTAMP) ON CONFLICT(entity_type,entity_id) DO UPDATE SET is_target=1,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`).bind(id,user.id||null)]);return json({success:true,partner:{id,company_name:name,industry_name:industry,industry_code:code,is_target:true,signup_enabled:true,has_logo:false,account_count:0}},201)}catch(e){return json({success:false,error:'협력사를 등록하지 못했습니다.'},500)}}
    if(request.method==='PATCH'&&partnerMatch[1]){const id=decodeURIComponent(partnerMatch[1]),b=await request.json().catch(()=>null);if(!b)return json({success:false,error:'변경할 값이 없습니다.'},400);const ht=typeof b.is_target==='boolean'||b.is_target===0||b.is_target===1,hs=typeof b.signup_enabled==='boolean'||b.signup_enabled===0||b.signup_enabled===1;if(!ht&&!hs)return json({success:false,error:'변경할 값이 없습니다.'},400);try{const cur=await env.partner_evaluation_db.prepare(`SELECT is_target,signup_enabled FROM partner_management WHERE company_id=?`).bind(id).first();if(!cur)return json({success:false,error:'협력사 정보를 찾을 수 없습니다.'},404);const t=ht?(b.is_target===true||b.is_target===1?1:0):Number(cur.is_target??1),s=hs?(b.signup_enabled===true||b.signup_enabled===1?1:0):Number(cur.signup_enabled??1);await env.partner_evaluation_db.batch([env.partner_evaluation_db.prepare(`UPDATE partner_management SET is_target=?,signup_enabled=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE company_id=?`).bind(t,s,user.id||null,id),env.partner_evaluation_db.prepare(`INSERT INTO committee_target_preferences(entity_type,entity_id,is_target,updated_by,updated_at) VALUES('partner',?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(entity_type,entity_id) DO UPDATE SET is_target=excluded.is_target,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`).bind(id,t,user.id||null)]);return json({success:true,partner:{id,is_target:t===1,signup_enabled:s===1}})}catch(e){return json({success:false,error:'협력사 설정을 저장하지 못했습니다.'},500)}}
    return json({success:false,error:'지원하지 않는 협력사 관리 요청입니다.'},405);
  }

  if(path==='/api/notifications'&&request.method==='GET'){try{let r;if(user.role==='admin')r=await env.partner_evaluation_db.prepare(`SELECT * FROM notifications WHERE recipient_user_id IN(SELECT id FROM users WHERE role='admin') ORDER BY created_at DESC LIMIT 100`).all();else r=await env.partner_evaluation_db.prepare(`SELECT * FROM notifications WHERE recipient_user_id=? ORDER BY created_at DESC LIMIT 100`).bind(user.id).all();const n=(r?.results||[]).map(normalizeNotification);return json({success:true,notifications:n,unread_count:n.filter(x=>!x.is_read).length})}catch(e){return json({success:false,error:'알림 목록을 불러오지 못했습니다.'},500)}}
  if(path==='/api/notifications'&&request.method==='PATCH'){const b=await request.json().catch(()=>({}));try{if(user.role==='admin'){if(b.all===true)await env.partner_evaluation_db.prepare(`UPDATE notifications SET is_read=1 WHERE recipient_user_id IN(SELECT id FROM users WHERE role='admin')`).run();else if(b.id)await env.partner_evaluation_db.prepare(`UPDATE notifications SET is_read=1 WHERE id=? AND recipient_user_id IN(SELECT id FROM users WHERE role='admin')`).bind(String(b.id)).run()}else{if(b.all===true)await env.partner_evaluation_db.prepare(`UPDATE notifications SET is_read=1 WHERE recipient_user_id=?`).bind(user.id).run();else if(b.id)await env.partner_evaluation_db.prepare(`UPDATE notifications SET is_read=1 WHERE id=? AND recipient_user_id=?`).bind(String(b.id),user.id).run()}return json({success:true})}catch(e){return json({success:false,error:'알림 읽음 처리에 실패했습니다.'},500)}}
  if(path==='/api/profile/display-name'&&request.method==='PATCH'){if(user.role!=='admin')return json({success:false,error:'관리자만 표시 이름을 변경할 수 있습니다.'},403);const b=await request.json().catch(()=>({})),name=String(b.name||'').trim();if(!name||name.length>40)return json({success:false,error:'관리자 이름을 1~40자로 입력하세요.'},400);try{await env.partner_evaluation_db.prepare(`UPDATE portal_accounts SET name=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND role='admin'`).bind(name,user.id).run();return json({success:true,name})}catch(e){return json({success:false,error:'관리자 이름 저장에 실패했습니다.'},500)}}
  return null;
}
