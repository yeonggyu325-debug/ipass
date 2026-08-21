function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=utf-8'}})}

export async function ensureSystemAuditSchema(env){
  await env.partner_evaluation_db.prepare(`CREATE TABLE IF NOT EXISTS system_request_audit_v2 (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    status INTEGER NOT NULL,
    duration_ms INTEGER,
    actor_id TEXT,
    actor_role TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await env.partner_evaluation_db.prepare(`CREATE INDEX IF NOT EXISTS idx_system_request_audit_v2_created ON system_request_audit_v2(created_at DESC)`).run();
}

async function admin(request,env,ctx,innerApp){
  const url=new URL(request.url);url.pathname='/api/me';url.search='';
  const response=await innerApp.fetch(new Request(url.toString(),{method:'GET',headers:request.headers}),env,ctx);
  const data=await response.clone().json().catch(()=>null);
  if(!response.ok||!data?.success)return {ok:false,response};
  if(data.auth_state!=='approved'||data.user?.role!=='admin')return {ok:false,response:json({success:false,error:'관리자 권한이 필요합니다.',code:'ADMIN_REQUIRED'},403)};
  return {ok:true,user:data.user};
}

export async function recordRequestAudit(env,{requestId,method,path,status,durationMs,actorId=null,actorRole=null}){
  try{
    await ensureSystemAuditSchema(env);
    await env.partner_evaluation_db.prepare(`INSERT INTO system_request_audit_v2 (id,request_id,method,path,status,duration_ms,actor_id,actor_role) VALUES (?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),requestId,method,path,status,durationMs,actorId,actorRole).run();
  }catch(error){console.error('request audit write failed',error)}
}

export async function handleSystemAdmin(request,env,ctx,innerApp){
  const url=new URL(request.url),path=url.pathname;
  if(!path.startsWith('/api/admin/system/'))return null;
  const auth=await admin(request,env,ctx,innerApp);if(!auth.ok)return auth.response;
  await ensureSystemAuditSchema(env);

  if(request.method==='GET'&&path==='/api/admin/system/diagnostics'){
    const checks={d1:false,r2:!!env.EVIDENCE_FILES,assets:!!env.ASSETS};
    let dbError=null;
    try{await env.partner_evaluation_db.prepare('SELECT 1 AS ok').first();checks.d1=true}catch(error){dbError=String(error?.message||error)}
    const tables=['evaluation_templates_v2','evaluation_cycles_v2','evaluation_targets_v2','evaluation_target_items_v2','evaluation_evidence_files_v2','system_request_audit_v2'];
    const present={};
    for(const table of tables){
      try{const row=await env.partner_evaluation_db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).bind(table).first();present[table]=!!row}catch{present[table]=false}
    }
    return json({success:true,service:'ipass',checks,tables:present,d1_error:dbError,storage:{bucket_binding:'EVIDENCE_FILES',bucket_available:!!env.EVIDENCE_FILES},user:{id:auth.user.id,role:auth.user.role}});
  }

  if(request.method==='GET'&&path==='/api/admin/system/requests'){
    const limit=Math.min(200,Math.max(1,Number(url.searchParams.get('limit')||50)));
    const errorsOnly=url.searchParams.get('errors')==='1';
    const clause=errorsOnly?'WHERE status >= 400':'';
    const {results}=await env.partner_evaluation_db.prepare(`SELECT request_id,method,path,status,duration_ms,actor_id,actor_role,created_at FROM system_request_audit_v2 ${clause} ORDER BY created_at DESC LIMIT ?`).bind(limit).all();
    return json({success:true,requests:results||[],filter:{errors_only:errorsOnly,limit}});
  }

  return json({success:false,error:'지원하지 않는 시스템 관리 요청입니다.',code:'SYSTEM_ADMIN_ROUTE_NOT_FOUND'},404);
}
