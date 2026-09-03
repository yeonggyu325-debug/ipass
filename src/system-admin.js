function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=utf-8'}})}
const REQUIRED_TABLES=[
  'portal_accounts','notifications','companies','portal_notices','safety_resources_v2','portal_content_files_v2',
  'evaluation_templates_v2','evaluation_cycles_v2','evaluation_targets_v2','evaluation_target_items_v2','evaluation_evidence_files_v2',
  'evaluation_edit_leases_v2','evaluation_partner_submission_logs_v2','evaluation_scoring_logs_v2','system_request_audit_v2',
  'education_submissions','education_submission_files','education_preview_tickets','education_submission_logs',
  'voc_cases_v2','voc_images_v2','system_schema_metadata_v2'
];
const FAST_INDEXES=[
  'idx_eval_items_v2_template_type','idx_eval_targets_v2_cycle_company','idx_eval_target_items_v2_target_applicable',
  'idx_evidence_files_v2_target_live_created','idx_evidence_files_v2_item_live_created','idx_upload_reservations_v2_created',
  'idx_notifications_account_read_created','idx_eval_na_rules_v2_code_workers','idx_eval_target_items_v2_target_status',
  'idx_evaluation_edit_leases_v2_lookup','idx_education_files_live_cover','idx_portal_accounts_status_created'
];

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
    await env.partner_evaluation_db.prepare(`INSERT INTO system_request_audit_v2 (id,request_id,method,path,status,duration_ms,actor_id,actor_role) VALUES (?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),requestId,method,path,status,durationMs,actorId,actorRole).run();
  }catch(error){console.error('request audit write failed',error)}
}

async function diagnostics(env,user){
  const checks={d1:false,r2:!!env.EVIDENCE_FILES,assets:!!env.ASSETS,analytics:!!env.PERFORMANCE_ANALYTICS};
  let dbError=null,rows=[];
  try{
    const result=await env.partner_evaluation_db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name IN (${REQUIRED_TABLES.map(()=>'?').join(',')})`).bind(...REQUIRED_TABLES).all();
    rows=result.results||[];checks.d1=true;
  }catch(error){dbError=String(error?.message||error)}
  const names=new Set(rows.map(row=>row.name));
  return{
    service:'ipass',version:'enterprise-v3',checks,
    tables:Object.fromEntries(REQUIRED_TABLES.map(table=>[table,names.has(table)])),
    missing_tables:REQUIRED_TABLES.filter(table=>!names.has(table)),
    d1_error:dbError,
    storage:{bucket_binding:'EVIDENCE_FILES',bucket_available:!!env.EVIDENCE_FILES},
    user:{id:user.id,role:user.role}
  };
}

async function database(env){
  const [indexResult,templateResult,cycleResult,targetResult,itemResult,fileResult,schemaResult,undeterminedResult,leaseResult,accountResult]=await env.partner_evaluation_db.batch([
    env.partner_evaluation_db.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name IN (${FAST_INDEXES.map(()=>'?').join(',')})`).bind(...FAST_INDEXES),
    env.partner_evaluation_db.prepare(`SELECT COUNT(*) AS count FROM evaluation_templates_v2`),
    env.partner_evaluation_db.prepare(`SELECT COUNT(*) AS count FROM evaluation_cycles_v2`),
    env.partner_evaluation_db.prepare(`SELECT COUNT(*) AS count FROM evaluation_targets_v2`),
    env.partner_evaluation_db.prepare(`SELECT COUNT(*) AS count FROM evaluation_target_items_v2`),
    env.partner_evaluation_db.prepare(`SELECT COUNT(*) AS count,COALESCE(SUM(file_size),0) AS bytes FROM evaluation_evidence_files_v2 WHERE deleted_at IS NULL`),
    env.partner_evaluation_db.prepare(`SELECT value FROM system_schema_metadata_v2 WHERE key='schema_version' LIMIT 1`),
    env.partner_evaluation_db.prepare(`SELECT COUNT(*) AS count FROM evaluation_target_items_v2 WHERE applicability_status='undetermined'`),
    env.partner_evaluation_db.prepare(`SELECT COUNT(*) AS count FROM evaluation_edit_leases_v2 WHERE revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP`),
    env.partner_evaluation_db.prepare(`SELECT COUNT(*) AS count FROM portal_accounts WHERE approval_status='approved'`)
  ]);
  const installed=new Set((indexResult.results||[]).map(row=>row.name));
  return{
    engine:'cloudflare-d1',schema:'evaluation_v2',schema_version:String(schemaResult.results?.[0]?.value||'unknown'),
    fast_path_ready:FAST_INDEXES.every(index=>installed.has(index)),
    indexes:{required:FAST_INDEXES,installed:[...installed],missing:FAST_INDEXES.filter(index=>!installed.has(index))},
    rows:{
      approved_accounts:Number(accountResult.results?.[0]?.count||0),templates:Number(templateResult.results?.[0]?.count||0),
      cycles:Number(cycleResult.results?.[0]?.count||0),targets:Number(targetResult.results?.[0]?.count||0),
      target_items:Number(itemResult.results?.[0]?.count||0),undetermined_items:Number(undeterminedResult.results?.[0]?.count||0),
      active_edit_leases:Number(leaseResult.results?.[0]?.count||0),active_files:Number(fileResult.results?.[0]?.count||0)
    },
    active_file_bytes:Number(fileResult.results?.[0]?.bytes||0)
  };
}

async function requestSummary(env){
  const [recent,errorCount,slow]=await env.partner_evaluation_db.batch([
    env.partner_evaluation_db.prepare(`SELECT request_id,method,path,status,duration_ms,created_at FROM system_request_audit_v2 ORDER BY created_at DESC LIMIT 20`),
    env.partner_evaluation_db.prepare(`SELECT COUNT(*) AS count FROM system_request_audit_v2 WHERE status>=500 AND created_at>=datetime('now','-24 hours')`),
    env.partner_evaluation_db.prepare(`SELECT path,COUNT(*) AS requests,ROUND(AVG(duration_ms),1) AS avg_ms,MAX(duration_ms) AS max_ms FROM system_request_audit_v2 WHERE created_at>=datetime('now','-24 hours') GROUP BY path ORDER BY max_ms DESC LIMIT 10`)
  ]);
  return{recent:recent.results||[],errors_24h:Number(errorCount.results?.[0]?.count||0),slow_routes:slow.results||[]};
}

export async function handleSystemAdmin(request,env,ctx,innerApp){
  const url=new URL(request.url),path=url.pathname;
  if(!path.startsWith('/api/admin/system/'))return null;
  const auth=await admin(request,env,ctx,innerApp);if(!auth.ok)return auth.response;

  if(request.method==='GET'&&path==='/api/admin/system/summary'){
    const [diagnostic,databaseInfo,requests]=await Promise.all([diagnostics(env,auth.user),database(env),requestSummary(env)]);
    return json({success:true,diagnostics:diagnostic,database:databaseInfo,requests,generated_at:new Date().toISOString()});
  }
  if(request.method==='GET'&&path==='/api/admin/system/diagnostics')return json({success:true,...await diagnostics(env,auth.user)});
  if(request.method==='GET'&&path==='/api/admin/system/database')return json({success:true,database:await database(env)});

  if(request.method==='GET'&&path==='/api/admin/system/requests'){
    const limit=Math.min(200,Math.max(1,Number(url.searchParams.get('limit')||50)));
    const errorsOnly=url.searchParams.get('errors')==='1';
    const clause=errorsOnly?'WHERE status >= 400':'';
    const {results}=await env.partner_evaluation_db.prepare(`SELECT request_id,method,path,status,duration_ms,actor_id,actor_role,created_at FROM system_request_audit_v2 ${clause} ORDER BY created_at DESC LIMIT ?`).bind(limit).all();
    return json({success:true,requests:results||[],filter:{errors_only:errorsOnly,limit}});
  }

  if(request.method==='GET'&&path==='/api/admin/system/submission-activity'){
    const limit=Math.min(200,Math.max(1,Number(url.searchParams.get('limit')||50)));
    const postSubmitOnly=url.searchParams.get('post_submit')!=='0';
    const clause=postSubmitOnly?`AND l.action IN ('post_submit_profile_edit','post_submit_item_edit','post_submit_items_bulk_edit','post_submit_file_added','file_deleted','resubmitted')`:'';
    const {results}=await env.partner_evaluation_db.prepare(`
      SELECT l.action,l.target_id,l.target_item_id,l.detail_json,l.changed_by,l.created_at,
             c.company_name,ec.year,ec.half,et.status AS target_status
      FROM evaluation_partner_submission_logs_v2 l
      JOIN evaluation_targets_v2 et ON et.id=l.target_id
      JOIN companies c ON c.id=et.company_id
      JOIN evaluation_cycles_v2 ec ON ec.id=et.cycle_id
      WHERE 1=1 ${clause}
      ORDER BY l.created_at DESC
      LIMIT ?
    `).bind(limit).all();
    return json({success:true,activities:results||[],filter:{post_submit_only:postSubmitOnly,limit}});
  }

  return json({success:false,error:'지원하지 않는 시스템 관리 요청입니다.',code:'SYSTEM_ADMIN_ROUTE_NOT_FOUND'},404);
}
