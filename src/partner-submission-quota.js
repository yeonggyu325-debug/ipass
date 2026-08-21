import { handlePartnerSubmission } from './partner-submission.js';

const GLOBAL_LIMIT_BYTES = 9126805504; // 8.5 GiB hard stop
const TARGET_LIMIT_BYTES = 524288000;   // 500 MiB per company / evaluation cycle
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const RESERVATION_TTL_MINUTES = 30;

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=utf-8','access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS'}})}
function mb(bytes){return Math.round((Number(bytes||0)/1024/1024)*10)/10}
function gb(bytes){return Math.round((Number(bytes||0)/1024/1024/1024)*100)/100}

async function ensureQuotaSchema(env){
  await env.partner_evaluation_db.batch([
    env.partner_evaluation_db.prepare(`CREATE TABLE IF NOT EXISTS evaluation_evidence_files_v2 (
      id TEXT PRIMARY KEY,
      target_id TEXT NOT NULL,
      target_item_id TEXT NOT NULL,
      object_key TEXT NOT NULL,
      file_name TEXT NOT NULL,
      content_type TEXT,
      file_size INTEGER NOT NULL DEFAULT 0,
      uploaded_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    )`),
    env.partner_evaluation_db.prepare(`CREATE TABLE IF NOT EXISTS evaluation_upload_reservations_v2 (
      id TEXT PRIMARY KEY,
      target_id TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.partner_evaluation_db.prepare(`CREATE INDEX IF NOT EXISTS idx_upload_reservations_v2_target ON evaluation_upload_reservations_v2(target_id,created_at)`),
    env.partner_evaluation_db.prepare(`CREATE TRIGGER IF NOT EXISTS trg_evidence_upload_quota_v2
      BEFORE INSERT ON evaluation_upload_reservations_v2
      BEGIN
        SELECT CASE WHEN (
          COALESCE((SELECT SUM(file_size) FROM evaluation_evidence_files_v2 WHERE deleted_at IS NULL),0)
          + COALESCE((SELECT SUM(file_size) FROM evaluation_upload_reservations_v2 WHERE created_at >= datetime('now','-${RESERVATION_TTL_MINUTES} minutes')),0)
          + NEW.file_size
        ) > ${GLOBAL_LIMIT_BYTES}
        THEN RAISE(ABORT,'GLOBAL_STORAGE_LIMIT') END;

        SELECT CASE WHEN (
          COALESCE((SELECT SUM(file_size) FROM evaluation_evidence_files_v2 WHERE target_id=NEW.target_id AND deleted_at IS NULL),0)
          + COALESCE((SELECT SUM(file_size) FROM evaluation_upload_reservations_v2 WHERE target_id=NEW.target_id AND created_at >= datetime('now','-${RESERVATION_TTL_MINUTES} minutes')),0)
          + NEW.file_size
        ) > ${TARGET_LIMIT_BYTES}
        THEN RAISE(ABORT,'TARGET_STORAGE_LIMIT') END;
      END`)
  ]);
  await env.partner_evaluation_db.prepare(`DELETE FROM evaluation_upload_reservations_v2 WHERE created_at < datetime('now','-${RESERVATION_TTL_MINUTES} minutes')`).run();
}

async function storageUsage(env,targetId){
  const [globalRow,targetRow,resGlobal,resTarget]=await env.partner_evaluation_db.batch([
    env.partner_evaluation_db.prepare(`SELECT COALESCE(SUM(file_size),0) AS used FROM evaluation_evidence_files_v2 WHERE deleted_at IS NULL`),
    env.partner_evaluation_db.prepare(`SELECT COALESCE(SUM(file_size),0) AS used FROM evaluation_evidence_files_v2 WHERE target_id=? AND deleted_at IS NULL`).bind(targetId),
    env.partner_evaluation_db.prepare(`SELECT COALESCE(SUM(file_size),0) AS used FROM evaluation_upload_reservations_v2 WHERE created_at >= datetime('now','-${RESERVATION_TTL_MINUTES} minutes')`),
    env.partner_evaluation_db.prepare(`SELECT COALESCE(SUM(file_size),0) AS used FROM evaluation_upload_reservations_v2 WHERE target_id=? AND created_at >= datetime('now','-${RESERVATION_TTL_MINUTES} minutes')`).bind(targetId)
  ]);
  const globalCommitted=Number(globalRow?.results?.[0]?.used||0),targetCommitted=Number(targetRow?.results?.[0]?.used||0),globalReserved=Number(resGlobal?.results?.[0]?.used||0),targetReserved=Number(resTarget?.results?.[0]?.used||0);
  const globalUsed=globalCommitted+globalReserved,targetUsed=targetCommitted+targetReserved;
  return {
    global:{used_bytes:globalUsed,committed_bytes:globalCommitted,reserved_bytes:globalReserved,limit_bytes:GLOBAL_LIMIT_BYTES,used_gb:gb(globalUsed),limit_gb:8.5,remaining_bytes:Math.max(0,GLOBAL_LIMIT_BYTES-globalUsed),percent:Math.min(100,Math.round(globalUsed/GLOBAL_LIMIT_BYTES*1000)/10)},
    company_cycle:{used_bytes:targetUsed,committed_bytes:targetCommitted,reserved_bytes:targetReserved,limit_bytes:TARGET_LIMIT_BYTES,used_mb:mb(targetUsed),limit_mb:500,remaining_bytes:Math.max(0,TARGET_LIMIT_BYTES-targetUsed),percent:Math.min(100,Math.round(targetUsed/TARGET_LIMIT_BYTES*1000)/10)}
  };
}

async function reserve(env,targetId,fileSize){
  const id=crypto.randomUUID();
  try{
    await env.partner_evaluation_db.prepare(`INSERT INTO evaluation_upload_reservations_v2 (id,target_id,file_size) VALUES (?,?,?)`).bind(id,targetId,fileSize).run();
    return {ok:true,id};
  }catch(e){
    const message=String(e?.message||e||'');
    if(message.includes('GLOBAL_STORAGE_LIMIT'))return {ok:false,scope:'global'};
    if(message.includes('TARGET_STORAGE_LIMIT'))return {ok:false,scope:'company_cycle'};
    throw e;
  }
}
async function release(env,id){if(!id)return;await env.partner_evaluation_db.prepare(`DELETE FROM evaluation_upload_reservations_v2 WHERE id=?`).bind(id).run().catch(()=>{})}

async function augmentWorkspaceResponse(response,env,targetId){
  if(!response?.ok)return response;
  const type=response.headers.get('content-type')||'';if(!type.includes('application/json'))return response;
  const data=await response.clone().json().catch(()=>null);if(!data?.success)return response;
  const usage=await storageUsage(env,targetId);
  data.capabilities={...(data.capabilities||{}),storage_limits:{global_gb:8.5,company_cycle_mb:500},storage_usage:usage};
  const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('content-encoding');
  return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
}

export async function handlePartnerSubmissionWithQuota(request,env,ctx,baseWorker){
  const url=new URL(request.url),path=url.pathname;if(!path.startsWith('/api/partner/submission'))return null;
  await ensureQuotaSchema(env);

  const root=path.match(/^\/api\/partner\/submission\/([^/]+)$/);
  if(root&&request.method==='GET'){
    const targetId=decodeURIComponent(root[1]);
    const response=await handlePartnerSubmission(request,env,ctx,baseWorker);
    return augmentWorkspaceResponse(response,env,targetId);
  }

  const upload=path.match(/^\/api\/partner\/submission\/([^/]+)\/items\/([^/]+)\/files$/);
  if(upload&&request.method==='POST'){
    const targetId=decodeURIComponent(upload[1]);
    let form=null;try{form=await request.clone().formData()}catch{}
    const file=form?.get('file');
    if(!(file instanceof File)||!file.name||file.size<=0||file.size>MAX_FILE_BYTES)return handlePartnerSubmission(request,env,ctx,baseWorker);

    const exists=await env.partner_evaluation_db.prepare(`SELECT id FROM evaluation_targets_v2 WHERE id=? AND is_selected=1 LIMIT 1`).bind(targetId).first();
    if(!exists)return handlePartnerSubmission(request,env,ctx,baseWorker);

    const reservation=await reserve(env,targetId,file.size);
    if(!reservation.ok){
      const usage=await storageUsage(env,targetId);
      if(reservation.scope==='global')return json({success:false,error:'전체 증빙자료 저장공간이 8.5GB 한도에 도달하여 신규 파일 업로드가 중지되었습니다.',code:'GLOBAL_STORAGE_LIMIT',storage_usage:usage},507);
      return json({success:false,error:'이 회사의 해당 평가회차 증빙자료가 500MB 한도에 도달하여 신규 파일 업로드가 중지되었습니다.',code:'COMPANY_CYCLE_STORAGE_LIMIT',storage_usage:usage},507);
    }

    try{
      const response=await handlePartnerSubmission(request,env,ctx,baseWorker);
      await release(env,reservation.id);
      return response;
    }catch(e){
      await release(env,reservation.id);
      throw e;
    }
  }

  return handlePartnerSubmission(request,env,ctx,baseWorker);
}
