import { handleFastEducationOverview } from './education-overview-fast.js';

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=utf-8'}})}
let partnerManagementSchemaReady=null;

async function currentUser(request,env,ctx,baseWorker){
  const u=new URL(request.url);u.pathname='/api/me';u.search='';
  const response=await baseWorker.fetch(new Request(u.toString(),{method:'GET',headers:request.headers}),env,ctx);
  if(!response.ok)return {ok:false,response};
  const data=await response.json().catch(()=>null);
  if(!data?.user||data.auth_state!=='approved')return {ok:false,response:json({success:false,error:'로그인이 필요합니다.'},401)};
  return {ok:true,user:data.user};
}

async function ensurePartnerManagementSchema(env){
  if(partnerManagementSchemaReady)return partnerManagementSchemaReady;
  partnerManagementSchemaReady=(async()=>{
    await env.partner_evaluation_db.prepare(`
      CREATE TABLE IF NOT EXISTS partner_management (
        company_id TEXT PRIMARY KEY,
        is_target INTEGER NOT NULL DEFAULT 1 CHECK (is_target IN (0,1)),
        signup_enabled INTEGER NOT NULL DEFAULT 1 CHECK (signup_enabled IN (0,1)),
        updated_by TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    const pmInfo=await env.partner_evaluation_db.prepare(`PRAGMA table_info(partner_management)`).all();
    const pmCols=new Set((pmInfo?.results||[]).map(row=>row.name));
    if(!pmCols.has('signup_enabled'))await env.partner_evaluation_db.prepare(`ALTER TABLE partner_management ADD COLUMN signup_enabled INTEGER NOT NULL DEFAULT 1 CHECK (signup_enabled IN (0,1))`).run();
    if(!pmCols.has('logo_key'))await env.partner_evaluation_db.prepare(`ALTER TABLE partner_management ADD COLUMN logo_key TEXT`).run();
    if(!pmCols.has('logo_content_type'))await env.partner_evaluation_db.prepare(`ALTER TABLE partner_management ADD COLUMN logo_content_type TEXT`).run();
    if(!pmCols.has('logo_updated_at'))await env.partner_evaluation_db.prepare(`ALTER TABLE partner_management ADD COLUMN logo_updated_at TEXT`).run();

    const accountInfo=await env.partner_evaluation_db.prepare(`PRAGMA table_info(portal_accounts)`).all();
    const accountCols=new Set((accountInfo?.results||[]).map(row=>row.name));
    if(!accountCols.has('job_title'))await env.partner_evaluation_db.prepare(`ALTER TABLE portal_accounts ADD COLUMN job_title TEXT`).run();

    await env.partner_evaluation_db.prepare(`
      CREATE TABLE IF NOT EXISTS committee_target_preferences (
        entity_type TEXT NOT NULL CHECK(entity_type IN ('partner','department')),
        entity_id TEXT NOT NULL,
        is_target INTEGER NOT NULL DEFAULT 1 CHECK(is_target IN (0,1)),
        updated_by TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(entity_type, entity_id)
      )
    `).run();
    await env.partner_evaluation_db.prepare(`CREATE INDEX IF NOT EXISTS idx_partner_management_target ON partner_management(is_target)`).run();
    await env.partner_evaluation_db.prepare(`CREATE INDEX IF NOT EXISTS idx_partner_management_signup ON partner_management(signup_enabled)`).run();

    const donghae=await env.partner_evaluation_db.prepare(`SELECT id FROM companies WHERE company_name='동해산업'`).all();
    for(const row of donghae?.results||[]){
      await env.partner_evaluation_db.batch([
        env.partner_evaluation_db.prepare(`DELETE FROM portal_accounts WHERE company_id=? AND role='partner'`).bind(row.id),
        env.partner_evaluation_db.prepare(`DELETE FROM partner_management WHERE company_id=?`).bind(row.id),
        env.partner_evaluation_db.prepare(`DELETE FROM committee_target_preferences WHERE entity_type='partner' AND entity_id=?`).bind(row.id),
        env.partner_evaluation_db.prepare(`UPDATE companies SET status='inactive' WHERE id=?`).bind(row.id)
      ]);
    }

    await env.partner_evaluation_db.prepare(`
      INSERT INTO partner_management(company_id,is_target,signup_enabled,updated_at)
      SELECT c.id,COALESCE(p.is_target,1),1,CURRENT_TIMESTAMP
      FROM companies c
      LEFT JOIN committee_target_preferences p ON p.entity_type='partner' AND p.entity_id=c.id
      WHERE c.status='active'
      ON CONFLICT(company_id) DO NOTHING
    `).run();
    await env.partner_evaluation_db.prepare(`
      INSERT INTO committee_target_preferences(entity_type,entity_id,is_target,updated_at)
      SELECT 'partner',company_id,is_target,CURRENT_TIMESTAMP FROM partner_management
      ON CONFLICT(entity_type,entity_id) DO UPDATE SET is_target=excluded.is_target,updated_at=CURRENT_TIMESTAMP
    `).run();
  })().catch(error=>{partnerManagementSchemaReady=null;throw error});
  return partnerManagementSchemaReady;
}

async function validateRegisteredPartner(request,env){
  await ensurePartnerManagementSchema(env);
  const body=await request.clone().json().catch(()=>({}));
  const companyId=String(body.company_id||'').trim();
  if(!companyId)return json({success:false,error:'협력사를 선택하세요.'},400);
  const company=await env.partner_evaluation_db.prepare(`
    SELECT c.id FROM companies c
    JOIN partner_management pm ON pm.company_id=c.id
    WHERE c.id=? AND c.status='active' AND pm.signup_enabled=1
    LIMIT 1
  `).bind(companyId).first();
  if(!company)return json({success:false,error:'회원가입이 허용된 협력사만 가입할 수 있습니다.'},400);
  return null;
}

async function augmentMe(response,env){
  if(!response.ok)return response;
  const data=await response.clone().json().catch(()=>null);
  if(!data?.user)return response;
  try{
    await ensurePartnerManagementSchema(env);
    if(data.user.id){
      const profile=await env.partner_evaluation_db.prepare(`SELECT job_title FROM portal_accounts WHERE id=? LIMIT 1`).bind(data.user.id).first();
      data.user.job_title=profile?.job_title||null;
    }
    if(data.user.role==='partner'&&data.user.company_id){
      const logo=await env.partner_evaluation_db.prepare(`SELECT logo_key FROM partner_management WHERE company_id=? LIMIT 1`).bind(data.user.company_id).first();
      if(logo?.logo_key)data.user.logo_url=`/api/partner-logo/${encodeURIComponent(data.user.company_id)}?v=${Date.now()}`;
    }
    return json(data,response.status);
  }catch(error){console.error('me augmentation failed',error);return response}
}

function normalizeNotification(row){
  return {id:row.id,title:row.title||row.notification_title||row.type||'업무 알림',message:row.message||row.content||row.body||'',type:row.type||row.notification_type||'general',is_read:Number(row.is_read||0)===1,created_at:row.created_at||row.updated_at||null};
}

export async function handlePortalShellApi(request,env,ctx,baseWorker){
  const fastEducation=await handleFastEducationOverview(request,env,ctx,baseWorker);if(fastEducation)return fastEducation;
  const url=new URL(request.url),path=url.pathname;
  const partnerMatch=path.match(/^\/api\/admin\/partners(?:\/([^/]+))?$/);
  const logoMatch=path.match(/^\/api\/admin\/partners\/([^/]+)\/logo$/);
  const publicLogoMatch=path.match(/^\/api\/partner-logo\/([^/]+)$/);
  const registrationMatch=path.match(/^\/api\/admin\/registrations(?:\/([^/]+))?$/);

  if(path==='/api/me'&&request.method==='GET'){
    try{await ensurePartnerManagementSchema(env)}catch(error){console.error('schema prepare failed',error)}
    return augmentMe(await baseWorker.fetch(request,env,ctx),env);
  }

  if(publicLogoMatch&&request.method==='GET'){
    try{
      await ensurePartnerManagementSchema(env);
      const companyId=decodeURIComponent(publicLogoMatch[1]);
      const row=await env.partner_evaluation_db.prepare(`SELECT pm.logo_key,pm.logo_content_type FROM partner_management pm JOIN companies c ON c.id=pm.company_id WHERE pm.company_id=? AND c.status='active' LIMIT 1`).bind(companyId).first();
      if(!row?.logo_key||!env.EVIDENCE_FILES)return new Response(null,{status:404});
      const object=await env.EVIDENCE_FILES.get(row.logo_key);if(!object)return new Response(null,{status:404});
      return new Response(object.body,{headers:{'content-type':row.logo_content_type||'image/png','cache-control':'public,max-age=3600'}});
    }catch(error){console.error('partner logo read failed',error);return new Response(null,{status:404})}
  }

  if(path==='/api/public/companies'&&request.method==='GET'){
    try{
      await ensurePartnerManagementSchema(env);
      const {results}=await env.partner_evaluation_db.prepare(`
        SELECT c.id,c.company_name,c.industry_code,c.industry_name
        FROM companies c JOIN partner_management pm ON pm.company_id=c.id
        WHERE c.status='active' AND pm.signup_enabled=1
        ORDER BY c.company_name COLLATE NOCASE
      `).all();
      return json({success:true,companies:results||[]});
    }catch(error){console.error('public partner registry failed',error);return json({success:false,error:'가입 가능한 협력사 목록을 불러오지 못했습니다.'},500)}
  }

  if(path==='/api/auth/register'&&request.method==='POST'){
    try{
      const body=await request.clone().json().catch(()=>({}));
      const invalid=await validateRegisteredPartner(request,env);if(invalid)return invalid;
      const response=await baseWorker.fetch(request,env,ctx);if(!response.ok)return response;
      const data=await response.clone().json().catch(()=>null);
      const accountId=data?.account?.id;
      if(accountId){
        const jobTitle=String(body.job_title||'').trim().slice(0,80);
        await env.partner_evaluation_db.prepare(`UPDATE portal_accounts SET job_title=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(jobTitle||null,accountId).run();
      }
      return response;
    }catch(error){console.error('partner signup validation failed',error);return json({success:false,error:'회원가입 정보를 저장하지 못했습니다.'},500)}
  }

  const needsAuth=path==='/api/notifications'||path==='/api/profile/display-name'||!!partnerMatch||!!logoMatch||!!registrationMatch;
  if(!needsAuth)return null;
  const auth=await currentUser(request,env,ctx,baseWorker);if(!auth.ok)return auth.response;
  const user=auth.user;

  if(registrationMatch){
    if(user.role!=='admin')return json({success:false,error:'관리자 권한이 필요합니다.'},403);
    try{await ensurePartnerManagementSchema(env)}catch(error){return json({success:false,error:'계정 관리정보를 준비하지 못했습니다.'},500)}
    if(request.method==='GET'&&!registrationMatch[1]){
      const {results}=await env.partner_evaluation_db.prepare(`
        SELECT pa.id,pa.company_id,c.company_name,pa.name,pa.position,pa.job_title,pa.phone,pa.email,
               pa.email_verified,pa.approval_status,pa.rejection_reason,pa.created_at
        FROM portal_accounts pa LEFT JOIN companies c ON c.id=pa.company_id
        WHERE pa.role='partner'
        ORDER BY CASE pa.approval_status WHEN 'pending' THEN 1 WHEN 'rejected' THEN 2 WHEN 'approved' THEN 3 ELSE 4 END,pa.created_at DESC
      `).all();
      return json({success:true,registrations:results||[]});
    }
    if(request.method==='DELETE'&&registrationMatch[1]){
      const accountId=decodeURIComponent(registrationMatch[1]);
      const account=await env.partner_evaluation_db.prepare(`SELECT id,email,role FROM portal_accounts WHERE id=? LIMIT 1`).bind(accountId).first();
      if(!account||account.role!=='partner')return json({success:false,error:'삭제할 협력사 계정을 찾을 수 없습니다.'},404);
      await env.partner_evaluation_db.prepare(`DELETE FROM portal_accounts WHERE id=? AND role='partner'`).bind(accountId).run();
      return json({success:true,deleted_account_id:accountId,email:account.email||null});
    }
    return null;
  }

  if(logoMatch){
    if(user.role!=='admin')return json({success:false,error:'관리자 권한이 필요합니다.'},403);
    const companyId=decodeURIComponent(logoMatch[1]);
    try{
      await ensurePartnerManagementSchema(env);
      const company=await env.partner_evaluation_db.prepare(`SELECT id FROM companies WHERE id=? AND status='active' LIMIT 1`).bind(companyId).first();
      if(!company)return json({success:false,error:'협력사를 찾을 수 없습니다.'},404);
      const current=await env.partner_evaluation_db.prepare(`SELECT logo_key FROM partner_management WHERE company_id=? LIMIT 1`).bind(companyId).first();
      if(request.method==='PUT'){
        if(!env.EVIDENCE_FILES)return json({success:false,error:'로고 저장소를 사용할 수 없습니다.'},503);
        const form=await request.formData().catch(()=>null);const file=form?.get('logo');
        if(!file||typeof file.arrayBuffer!=='function')return json({success:false,error:'로고 파일을 선택하세요.'},400);
        const type=String(file.type||'').toLowerCase();if(!['image/png','image/jpeg','image/webp'].includes(type))return json({success:false,error:'PNG, JPG, WEBP 로고만 업로드할 수 있습니다.'},400);
        if(Number(file.size||0)>2*1024*1024)return json({success:false,error:'로고 파일은 2MB 이하만 가능합니다.'},400);
        const ext=type==='image/png'?'png':type==='image/webp'?'webp':'jpg';const key=`partner-logos/${companyId}/${crypto.randomUUID()}.${ext}`;
        await env.EVIDENCE_FILES.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:type}});
        await env.partner_evaluation_db.prepare(`UPDATE partner_management SET logo_key=?,logo_content_type=?,logo_updated_at=CURRENT_TIMESTAMP,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE company_id=?`).bind(key,type,user.id||null,companyId).run();
        if(current?.logo_key&&current.logo_key!==key)await env.EVIDENCE_FILES.delete(current.logo_key).catch(()=>{});
        return json({success:true,logo_url:`/api/partner-logo/${encodeURIComponent(companyId)}?v=${Date.now()}`});
      }
      if(request.method==='DELETE'){
        if(current?.logo_key&&env.EVIDENCE_FILES)await env.EVIDENCE_FILES.delete(current.logo_key).catch(()=>{});
        await env.partner_evaluation_db.prepare(`UPDATE partner_management SET logo_key=NULL,logo_content_type=NULL,logo_updated_at=NULL,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE company_id=?`).bind(user.id||null,companyId).run();
        return json({success:true});
      }
      return json({success:false,error:'지원하지 않는 로고 요청입니다.'},405);
    }catch(error){console.error('partner logo update failed',error);return json({success:false,error:'협력사 로고를 저장하지 못했습니다.'},500)}
  }

  if(partnerMatch){
    if(user.role!=='admin')return json({success:false,error:'관리자 권한이 필요합니다.'},403);
    try{await ensurePartnerManagementSchema(env)}catch(error){console.error('partner management schema failed',error);return json({success:false,error:'협력사 관리정보를 준비하지 못했습니다.'},500)}

    if(request.method==='GET'&&!partnerMatch[1]){
      try{
        const {results}=await env.partner_evaluation_db.prepare(`
          SELECT c.id,c.company_name,c.industry_code,c.industry_name,c.status,
                 pm.is_target,pm.signup_enabled,pm.logo_key,pm.logo_updated_at,pm.updated_at,
                 COALESCE(a.account_count,0) AS account_count
          FROM companies c JOIN partner_management pm ON pm.company_id=c.id
          LEFT JOIN (
            SELECT company_id,COUNT(*) AS account_count FROM portal_accounts
            WHERE role='partner' AND approval_status IN ('pending','approved','suspended') GROUP BY company_id
          ) a ON a.company_id=c.id
          WHERE c.status='active' ORDER BY c.company_name COLLATE NOCASE
        `).all();
        const partners=(results||[]).map(row=>({...row,is_target:Number(row.is_target)!==0,signup_enabled:Number(row.signup_enabled)!==0,has_logo:!!row.logo_key,logo_url:row.logo_key?`/api/partner-logo/${encodeURIComponent(row.id)}?v=${encodeURIComponent(row.logo_updated_at||'1')}`:null,account_count:Number(row.account_count||0)}));
        return json({success:true,partners,summary:{total:partners.length,target:partners.filter(row=>row.is_target).length,non_target:partners.filter(row=>!row.is_target).length,signup_enabled:partners.filter(row=>row.signup_enabled).length,accounts:partners.reduce((sum,row)=>sum+row.account_count,0)}});
      }catch(error){console.error('partner management list failed',error);return json({success:false,error:'협력사 목록을 불러오지 못했습니다.'},500)}
    }

    if(request.method==='POST'&&!partnerMatch[1]){
      const body=await request.json().catch(()=>({}));const companyName=String(body.company_name||'').trim();const industryName=String(body.industry_name||'').trim();const industryCode=String(body.industry_code||'').trim();
      if(!companyName)return json({success:false,error:'협력사명을 입력하세요.'},400);
      try{
        const existing=await env.partner_evaluation_db.prepare(`SELECT id,status FROM companies WHERE lower(company_name)=lower(?) LIMIT 1`).bind(companyName).first();
        if(existing?.status==='active')return json({success:false,error:'이미 등록된 협력사입니다.'},409);
        const id=existing?.id||crypto.randomUUID();
        if(existing)await env.partner_evaluation_db.prepare(`UPDATE companies SET company_name=?,industry_name=?,industry_code=?,status='active' WHERE id=?`).bind(companyName,industryName||null,industryCode||null,id).run();
        else await env.partner_evaluation_db.prepare(`INSERT INTO companies(id,company_name,industry_code,industry_name,status) VALUES(?,?,?,?, 'active')`).bind(id,companyName,industryCode||null,industryName||null).run();
        await env.partner_evaluation_db.batch([
          env.partner_evaluation_db.prepare(`INSERT INTO partner_management(company_id,is_target,signup_enabled,updated_by,updated_at) VALUES(?,1,1,?,CURRENT_TIMESTAMP) ON CONFLICT(company_id) DO UPDATE SET is_target=1,signup_enabled=1,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`).bind(id,user.id||null),
          env.partner_evaluation_db.prepare(`INSERT INTO committee_target_preferences(entity_type,entity_id,is_target,updated_by,updated_at) VALUES('partner',?,1,?,CURRENT_TIMESTAMP) ON CONFLICT(entity_type,entity_id) DO UPDATE SET is_target=1,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`).bind(id,user.id||null)
        ]);
        return json({success:true,partner:{id,company_name:companyName,industry_name:industryName,industry_code:industryCode,is_target:true,signup_enabled:true,has_logo:false,account_count:0}},201);
      }catch(error){console.error('partner create failed',error);return json({success:false,error:'협력사를 등록하지 못했습니다.'},500)}
    }

    if(request.method==='PATCH'&&partnerMatch[1]){
      const companyId=decodeURIComponent(partnerMatch[1]);const body=await request.json().catch(()=>null);if(!body)return json({success:false,error:'변경할 값이 없습니다.'},400);
      const hasTarget=typeof body.is_target==='boolean'||body.is_target===0||body.is_target===1;const hasSignup=typeof body.signup_enabled==='boolean'||body.signup_enabled===0||body.signup_enabled===1;
      if(!hasTarget&&!hasSignup)return json({success:false,error:'변경할 값이 없습니다.'},400);
      try{
        const company=await env.partner_evaluation_db.prepare(`SELECT id,company_name FROM companies WHERE id=? AND status='active' LIMIT 1`).bind(companyId).first();if(!company)return json({success:false,error:'협력사 정보를 찾을 수 없습니다.'},404);
        const current=await env.partner_evaluation_db.prepare(`SELECT is_target,signup_enabled FROM partner_management WHERE company_id=?`).bind(companyId).first();
        const isTarget=hasTarget?(body.is_target===true||body.is_target===1?1:0):Number(current?.is_target??1);const signupEnabled=hasSignup?(body.signup_enabled===true||body.signup_enabled===1?1:0):Number(current?.signup_enabled??1);
        await env.partner_evaluation_db.batch([
          env.partner_evaluation_db.prepare(`INSERT INTO partner_management(company_id,is_target,signup_enabled,updated_by,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(company_id) DO UPDATE SET is_target=excluded.is_target,signup_enabled=excluded.signup_enabled,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`).bind(companyId,isTarget,signupEnabled,user.id||null),
          env.partner_evaluation_db.prepare(`INSERT INTO committee_target_preferences(entity_type,entity_id,is_target,updated_by,updated_at) VALUES('partner',?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(entity_type,entity_id) DO UPDATE SET is_target=excluded.is_target,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`).bind(companyId,isTarget,user.id||null)
        ]);
        return json({success:true,partner:{id:company.id,company_name:company.company_name,is_target:isTarget===1,signup_enabled:signupEnabled===1,updated_at:new Date().toISOString()}});
      }catch(error){console.error('partner management update failed',error);return json({success:false,error:'협력사 설정을 저장하지 못했습니다.'},500)}
    }
    return json({success:false,error:'지원하지 않는 협력사 관리 요청입니다.'},405);
  }

  if(path==='/api/notifications'&&request.method==='GET'){
    try{let result;if(user.role==='admin')result=await env.partner_evaluation_db.prepare(`SELECT * FROM notifications WHERE recipient_user_id IN (SELECT id FROM users WHERE role='admin') ORDER BY created_at DESC LIMIT 100`).all();else result=await env.partner_evaluation_db.prepare(`SELECT * FROM notifications WHERE recipient_user_id=? ORDER BY created_at DESC LIMIT 100`).bind(user.id).all();const notifications=(result?.results||[]).map(normalizeNotification);return json({success:true,notifications,unread_count:notifications.filter(n=>!n.is_read).length})}catch(error){return json({success:false,error:'알림 목록을 불러오지 못했습니다.'},500)}
  }
  if(path==='/api/notifications'&&request.method==='PATCH'){
    const body=await request.json().catch(()=>({}));try{if(user.role==='admin'){if(body.all===true)await env.partner_evaluation_db.prepare(`UPDATE notifications SET is_read=1 WHERE recipient_user_id IN (SELECT id FROM users WHERE role='admin')`).run();else if(body.id)await env.partner_evaluation_db.prepare(`UPDATE notifications SET is_read=1 WHERE id=? AND recipient_user_id IN (SELECT id FROM users WHERE role='admin')`).bind(String(body.id)).run()}else{if(body.all===true)await env.partner_evaluation_db.prepare(`UPDATE notifications SET is_read=1 WHERE recipient_user_id=?`).bind(user.id).run();else if(body.id)await env.partner_evaluation_db.prepare(`UPDATE notifications SET is_read=1 WHERE id=? AND recipient_user_id=?`).bind(String(body.id),user.id).run()}return json({success:true})}catch(error){return json({success:false,error:'알림 읽음 처리에 실패했습니다.'},500)}
  }
  if(path==='/api/profile/display-name'&&request.method==='PATCH'){
    if(user.role!=='admin')return json({success:false,error:'관리자만 표시 이름을 변경할 수 있습니다.'},403);const body=await request.json().catch(()=>({}));const name=String(body.name||'').trim();if(!name||name.length>40)return json({success:false,error:'관리자 이름을 1~40자로 입력하세요.'},400);try{await env.partner_evaluation_db.prepare(`UPDATE portal_accounts SET name=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND role='admin'`).bind(name,user.id).run();return json({success:true,name})}catch(error){return json({success:false,error:'관리자 이름 저장에 실패했습니다.'},500)}
  }
  return json({success:false,error:'지원하지 않는 요청입니다.'},405);
}
