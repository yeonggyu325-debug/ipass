import { reconcileCycleApplicability } from './applicability-engine.js';

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=utf-8'}})}
async function admin(request,env,ctx,baseWorker){
  const url=new URL(request.url);url.pathname='/api/me';url.search='';
  const response=await baseWorker.fetch(new Request(url.toString(),{method:'GET',headers:request.headers}),env,ctx);
  const data=await response.clone().json().catch(()=>null);
  if(!response.ok||!data?.success)return{ok:false,response};
  if(data.auth_state!=='approved'||data.user?.role!=='admin')return{ok:false,response:json({success:false,error:'관리자 권한이 필요합니다.'},403)};
  return{ok:true,user:data.user};
}

export async function handleFastCycleStart(request,env,ctx,baseWorker){
  const path=new URL(request.url).pathname;
  const match=path.match(/^\/api\/admin\/evaluation-runtime\/cycles\/([^/]+)\/start$/);
  if(!match||request.method!=='POST')return null;
  const auth=await admin(request,env,ctx,baseWorker);if(!auth.ok)return auth.response;
  const cycleId=decodeURIComponent(match[1]);
  const cycle=await env.partner_evaluation_db.prepare(`
    SELECT c.*,t.status AS template_status
    FROM evaluation_cycles_v2 c
    JOIN evaluation_templates_v2 t ON t.id=c.template_id
    WHERE c.id=? LIMIT 1
  `).bind(cycleId).first();
  if(!cycle)return json({success:false,error:'평가회차를 찾을 수 없습니다.'},404);
  if(cycle.status!=='draft')return json({success:false,error:'이미 시작된 평가회차입니다.'},409);
  if(!cycle.start_at||!cycle.end_at)return json({success:false,error:'평가기간을 먼저 입력하세요.'},400);
  const selected=await env.partner_evaluation_db.prepare(`SELECT COUNT(*) AS count FROM evaluation_targets_v2 WHERE cycle_id=? AND is_selected=1`).bind(cycleId).first();
  if(Number(selected?.count||0)<1)return json({success:false,error:'평가대상 협력사를 1개 이상 선택하세요.'},400);

  // One set-based statement replaces target x item INSERT loops.
  await env.partner_evaluation_db.prepare(`
    INSERT OR IGNORE INTO evaluation_target_items_v2 (
      id,target_id,template_item_id,item_code,item_name,item_type,max_score,
      category_name,parent_category_name,guide_text,judgment_guide,
      applicable,na_source,applicability_status,applicability_reason,sort_order
    )
    SELECT
      lower(hex(randomblob(16))),et.id,i.id,i.item_code,i.item_name,i.item_type,i.max_score,
      c.category_name,pc.category_name,i.submission_guide,i.judgment_guide,
      1,NULL,
      CASE WHEN EXISTS(SELECT 1 FROM evaluation_na_rules_v2 r WHERE r.item_id=i.id) THEN 'undetermined' ELSE 'applicable' END,
      CASE WHEN EXISTS(SELECT 1 FROM evaluation_na_rules_v2 r WHERE r.item_id=i.id) THEN '업종·상시근로자 기준을 확인하는 중입니다.' ELSE NULL END,
      i.sort_order
    FROM evaluation_targets_v2 et
    JOIN evaluation_cycles_v2 ec ON ec.id=et.cycle_id
    JOIN evaluation_items_v2 i ON i.template_id=ec.template_id
    LEFT JOIN evaluation_categories_v2 c ON c.id=i.category_id
    LEFT JOIN evaluation_categories_v2 pc ON pc.id=c.parent_id
    WHERE et.cycle_id=? AND et.is_selected=1
  `).bind(cycleId).run();

  const applicability=await reconcileCycleApplicability(env,cycleId);
  await env.partner_evaluation_db.batch([
    env.partner_evaluation_db.prepare(`UPDATE evaluation_cycles_v2 SET status='active',started_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='draft'`).bind(cycleId),
    env.partner_evaluation_db.prepare(`UPDATE evaluation_targets_v2 SET status='in_progress',updated_at=CURRENT_TIMESTAMP WHERE cycle_id=? AND is_selected=1 AND status='not_started'`).bind(cycleId),
    env.partner_evaluation_db.prepare(`INSERT INTO evaluation_cycle_logs_v2(id,cycle_id,action,detail_json,changed_by) VALUES(?,?,?,?,?)`).bind(crypto.randomUUID(),cycleId,'cycle_started',JSON.stringify({selected_count:Number(selected.count||0),materialization:'set_based',applicability}),auth.user.id)
  ]);
  const updated=await env.partner_evaluation_db.prepare(`SELECT * FROM evaluation_cycles_v2 WHERE id=? LIMIT 1`).bind(cycleId).first();
  return json({success:true,cycle:updated,materialization:{mode:'set_based',selected_targets:Number(selected.count||0),applicability}});
}
