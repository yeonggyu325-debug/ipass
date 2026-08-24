import { handlePartnerSubmission } from './partner-submission.js';

const GLOBAL_LIMIT_BYTES = 9126805504; // 8.5 GiB hard stop
const TARGET_LIMIT_BYTES = 524288000;   // 500 MiB per company / evaluation cycle
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const RESERVATION_TTL_MINUTES = 30;
const USAGE_CACHE_MS = 60000;
let quotaSchemaPromise=null;
let globalUsageCache=null;

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=utf-8','access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS'}})}
function mb(bytes){return Math.round((Number(bytes||0)/1024/1024)*10)/10}
function gb(bytes){return Math.round((Number(bytes||0)/1024/1024/1024)*100)/100}

async function ensureQuotaSchema(env){
  if(quotaSchemaPromise)return quotaSchemaPromise;
  quotaSchemaPromise=(async()=>{await env.partner_evaluation_db.batch([
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
    env.partner_evaluation_db.prepare(`CREATE INDEX IF NOT EXISTS idx_evidence_files_v2_target_quota ON evaluation_evidence_files_v2(target_id,deleted_at)`),
    env.partner_evaluation_db.prepare(`DROP TRIGGER IF EXISTS trg_evidence_upload_quota_v2`)
  ]);
  await env.partner_evaluation_db.prepare(`DELETE FROM evaluation_upload_reservations_v2 WHERE created_at < datetime('now','-${RESERVATION_TTL_MINUTES} minutes')`).run()})();
  try{await quotaSchemaPromise}catch(error){quotaSchemaPromise=null;throw error}
}

async function storageUsage(env,targetId,{exact=false}={}){
  const useCache=!exact&&globalUsageCache&&Date.now()-globalUsageCache.at<USAGE_CACHE_MS,statements=[env.partner_evaluation_db.prepare(`SELECT COALESCE(SUM(file_size),0) AS used FROM evaluation_evidence_files_v2 WHERE target_id=? AND deleted_at IS NULL`).bind(targetId),env.partner_evaluation_db.prepare(`SELECT COALESCE(SUM(file_size),0) AS used FROM evaluation_upload_reservations_v2 WHERE target_id=? AND created_at >= datetime('now','-${RESERVATION_TTL_MINUTES} minutes')`).bind(targetId)];
  if(!useCache)statements.push(env.partner_evaluation_db.prepare(`SELECT COALESCE(SUM(file_size),0) AS used FROM evaluation_evidence_files_v2 WHERE deleted_at IS NULL`),env.partner_evaluation_db.prepare(`SELECT COALESCE(SUM(file_size),0) AS used FROM evaluation_upload_reservations_v2 WHERE created_at >= datetime('now','-${RESERVATION_TTL_MINUTES} minutes')`));
  const rows=await env.partner_evaluation_db.batch(statements),targetCommitted=Number(rows[0]?.results?.[0]?.used||0),targetReserved=Number(rows[1]?.results?.[0]?.used||0);
  if(!useCache)globalUsageCache={at:Date.now(),committed:Number(rows[2]?.results?.[0]?.used||0),reserved:Number(rows[3]?.results?.[0]?.used||0)};
  const globalCommitted=Number(globalUsageCache?.committed||0),globalReserved=Number(globalUsageCache?.reserved||0);
  const globalUsed=globalCommitted+globalReserved,targetUsed=targetCommitted+targetReserved;
  return {
    global:{used_bytes:globalUsed,committed_bytes:globalCommitted,reserved_bytes:globalReserved,limit_bytes:GLOBAL_LIMIT_BYTES,used_gb:gb(globalUsed),limit_gb:8.5,remaining_bytes:Math.max(0,GLOBAL_LIMIT_BYTES-globalUsed),percent:Math.min(100,Math.round(globalUsed/GLOBAL_LIMIT_BYTES*1000)/10)},
    company_cycle:{used_bytes:targetUsed,committed_bytes:targetCommitted,reserved_bytes:targetReserved,limit_bytes:TARGET_LIMIT_BYTES,used_mb:mb(targetUsed),limit_mb:500,remaining_bytes:Math.max(0,TARGET_LIMIT_BYTES-targetUsed),percent:Math.min(100,Math.round(targetUsed/TARGET_LIMIT_BYTES*1000)/10)}
  };
}

async function reserve(env,targetId,fileSize){
  const id=crypto.randomUUID();
  const sql=`INSERT INTO evaluation_upload_reservations_v2 (id,target_id,file_size)
    SELECT ?,?,?
    WHERE (
      COALESCE((SELECT SUM(file_size) FROM evaluation_evidence_files_v2 WHERE deleted_at IS NULL),0)
      + COALESCE((SELECT SUM(file_size) FROM evaluation_upload_reservations_v2 WHERE created_at >= datetime('now','-${RESERVATION_TTL_MINUTES} minutes')),0)
      + ?
    ) <= ?
    AND (
      COALESCE((SELECT SUM(file_size) FROM evaluation_evidence_files_v2 WHERE target_id=? AND deleted_at IS NULL),0)
      + COALESCE((SELECT SUM(file_size) FROM evaluation_upload_reservations_v2 WHERE target_id=? AND created_at >= datetime('now','-${RESERVATION_TTL_MINUTES} minutes')),0)
      + ?
    ) <= ?`;
  const result=await env.partner_evaluation_db.prepare(sql).bind(id,targetId,fileSize,fileSize,GLOBAL_LIMIT_BYTES,targetId,targetId,fileSize,TARGET_LIMIT_BYTES).run();
  if(Number(result?.meta?.changes||0)>0)return {ok:true,id};
  const usage=await storageUsage(env,targetId,{exact:true});
  const globalBlocked=usage.global.used_bytes+fileSize>GLOBAL_LIMIT_BYTES;
  return {ok:false,scope:globalBlocked?'global':'company_cycle',usage};
}
async function release(env,id){if(!id)return;await env.partner_evaluation_db.prepare(`DELETE FROM evaluation_upload_reservations_v2 WHERE id=?`).bind(id).run().catch(()=>{});globalUsageCache=null}

export async function handlePartnerSubmissionWithQuota(request,env,ctx,baseWorker){
  const url=new URL(request.url),path=url.pathname;if(!path.startsWith('/api/partner/submission'))return null;
  const upload=/^\/api\/partner\/submission\/[^/]+\/items\/[^/]+\/files$/.test(path)&&request.method==='POST';
  if(!upload)return handlePartnerSubmission(request,env,ctx,baseWorker);
  try{await ensureQuotaSchema(env)}catch(e){console.error('quota schema init failed',e);return json({success:false,error:'증빙자료 저장공간을 준비하는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',code:'STORAGE_INIT_FAILED'},503)}

  // Multipart data is parsed once by the core handler. It invokes these hooks
  // after validating the file, avoiding a second read of uploads up to 25 MB.
  const quota={
    max_file_bytes:MAX_FILE_BYTES,
    reserve:async(targetId,fileSize)=>reserve(env,targetId,fileSize),
    release:async reservationId=>release(env,reservationId),
    usage:async targetId=>storageUsage(env,targetId)
  };
  return handlePartnerSubmission(request,env,ctx,baseWorker,quota);
}
