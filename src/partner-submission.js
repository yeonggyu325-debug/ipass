import { reconcileTargetApplicability } from './applicability-engine.js';
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=utf-8','access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS'}})}
function clean(v,max=500){return String(v??'').trim().slice(0,max)}
function int(v,def=null){if(v===null||v===undefined||v==='')return def;const n=Number(v);return Number.isInteger(n)&&n>=0?n:def}
function kstToday(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const m=Object.fromEntries(parts.map(p=>[p.type,p.value]));return `${m.year}-${m.month}-${m.day}`}
function normalEditWindow(target){const today=kstToday();return target.cycle_status==='active'&&(!target.start_at||today>=String(target.start_at).slice(0,10))&&(!target.end_at||today<=String(target.end_at).slice(0,10))}
function canEdit(target,lease=null){return normalEditWindow(target)||Boolean(lease&&Date.parse(lease.expires_at)>Date.now())}
function wasSubmitted(target){return Number(target?.has_submission_record||0)>0}
function safeFileName(v){return String(v||'file').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').replace(/\s+/g,' ').trim().slice(0,180)||'file'}
const ALLOWED_EXT=new Set(['pdf','jpg','jpeg','png','xls','xlsx','hwp','hwpx','ppt','pptx','doc','docx']);
const MAX_FILE_BYTES=25*1024*1024;
const PREVIEW_TICKET_MINUTES=5;

function previewMime(file){
  const ext=(String(file?.file_name||'').split('.').pop()||'').toLowerCase();
  const mime={
    pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',
    xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt:'application/vnd.ms-powerpoint',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    hwp:'application/x-hwp',hwpx:'application/vnd.hancom.hwpx'
  };
  return mime[ext]||file?.content_type||'application/octet-stream';
}

async function account(request,env,ctx,baseWorker){const u=new URL(request.url);u.pathname='/api/me';u.search='';const r=await baseWorker.fetch(new Request(u.toString(),{method:'GET',headers:request.headers}),env,ctx);const d=await r.clone().json().catch(()=>null);if(!r.ok||!d?.success)return {ok:false,response:r};if(d.auth_state!=='approved')return {ok:false,response:json({success:false,error:'승인된 계정이 필요합니다.'},403)};return {ok:true,user:d.user}}
async function target(env,targetId){return env.partner_evaluation_db.prepare(`SELECT et.id AS target_id,et.company_id,et.status,et.business_number,et.representative_name,et.worker_count,et.submitted_at,et.finalized_at,et.published_at,et.updated_at,EXISTS(SELECT 1 FROM evaluation_partner_submission_logs_v2 sl WHERE sl.target_id=et.id AND sl.action IN ('submitted','resubmitted')) AS has_submission_record,c.company_name,c.industry_code,c.industry_name,ec.id AS cycle_id,ec.year,ec.half,ec.cycle_name,ec.start_at,ec.end_at,ec.status AS cycle_status,ec.template_id FROM evaluation_targets_v2 et JOIN companies c ON c.id=et.company_id JOIN evaluation_cycles_v2 ec ON ec.id=et.cycle_id WHERE et.id=? AND et.is_selected=1 LIMIT 1`).bind(targetId).first()}
async function leaseForRequest(request,env,targetId,accountId){const token=clean(request.headers.get('x-edit-lease'),100);if(!token)return null;return env.partner_evaluation_db.prepare(`SELECT lease_token,expires_at FROM evaluation_edit_leases_v2 WHERE target_id=? AND account_id=? AND lease_token=? AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP LIMIT 1`).bind(targetId,accountId,token).first()}
async function ensureAccess(request,env,ctx,baseWorker,targetId,write=false){const [a,t]=await Promise.all([account(request,env,ctx,baseWorker),target(env,targetId)]);if(!a.ok)return a;if(!t)return {ok:false,response:json({success:false,error:'평가대상을 찾을 수 없습니다.'},404)};if(a.user.role!=='admin'&&t.company_id!==a.user.company_id)return {ok:false,response:json({success:false,error:'접근 권한이 없습니다.'},403)};if(write&&a.user.role!=='partner')return {ok:false,response:json({success:false,error:'협력사 계정에서만 제출자료를 수정할 수 있습니다.'},403)};if(write&&t.status==='published')return {ok:false,response:json({success:false,error:'결과가 공개된 평가는 수정할 수 없습니다.',editable:false},409)};const lease=write?await leaseForRequest(request,env,targetId,a.user.id):null;if(write&&!canEdit(t,lease))return {ok:false,response:json({success:false,error:'현재 평가자료를 수정할 수 있는 기간이 아닙니다.',editable:false},409)};return {ok:true,user:a.user,target:t,lease}}
async function log(env,targetId,itemId,action,detail,userId){await env.partner_evaluation_db.prepare(`INSERT INTO evaluation_partner_submission_logs_v2 (id,target_id,target_item_id,action,detail_json,changed_by) VALUES (?,?,?,?,?,?)`).bind(crypto.randomUUID(),targetId,itemId||null,action,JSON.stringify(detail||{}),userId||null).run()}

async function markPartnerChange(env,targetId,itemId=null,allItems=false){
  const statements=[];
  if(allItems)statements.push(env.partner_evaluation_db.prepare(`UPDATE evaluation_target_items_v2 SET needs_rescore=CASE WHEN earned_score IS NOT NULL THEN 1 ELSE needs_rescore END,partner_changed_at=CASE WHEN earned_score IS NOT NULL THEN CURRENT_TIMESTAMP ELSE partner_changed_at END,updated_at=CURRENT_TIMESTAMP WHERE target_id=?`).bind(targetId));
  else if(itemId)statements.push(env.partner_evaluation_db.prepare(`UPDATE evaluation_target_items_v2 SET needs_rescore=CASE WHEN earned_score IS NOT NULL THEN 1 ELSE needs_rescore END,partner_changed_at=CASE WHEN earned_score IS NOT NULL THEN CURRENT_TIMESTAMP ELSE partner_changed_at END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND target_id=?`).bind(itemId,targetId));
  statements.push(env.partner_evaluation_db.prepare(`UPDATE evaluation_targets_v2 SET status=CASE WHEN status='completed' THEN 'evaluating' ELSE status END,finalized_at=CASE WHEN status='completed' THEN NULL ELSE finalized_at END,finalized_by=CASE WHEN status='completed' THEN NULL ELSE finalized_by END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(targetId));
  await env.partner_evaluation_db.batch(statements);
}

async function workspace(env,t){
  const [itemRes,fileRes]=await env.partner_evaluation_db.batch([
    env.partner_evaluation_db.prepare(`SELECT id AS target_item_state_id,template_item_id AS item_id,item_code,item_name,item_type,max_score,category_name,parent_category_name,guide_text,judgment_guide,applicable,na_source,applicability_status,applicability_reason,manual_na_reason,description,earned_score,max_score_snapshot,evaluation_comment,evaluated_at,needs_rescore,partner_changed_at,updated_at FROM evaluation_target_items_v2 WHERE target_id=? ORDER BY sort_order,item_code,item_name`).bind(t.target_id),
    env.partner_evaluation_db.prepare(`SELECT id,target_id,target_item_id,file_name,content_type,file_size,created_at FROM evaluation_evidence_files_v2 WHERE target_id=? AND deleted_at IS NULL ORDER BY created_at DESC`).bind(t.target_id)
  ]);
  const filesBy=new Map();for(const f of fileRes.results||[]){if(!filesBy.has(f.target_item_id))filesBy.set(f.target_item_id,[]);filesBy.get(f.target_item_id).push(f)}
  const items=(itemRes.results||[]).map(i=>({...i,applicability_status:i.applicability_status||(Number(i.applicable)===0?'not_applicable':'applicable'),files:filesBy.get(i.target_item_state_id)||[]}));
  const applicable=items.filter(i=>i.applicability_status==='applicable'),notApplicable=items.filter(i=>i.applicability_status==='not_applicable'),undetermined=items.filter(i=>i.applicability_status==='undetermined');const prepared=applicable.filter(i=>clean(i.description,4000)||i.files.length).length;
  return {target:t,items,summary:{total:items.length,applicable:applicable.length,na:notApplicable.length,undetermined:undetermined.length,prepared,blank:Math.max(0,applicable.length-prepared),progress:items.length?Math.round(((prepared+notApplicable.length)/items.length)*100):0}};
}
function visibleWorkspace(w,user){
  if(user?.role!=='partner'||w.target.published_at)return w;
  return {...w,items:w.items.map(i=>({...i,earned_score:null,max_score_snapshot:null,evaluation_comment:null,evaluated_at:null,needs_rescore:0,partner_changed_at:null}))};
}

async function recalcNa(env,t){return reconcileTargetApplicability(env,t.target_id)}

async function saveProfile(env,access,body){
  const business=clean(body.business_number,30),rep=clean(body.representative_name,100),wc=int(body.worker_count,null);
  if(!business||!rep||wc===null)return {error:'사업자등록번호, 대표자명, 상시근로자 수를 모두 입력하세요.',status:400};
  const before={business_number:access.target.business_number,representative_name:access.target.representative_name,worker_count:access.target.worker_count};
  const after={business_number:business,representative_name:rep,worker_count:wc};
  const changed=String(before.business_number||'')!==business||String(before.representative_name||'')!==rep||Number(before.worker_count)!==wc;
  if(!changed)return {ok:true,changed:false};
  await env.partner_evaluation_db.prepare(`UPDATE evaluation_targets_v2 SET business_number=?,representative_name=?,worker_count=?,status=CASE WHEN status='not_started' THEN 'in_progress' ELSE status END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(business,rep,wc,access.target.target_id).run();
  access.target={...access.target,...after};
  if(Number(before.worker_count)!==wc)await recalcNa(env,access.target);
  const postSubmit=wasSubmitted(access.target);if(changed&&postSubmit)await markPartnerChange(env,access.target.target_id,null,true);
  await log(env,access.target.target_id,null,postSubmit?'post_submit_profile_edit':'profile_saved',{before,after,needs_rescore:changed&&postSubmit},access.user.id);
  return {ok:true,changed:true};
}

function bulkDescriptionStatements(env,targetId,changed,postSubmit){
  const statements=[];
  for(let offset=0;offset<changed.length;offset+=25){
    const part=changed.slice(offset,offset+25),cases=part.map(()=>`WHEN ? THEN ?`).join(' '),marks=part.map(()=>'?').join(','),binds=[];
    for(const {row,description} of part)binds.push(row.id,description||null);
    binds.push(targetId,...part.map(({row})=>row.id));
    statements.push(env.partner_evaluation_db.prepare(`UPDATE evaluation_target_items_v2 SET description=CASE id ${cases} ELSE description END,needs_rescore=CASE WHEN ${postSubmit?1:0}=1 AND earned_score IS NOT NULL THEN 1 ELSE needs_rescore END,partner_changed_at=CASE WHEN ${postSubmit?1:0}=1 AND earned_score IS NOT NULL THEN CURRENT_TIMESTAMP ELSE partner_changed_at END,updated_at=CURRENT_TIMESTAMP WHERE target_id=? AND id IN (${marks})`).bind(...binds));
  }
  return statements;
}

async function saveItemsBulk(env,access,body){
  const incoming=Array.isArray(body?.items)?body.items.slice(0,150):[];if(!incoming.length)return {ok:true,items:[],saved_at:new Date().toISOString()};
  const requested=new Map();for(const item of incoming){const id=clean(item?.id,100);if(id)requested.set(id,clean(item?.description,4000))}
  if(!requested.size)return {ok:true,items:[],saved_at:new Date().toISOString()};
  const ids=[...requested.keys()],reads=[];for(let i=0;i<ids.length;i+=80){const part=ids.slice(i,i+80),marks=part.map(()=>'?').join(',');reads.push(env.partner_evaluation_db.prepare(`SELECT id,description,applicable,applicability_status,earned_score FROM evaluation_target_items_v2 WHERE target_id=? AND id IN (${marks})`).bind(access.target.target_id,...part))}const batches=await env.partner_evaluation_db.batch(reads),rows=new Map(batches.flatMap(result=>result.results||[]).map(row=>[row.id,row]));
  for(const id of requested.keys()){const row=rows.get(id);if(!row)return {error:'평가항목을 찾을 수 없습니다.',status:404};if(row.applicability_status==='undetermined')return {error:'업종·상시근로자 수를 확인한 후 작성할 수 있습니다.',status:409,code:'APPLICABILITY_UNDETERMINED'};if(Number(row.applicable)===0)return {error:'N/A 항목은 제출자료를 입력할 수 없습니다.',status:409}}
  const changed=[];for(const [id,description] of requested){const row=rows.get(id);if(String(row.description||'')!==description)changed.push({row,description})}
  const savedAt=new Date().toISOString();if(!changed.length)return {ok:true,items:[...requested].map(([id,description])=>({id,description})),changed_count:0,saved_at:savedAt};
  const postSubmit=wasSubmitted(access.target),stmts=bulkDescriptionStatements(env,access.target.target_id,changed,postSubmit);
  stmts.push(env.partner_evaluation_db.prepare(`UPDATE evaluation_targets_v2 SET status=CASE WHEN ?=1 AND status='completed' THEN 'evaluating' WHEN status='not_started' THEN 'in_progress' ELSE status END,finalized_at=CASE WHEN ?=1 AND status='completed' THEN NULL ELSE finalized_at END,finalized_by=CASE WHEN ?=1 AND status='completed' THEN NULL ELSE finalized_by END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(postSubmit?1:0,postSubmit?1:0,postSubmit?1:0,access.target.target_id));
  stmts.push(env.partner_evaluation_db.prepare(`INSERT INTO evaluation_partner_submission_logs_v2 (id,target_id,target_item_id,action,detail_json,changed_by) VALUES (?,?,?,?,?,?)`).bind(crypto.randomUUID(),access.target.target_id,null,postSubmit?'post_submit_items_bulk_edit':'items_bulk_saved',JSON.stringify({item_count:changed.length,item_ids:changed.map(x=>x.row.id),needs_rescore:postSubmit&&changed.some(x=>x.row.earned_score!==null&&x.row.earned_score!==undefined)}),access.user.id));
  for(let i=0;i<stmts.length;i+=90)await env.partner_evaluation_db.batch(stmts.slice(i,i+90));
  if(postSubmit&&access.target.status==='completed')access.target.status='evaluating';else if(access.target.status==='not_started')access.target.status='in_progress';
  return {ok:true,items:[...requested].map(([id,description])=>({id,description})),changed_count:changed.length,saved_at:savedAt};
}
async function saveItem(env,access,itemId,body){const result=await saveItemsBulk(env,access,{items:[{id:itemId,description:body?.description}]});if(result.error)return result;return {ok:true,saved_at:result.saved_at}}
function validRequestId(value){const id=clean(value,100);return /^[A-Za-z0-9._:-]{8,100}$/.test(id)?id:''}
async function claimSubmissionRequest(env,targetId,userId,requestId){
  const inserted=await env.partner_evaluation_db.prepare(`INSERT OR IGNORE INTO evaluation_submission_requests_v2 (request_id,target_id,user_id,state) VALUES (?,?,?,'processing')`).bind(requestId,targetId,userId).run();
  if(Number(inserted?.meta?.changes||0)>0)return {owner:true};
  let existing=await env.partner_evaluation_db.prepare(`SELECT state,response_json,error_code FROM evaluation_submission_requests_v2 WHERE request_id=? AND target_id=? AND user_id=? LIMIT 1`).bind(requestId,targetId,userId).first();
  if(!existing)return {error:'제출 요청 식별자가 충돌했습니다.',status:409};
  if(existing.state==='completed')return {owner:false,result:JSON.parse(existing.response_json||'{}')};
  if(existing.state==='processing')return {owner:false,pending:true};
  const reclaimed=await env.partner_evaluation_db.prepare(`UPDATE evaluation_submission_requests_v2 SET state='processing',response_json=NULL,error_code=NULL,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND target_id=? AND user_id=? AND state='failed'`).bind(requestId,targetId,userId).run();
  if(Number(reclaimed?.meta?.changes||0)>0)return {owner:true};
  existing=await env.partner_evaluation_db.prepare(`SELECT state,response_json FROM evaluation_submission_requests_v2 WHERE request_id=? AND target_id=? AND user_id=? LIMIT 1`).bind(requestId,targetId,userId).first();
  return existing?.state==='completed'?{owner:false,result:JSON.parse(existing.response_json||'{}')}:{owner:false,pending:true};
}
function completeSubmissionRequestStatement(env,requestId,result){return env.partner_evaluation_db.prepare(`UPDATE evaluation_submission_requests_v2 SET state='completed',response_json=?,error_code=NULL,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE request_id=?`).bind(JSON.stringify(result),requestId)}
async function failSubmissionRequest(env,requestId,error){if(!requestId)return;await env.partner_evaluation_db.prepare(`UPDATE evaluation_submission_requests_v2 SET state='failed',error_code=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND state='processing'`).bind(clean(error?.code||'SUBMISSION_FAILED',80),requestId).run().catch(()=>{})}
async function submitWithItems(env,access,body,onProgress=()=>{}){
  const t=access.target;if(!clean(t.business_number,30)||!clean(t.representative_name,100)||t.worker_count===null||t.worker_count===undefined)return {error:'제출 전 회사 기본정보를 먼저 저장하세요.',status:400};
  const requestId=validRequestId(body?.request_id)||crypto.randomUUID(),incoming=Array.isArray(body?.items)?body.items.slice(0,150):[],requested=new Map();for(const item of incoming){const id=clean(item?.id,100);if(id)requested.set(id,clean(item?.description,4000))}
  let rows=new Map();if(requested.size){const ids=[...requested.keys()],reads=[];for(let i=0;i<ids.length;i+=80){const part=ids.slice(i,i+80),marks=part.map(()=>'?').join(',');reads.push(env.partner_evaluation_db.prepare(`SELECT id,description,applicable,applicability_status,earned_score FROM evaluation_target_items_v2 WHERE target_id=? AND id IN (${marks})`).bind(t.target_id,...part))}const batches=await env.partner_evaluation_db.batch(reads);rows=new Map(batches.flatMap(result=>result.results||[]).map(row=>[row.id,row]));for(const id of requested.keys()){const row=rows.get(id);if(!row)return {error:'평가항목을 찾을 수 없습니다.',status:404};if(row.applicability_status==='undetermined')return {error:'업종·상시근로자 수를 확인한 후 작성할 수 있습니다.',status:409,code:'APPLICABILITY_UNDETERMINED'};if(Number(row.applicable)===0)return {error:'N/A 항목은 제출자료를 입력할 수 없습니다.',status:409}}}
  onProgress(60);
  const changed=[];for(const [id,description] of requested){const row=rows.get(id);if(String(row?.description||'')!==description)changed.push({row,description})}
  const claim=await claimSubmissionRequest(env,t.target_id,access.user.id,requestId);if(claim.error)return claim;if(claim.result){onProgress(80);return {...claim.result,duplicate:true}}if(claim.pending)return {ok:true,pending:true,request_id:requestId};
  const postSubmit=wasSubmitted(t),resubmitted=postSubmit,submittedAt=postSubmit&&t.submitted_at?t.submitted_at:new Date().toISOString(),statements=[];
  if(postSubmit&&!changed.length){const result={ok:true,resubmitted:true,summary:null,submitted_at:submittedAt,status:t.status,changed_count:0,unchanged:true,request_id:requestId,next_url:'/ipass/evaluations?submitted=1'};try{await env.partner_evaluation_db.batch([env.partner_evaluation_db.prepare(`INSERT INTO evaluation_partner_submission_logs_v2 (id,target_id,target_item_id,action,detail_json,changed_by) VALUES (?,?,?,?,?,?)`).bind(crypto.randomUUID(),t.target_id,null,'resubmitted',JSON.stringify({changed_count:0,requested_count:requested.size,request_id:requestId}),access.user.id),completeSubmissionRequestStatement(env,requestId,result)]);onProgress(80);return result}catch(error){await failSubmissionRequest(env,requestId,error);throw error}}
  statements.push(...bulkDescriptionStatements(env,t.target_id,changed,postSubmit));
  statements.push(env.partner_evaluation_db.prepare(`UPDATE evaluation_targets_v2 SET status=CASE WHEN ?=1 AND ?=1 AND status='completed' THEN 'evaluating' WHEN status IN ('not_started','in_progress','submitted') THEN 'submitted' ELSE status END,submitted_at=CASE WHEN ?=0 THEN CURRENT_TIMESTAMP ELSE COALESCE(submitted_at,CURRENT_TIMESTAMP) END,finalized_at=CASE WHEN ?=1 AND ?=1 AND status='completed' THEN NULL ELSE finalized_at END,finalized_by=CASE WHEN ?=1 AND ?=1 AND status='completed' THEN NULL ELSE finalized_by END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(postSubmit?1:0,changed.length?1:0,postSubmit?1:0,postSubmit?1:0,changed.length?1:0,postSubmit?1:0,changed.length?1:0,t.target_id));
  if(changed.length)statements.push(env.partner_evaluation_db.prepare(`INSERT INTO evaluation_partner_submission_logs_v2 (id,target_id,target_item_id,action,detail_json,changed_by) VALUES (?,?,?,?,?,?)`).bind(crypto.randomUUID(),t.target_id,null,postSubmit?'post_submit_items_bulk_edit':'items_bulk_saved',JSON.stringify({item_count:changed.length,item_ids:changed.map(x=>x.row.id),needs_rescore:postSubmit&&changed.some(x=>x.row.earned_score!==null&&x.row.earned_score!==undefined)}),access.user.id));
  statements.push(env.partner_evaluation_db.prepare(`INSERT INTO evaluation_partner_submission_logs_v2 (id,target_id,target_item_id,action,detail_json,changed_by) VALUES (?,?,?,?,?,?)`).bind(crypto.randomUUID(),t.target_id,null,resubmitted?'resubmitted':'submitted',JSON.stringify({changed_count:changed.length,requested_count:requested.size,request_id:requestId}),access.user.id));
  const status=postSubmit&&changed.length&&t.status==='completed'?'evaluating':['not_started','in_progress','submitted'].includes(t.status)?'submitted':t.status;
  const result={ok:true,resubmitted,summary:null,submitted_at:submittedAt,status,changed_count:changed.length,request_id:requestId,next_url:'/ipass/evaluations?submitted=1'};statements.push(completeSubmissionRequestStatement(env,requestId,result));
  try{await env.partner_evaluation_db.batch(statements);onProgress(80);return result}catch(error){await failSubmissionRequest(env,requestId,error);throw error}
}

function submissionStream(request,env,ctx,baseWorker,targetId){
  const encoder=new TextEncoder();let active=true;
  const stream=new ReadableStream({start(controller){const send=value=>{if(!active)return;try{controller.enqueue(encoder.encode(JSON.stringify(value)+'\n'))}catch(_){active=false}};const close=()=>{if(!active)return;try{controller.close()}catch(_){}active=false};const work=(async()=>{try{const access=await ensureAccess(request,env,ctx,baseWorker,targetId,true);if(!access.ok){const data=await access.response.clone().json().catch(()=>({}));send({error:data.error||'제출 권한을 확인할 수 없습니다.',status:access.response.status,code:data.code||null});return}send({progress:40});const body=await request.json().catch(()=>({}));const result=await submitWithItems(env,access,body,progress=>send({progress}));if(result.error){send({error:result.error,status:result.status||400,code:result.code||null});return}send({progress:result.pending?80:100,result})}catch(error){send({error:error?.message||'제출 처리 중 오류가 발생했습니다.',status:500,code:error?.code||'SUBMISSION_FAILED'})}finally{close()}})();if(ctx?.waitUntil)ctx.waitUntil(work);},cancel(){active=false}});
  return new Response(stream,{headers:{'content-type':'application/x-ndjson;charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type,x-request-id','access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS'}});
}

async function addFile(request,env,access,itemId,quota=null){
  if(!env.EVIDENCE_FILES)return {error:'증빙자료 저장소가 아직 연결되지 않았습니다.',status:503,storage_available:false};
  const [item,form]=await Promise.all([env.partner_evaluation_db.prepare(`SELECT id,applicable,applicability_status,earned_score FROM evaluation_target_items_v2 WHERE id=? AND target_id=? LIMIT 1`).bind(itemId,access.target.target_id).first(),request.formData()]);
  if(!item)return {error:'평가항목을 찾을 수 없습니다.',status:404};if(item.applicability_status==='undetermined')return {error:'업종·상시근로자 수를 확인한 후 파일을 첨부할 수 있습니다.',status:409,code:'APPLICABILITY_UNDETERMINED'};if(Number(item.applicable)===0)return {error:'N/A 항목에는 증빙자료를 첨부할 수 없습니다.',status:409};
  const file=form.get('file');if(!(file instanceof File)||!file.name)return {error:'첨부할 파일을 선택하세요.',status:400};if(file.size<=0||file.size>MAX_FILE_BYTES)return {error:'파일은 25MB 이하만 첨부할 수 있습니다.',status:400};const ext=(file.name.split('.').pop()||'').toLowerCase();if(!ALLOWED_EXT.has(ext))return {error:'PDF, JPG, PNG, Excel, HWP, PowerPoint, Word 파일만 첨부할 수 있습니다.',status:400};
  let reservation=null;if(quota?.reserve){try{reservation=await quota.reserve(access.target.target_id,file.size)}catch(error){console.error('quota reservation failed',error);return {error:'저장공간 확인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',status:503,code:'STORAGE_QUOTA_CHECK_FAILED'}}if(!reservation.ok){const global=reservation.scope==='global';return {error:global?'전체 증빙자료 저장공간이 8.5GB 한도에 도달하여 신규 파일 업로드가 중지되었습니다.':'이 회사의 해당 평가회차 증빙자료가 500MB 한도에 도달하여 신규 파일 업로드가 중지되었습니다.',status:507,code:global?'GLOBAL_STORAGE_LIMIT':'COMPANY_CYCLE_STORAGE_LIMIT',storage_usage:reservation.usage||await quota.usage(access.target.target_id)}}}
  const id=crypto.randomUUID(),name=safeFileName(file.name),contentType=file.type||'application/octet-stream',createdAt=new Date().toISOString(),key=`evaluations/${access.target.year}/${access.target.half}/${access.target.company_id}/${access.target.target_id}/${itemId}/${id}-${name}`;
  try{
    await env.EVIDENCE_FILES.put(key,file.stream(),{httpMetadata:{contentType},customMetadata:{originalName:name,uploadedBy:String(access.user.id||'')}});
    const postSubmit=wasSubmitted(access.target),statements=[env.partner_evaluation_db.prepare(`INSERT INTO evaluation_evidence_files_v2 (id,target_id,target_item_id,object_key,file_name,content_type,file_size,uploaded_by) VALUES (?,?,?,?,?,?,?,?)`).bind(id,access.target.target_id,itemId,key,name,contentType,file.size,access.user.id),env.partner_evaluation_db.prepare(`INSERT INTO evaluation_partner_submission_logs_v2 (id,target_id,target_item_id,action,detail_json,changed_by) VALUES (?,?,?,?,?,?)`).bind(crypto.randomUUID(),access.target.target_id,itemId,postSubmit?'post_submit_file_added':'file_added',JSON.stringify({file_id:id,file_name:name,file_size:file.size,needs_rescore:item.earned_score!==null&&item.earned_score!==undefined}),access.user.id)];
    if(postSubmit)statements.push(env.partner_evaluation_db.prepare(`UPDATE evaluation_target_items_v2 SET needs_rescore=CASE WHEN earned_score IS NOT NULL THEN 1 ELSE needs_rescore END,partner_changed_at=CASE WHEN earned_score IS NOT NULL THEN CURRENT_TIMESTAMP ELSE partner_changed_at END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND target_id=?`).bind(itemId,access.target.target_id),env.partner_evaluation_db.prepare(`UPDATE evaluation_targets_v2 SET status=CASE WHEN status='completed' THEN 'evaluating' ELSE status END,finalized_at=CASE WHEN status='completed' THEN NULL ELSE finalized_at END,finalized_by=CASE WHEN status='completed' THEN NULL ELSE finalized_by END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(access.target.target_id));
    await env.partner_evaluation_db.batch(statements);return {ok:true,file:{id,target_item_id:itemId,file_name:name,content_type:contentType,file_size:file.size,created_at:createdAt}};
  }catch(error){await env.EVIDENCE_FILES.delete(key).catch(()=>{});throw error}finally{if(reservation?.id)await quota.release(reservation.id)}
}

async function fileAccess(request,env,ctx,baseWorker,fileId,write=false){const a=await account(request,env,ctx,baseWorker);if(!a.ok)return a;const row=await env.partner_evaluation_db.prepare(`SELECT f.*,et.company_id,et.status AS target_status,et.submitted_at,EXISTS(SELECT 1 FROM evaluation_partner_submission_logs_v2 sl WHERE sl.target_id=et.id AND sl.action IN ('submitted','resubmitted')) AS has_submission_record,ti.earned_score,ec.status AS cycle_status,ec.start_at,ec.end_at FROM evaluation_evidence_files_v2 f JOIN evaluation_targets_v2 et ON et.id=f.target_id JOIN evaluation_target_items_v2 ti ON ti.id=f.target_item_id JOIN evaluation_cycles_v2 ec ON ec.id=et.cycle_id WHERE f.id=? AND f.deleted_at IS NULL LIMIT 1`).bind(fileId).first();if(!row)return {ok:false,response:json({success:false,error:'첨부파일을 찾을 수 없습니다.'},404)};if(a.user.role!=='admin'&&row.company_id!==a.user.company_id)return {ok:false,response:json({success:false,error:'접근 권한이 없습니다.'},403)};if(write){const pseudo={cycle_status:row.cycle_status,start_at:row.start_at,end_at:row.end_at};if(row.target_status==='published')return {ok:false,response:json({success:false,error:'결과가 공개된 평가는 수정할 수 없습니다.'},409)};const lease=await leaseForRequest(request,env,row.target_id,a.user.id);if(a.user.role!=='partner'||!canEdit(pseudo,lease))return {ok:false,response:json({success:false,error:'현재 첨부파일을 삭제할 수 없습니다.'},409)}}return {ok:true,user:a.user,file:row}}

export async function handlePartnerSubmission(request,env,ctx,baseWorker,quota=null){
  const url=new URL(request.url),path=url.pathname;if(!path.startsWith('/api/partner/submission'))return null;if(request.method==='OPTIONS')return json({success:true});const accessFor=(id,write=false)=>ensureAccess(request,env,ctx,baseWorker,id,write);
  const publicPreview=path.match(/^\/api\/partner\/submission\/preview\/([^/]+)(?:\/[^/]+)?$/);
  if(publicPreview&&request.method==='GET'){
    if(!env.EVIDENCE_FILES)return json({success:false,error:'증빙자료 저장소가 아직 연결되지 않았습니다.'},503);
    const ticket=await env.partner_evaluation_db.prepare(`SELECT f.* FROM evaluation_evidence_preview_tickets_v2 p JOIN evaluation_evidence_files_v2 f ON f.id=p.file_id WHERE p.id=? AND p.expires_at>CURRENT_TIMESTAMP AND f.deleted_at IS NULL LIMIT 1`).bind(decodeURIComponent(publicPreview[1])).first();
    if(!ticket)return json({success:false,error:'미리보기 링크가 만료되었거나 유효하지 않습니다.'},410);
    const obj=await env.EVIDENCE_FILES.get(ticket.object_key);if(!obj)return json({success:false,error:'저장된 파일을 찾을 수 없습니다.'},404);
    const h=new Headers();obj.writeHttpMetadata(h);h.set('content-type',previewMime(ticket));h.set('content-disposition',`inline; filename*=UTF-8''${encodeURIComponent(ticket.file_name)}`);h.set('content-length',String(obj.size));h.set('cache-control','private, no-store, max-age=0');h.set('x-content-type-options','nosniff');h.set('access-control-allow-origin','*');return new Response(obj.body,{headers:h});
  }
  const previewTicket=path.match(/^\/api\/partner\/submission\/files\/([^/]+)\/preview-ticket$/);
  if(previewTicket&&request.method==='POST'){
    const fa=await fileAccess(request,env,ctx,baseWorker,decodeURIComponent(previewTicket[1]),false);if(!fa.ok)return fa.response;
    const id=crypto.randomUUID();
    await env.partner_evaluation_db.batch([
      env.partner_evaluation_db.prepare(`DELETE FROM evaluation_evidence_preview_tickets_v2 WHERE expires_at<=CURRENT_TIMESTAMP`),
      env.partner_evaluation_db.prepare(`INSERT INTO evaluation_evidence_preview_tickets_v2 (id,file_id,issued_by,expires_at) VALUES (?,?,?,datetime('now',?))`).bind(id,fa.file.id,fa.user.id,`+${PREVIEW_TICKET_MINUTES} minutes`)
    ]);
    const sourceUrl=`${url.origin}/api/partner/submission/preview/${encodeURIComponent(id)}/${encodeURIComponent(fa.file.file_name)}`;
    const viewerUrl=`https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(sourceUrl)}`;
    const officeViewerUrl=`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(sourceUrl)}`;
    return json({success:true,source_url:sourceUrl,viewer_url:viewerUrl,office_viewer_url:officeViewerUrl,expires_in_seconds:PREVIEW_TICKET_MINUTES*60});
  }
  const fileMatch=path.match(/^\/api\/partner\/submission\/files\/([^/]+)$/);if(fileMatch){const fa=await fileAccess(request,env,ctx,baseWorker,decodeURIComponent(fileMatch[1]),request.method==='DELETE');if(!fa.ok)return fa.response;if(request.method==='GET'){if(!env.EVIDENCE_FILES)return json({success:false,error:'증빙자료 저장소가 아직 연결되지 않았습니다.'},503);const obj=await env.EVIDENCE_FILES.get(fa.file.object_key);if(!obj)return json({success:false,error:'저장된 파일을 찾을 수 없습니다.'},404);const h=new Headers();obj.writeHttpMetadata(h);h.set('content-disposition',`attachment; filename*=UTF-8''${encodeURIComponent(fa.file.file_name)}`);return new Response(obj.body,{headers:h})}if(request.method==='DELETE'){if(!env.EVIDENCE_FILES)return json({success:false,error:'증빙자료 저장소가 아직 연결되지 않았습니다.'},503);await env.EVIDENCE_FILES.delete(fa.file.object_key);await env.partner_evaluation_db.prepare(`UPDATE evaluation_evidence_files_v2 SET deleted_at=CURRENT_TIMESTAMP WHERE id=?`).bind(fa.file.id).run();if(wasSubmitted(fa.file))await markPartnerChange(env,fa.file.target_id,fa.file.target_item_id,false);await log(env,fa.file.target_id,fa.file.target_item_id,'file_deleted',{file_id:fa.file.id,file_name:fa.file.file_name,needs_rescore:fa.file.earned_score!==null&&fa.file.earned_score!==undefined},fa.user.id);return json({success:true})}return json({success:false,error:'지원하지 않는 요청입니다.'},405)}

  const root=path.match(/^\/api\/partner\/submission\/([^/]+)$/);if(root){const access=await accessFor(decodeURIComponent(root[1]),false);if(!access.ok)return access.response;if(request.method==='GET'){const w=visibleWorkspace(await workspace(env,access.target),access.user);return json({success:true,user:{role:access.user.role||null,name:access.user.name||null,company_name:access.user.company_name||null},workspace:w,capabilities:{evidence_upload:!!env.EVIDENCE_FILES,editable:canEdit(access.target,access.lease)&&access.target.status!=='published',max_file_size_mb:25,allowed_extensions:[...ALLOWED_EXT]}})}return json({success:false,error:'지원하지 않는 요청입니다.'},405)}
  const profile=path.match(/^\/api\/partner\/submission\/([^/]+)\/profile$/);if(profile&&request.method==='PATCH'){const access=await accessFor(decodeURIComponent(profile[1]),true);if(!access.ok)return access.response;const r=await saveProfile(env,access,await request.json());if(r.error)return json({success:false,error:r.error},r.status);const w=await workspace(env,await target(env,access.target.target_id));return json({success:true,workspace:visibleWorkspace(w,access.user)})}
  const bulkItems=path.match(/^\/api\/partner\/submission\/([^/]+)\/items\/bulk$/);if(bulkItems&&request.method==='PATCH'){const access=await accessFor(decodeURIComponent(bulkItems[1]),true);if(!access.ok)return access.response;const r=await saveItemsBulk(env,access,await request.json());if(r.error)return json({success:false,error:r.error},r.status);return json({success:true,...r})}
  const item=path.match(/^\/api\/partner\/submission\/([^/]+)\/items\/([^/]+)$/);if(item&&request.method==='PATCH'){const access=await accessFor(decodeURIComponent(item[1]),true);if(!access.ok)return access.response;const r=await saveItem(env,access,decodeURIComponent(item[2]),await request.json());if(r.error)return json({success:false,error:r.error},r.status);return json({success:true,...r})}
  const files=path.match(/^\/api\/partner\/submission\/([^/]+)\/items\/([^/]+)\/files$/);if(files&&request.method==='POST'){const access=await accessFor(decodeURIComponent(files[1]),true);if(!access.ok)return access.response;const r=await addFile(request,env,access,decodeURIComponent(files[2]),quota);if(r.error)return json({success:false,error:r.error,code:r.code,storage_available:r.storage_available,storage_usage:r.storage_usage},r.status);return json({success:true,file:r.file},201)}
  const submitStatus=path.match(/^\/api\/partner\/submission\/([^/]+)\/submit-status\/([^/]+)$/);if(submitStatus&&request.method==='GET'){const access=await accessFor(decodeURIComponent(submitStatus[1]),false);if(!access.ok)return access.response;const requestId=validRequestId(decodeURIComponent(submitStatus[2]));if(!requestId)return json({success:false,error:'올바르지 않은 제출 요청입니다.'},400);const row=await env.partner_evaluation_db.prepare(`SELECT state,response_json,error_code,created_at,completed_at FROM evaluation_submission_requests_v2 WHERE request_id=? AND target_id=? LIMIT 1`).bind(requestId,access.target.target_id).first();if(!row)return json({success:true,state:'not_found',request_id:requestId});return json({success:true,state:row.state,request_id:requestId,result:row.state==='completed'?JSON.parse(row.response_json||'{}'):null,error_code:row.error_code||null,created_at:row.created_at,completed_at:row.completed_at})}
  const submitMatch=path.match(/^\/api\/partner\/submission\/([^/]+)\/submit$/);if(submitMatch&&request.method==='POST'){const targetId=decodeURIComponent(submitMatch[1]);if((request.headers.get('accept')||'').includes('application/x-ndjson'))return submissionStream(request,env,ctx,baseWorker,targetId);const access=await accessFor(targetId,true);if(!access.ok)return access.response;const r=await submitWithItems(env,access,await request.json().catch(()=>({})));if(r.error)return json({success:false,error:r.error},r.status);return json({success:true,...r})}
  return json({success:false,error:'지원하지 않는 제출 요청입니다.'},404)
}
