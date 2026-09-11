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
    const info=await env.partner_evaluation_db.prepare(`PRAGMA table_info(partner_management)`).all();
    const columns=new Set((info?.results||[]).map(row=>row.name));
    if(!columns.has('signup_enabled'))await env.partner_evaluation_db.prepare(`ALTER TABLE partner_management ADD COLUMN signup_enabled INTEGER NOT NULL DEFAULT 1 CHECK (signup_enabled IN (0,1))`).run();
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
      WHERE 1=1
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

function normalizeNotification(row){
  return {
    id:row.id,
    title:row.title||row.notification_title||row.type||'업무 알림',
    message:row.message||row.content||row.body||'',
    type:row.type||row.notification_type||'general',
    is_read:Number(row.is_read||0)===1,
    created_at:row.created_at||row.updated_at||null
  };
}

export async function handlePortalShellApi(request,env,ctx,baseWorker){
  const fastEducation=await handleFastEducationOverview(request,env,ctx,baseWorker);if(fastEducation)return fastEducation;
  const url=new URL(request.url),path=url.pathname;
  const partnerMatch=path.match(/^\/api\/admin\/partners(?:\/([^/]+))?$/);

  if(path==='/api/public/companies'&&request.method==='GET'){
    try{
      await ensurePartnerManagementSchema(env);
      const {results}=await env.partner_evaluation_db.prepare(`
        SELECT c.id,c.company_name,c.industry_code,c.industry_name
        FROM companies c
        JOIN partner_management pm ON pm.company_id=c.id
        WHERE c.status='active' AND pm.signup_enabled=1
        ORDER BY c.company_name COLLATE NOCASE
      `).all();
      return json({success:true,companies:results||[]});
    }catch(error){console.error('public partner registry failed',error);return json({success:false,error:'가입 가능한 협력사 목록을 불러오지 못했습니다.'},500)}
  }

  if(path==='/api/auth/register'&&request.method==='POST'){
    try{return await validateRegisteredPartner(request,env)}catch(error){console.error('partner signup validation failed',error);return json({success:false,error:'협력사 등록정보를 확인하지 못했습니다.'},500)}
  }

  if(path!=='/api/notifications'&&path!=='/api/profile/display-name'&&!partnerMatch)return null;
  const auth=await currentUser(request,env,ctx,baseWorker);if(!auth.ok)return auth.response;
  const user=auth.user;

  if(partnerMatch){
    if(user.role!=='admin')return json({success:false,error:'관리자 권한이 필요합니다.'},403);
    try{await ensurePartnerManagementSchema(env)}catch(error){console.error('partner management schema failed',error);return json({success:false,error:'협력사 관리정보를 준비하지 못했습니다.'},500)}

    if(request.method==='GET'&&!partnerMatch[1]){
      try{
        const {results}=await env.partner_evaluation_db.prepare(`
          SELECT c.id,c.company_name,c.industry_code,c.industry_name,c.status,
                 pm.is_target,pm.signup_enabled,pm.updated_at,
                 COALESCE(a.account_count,0) AS account_count
          FROM companies c
          JOIN partner_management pm ON pm.company_id=c.id
          LEFT JOIN (
            SELECT company_id,COUNT(*) AS account_count
            FROM portal_accounts
            WHERE role='partner' AND approval_status IN ('pending','approved')
            GROUP BY company_id
          ) a ON a.company_id=c.id
          WHERE c.status='active'
          ORDER BY c.company_name COLLATE NOCASE
        `).all();
        const partners=(results||[]).map(row=>({...row,is_target:Number(row.is_target)!==0,signup_enabled:Number(row.signup_enabled)!==0,account_count:Number(row.account_count||0)}));
        return json({success:true,partners,summary:{total:partners.length,target:partners.filter(row=>row.is_target).length,non_target:partners.filter(row=>!row.is_target).length,signup_enabled:partners.filter(row=>row.signup_enabled).length,accounts:partners.reduce((sum,row)=>sum+row.account_count,0)}});
      }catch(error){console.error('partner management list failed',error);return json({success:false,error:'협력사 목록을 불러오지 못했습니다.'},500)}
    }

    if(request.method==='POST'&&!partnerMatch[1]){
      const body=await request.json().catch(()=>({}));
      const companyName=String(body.company_name||'').trim();
      const industryName=String(body.industry_name||'').trim();
      const industryCode=String(body.industry_code||'').trim();
      if(!companyName)return json({success:false,error:'협력사명을 입력하세요.'},400);
      try{
        const existing=await env.partner_evaluation_db.prepare(`SELECT id,status FROM companies WHERE lower(company_name)=lower(?) LIMIT 1`).bind(companyName).first();
        if(existing?.status==='active')return json({success:false,error:'이미 등록된 협력사입니다.'},409);
        const id=existing?.id||crypto.randomUUID();
        if(existing){
          await env.partner_evaluation_db.prepare(`UPDATE companies SET company_name=?,industry_name=?,industry_code=?,status='active' WHERE id=?`).bind(companyName,industryName||null,industryCode||null,id).run();
        }else{
          await env.partner_evaluation_db.prepare(`INSERT INTO companies(id,company_name,industry_code,industry_name,status) VALUES(?,?,?,?, 'active')`).bind(id,companyName,industryCode||null,industryName||null).run();
        }
        await env.partner_evaluation_db.batch([
          env.partner_evaluation_db.prepare(`INSERT INTO partner_management(company_id,is_target,signup_enabled,updated_by,updated_at) VALUES(?,1,1,?,CURRENT_TIMESTAMP) ON CONFLICT(company_id) DO UPDATE SET is_target=1,signup_enabled=1,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`).bind(id,user.id||null),
          env.partner_evaluation_db.prepare(`INSERT INTO committee_target_preferences(entity_type,entity_id,is_target,updated_by,updated_at) VALUES('partner',?,1,?,CURRENT_TIMESTAMP) ON CONFLICT(entity_type,entity_id) DO UPDATE SET is_target=1,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`).bind(id,user.id||null)
        ]);
        return json({success:true,partner:{id,company_name:companyName,industry_name:industryName,industry_code:industryCode,is_target:true,signup_enabled:true,account_count:0}},201);
      }catch(error){console.error('partner create failed',error);return json({success:false,error:'협력사를 등록하지 못했습니다.'},500)}
    }

    if(request.method==='PATCH'&&partnerMatch[1]){
      const companyId=decodeURIComponent(partnerMatch[1]);
      const body=await request.json().catch(()=>null);
      if(!body)return json({success:false,error:'변경할 값이 없습니다.'},400);
      const hasTarget=typeof body.is_target==='boolean'||body.is_target===0||body.is_target===1;
      const hasSignup=typeof body.signup_enabled==='boolean'||body.signup_enabled===0||body.signup_enabled===1;
      if(!hasTarget&&!hasSignup)return json({success:false,error:'변경할 값이 없습니다.'},400);
      try{
        const company=await env.partner_evaluation_db.prepare(`SELECT id,company_name FROM companies WHERE id=? AND status='active' LIMIT 1`).bind(companyId).first();
        if(!company)return json({success:false,error:'협력사 정보를 찾을 수 없습니다.'},404);
        const current=await env.partner_evaluation_db.prepare(`SELECT is_target,signup_enabled FROM partner_management WHERE company_id=?`).bind(companyId).first();
        const isTarget=hasTarget?(body.is_target===true||body.is_target===1?1:0):Number(current?.is_target??1);
        const signupEnabled=hasSignup?(body.signup_enabled===true||body.signup_enabled===1?1:0):Number(current?.signup_enabled??1);
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
    try{
      let result;
      if(user.role==='admin')result=await env.partner_evaluation_db.prepare(`SELECT * FROM notifications WHERE recipient_user_id IN (SELECT id FROM users WHERE role='admin') ORDER BY created_at DESC LIMIT 100`).all();
      else result=await env.partner_evaluation_db.prepare(`SELECT * FROM notifications WHERE recipient_user_id=? ORDER BY created_at DESC LIMIT 100`).bind(user.id).all();
      const notifications=(result?.results||[]).map(normalizeNotification);
      return json({success:true,notifications,unread_count:notifications.filter(n=>!n.is_read).length});
    }catch(error){return json({success:false,error:'알림 목록을 불러오지 못했습니다.'},500)}
  }

  if(path==='/api/notifications'&&request.method==='PATCH'){
    const body=await request.json().catch(()=>({}));
    try{
      if(user.role==='admin'){
        if(body.all===true)await env.partner_evaluation_db.prepare(`UPDATE notifications SET is_read=1 WHERE recipient_user_id IN (SELECT id FROM users WHERE role='admin')`).run();
        else if(body.id)await env.partner_evaluation_db.prepare(`UPDATE notifications SET is_read=1 WHERE id=? AND recipient_user_id IN (SELECT id FROM users WHERE role='admin')`).bind(String(body.id)).run();
      }else{
        if(body.all===true)await env.partner_evaluation_db.prepare(`UPDATE notifications SET is_read=1 WHERE recipient_user_id=?`).bind(user.id).run();
        else if(body.id)await env.partner_evaluation_db.prepare(`UPDATE notifications SET is_read=1 WHERE id=? AND recipient_user_id=?`).bind(String(body.id),user.id).run();
      }
      return json({success:true});
    }catch(error){return json({success:false,error:'알림 읽음 처리에 실패했습니다.'},500)}
  }

  if(path==='/api/profile/display-name'&&request.method==='PATCH'){
    if(user.role!=='admin')return json({success:false,error:'관리자만 표시 이름을 변경할 수 있습니다.'},403);
    const body=await request.json().catch(()=>({}));const name=String(body.name||'').trim();
    if(!name||name.length>40)return json({success:false,error:'관리자 이름을 1~40자로 입력하세요.'},400);
    try{await env.partner_evaluation_db.prepare(`UPDATE portal_accounts SET name=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND role='admin'`).bind(name,user.id).run();return json({success:true,name})}
    catch(error){return json({success:false,error:'관리자 이름 저장에 실패했습니다.'},500)}
  }
  return json({success:false,error:'지원하지 않는 요청입니다.'},405);
}
