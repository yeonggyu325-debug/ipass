function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=utf-8'}})}
function num(v){const n=Number(v);return Number.isFinite(n)?n:null}
function clean(v,max=3000){return String(v??'').trim().slice(0,max)}
function round1(v){return Math.round(Number(v||0)*10)/10}
async function admin(request,env,ctx,innerApp){
  const url=new URL(request.url);url.pathname='/api/me';url.search='';
  const response=await innerApp.fetch(new Request(url.toString(),{method:'GET',headers:request.headers}),env,ctx);
  const data=await response.clone().json().catch(()=>null);
  if(!response.ok||!data?.success)return {ok:false,response};
  if(data.auth_state!=='approved'||data.user?.role!=='admin')return {ok:false,response:json({success:false,error:'관리자 권한이 필요합니다.',code:'ADMIN_REQUIRED'},403)};
  return {ok:true,user:data.user};
}
async function log(env,targetId,itemId,action,before,after,userId){
  await env.partner_evaluation_db.prepare(`INSERT INTO evaluation_scoring_logs_v2 (id,target_id,target_item_id,action,before_json,after_json,changed_by) VALUES (?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),targetId,itemId||null,action,JSON.stringify(before||null),JSON.stringify(after||null),userId||null).run();
}
async function target(env,id){
  return env.partner_evaluation_db.prepare(`SELECT et.*,c.company_name,c.industry_name,ec.year,ec.half,ec.cycle_name,ec.status AS cycle_status,ec.start_at,ec.end_at FROM evaluation_targets_v2 et JOIN companies c ON c.id=et.company_id JOIN evaluation_cycles_v2 ec ON ec.id=et.cycle_id WHERE et.id=? AND et.is_selected=1 LIMIT 1`).bind(id).first();
}
async function items(env,targetId){
  const {results}=await env.partner_evaluation_db.prepare(`SELECT id,target_id,template_item_id,item_code,item_name,item_type,max_score,category_name,parent_category_name,applicable,na_source,manual_na_reason,description,earned_score,evaluation_comment,evaluated_at,needs_rescore,partner_changed_at,updated_at FROM evaluation_target_items_v2 WHERE target_id=? ORDER BY sort_order,item_code,item_name`).bind(targetId).all();
  return results||[];
}
function scoreSummary(rows){
  const applicable=rows.filter(x=>Number(x.applicable)!==0);
  const base=applicable.filter(x=>x.item_type!=='bonus');
  const bonus=applicable.filter(x=>x.item_type==='bonus');
  const baseMax=base.reduce((s,x)=>s+Number(x.max_score||0),0);
  const baseEarned=base.reduce((s,x)=>s+Number(x.earned_score||0),0);
  const normalizedBase=baseMax>0?baseEarned/baseMax*100:0;
  const bonusEarned=bonus.reduce((s,x)=>s+Number(x.earned_score||0),0);
  const raw=round1(Math.min(100,Math.max(0,normalizedBase+bonusEarned)));
  const unevaluated=applicable.filter(x=>x.earned_score===null||x.earned_score===undefined).length;
  const needsRescore=applicable.filter(x=>Number(x.needs_rescore)===1).length;
  return {raw_score:raw,base_max:round1(baseMax),base_earned:round1(baseEarned),normalized_base:round1(normalizedBase),bonus_earned:round1(bonusEarned),applicable_count:applicable.length,na_count:rows.length-applicable.length,unevaluated_count:unevaluated,needs_rescore_count:needsRescore,complete:unevaluated===0&&needsRescore===0};
}
async function bundle(env,targetId){
  const t=await target(env,targetId);if(!t)return null;
  const [rows,fileResult,logResult]=await Promise.all([
    items(env,targetId),
    env.partner_evaluation_db.prepare(`SELECT id,target_item_id,file_name,content_type,file_size,created_at FROM evaluation_evidence_files_v2 WHERE target_id=? AND deleted_at IS NULL ORDER BY created_at DESC`).bind(targetId).all().catch(()=>({results:[]})),
    env.partner_evaluation_db.prepare(`SELECT action,target_item_id,before_json,after_json,changed_by,created_at FROM evaluation_scoring_logs_v2 WHERE target_id=? ORDER BY created_at DESC LIMIT 50`).bind(targetId).all()
  ]);
  const files=new Map();for(const f of fileResult.results||[]){if(!files.has(f.target_item_id))files.set(f.target_item_id,[]);files.get(f.target_item_id).push(f)}
  const enriched=rows.map(x=>({...x,files:files.get(x.id)||[]}));
  return {target:t,items:enriched,summary:scoreSummary(enriched),recent_scoring_activity:logResult.results||[]};
}

export async function handleEvaluationScoring(request,env,ctx,innerApp){
  const url=new URL(request.url),path=url.pathname;
  if(!path.startsWith('/api/admin/evaluation-scoring/'))return null;
  const auth=await admin(request,env,ctx,innerApp);if(!auth.ok)return auth.response;
  const root=path.match(/^\/api\/admin\/evaluation-scoring\/([^/]+)$/);
  if(root&&request.method==='GET'){
    const data=await bundle(env,decodeURIComponent(root[1]));if(!data)return json({success:false,error:'평가대상을 찾을 수 없습니다.',code:'TARGET_NOT_FOUND'},404);
    return json({success:true,workspace:data});
  }

  const itemRoute=path.match(/^\/api\/admin\/evaluation-scoring\/([^/]+)\/items\/([^/]+)$/);
  if(itemRoute&&request.method==='PATCH'){
    const targetId=decodeURIComponent(itemRoute[1]),itemId=decodeURIComponent(itemRoute[2]);
    const t=await target(env,targetId);if(!t)return json({success:false,error:'평가대상을 찾을 수 없습니다.',code:'TARGET_NOT_FOUND'},404);
    if(!['submitted','evaluating','completed','published'].includes(t.status))return json({success:false,error:'협력사가 자료를 제출한 이후에 평가할 수 있습니다.',code:'TARGET_NOT_SUBMITTED'},409);
    const row=await env.partner_evaluation_db.prepare(`SELECT * FROM evaluation_target_items_v2 WHERE id=? AND target_id=? LIMIT 1`).bind(itemId,targetId).first();if(!row)return json({success:false,error:'평가항목을 찾을 수 없습니다.',code:'ITEM_NOT_FOUND'},404);
    if(Number(row.applicable)===0)return json({success:false,error:'N/A 항목은 채점할 수 없습니다.',code:'ITEM_NA'},409);
    const body=await request.json(),score=num(body.earned_score),max=Number(row.max_score||0);
    if(score===null||score<0||score>max)return json({success:false,error:`점수는 0점 이상 ${max}점 이하로 입력하세요.`,code:'INVALID_SCORE'},400);
    const comment=clean(body.evaluation_comment,3000)||null;
    const before={earned_score:row.earned_score,evaluation_comment:row.evaluation_comment,needs_rescore:Number(row.needs_rescore)===1};
    await env.partner_evaluation_db.batch([
      env.partner_evaluation_db.prepare(`UPDATE evaluation_target_items_v2 SET earned_score=?,evaluation_comment=?,needs_rescore=0,evaluated_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(score,comment,itemId),
      env.partner_evaluation_db.prepare(`UPDATE evaluation_targets_v2 SET status=CASE WHEN status='submitted' THEN 'evaluating' ELSE status END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(targetId)
    ]);
    const action=Number(row.needs_rescore)===1?'item_rechecked':(t.status==='completed'||t.status==='published'?'score_changed_after_completion':'item_scored');
    await log(env,targetId,itemId,action,before,{earned_score:score,evaluation_comment:comment,needs_rescore:false},auth.user.id);
    const data=await bundle(env,targetId);await env.partner_evaluation_db.prepare(`UPDATE evaluation_targets_v2 SET raw_score=? WHERE id=?`).bind(data.summary.raw_score,targetId).run();
    return json({success:true,workspace:data});
  }

  const complete=path.match(/^\/api\/admin\/evaluation-scoring\/([^/]+)\/complete$/);
  if(complete&&request.method==='POST'){
    const targetId=decodeURIComponent(complete[1]),data=await bundle(env,targetId);if(!data)return json({success:false,error:'평가대상을 찾을 수 없습니다.',code:'TARGET_NOT_FOUND'},404);
    if(!['submitted','evaluating','completed'].includes(data.target.status))return json({success:false,error:'제출된 평가자료만 평가완료 처리할 수 있습니다.',code:'TARGET_NOT_SUBMITTED'},409);
    if(data.summary.unevaluated_count>0)return json({success:false,error:`미채점 항목 ${data.summary.unevaluated_count}개가 남아 있습니다.`,code:'UNEVALUATED_ITEMS',summary:data.summary},409);
    if(data.summary.needs_rescore_count>0)return json({success:false,error:`재확인이 필요한 항목 ${data.summary.needs_rescore_count}개가 남아 있습니다.`,code:'RESCORE_REQUIRED',summary:data.summary},409);
    await env.partner_evaluation_db.prepare(`UPDATE evaluation_targets_v2 SET status='completed',raw_score=?,finalized_at=CURRENT_TIMESTAMP,finalized_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(data.summary.raw_score,auth.user.id,targetId).run();
    await log(env,targetId,null,'evaluation_completed',{status:data.target.status},{status:'completed',raw_score:data.summary.raw_score},auth.user.id);
    return json({success:true,workspace:await bundle(env,targetId)});
  }

  const publish=path.match(/^\/api\/admin\/evaluation-scoring\/([^/]+)\/publish$/);
  if(publish&&request.method==='POST'){
    const targetId=decodeURIComponent(publish[1]),data=await bundle(env,targetId);if(!data)return json({success:false,error:'평가대상을 찾을 수 없습니다.',code:'TARGET_NOT_FOUND'},404);
    if(!['completed','published'].includes(data.target.status))return json({success:false,error:'평가완료 후 결과를 공개할 수 있습니다.',code:'NOT_COMPLETED'},409);
    await env.partner_evaluation_db.prepare(`UPDATE evaluation_targets_v2 SET status='published',published_at=COALESCE(published_at,CURRENT_TIMESTAMP),published_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(auth.user.id,targetId).run();
    await log(env,targetId,null,'result_published',{status:data.target.status},{status:'published',raw_score:data.summary.raw_score},auth.user.id);
    return json({success:true,workspace:await bundle(env,targetId)});
  }

  return json({success:false,error:'지원하지 않는 평가 요청입니다.',code:'SCORING_ROUTE_NOT_FOUND'},404);
}
