function normalize(value){return String(value||'').trim().toLowerCase().replace(/[^0-9a-z가-힣]/g,'')}
function normalizeCode(value){return String(value||'').trim().toUpperCase().replace(/[^0-9A-Z]/g,'')}

function matchIndustry(rule,target){
  const targetCode=normalizeCode(target.industry_code),ruleCode=normalizeCode(rule.industry_code);
  if(ruleCode&&targetCode)return targetCode===ruleCode||targetCode.startsWith(ruleCode)||ruleCode.startsWith(targetCode);
  const targetName=normalize(target.industry_name),ruleName=normalize(rule.industry_name);
  return Boolean(targetName&&ruleName&&targetName===ruleName);
}

export function evaluateApplicability(target,rules=[],manualReason=''){
  if(String(manualReason||'').trim())return{status:'not_applicable',applicable:0,source:'manual',reason:String(manualReason).trim()};
  if(!rules.length)return{status:'applicable',applicable:1,source:null,reason:null};

  const workerCount=target.worker_count===null||target.worker_count===undefined||target.worker_count===''?null:Number(target.worker_count);
  if(workerCount===null||!Number.isFinite(workerCount))return{status:'undetermined',applicable:1,source:'missing_worker_count',reason:'상시근로자 수 확인이 필요합니다.'};

  const industryRules=rules.filter(rule=>rule.rule_type==='industry_worker');
  if(industryRules.length){
    const hasIndustry=Boolean(normalizeCode(target.industry_code)||normalize(target.industry_name));
    if(!hasIndustry)return{status:'undetermined',applicable:1,source:'missing_industry',reason:'업종 정보 확인이 필요합니다.'};
    const matched=industryRules.filter(rule=>matchIndustry(rule,target));
    if(!matched.length)return{status:'not_applicable',applicable:0,source:'auto_industry_worker',reason:'해당 업종의 적용대상이 아닙니다.'};
    const threshold=Math.min(...matched.map(rule=>Math.max(0,Number(rule.min_worker_count||0))));
    if(workerCount<threshold)return{status:'not_applicable',applicable:0,source:'auto_industry_worker',reason:`상시근로자 ${threshold}인 미만으로 비대상입니다.`};
    return{status:'applicable',applicable:1,source:null,reason:`업종·인원 기준을 충족합니다. (${threshold}인 이상)`};
  }

  const workerRules=rules.filter(rule=>rule.rule_type==='worker_count');
  if(workerRules.length){
    const threshold=Math.max(...workerRules.map(rule=>Math.max(0,Number(rule.min_worker_count||0))));
    if(workerCount<threshold)return{status:'not_applicable',applicable:0,source:'auto_worker_count',reason:`상시근로자 ${threshold}인 미만으로 비대상입니다.`};
    return{status:'applicable',applicable:1,source:null,reason:`상시근로자 ${threshold}인 이상으로 적용대상입니다.`};
  }

  return{status:'applicable',applicable:1,source:null,reason:null};
}

export async function reconcileTargetApplicability(env,targetId){
  const [targetResult,itemResult,ruleResult]=await env.partner_evaluation_db.batch([
    env.partner_evaluation_db.prepare(`
      SELECT et.id,et.worker_count,c.industry_code,c.industry_name,ec.template_id
      FROM evaluation_targets_v2 et
      JOIN companies c ON c.id=et.company_id
      JOIN evaluation_cycles_v2 ec ON ec.id=et.cycle_id
      WHERE et.id=? LIMIT 1
    `).bind(targetId),
    env.partner_evaluation_db.prepare(`
      SELECT id,template_item_id,manual_na_reason,applicable,na_source,applicability_status,applicability_reason
      FROM evaluation_target_items_v2 WHERE target_id=?
    `).bind(targetId),
    env.partner_evaluation_db.prepare(`
      SELECT r.item_id,r.rule_type,r.industry_code,r.industry_name,r.min_worker_count,r.sort_order
      FROM evaluation_na_rules_v2 r
      JOIN evaluation_items_v2 i ON i.id=r.item_id
      JOIN evaluation_cycles_v2 ec ON ec.template_id=i.template_id
      JOIN evaluation_targets_v2 et ON et.cycle_id=ec.id
      WHERE et.id=?
      ORDER BY r.item_id,r.sort_order
    `).bind(targetId)
  ]);
  const target=targetResult.results?.[0];if(!target)return{changed:0,summary:{applicable:0,not_applicable:0,undetermined:0}};
  const byItem=new Map();for(const rule of ruleResult.results||[]){if(!byItem.has(rule.item_id))byItem.set(rule.item_id,[]);byItem.get(rule.item_id).push(rule)}
  const statements=[],summary={applicable:0,not_applicable:0,undetermined:0};
  for(const item of itemResult.results||[]){
    const next=evaluateApplicability(target,byItem.get(item.template_item_id)||[],item.manual_na_reason);
    summary[next.status]=(summary[next.status]||0)+1;
    const unchanged=Number(item.applicable)===next.applicable&&String(item.na_source||'')===String(next.source||'')&&String(item.applicability_status||'')===next.status&&String(item.applicability_reason||'')===String(next.reason||'');
    if(unchanged)continue;
    statements.push(env.partner_evaluation_db.prepare(`
      UPDATE evaluation_target_items_v2
      SET applicable=?,na_source=?,applicability_status=?,applicability_reason=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND target_id=?
    `).bind(next.applicable,next.source,next.status,next.reason,item.id,targetId));
  }
  for(let offset=0;offset<statements.length;offset+=90)await env.partner_evaluation_db.batch(statements.slice(offset,offset+90));
  return{changed:statements.length,summary};
}

export async function reconcileCycleApplicability(env,cycleId){
  const {results}=await env.partner_evaluation_db.prepare(`SELECT id FROM evaluation_targets_v2 WHERE cycle_id=? AND is_selected=1`).bind(cycleId).all();
  let changed=0;const summary={applicable:0,not_applicable:0,undetermined:0};
  for(const row of results||[]){
    const result=await reconcileTargetApplicability(env,row.id);changed+=result.changed;
    for(const key of Object.keys(summary))summary[key]+=Number(result.summary[key]||0);
  }
  return{targets:(results||[]).length,changed,summary};
}
