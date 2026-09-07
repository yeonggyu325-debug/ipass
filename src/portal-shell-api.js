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
        updated_by TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await env.partner_evaluation_db.prepare(`CREATE INDEX IF NOT EXISTS idx_partner_management_target ON partner_management(is_target)`).run();
  })().catch(error=>{partnerManagementSchemaReady=null;throw error});
  return partnerManagementSchemaReady;
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
                 COALESCE(pm.is_target,1) AS is_target,
                 pm.updated_at,
                 COALESCE(a.account_count,0) AS account_count
          FROM companies c
          LEFT JOIN partner_management pm ON pm.company_id=c.id
          LEFT JOIN (
            SELECT company_id,COUNT(*) AS account_count
            FROM portal_accounts
            WHERE role='partner' AND approval_status IN ('pending','approved')
            GROUP BY company_id
          ) a ON a.company_id=c.id
          WHERE c.status='active'
          ORDER BY c.company_name COLLATE NOCASE
        `).all();
        const partners=(results||[]).map(row=>({...row,is_target:Number(row.is_target)!==0,account_count:Number(row.account_count||0)}));
        return json({success:true,partners,summary:{total:partners.length,target:partners.filter(row=>row.is_target).length,non_target:partners.filter(row=>!row.is_target).length,accounts:partners.reduce((sum,row)=>sum+row.account_count,0)}});
      }catch(error){console.error('partner management list failed',error);return json({success:false,error:'협력사 목록을 불러오지 못했습니다.'},500)}
    }

    if(request.method==='PATCH'&&partnerMatch[1]){
      const companyId=decodeURIComponent(partnerMatch[1]);
      const body=await request.json().catch(()=>null);
      if(!body||!(typeof body.is_target==='boolean'||body.is_target===0||body.is_target===1))return json({success:false,error:'대상 여부 값이 올바르지 않습니다.'},400);
      const isTarget=body.is_target===true||body.is_target===1?1:0;
      try{
        const company=await env.partner_evaluation_db.prepare(`SELECT id,company_name FROM companies WHERE id=? AND status='active' LIMIT 1`).bind(companyId).first();
        if(!company)return json({success:false,error:'협력사 정보를 찾을 수 없습니다.'},404);
        await env.partner_evaluation_db.prepare(`
          INSERT INTO partner_management(company_id,is_target,updated_by,updated_at)
          VALUES(?,?,?,CURRENT_TIMESTAMP)
          ON CONFLICT(company_id) DO UPDATE SET is_target=excluded.is_target,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP
        `).bind(companyId,isTarget,user.id||null).run();
        return json({success:true,partner:{id:company.id,company_name:company.company_name,is_target:isTarget===1,updated_at:new Date().toISOString()}});
      }catch(error){console.error('partner management update failed',error);return json({success:false,error:'협력사 대상 구분을 저장하지 못했습니다.'},500)}
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
