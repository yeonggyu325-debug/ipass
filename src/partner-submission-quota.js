import { handlePartnerSubmission } from './partner-submission.js';
import { reconcileTargetApplicability } from './applicability-engine.js';

const GLOBAL_LIMIT_BYTES=9126805504;
const TARGET_LIMIT_BYTES=524288000;
const MAX_FILE_BYTES=25*1024*1024;
const RESERVATION_TTL_MINUTES=30;
const USAGE_CACHE_MS=60000;
const EDIT_LEASE_MINUTES=30;
let globalUsageCache=null;

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=utf-8'}})}
function mb(bytes){return Math.round((Number(bytes||0)/1024/1024)*10)/10}
function gb(bytes){return Math.round((Number(bytes||0)/1024/1024/1024)*100)/100}
function targetIdFromPath(path){
  const match=path.match(/^\/api\/partner\/submission\/([^/]+)(?:\/|$)/);if(!match)return'';
  const id=decodeURIComponent(match[1]);return id==='files'||id==='preview'?'':id;
}
async function account(request,env,ctx,baseWorker){
  const url=new URL(request.url);url.pathname='/api/me';url.search='';
  const response=await baseWorker.fetch(new Request(url.toString(),{method:'GET',headers:request.headers}),env,ctx);
  const data=await response.clone().json().catch(()=>null);
  if(!response.ok||!data?.success)return{ok:false,response};
  if(data.auth_state!=='approved')return{ok:false,response:json({success:false,error:'승인된 계정이 필요합니다.'},403)};
  return{ok:true,user:data.user};
}
async function targetInfo(env,targetId){return env.partner_evaluation_db.prepare(`
  SELECT et.id,et.company_id,et.status,et.submitted_at,c.company_name,ec.cycle_name,ec.status AS cycle_status,ec.start_at,ec.end_at
  FROM evaluation_targets_v2 et JOIN companies c ON c.id=et.company_id JOIN evaluation_cycles_v2 ec ON ec.id=et.cycle_id
  WHERE et.id=? AND et.is_selected=1 LIMIT 1
`).bind(targetId).first()}
function inNormalEditWindow(target){
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  return target?.cycle_status==='active'&&(!target.start_at||today>=String(target.start_at).slice(0,10))&&(!target.end_at||today<=String(target.end_at).slice(0,10));
}
async function issueEditLease(request,env,ctx,baseWorker,targetId){
  const auth=await account(request,env,ctx,baseWorker);if(!auth.ok)return auth.response;
  if(auth.user.role!=='partner')return json({success:false,error:'협력사 계정에서만 편집 세션을 시작할 수 있습니다.'},403);
  const target=await targetInfo(env,targetId);if(!target)return json({success:false,error:'평가대상을 찾을 수 없습니다.'},404);
  if(target.company_id!==auth.user.company_id)return json({success:false,error:'접근 권한이 없습니다.'},403);
  if(target.status==='published')return json({success:false,error:'결과가 공개된 평가는 수정할 수 없습니다.'},409);
  const existing=await env.partner_evaluation_db.prepare(`SELECT lease_token,expires_at FROM evaluation_edit_leases_v2 WHERE target_id=? AND account_id=? AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP LIMIT 1`).bind(targetId,auth.user.id).first();
  if(!inNormalEditWindow(target)&&!existing)return json({success:false,error:'평가기간이 종료되어 새 편집 세션을 시작할 수 없습니다.',code:'EDIT_WINDOW_CLOSED'},409);
  const token=existing?.lease_token||crypto.randomUUID(),id=crypto.randomUUID();
  await env.partner_evaluation_db.prepare(`
    INSERT INTO evaluation_edit_leases_v2(id,target_id,account_id,lease_token,expires_at,last_seen_at,revoked_at)
    VALUES(?,?,?,?,datetime('now',?),CURRENT_TIMESTAMP,NULL)
    ON CONFLICT(target_id,account_id) DO UPDATE SET
      lease_token=excluded.lease_token,expires_at=excluded.expires_at,last_seen_at=CURRENT_TIMESTAMP,revoked_at=NULL
  `).bind(id,targetId,auth.user.id,token,`+${EDIT_LEASE_MINUTES} minutes`).run();
  const row=await env.partner_evaluation_db.prepare(`SELECT lease_token,expires_at FROM evaluation_edit_leases_v2 WHERE target_id=? AND account_id=? LIMIT 1`).bind(targetId,auth.user.id).first();
  return json({success:true,lease_token:row.lease_token,expires_at:row.expires_at,minutes:EDIT_LEASE_MINUTES});
}
async function fileTargetId(env,path){
  const match=path.match(/^\/api\/partner\/submission\/files\/([^/]+)$/);if(!match)return'';
  const row=await env.partner_evaluation_db.prepare(`SELECT target_id FROM evaluation_evidence_files_v2 WHERE id=? LIMIT 1`).bind(decodeURIComponent(match[1])).first();return row?.target_id||'';
}
async function enrichWorkspace(response,env,targetId){
  if(!response.ok||!targetId||(response.headers.get('content-type')||'').includes('application/json')===false)return response;
  const data=await response.clone().json().catch(()=>null);if(!data?.success||!data.workspace?.items)return response;
  const {results}=await env.partner_evaluation_db.prepare(`SELECT id,applicability_status,applicability_reason FROM evaluation_target_items_v2 WHERE target_id=?`).bind(targetId).all();
  const states=new Map((results||[]).map(row=>[row.id,row]));
  data.workspace.items=data.workspace.items.map(item=>({...item,...(states.get(item.target_item_state_id||item.id)||{})}));
  const applicable=data.workspace.items.filter(item=>(item.applicability_status|| (Number(item.applicable)===0?'not_applicable':'applicable'))==='applicable');
  const notApplicable=data.workspace.items.filter(item=>(item.applicability_status||'')==='not_applicable');
  const undetermined=data.workspace.items.filter(item=>(item.applicability_status||'')==='undetermined');
  const prepared=applicable.filter(item=>String(item.description||'').trim()||(item.files||[]).length).length;
  data.workspace.summary={...(data.workspace.summary||{}),total:data.workspace.items.length,applicable:applicable.length,na:notApplicable.length,undetermined:undetermined.length,prepared,blank:Math.max(0,applicable.length-prepared),progress:data.workspace.items.length?Math.round((prepared+notApplicable.length)/data.workspace.items.length*100):0};
  if(undetermined.length){data.capabilities={...(data.capabilities||{}),can_submit:false,submission_blocked_reason:`적용대상 판정이 필요한 항목 ${undetermined.length}개가 있습니다. 회사 기본정보를 확인해 주세요.`}}
  const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('content-encoding');
  return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
}
async function blockUndeterminedWrite(env,path,targetId){
  if(!targetId)return null;
  if(/\/profile$/.test(path)||/\/edit-lease$/.test(path))return null;
  const itemMatch=path.match(/\/items\/([^/]+)(?:\/files)?$/);
  if(itemMatch&&itemMatch[1]!=='bulk'){
    const row=await env.partner_evaluation_db.prepare(`SELECT applicability_status FROM evaluation_target_items_v2 WHERE id=? AND target_id=? LIMIT 1`).bind(decodeURIComponent(itemMatch[1]),targetId).first();
    if(row?.applicability_status==='undetermined')return json({success:false,error:'업종·상시근로자 수를 확인한 후 이 항목을 작성할 수 있습니다.',code:'APPLICABILITY_UNDETERMINED'},409);
  }
  if(/\/submit$/.test(path)){
    const row=await env.partner_evaluation_db.prepare(`SELECT COUNT(*) AS count FROM evaluation_target_items_v2 WHERE target_id=? AND applicability_status='undetermined'`).bind(targetId).first();
    if(Number(row?.count||0)>0)return json({success:false,error:`적용대상 판정이 필요한 항목 ${Number(row.count)}개가 있어 제출할 수 없습니다.`,code:'APPLICABILITY_UNDETERMINED'},409);
  }
  return null;
}
function mutationKind(path,method){
  if(method==='PATCH'&&/\/profile$/.test(path))return'profile';
  if(method==='PATCH'&&/\/items\//.test(path))return'items';
  if(method==='POST'&&/\/items\/[^/]+\/files$/.test(path))return'file';
  if(method==='DELETE'&&/\/files\/[^/]+$/.test(path))return'file';
  if(method==='POST'&&/\/submit$/.test(path))return'submit';
  return'';
}
async function notifyAdmins(env,targetId,kind){
  const target=await targetInfo(env,targetId);if(!target)return;
  const submitted=Boolean(target.submitted_at)||['submitted','evaluating','completed','published'].includes(target.status);
  if(kind!=='submit'&&!submitted)return;
  const changed=kind==='submit'&&target.status==='submitted'?'평가자료를 제출했습니다.':'제출 후 평가자료를 수정했습니다.';
  const title=kind==='submit'?'i-PaSS 평가자료 제출':'i-PaSS 제출자료 변경';
  const bucket=Math.floor(Date.now()/300000),prefix=`${kind}:${targetId}:${bucket}`;
  await env.partner_evaluation_db.prepare(`
    INSERT OR IGNORE INTO notifications(
      id,recipient_user_id,recipient_account_id,title,message,type,is_read,entity_type,entity_id,dedupe_key,created_at
    )
    SELECT lower(hex(randomblob(16))),COALESCE((SELECT u.id FROM users u WHERE LOWER(u.email)=LOWER(pa.email) LIMIT 1),(SELECT u.id FROM users u WHERE u.role='admin' LIMIT 1),pa.id),pa.id,?,?,?,0,'evaluation_target',?,?||':'||pa.id,CURRENT_TIMESTAMP
    FROM portal_accounts pa
    WHERE pa.role='admin' AND pa.approval_status='approved'
  `).bind(title,`${target.company_name}에서 ${target.cycle_name} ${changed}`,'evaluation_partner_activity',targetId,prefix).run();
}

async function storageUsage(env,targetId,{exact=false}={}){
  const useCache=!exact&&globalUsageCache&&Date.now()-globalUsageCache.at<USAGE_CACHE_MS;
  const statements=[
    env.partner_evaluation_db.prepare(`SELECT COALESCE(SUM(file_size),0) AS used FROM evaluation_evidence_files_v2 WHERE target_id=? AND deleted_at IS NULL`).bind(targetId),
    env.partner_evaluation_db.prepare(`SELECT COALESCE(SUM(file_size),0) AS used FROM evaluation_upload_reservations_v2 WHERE target_id=? AND created_at >= datetime('now','-${RESERVATION_TTL_MINUTES} minutes')`).bind(targetId)
  ];
  if(!useCache)statements.push(
    env.partner_evaluation_db.prepare(`SELECT COALESCE(SUM(file_size),0) AS used FROM evaluation_evidence_files_v2 WHERE deleted_at IS NULL`),
    env.partner_evaluation_db.prepare(`SELECT COALESCE(SUM(file_size),0) AS used FROM evaluation_upload_reservations_v2 WHERE created_at >= datetime('now','-${RESERVATION_TTL_MINUTES} minutes')`)
  );
  const rows=await env.partner_evaluation_db.batch(statements),targetCommitted=Number(rows[0]?.results?.[0]?.used||0),targetReserved=Number(rows[1]?.results?.[0]?.used||0);
  if(!useCache)globalUsageCache={at:Date.now(),committed:Number(rows[2]?.results?.[0]?.used||0),reserved:Number(rows[3]?.results?.[0]?.used||0)};
  const globalCommitted=Number(globalUsageCache?.committed||0),globalReserved=Number(globalUsageCache?.reserved||0),globalUsed=globalCommitted+globalReserved,targetUsed=targetCommitted+targetReserved;
  return{
    global:{used_bytes:globalUsed,committed_bytes:globalCommitted,reserved_bytes:globalReserved,limit_bytes:GLOBAL_LIMIT_BYTES,used_gb:gb(globalUsed),limit_gb:8.5,remaining_bytes:Math.max(0,GLOBAL_LIMIT_BYTES-globalUsed),percent:Math.min(100,Math.round(globalUsed/GLOBAL_LIMIT_BYTES*1000)/10)},
    company_cycle:{used_bytes:targetUsed,committed_bytes:targetCommitted,reserved_bytes:targetReserved,limit_bytes:TARGET_LIMIT_BYTES,used_mb:mb(targetUsed),limit_mb:500,remaining_bytes:Math.max(0,TARGET_LIMIT_BYTES-targetUsed),percent:Math.min(100,Math.round(targetUsed/TARGET_LIMIT_BYTES*1000)/10)}
  };
}
async function reserve(env,targetId,fileSize){
  const id=crypto.randomUUID();
  const sql=`INSERT INTO evaluation_upload_reservations_v2 (id,target_id,file_size)
    SELECT ?,?,? WHERE (
      COALESCE((SELECT SUM(file_size) FROM evaluation_evidence_files_v2 WHERE deleted_at IS NULL),0)+
      COALESCE((SELECT SUM(file_size) FROM evaluation_upload_reservations_v2 WHERE created_at >= datetime('now','-${RESERVATION_TTL_MINUTES} minutes')),0)+?
    )<=? AND (
      COALESCE((SELECT SUM(file_size) FROM evaluation_evidence_files_v2 WHERE target_id=? AND deleted_at IS NULL),0)+
      COALESCE((SELECT SUM(file_size) FROM evaluation_upload_reservations_v2 WHERE target_id=? AND created_at >= datetime('now','-${RESERVATION_TTL_MINUTES} minutes')),0)+?
    )<=?`;
  const result=await env.partner_evaluation_db.prepare(sql).bind(id,targetId,fileSize,fileSize,GLOBAL_LIMIT_BYTES,targetId,targetId,fileSize,TARGET_LIMIT_BYTES).run();
  if(Number(result?.meta?.changes||0)>0)return{ok:true,id};
  const usage=await storageUsage(env,targetId,{exact:true}),globalBlocked=usage.global.used_bytes+fileSize>GLOBAL_LIMIT_BYTES;
  return{ok:false,scope:globalBlocked?'global':'company_cycle',usage};
}
async function release(env,id){if(!id)return;await env.partner_evaluation_db.prepare(`DELETE FROM evaluation_upload_reservations_v2 WHERE id=?`).bind(id).run().catch(()=>{});globalUsageCache=null}

export async function handlePartnerSubmissionWithQuota(request,env,ctx,baseWorker){
  const url=new URL(request.url),path=url.pathname;if(!path.startsWith('/api/partner/submission'))return null;
  let targetId=targetIdFromPath(path);if(!targetId)targetId=await fileTargetId(env,path);
  const leaseRoute=targetId&&path===`/api/partner/submission/${encodeURIComponent(targetId)}/edit-lease`;
  if(leaseRoute&&request.method==='POST')return issueEditLease(request,env,ctx,baseWorker,targetId);

  if(targetId)await reconcileTargetApplicability(env,targetId);
  if(request.method!=='GET'){
    const blocked=await blockUndeterminedWrite(env,path,targetId);if(blocked)return blocked;
  }

  const upload=/^\/api\/partner\/submission\/[^/]+\/items\/[^/]+\/files$/.test(path)&&request.method==='POST';
  const quota=upload?{
    max_file_bytes:MAX_FILE_BYTES,
    reserve:async(id,size)=>reserve(env,id,size),
    release:async reservationId=>release(env,reservationId),
    usage:async id=>storageUsage(env,id)
  }:null;
  let response=await handlePartnerSubmission(request,env,ctx,baseWorker,quota);
  if(!response)return null;

  if(response.ok&&request.method==='GET'&&targetId&&path===`/api/partner/submission/${encodeURIComponent(targetId)}`)response=await enrichWorkspace(response,env,targetId);
  if(response.ok&&targetId){
    const kind=mutationKind(path,request.method);
    if(kind){
      const task=(async()=>{if(kind==='profile')await reconcileTargetApplicability(env,targetId);await notifyAdmins(env,targetId,kind)})();
      if(ctx?.waitUntil)ctx.waitUntil(task);else void task;
    }
  }
  return response;
}
