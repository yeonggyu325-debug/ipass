function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=utf-8','access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS'}})}
function text(v,max=500){return String(v??'').trim().slice(0,max)}
function number(v,def=0){const n=Number(v);return Number.isFinite(n)?n:def}
function round1(v){return Math.round(Number(v||0)*10)/10}
function clamp(v,min=0,max=100){return Math.max(min,Math.min(max,Number(v||0)))}
function halfLabel(v){return v==='first'?'상반기':'하반기'}
function grade(score){if(score==null)return null;const n=Number(score);if(n>=90)return '안전관리 우수협력사';if(n>=70)return '적격 수급사';return '역량강화대상 협력사'}
function isHtmlPath(path){return path==='/'||path==='/index.html'||path==='/evaluation-management.html'}

async function ensureRuntimeSchema(env){
  await env.partner_evaluation_db.batch([
    env.partner_evaluation_db.prepare(`CREATE TABLE IF NOT EXISTS evaluation_cycles_v2 (
      id TEXT PRIMARY KEY,
      year INTEGER NOT NULL,
      half TEXT NOT NULL,
      cycle_name TEXT NOT NULL,
      start_at TEXT,
      end_at TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      template_id TEXT NOT NULL,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      started_at TEXT,
      closed_at TEXT,
      UNIQUE(year,half)
    )`),
    env.partner_evaluation_db.prepare(`CREATE INDEX IF NOT EXISTS idx_eval_cycles_v2_status ON evaluation_cycles_v2(status,year,half)`),
    env.partner_evaluation_db.prepare(`CREATE TABLE IF NOT EXISTS evaluation_targets_v2 (
      id TEXT PRIMARY KEY,
      cycle_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      is_selected INTEGER NOT NULL DEFAULT 0,
      exclusion_reason TEXT,
      exemption_type TEXT,
      previous_ipass_score REAL,
      status TEXT NOT NULL DEFAULT 'not_started',
      business_number TEXT,
      representative_name TEXT,
      worker_count INTEGER,
      submitted_at TEXT,
      finalized_at TEXT,
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(cycle_id,company_id)
    )`),
    env.partner_evaluation_db.prepare(`CREATE INDEX IF NOT EXISTS idx_eval_targets_v2_cycle ON evaluation_targets_v2(cycle_id,is_selected,status)`),
    env.partner_evaluation_db.prepare(`CREATE INDEX IF NOT EXISTS idx_eval_targets_v2_company ON evaluation_targets_v2(company_id,cycle_id)`),
    env.partner_evaluation_db.prepare(`CREATE TABLE IF NOT EXISTS evaluation_target_items_v2 (
      id TEXT PRIMARY KEY,
      target_id TEXT NOT NULL,
      template_item_id TEXT NOT NULL,
      item_code TEXT,
      item_name TEXT NOT NULL,
      item_type TEXT NOT NULL DEFAULT 'score',
      max_score REAL NOT NULL DEFAULT 0,
      category_name TEXT,
      parent_category_name TEXT,
      guide_text TEXT,
      judgment_guide TEXT,
      applicable INTEGER NOT NULL DEFAULT 1,
      na_source TEXT,
      manual_na_reason TEXT,
      description TEXT,
      earned_score REAL,
      max_score_snapshot REAL,
      evaluation_comment TEXT,
      evaluated_at TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(target_id,template_item_id)
    )`),
    env.partner_evaluation_db.prepare(`CREATE INDEX IF NOT EXISTS idx_eval_target_items_v2_target ON evaluation_target_items_v2(target_id,sort_order)`),
    env.partner_evaluation_db.prepare(`CREATE TABLE IF NOT EXISTS evaluation_cycle_logs_v2 (
      id TEXT PRIMARY KEY,
      cycle_id TEXT,
      action TEXT NOT NULL,
      detail_json TEXT,
      changed_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`)
  ]);
}

async function accountFromRequest(request,env,ctx,baseWorker){
  const u=new URL(request.url);u.pathname='/api/me';u.search='';
  const r=await baseWorker.fetch(new Request(u.toString(),{method:'GET',headers:request.headers}),env,ctx);
  const d=await r.clone().json().catch(()=>null);
  if(!r.ok||!d?.success)return {ok:false,response:r};
  if(d.auth_state!=='approved')return {ok:false,response:json({success:false,error:'승인된 계정이 필요합니다.',auth_state:d.auth_state},403)};
  return {ok:true,user:d.user};
}
async function adminFromRequest(request,env,ctx,baseWorker){const a=await accountFromRequest(request,env,ctx,baseWorker);if(!a.ok)return a;if(a.user?.role!=='admin')return {ok:false,response:json({success:false,error:'관리자 권한이 필요합니다.'},403)};return a}
async function cycleLog(env,cycleId,action,detail,userId){await env.partner_evaluation_db.prepare(`INSERT INTO evaluation_cycle_logs_v2 (id,cycle_id,action,detail_json,changed_by) VALUES (?,?,?,?,?)`).bind(crypto.randomUUID(),cycleId,action,JSON.stringify(detail||{}),userId||null).run()}

async function policy(env){
  try{return await env.partner_evaluation_db.prepare(`SELECT * FROM ipass_policy_settings_v2 WHERE id=1`).first()}catch{return {excellence_threshold:90,first_half_exempt_enabled:1,normal_first_half_weight:40,normal_second_half_weight:40,exempt_second_half_weight:80,committee_weight:10,industrial_accident_weight:10}}
}
async function activeCompanies(env){const {results}=await env.partner_evaluation_db.prepare(`SELECT id,company_name,industry_code,industry_name FROM companies WHERE status='active' ORDER BY company_name`).all();return results||[]}
async function templates(env){
  try{const {results}=await env.partner_evaluation_db.prepare(`SELECT t.*,COALESCE((SELECT SUM(i.max_score) FROM evaluation_items_v2 i WHERE i.template_id=t.id AND i.item_type='score'),0) AS score_total,COALESCE((SELECT SUM(i.max_score) FROM evaluation_items_v2 i WHERE i.template_id=t.id AND i.item_type='bonus'),0) AS bonus_total FROM evaluation_templates_v2 t WHERE t.status IN ('active','locked') ORDER BY t.year DESC,CASE WHEN t.half='second' THEN 2 ELSE 1 END DESC,t.version DESC`).all();return results||[]}catch{return []}
}
async function cycles(env){const {results}=await env.partner_evaluation_db.prepare(`SELECT c.*,t.name AS template_name,t.version AS template_version FROM evaluation_cycles_v2 c LEFT JOIN evaluation_templates_v2 t ON t.id=c.template_id ORDER BY c.year DESC,CASE WHEN c.half='second' THEN 2 ELSE 1 END DESC`).all();return results||[]}
async function cycleById(env,id){return env.partner_evaluation_db.prepare(`SELECT c.*,t.name AS template_name,t.status AS template_status,t.version AS template_version FROM evaluation_cycles_v2 c LEFT JOIN evaluation_templates_v2 t ON t.id=c.template_id WHERE c.id=? LIMIT 1`).bind(id).first()}
async function cycleByTemplate(env,templateId){return env.partner_evaluation_db.prepare(`SELECT c.*,t.name AS template_name,t.status AS template_status,t.version AS template_version FROM evaluation_cycles_v2 c LEFT JOIN evaluation_templates_v2 t ON t.id=c.template_id WHERE c.template_id=? LIMIT 1`).bind(templateId).first()}
async function templateById(env,id){return env.partner_evaluation_db.prepare(`SELECT * FROM evaluation_templates_v2 WHERE id=? LIMIT 1`).bind(id).first()}

async function baseAnnual(request,env,ctx,baseWorker,companyId,year){
  const u=new URL(request.url);u.pathname=`/api/admin/annual-ipass/${encodeURIComponent(companyId)}/${year}`;u.search='';
  const r=await baseWorker.fetch(new Request(u.toString(),{method:'GET',headers:request.headers}),env,ctx);const d=await r.json().catch(()=>null);return r.ok&&d?.success?d.annual:null;
}
async function exemptionCandidates(request,env,ctx,baseWorker,year){
  const p=await policy(env);if(Number(p?.first_half_exempt_enabled||0)===0)return new Map();const threshold=number(p?.excellence_threshold,90);const companies=await activeCompanies(env);const out=new Map();let idx=0;
  const worker=async()=>{while(idx<companies.length){const c=companies[idx++];const a=await adjustedAnnualForCompany(request,env,ctx,baseWorker,c.id,year-1,false);const score=number(a?.final_total,NaN);if(Number.isFinite(score)&&score>=threshold)out.set(c.id,{score,reason:`${year-1}년 i-PaSS ${score}점 · ${year}년 상반기 평가 면제`})}};
  await Promise.all(Array.from({length:Math.min(5,companies.length)},()=>worker()));return out;
}

async function ensureTargetRows(request,env,ctx,baseWorker,cycle,userId){
  const companies=await activeCompanies(env);const exemptions=cycle.half==='first'?await exemptionCandidates(request,env,ctx,baseWorker,Number(cycle.year)):new Map();const existingRes=await env.partner_evaluation_db.prepare(`SELECT * FROM evaluation_targets_v2 WHERE cycle_id=?`).bind(cycle.id).all();const existing=new Map((existingRes.results||[]).map(x=>[x.company_id,x]));const stmts=[];
  for(const c of companies){const old=existing.get(c.id);const ex=exemptions.get(c.id);if(old){if(ex&&old.exemption_type!=='ipass_excellent')stmts.push(env.partner_evaluation_db.prepare(`UPDATE evaluation_targets_v2 SET is_selected=0,exclusion_reason=?,exemption_type='ipass_excellent',previous_ipass_score=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(ex.reason,ex.score,old.id));continue}stmts.push(env.partner_evaluation_db.prepare(`INSERT INTO evaluation_targets_v2 (id,cycle_id,company_id,is_selected,exclusion_reason,exemption_type,previous_ipass_score,status) VALUES (?,?,?,?,?,?,?,'not_started')`).bind(crypto.randomUUID(),cycle.id,c.id,0,ex?.reason||null,ex?'ipass_excellent':null,ex?.score??null))}
  for(let i=0;i<stmts.length;i+=90)await env.partner_evaluation_db.batch(stmts.slice(i,i+90));if(stmts.length)await cycleLog(env,cycle.id,'targets_initialized',{company_count:companies.length,exemption_count:exemptions.size},userId)
}

async function cycleCompanies(request,env,ctx,baseWorker,cycle,userId){
  await ensureTargetRows(request,env,ctx,baseWorker,cycle,userId);const {results}=await env.partner_evaluation_db.prepare(`SELECT et.*,c.company_name,c.industry_code,c.industry_name FROM evaluation_targets_v2 et JOIN companies c ON c.id=et.company_id WHERE et.cycle_id=? ORDER BY c.company_name`).bind(cycle.id).all();return results||[]
}

async function materializeItems(env,cycle){
  const [catRes,itemRes,ruleRes,targetRes,companyRes]=await env.partner_evaluation_db.batch([
    env.partner_evaluation_db.prepare(`SELECT * FROM evaluation_categories_v2 WHERE template_id=? ORDER BY sort_order`).bind(cycle.template_id),
    env.partner_evaluation_db.prepare(`SELECT * FROM evaluation_items_v2 WHERE template_id=? ORDER BY sort_order`).bind(cycle.template_id),
    env.partner_evaluation_db.prepare(`SELECT r.* FROM evaluation_na_rules_v2 r JOIN evaluation_items_v2 i ON i.id=r.item_id WHERE i.template_id=? ORDER BY r.sort_order`).bind(cycle.template_id),
    env.partner_evaluation_db.prepare(`SELECT * FROM evaluation_targets_v2 WHERE cycle_id=? AND is_selected=1`).bind(cycle.id),
    env.partner_evaluation_db.prepare(`SELECT id,industry_name FROM companies WHERE status='active'`)
  ]);
  const cats=new Map((catRes.results||[]).map(x=>[x.id,x]));const rules=new Map();for(const r of ruleRes.results||[]){if(!rules.has(r.item_id))rules.set(r.item_id,[]);rules.get(r.item_id).push(r)}const industries=new Map((companyRes.results||[]).map(x=>[x.id,x.industry_name||'']));const stmts=[];
  const applicability=(item,target)=>{const rs=rules.get(item.id)||[];if(!rs.length||target.worker_count==null)return {applicable:1,source:null};const wc=Number(target.worker_count);const industry=industries.get(target.company_id)||'';const industryRules=rs.filter(r=>r.rule_type==='industry_worker');if(industryRules.length){const match=industryRules.find(r=>industry&&String(industry).includes(String(r.industry_name||'')));if(!match)return {applicable:0,source:'auto_industry_worker'};return wc>=Number(match.min_worker_count||0)?{applicable:1,source:null}:{applicable:0,source:'auto_industry_worker'}}const workerRule=rs.find(r=>r.rule_type==='worker_count');if(workerRule&&wc<Number(workerRule.min_worker_count||0))return {applicable:0,source:'auto_worker_count'};return {applicable:1,source:null}};
  for(const target of targetRes.results||[]){for(const item of itemRes.results||[]){const cat=cats.get(item.category_id)||{};const parent=cat.parent_id?cats.get(cat.parent_id):null;const app=applicability(item,target);stmts.push(env.partner_evaluation_db.prepare(`INSERT OR IGNORE INTO evaluation_target_items_v2 (id,target_id,template_item_id,item_code,item_name,item_type,max_score,category_name,parent_category_name,guide_text,judgment_guide,applicable,na_source,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),target.id,item.id,item.item_code||null,item.item_name,item.item_type,item.max_score,cat.category_name||null,parent?.category_name||null,item.submission_guide||null,item.judgment_guide||null,app.applicable,app.source,item.sort_order||0))}}
  for(let i=0;i<stmts.length;i+=90)await env.partner_evaluation_db.batch(stmts.slice(i,i+90));
}

async function createCycle(request,env,ctx,baseWorker,templateId,user){
  const t=await templateById(env,templateId);if(!t)return {error:'평가표를 찾을 수 없습니다.',status:404};if(t.status!=='active')return {error:'사용중 평가표만 평가회차에 연결할 수 있습니다.',status:409};
  const sum=await env.partner_evaluation_db.prepare(`SELECT COALESCE(SUM(CASE WHEN item_type='score' THEN max_score ELSE 0 END),0) AS total FROM evaluation_items_v2 WHERE template_id=?`).bind(t.id).first();if(Math.round(number(sum?.total,0)*100)/100!==100)return {error:'평가항목 배점 합계가 100점이 아닙니다.',status:409};
  const existing=await env.partner_evaluation_db.prepare(`SELECT * FROM evaluation_cycles_v2 WHERE year=? AND half=? LIMIT 1`).bind(t.year,t.half).first();if(existing){if(existing.template_id===t.id)return {cycle:existing};return {error:`${t.year}년 ${halfLabel(t.half)} 평가회차가 다른 평가표와 이미 연결되어 있습니다.`,status:409}}
  const id=crypto.randomUUID();await env.partner_evaluation_db.prepare(`INSERT INTO evaluation_cycles_v2 (id,year,half,cycle_name,status,template_id,created_by) VALUES (?,?,?,?, 'draft',?,?)`).bind(id,t.year,t.half,`${t.year}년 ${halfLabel(t.half)} 이행수준평가`,t.id,user.id).run();const cycle=await cycleById(env,id);await ensureTargetRows(request,env,ctx,baseWorker,cycle,user.id);await cycleLog(env,id,'cycle_created',{template_id:t.id,year:t.year,half:t.half},user.id);return {cycle};
}

async function updateCycle(request,env,ctx,baseWorker,cycleId,body,user){
  const cycle=await cycleById(env,cycleId);if(!cycle)return {error:'평가회차를 찾을 수 없습니다.',status:404};if(cycle.status!=='draft')return {error:'평가 시작 후에는 기간과 대상 협력사를 변경할 수 없습니다.',status:409};
  const start=text(body.start_at,20)||null,end=text(body.end_at,20)||null;if(start&&end&&start>end)return {error:'평가 시작일이 종료일보다 늦을 수 없습니다.',status:400};const name=text(body.cycle_name,200)||cycle.cycle_name;
  const rows=await cycleCompanies(request,env,ctx,baseWorker,cycle,user.id);const by=new Map((Array.isArray(body.targets)?body.targets:[]).map(x=>[String(x.company_id),x]));const stmts=[env.partner_evaluation_db.prepare(`UPDATE evaluation_cycles_v2 SET cycle_name=?,start_at=?,end_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(name,start,end,cycle.id)];
  for(const r of rows){const next=by.get(r.company_id);if(r.exemption_type==='ipass_excellent'){stmts.push(env.partner_evaluation_db.prepare(`UPDATE evaluation_targets_v2 SET is_selected=0,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(r.id));continue}const selected=next?.is_selected===true||next?.is_selected===1?1:0;const reason=selected?null:(text(next?.exclusion_reason,500)||'관리자 평가대상 제외');const wc=next?.worker_count==null||next?.worker_count===''?r.worker_count:Math.max(0,Math.round(number(next.worker_count,0)));stmts.push(env.partner_evaluation_db.prepare(`UPDATE evaluation_targets_v2 SET is_selected=?,exclusion_reason=?,worker_count=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(selected,reason,wc??null,r.id))}
  for(let i=0;i<stmts.length;i+=90)await env.partner_evaluation_db.batch(stmts.slice(i,i+90));await cycleLog(env,cycle.id,'cycle_saved',{start_at:start,end_at:end,selected_count:(Array.isArray(body.targets)?body.targets:[]).filter(x=>x.is_selected===true||x.is_selected===1).length},user.id);return {cycle:await cycleById(env,cycle.id)};
}

async function startCycle(env,cycleId,user){const cycle=await cycleById(env,cycleId);if(!cycle)return {error:'평가회차를 찾을 수 없습니다.',status:404};if(cycle.status!=='draft')return {error:'이미 시작된 평가회차입니다.',status:409};if(!cycle.start_at||!cycle.end_at)return {error:'평가기간을 먼저 입력하세요.',status:400};const count=await env.partner_evaluation_db.prepare(`SELECT COUNT(*) AS cnt FROM evaluation_targets_v2 WHERE cycle_id=? AND is_selected=1`).bind(cycle.id).first();if(Number(count?.cnt||0)<1)return {error:'평가대상 협력사를 1개 이상 선택하세요.',status:400};await materializeItems(env,cycle);await env.partner_evaluation_db.batch([env.partner_evaluation_db.prepare(`UPDATE evaluation_cycles_v2 SET status='active',started_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(cycle.id),env.partner_evaluation_db.prepare(`UPDATE evaluation_targets_v2 SET status='in_progress',updated_at=CURRENT_TIMESTAMP WHERE cycle_id=? AND is_selected=1 AND status='not_started'`).bind(cycle.id)]);await cycleLog(env,cycle.id,'cycle_started',{selected_count:Number(count?.cnt||0)},user.id);return {cycle:await cycleById(env,cycle.id)}}
async function closeCycle(env,cycleId,user){const cycle=await cycleById(env,cycleId);if(!cycle)return {error:'평가회차를 찾을 수 없습니다.',status:404};if(cycle.status!=='active')return {error:'진행중 평가회차만 종료할 수 있습니다.',status:409};await env.partner_evaluation_db.batch([env.partner_evaluation_db.prepare(`UPDATE evaluation_cycles_v2 SET status='closed',closed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(cycle.id),env.partner_evaluation_db.prepare(`UPDATE evaluation_templates_v2 SET status='locked',locked_at=COALESCE(locked_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(cycle.template_id)]);await cycleLog(env,cycle.id,'cycle_closed',{},user.id);return {cycle:await cycleById(env,cycle.id)}}

async function runtimeBundle(request,env,ctx,baseWorker,templateId,cycleId,user){const ts=await templates(env),cs=await cycles(env);let cycle=cycleId?await cycleById(env,cycleId):templateId?await cycleByTemplate(env,templateId):cs[0]||null;let companies=[];if(cycle)companies=await cycleCompanies(request,env,ctx,baseWorker,cycle,user.id);return {success:true,templates:ts,cycles:cs,cycle,companies,policy:await policy(env)}}

async function runtimeDashboard(env){const cs=await cycles(env);if(!cs.length)return null;const cycle=cs[0];const {results}=await env.partner_evaluation_db.prepare(`SELECT et.id,et.cycle_id,et.company_id,c.company_name,c.industry_name,et.is_selected,et.exclusion_reason,et.exemption_type,et.previous_ipass_score,et.status,et.submitted_at,et.finalized_at,et.published_at,et.worker_count FROM evaluation_targets_v2 et JOIN companies c ON c.id=et.company_id WHERE et.cycle_id=? ORDER BY c.company_name`).bind(cycle.id).all();const selected=(results||[]).filter(x=>Number(x.is_selected)===1);return {cycles:cs,dashboard:{cycle_id:cycle.id,cycle_name:cycle.cycle_name,target_company_count:selected.length,submitted_count:selected.filter(x=>x.submitted_at).length,evaluating_count:selected.filter(x=>['in_progress','submitted','evaluating'].includes(x.status)).length,completed_count:selected.filter(x=>['completed','published'].includes(x.status)||x.finalized_at).length,unread_notification_count:0},targets:results||[]}}

async function myEvaluations(env,companyId){const {results}=await env.partner_evaluation_db.prepare(`SELECT et.id,et.cycle_id,et.company_id,et.status,et.submitted_at,et.finalized_at,et.published_at,ec.cycle_name,ec.year,ec.half,ec.start_at,ec.end_at,c.company_name,c.industry_name,et.worker_count FROM evaluation_targets_v2 et JOIN evaluation_cycles_v2 ec ON ec.id=et.cycle_id JOIN companies c ON c.id=et.company_id WHERE et.company_id=? AND et.is_selected=1 AND ec.status IN ('active','closed') ORDER BY ec.year DESC,CASE WHEN ec.half='second' THEN 2 ELSE 1 END DESC`).bind(companyId).all();return results||[]}
async function evaluationDetail(env,targetId){const target=await env.partner_evaluation_db.prepare(`SELECT et.id AS target_id,et.status,et.submitted_at,et.finalized_at,et.published_at,et.company_id,c.company_name,c.industry_code,c.industry_name,et.business_number,et.representative_name,et.worker_count,ec.id AS cycle_id,ec.cycle_name,ec.year,ec.half,ec.start_at,ec.end_at FROM evaluation_targets_v2 et JOIN companies c ON c.id=et.company_id JOIN evaluation_cycles_v2 ec ON ec.id=et.cycle_id WHERE et.id=? AND et.is_selected=1 LIMIT 1`).bind(targetId).first();if(!target)return null;const {results}=await env.partner_evaluation_db.prepare(`SELECT id AS target_item_state_id,template_item_id AS item_id,item_code,item_name,guide_text,item_type,max_score,category_name,parent_category_name,applicable,na_source,manual_na_reason,description,earned_score,max_score_snapshot,evaluation_comment,evaluated_at FROM evaluation_target_items_v2 WHERE target_id=? ORDER BY sort_order,item_code,item_name`).bind(targetId).all();return {target,items:results||[]}}

async function v2RawScore(env,companyId,year,half){const row=await env.partner_evaluation_db.prepare(`SELECT et.id,et.published_at FROM evaluation_targets_v2 et JOIN evaluation_cycles_v2 ec ON ec.id=et.cycle_id WHERE et.company_id=? AND ec.year=? AND ec.half=? AND et.is_selected=1 ORDER BY ec.created_at DESC LIMIT 1`).bind(companyId,year,half).first();if(!row||!row.published_at)return null;const {results}=await env.partner_evaluation_db.prepare(`SELECT item_type,max_score,earned_score,applicable FROM evaluation_target_items_v2 WHERE target_id=?`).bind(row.id).all();let earned=0,max=0,bonus=0,hasScore=false;for(const i of results||[]){if(Number(i.applicable)===0)continue;if(i.item_type==='bonus'){if(i.earned_score!=null)bonus+=Math.max(0,Number(i.earned_score));continue}max+=Math.max(0,Number(i.max_score||0));if(i.earned_score!=null){earned+=Math.max(0,Number(i.earned_score));hasScore=true}}if(!hasScore||max<=0)return null;return round1(Math.min(100,(earned/max)*100+bonus))}
async function exemptionRecord(env,companyId,year){return env.partner_evaluation_db.prepare(`SELECT et.previous_ipass_score,et.exclusion_reason FROM evaluation_targets_v2 et JOIN evaluation_cycles_v2 ec ON ec.id=et.cycle_id WHERE et.company_id=? AND ec.year=? AND ec.half='first' AND et.exemption_type='ipass_excellent' LIMIT 1`).bind(companyId,year).first()}
async function adjustedAnnualForCompany(request,env,ctx,baseWorker,companyId,year,usePartnerPath=true){
  let base;
  if(usePartnerPath){const u=new URL(request.url);u.pathname='/api/annual-ipass';u.search=`?year=${year}&company_id=${encodeURIComponent(companyId)}`;const r=await baseWorker.fetch(new Request(u.toString(),{method:'GET',headers:request.headers}),env,ctx);const d=await r.json().catch(()=>null);base=r.ok&&d?.success?d.annual:null}else base=await baseAnnual(request,env,ctx,baseWorker,companyId,year);
  if(!base)return null;const p=await policy(env);const ex=await exemptionRecord(env,companyId,year);const firstRaw=await v2RawScore(env,companyId,year,'first');const secondRaw=await v2RawScore(env,companyId,year,'second');const manualFirst=base.first_half_source==='manual';const manualSecond=base.second_half_source==='manual';
  if(ex){const secondBase=manualSecond?base.second_half_score:(secondRaw==null?base.second_half_score:round1(secondRaw*0.4));const second=secondBase==null?null:round1(Number(secondBase)*2);const autoSecond=secondRaw==null?(base.auto_second_half_score==null?null:round1(Number(base.auto_second_half_score)*2)):round1(secondRaw*number(p.exempt_second_half_weight,80)/100);const committee=number(base.committee_score,0),accident=number(base.industrial_accident_score,0),deduction=number(base.unreasonable_deduction,0);const final=second==null?null:round1(clamp(second+committee+accident-deduction));return {...base,first_half_score:null,first_half_source:'exempt',auto_first_half_score:null,second_half_score:second,second_half_source:second==null?null:(manualSecond?'manual':'auto'),auto_second_half_score:autoSecond,first_half_exempt:true,first_half_exempt_reason:ex.exclusion_reason||'전년도 우수협력사',previous_ipass_score:ex.previous_ipass_score,first_half_weight:0,second_half_weight:number(p.exempt_second_half_weight,80),final_total:final,final_grade:grade(final),current_reflected_score:round1(Math.max(0,(second||0)+committee+accident-deduction)),current_reflected_max:second==null?20:100,maintain_projection:null,maintain_grade:null,perfect_projection:round1(clamp(number(p.exempt_second_half_weight,80)+committee+accident-deduction)),perfect_grade:grade(round1(clamp(number(p.exempt_second_half_weight,80)+committee+accident-deduction))),second_half_pending:second==null}}
  let first=manualFirst?base.first_half_score:(firstRaw==null?base.first_half_score:round1(firstRaw*number(p.normal_first_half_weight,40)/100));let second=manualSecond?base.second_half_score:(secondRaw==null?base.second_half_score:round1(secondRaw*number(p.normal_second_half_weight,40)/100));const committee=number(base.committee_score,0),accident=number(base.industrial_accident_score,0),deduction=number(base.unreasonable_deduction,0);const final=second==null?null:round1(clamp(number(first,0)+number(second,0)+committee+accident-deduction));return {...base,first_half_score:first,first_half_source:first==null?null:(manualFirst?'manual':'auto'),second_half_score:second,second_half_source:second==null?null:(manualSecond?'manual':'auto'),auto_first_half_score:firstRaw==null?base.auto_first_half_score:round1(firstRaw*0.4),auto_second_half_score:secondRaw==null?base.auto_second_half_score:round1(secondRaw*0.4),first_half_exempt:false,first_half_weight:40,second_half_weight:40,final_total:final,final_grade:grade(final),current_reflected_score:round1(Math.max(0,number(first,0)+number(second,0)+committee+accident-deduction)),current_reflected_max:second==null?60:100,second_half_pending:second==null}
}

async function injectAsset(request,env,path){const asset=await env.ASSETS.fetch(request);if(!asset.ok)return asset;let html=await asset.text();if(path==='/evaluation-management.html'){html=html.replace('</body>',`<script>(function(){const box=document.querySelector('.side-actions');if(box&&!document.getElementById('cycleOpsLink')){const b=document.createElement('button');b.id='cycleOpsLink';b.type='button';b.textContent='평가회차 운영';b.onclick=()=>location.href='/evaluation-cycle.html';box.appendChild(b)}})();</script></body>`)}else{html=html.replace('</body>',`<script>(function(){if(typeof window.loadAnnualIpassOverview!=='function')return;const original=window.loadAnnualIpassOverview;window.loadAnnualIpassOverview=async function(){await original.apply(this,arguments);try{if(window.currentUser?.role==='admin')return;const year=new Date().getFullYear();const d=await window.annualApi(year);const a=d?.annual||{};if(!a.first_half_exempt)return;const box=document.getElementById('portalIpassOverview');if(!box)return;const formula=box.querySelector('.ipass-formula-text');if(formula)formula.innerHTML='<b>상반기 평가 면제</b> + <b>하반기 '+(a.second_half_weight||80)+'점</b> + 협의체 참석 10점 + 산업재해 10점 − 불합리 적발 건수 × 3점';const metrics=box.querySelectorAll('.ipass-metric');if(metrics[0]){metrics[0].querySelector('.ipass-metric-value').innerHTML='면제';metrics[0].querySelector('.ipass-metric-score').textContent=(a.previous_ipass_score!=null?'전년도 i-PaSS '+a.previous_ipass_score+'점 · ':'')+'익년도 상반기 평가 면제'}if(metrics[1]&&a.second_half_score!=null){metrics[1].querySelector('.ipass-metric-value').innerHTML=(window.formatScore?window.formatScore(a.second_half_score):a.second_half_score)+'<span class="unit"> / '+(a.second_half_weight||80)+'점</span>'}}catch(e){console.warn('exempt ipass ui',e)}}})();</script></body>`)}return new Response(html,{status:asset.status,headers:{...Object.fromEntries(asset.headers),'content-type':'text/html;charset=utf-8'}})}

export async function handleEvaluationRuntime(request,env,ctx,baseWorker){
  const url=new URL(request.url),path=url.pathname;
  if(isHtmlPath(path))return injectAsset(request,env,path);
  const watched=path.startsWith('/api/admin/evaluation-runtime')||path==='/api/admin/dashboard-bundle'||path==='/api/cycles'||path==='/api/dashboard'||path==='/api/targets'||path==='/api/my/evaluations'||/^\/api\/evaluations\/[^/]+$/.test(path)||path==='/api/annual-ipass'||/^\/api\/admin\/annual-ipass\/[^/]+\/\d{4}$/.test(path);
  if(!watched)return null;if(request.method==='OPTIONS')return json({success:true});await ensureRuntimeSchema(env);

  if(path.startsWith('/api/admin/evaluation-runtime')){
    const auth=await adminFromRequest(request,env,ctx,baseWorker);if(!auth.ok)return auth.response;const user=auth.user;
    if(request.method==='GET'&&path==='/api/admin/evaluation-runtime'){return json(await runtimeBundle(request,env,ctx,baseWorker,text(url.searchParams.get('template_id'),100),text(url.searchParams.get('cycle_id'),100),user))}
    if(request.method==='POST'&&path==='/api/admin/evaluation-runtime/cycles'){const b=await request.json();const r=await createCycle(request,env,ctx,baseWorker,text(b.template_id,100),user);if(r.error)return json({success:false,error:r.error},r.status);return json({success:true,cycle:r.cycle},201)}
    const cycleMatch=path.match(/^\/api\/admin\/evaluation-runtime\/cycles\/([^/]+)$/);if(cycleMatch&&request.method==='PATCH'){const r=await updateCycle(request,env,ctx,baseWorker,decodeURIComponent(cycleMatch[1]),await request.json(),user);if(r.error)return json({success:false,error:r.error},r.status);return json({success:true,cycle:r.cycle})}
    const startMatch=path.match(/^\/api\/admin\/evaluation-runtime\/cycles\/([^/]+)\/start$/);if(startMatch&&request.method==='POST'){const r=await startCycle(env,decodeURIComponent(startMatch[1]),user);if(r.error)return json({success:false,error:r.error},r.status);return json({success:true,cycle:r.cycle})}
    const closeMatch=path.match(/^\/api\/admin\/evaluation-runtime\/cycles\/([^/]+)\/close$/);if(closeMatch&&request.method==='POST'){const r=await closeCycle(env,decodeURIComponent(closeMatch[1]),user);if(r.error)return json({success:false,error:r.error},r.status);return json({success:true,cycle:r.cycle})}
    return json({success:false,error:'지원하지 않는 평가회차 요청입니다.'},404);
  }

  if(path==='/api/admin/dashboard-bundle'&&request.method==='GET'){const auth=await adminFromRequest(request,env,ctx,baseWorker);if(!auth.ok)return auth.response;const d=await runtimeDashboard(env);if(!d)return null;return json({success:true,...d})}
  if(path==='/api/cycles'&&request.method==='GET'){const auth=await accountFromRequest(request,env,ctx,baseWorker);if(!auth.ok)return auth.response;const cs=await cycles(env);if(!cs.length)return null;return json({success:true,cycles:cs})}
  if(path==='/api/dashboard'&&request.method==='GET'){const auth=await adminFromRequest(request,env,ctx,baseWorker);if(!auth.ok)return auth.response;const d=await runtimeDashboard(env);if(!d)return null;return json({success:true,dashboard:d.dashboard})}
  if(path==='/api/targets'&&request.method==='GET'){const auth=await adminFromRequest(request,env,ctx,baseWorker);if(!auth.ok)return auth.response;const cs=await cycles(env);if(!cs.length)return null;const cycleId=text(url.searchParams.get('cycle_id'),100)||cs[0].id;const {results}=await env.partner_evaluation_db.prepare(`SELECT et.id,et.cycle_id,et.company_id,c.company_name,c.industry_name,et.is_selected,et.exclusion_reason,et.exemption_type,et.previous_ipass_score,et.status,et.submitted_at,et.finalized_at,et.published_at,et.worker_count FROM evaluation_targets_v2 et JOIN companies c ON c.id=et.company_id WHERE et.cycle_id=? ORDER BY c.company_name`).bind(cycleId).all();return json({success:true,targets:results||[]})}
  if(path==='/api/my/evaluations'&&request.method==='GET'){const auth=await accountFromRequest(request,env,ctx,baseWorker);if(!auth.ok)return auth.response;if(auth.user.role!=='partner')return json({success:false,error:'협력사 계정이 필요합니다.'},403);const list=await myEvaluations(env,auth.user.company_id);if(!list.length)return null;return json({success:true,evaluations:list})}
  const evaluationMatch=path.match(/^\/api\/evaluations\/([^/]+)$/);if(evaluationMatch&&request.method==='GET'){const auth=await accountFromRequest(request,env,ctx,baseWorker);if(!auth.ok)return auth.response;const e=await evaluationDetail(env,decodeURIComponent(evaluationMatch[1]));if(!e)return null;if(auth.user.role!=='admin'&&e.target.company_id!==auth.user.company_id)return json({success:false,error:'접근 권한이 없습니다.'},403);if(auth.user.role==='partner'&&!e.target.published_at)for(const i of e.items){i.earned_score=null;i.max_score_snapshot=null;i.evaluation_comment=null;i.evaluated_at=null}return json({success:true,evaluation:e})}

  const adminAnnual=path.match(/^\/api\/admin\/annual-ipass\/([^/]+)\/(\d{4})$/);
  if(adminAnnual){const auth=await adminFromRequest(request,env,ctx,baseWorker);if(!auth.ok)return auth.response;const companyId=decodeURIComponent(adminAnnual[1]),year=Number(adminAnnual[2]);if(request.method==='GET'){const a=await adjustedAnnualForCompany(request,env,ctx,baseWorker,companyId,year,false);return a?json({success:true,annual:a}):null}if(request.method==='PATCH'){const ex=await exemptionRecord(env,companyId,year);let body=await request.json();if(ex){body={...body};delete body.first_half_mode;delete body.first_half_score;if(body.second_half_mode==='manual'){const effective=Number(body.second_half_score);if(!Number.isFinite(effective)||effective<0||effective>80)return json({success:false,error:'면제 연도 하반기 점수는 0~80점으로 입력하세요.'},400);body.second_half_score=round1(effective/2)}}const r=await baseWorker.fetch(new Request(request.url,{method:'PATCH',headers:request.headers,body:JSON.stringify(body)}),env,ctx);if(!r.ok)return r;const a=await adjustedAnnualForCompany(request,env,ctx,baseWorker,companyId,year,false);return json({success:true,annual:a})}}
  if(path==='/api/annual-ipass'&&request.method==='GET'){const auth=await accountFromRequest(request,env,ctx,baseWorker);if(!auth.ok)return auth.response;const year=Math.max(2020,Math.min(2100,Number(url.searchParams.get('year')||new Date().getFullYear())));const companyId=auth.user.role==='admin'?text(url.searchParams.get('company_id'),100):auth.user.company_id;if(!companyId)return json({success:false,error:'회사 정보가 필요합니다.'},400);const a=await adjustedAnnualForCompany(request,env,ctx,baseWorker,companyId,year,auth.user.role!=='admin');return a?json({success:true,annual:a}):null}
  return null;
}
