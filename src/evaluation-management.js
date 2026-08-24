const DEFAULT_POLICY={excellence_threshold:90,first_half_exempt_enabled:1,normal_first_half_weight:40,normal_second_half_weight:40,exempt_second_half_weight:80,committee_weight:10,industrial_accident_weight:10};
const DEFAULT_TEMPLATE_SETTINGS={concept_text:'',excellent_min:90,qualified_min:70,first_half_exempt_enabled:1,exemption_threshold:90,normal_first_half_weight:40,normal_second_half_weight:40,exempt_second_half_weight:80,committee_weight:10,industrial_accident_weight:10,score_cap:100,bonus_cap:5,manual_publish:1,allow_partner_edits:1,preserve_score_on_edit:1};

const DEFAULT_ITEMS=[
  {code:'B1',category:'가점',type:'bonus',name:'안전보건경영시스템 구축 및 운영',score:3,guide:'아래 항목 중 1개만 인정(각 3점, 중복 인정 불가): ISO45001 인증서, KOSHA-MS 인증서, 위험성평가 인정서(100인 미만).',submission:'인증서 또는 인정서 증빙자료를 제출하세요.'},
  {code:'B2',category:'가점',type:'bonus',name:'환경안전 부문 수상이력',score:2,guide:'아래 항목 중 1개만 인정(각 2점, 중복 인정 불가): 안전관리 우수 협력사, 우수 안전담당자.',submission:'수상이력을 확인할 수 있는 상장 또는 증빙자료를 제출하세요.'},
  {code:'1',category:'중대산업재해 예방',type:'score',name:'경영책임자 안전보건 의무 이행',score:10,guide:'중대재해처벌법에 따른 경영책임자의 주기적 점검 실시 여부를 확인합니다. 유해위험요인 확인·개선, 안전보건관리책임자 업무수행 조치, 종사자 의견청취, 비상매뉴얼, 도급·용역·위탁 평가기준, 관계법령 및 교육 의무 이행, 반기 점검, 경영책임자 직접 점검 근거를 확인합니다. 배점: 10/8/6/4/2/0점. 경영책임자 직접 점검 근거가 없거나 5개 이상 미확인 시 0점.',submission:'경영책임자 성명과 최근 반기 점검일을 기록하고 전자결재·직접서명 등 객관적 점검 근거를 제출하세요.',na:[{type:'worker_count',min:5}]},
  {code:'2',category:'안전보건 관리 체계',type:'score',name:'안전·보건 업무(총괄) 전담조직 설치',score:3,guide:'안전보건관리 조직 보유 여부를 확인합니다. 500인 이상 사업장은 전담조직, 그 외는 안전보건조직도, 법적 안전담당자 이름·직급, 최신 조직도를 확인합니다. 배점: 3/2/1/0점.',submission:'상시근로자 500인 이상 여부, 환경안전 전담조직 보유 여부, 조직구성 및 안전보건 관계자 현황을 기록하세요.',na:[{type:'worker_count',min:5}]},
  {code:'3',category:'안전보건 관리 체계',type:'score',name:'안전·보건관리자 적정 수 배치',score:5,guide:'산업안전보건법 기준에 따른 안전관리자·보건관리자·산업보건의 또는 안전보건관리담당자의 적정 선임과 교육을 확인합니다. 위탁 시 유효한 위탁계약서를 확인합니다. 배점: 법적 기준 만족 5점, 미선임 또는 교육 미실시 0점. N/A는 인원 미만 또는 비해당 업종.',submission:'안전관리자·보건관리자·산업보건의·안전보건관리담당자의 이름, 선임일, 최근 교육이수일과 위탁 시 위탁기관 및 계약기간을 기록하세요.'},
  {code:'4',category:'안전보건 관리 체계',type:'score',name:'안전보건관리책임자, 관리감독자 선임여부',score:5,guide:'안전보건관리책임자와 관리감독자의 법적 선임 및 교육 이수 여부를 확인합니다. 배점: 모두 만족 5점, 법적기준 미선임 또는 교육 미이수 0점.',submission:'안전보건관리책임자와 관리감독자의 이름, 선임일, 최근 교육이수일, 비대상 시 근거를 기록하세요.',na:[{type:'worker_count',min:5}]},
  {code:'5',category:'안전보건 관리 체계',type:'score',name:'안전보건방침 및 안전보건 목표 수립',score:3,guide:'안전보건 경영방침, 당해년도 목표, 목표 이행점검, 종사자가 볼 수 있는 게시 여부를 확인합니다. 배점: 3/2/1/0점.',submission:'경영방침 서명일, 목표 수립일, 이행점검일, 경영방침 게시 장소를 기록하세요.',na:[{type:'worker_count',min:5}]},
  {code:'6',category:'안전보건 관리 체계',type:'score',name:'안전보건관리규정',score:3,guide:'사업장에 적합한 안전보건관리규정 보유, 최신 법규 반영, 재개정 이력, 산안위 의결 또는 근로자대표 합의, 게시 여부를 확인합니다. 배점: 3/2/1/0점. N/A는 업종·인원 등 작성대상 미해당 근거가 있는 경우.',submission:'규정 대상 여부, 비대상 사유, 최근 제·개정일, 산업안전보건위원회 또는 근로자대표 합의 근거를 기록하세요.'},
  {code:'7',category:'안전보건 관리 체계',type:'score',name:'법령 요지 게시',score:2,guide:'산업안전보건법 제34조에 따른 법령 요지 게시 여부와 최신 법규 반영 여부를 확인합니다. 게시 2점, 미게시 또는 확인불가 0점.',submission:'법령 요지 게시 장소를 기록하고 게시 근거를 제출하세요.'},
  {code:'8',category:'안전보건 관리 체계',type:'score',name:'산업안전보건위원회 및 안전보건회의 운영',score:5,guide:'산업안전보건위원회 대상 여부에 따라 절차서, 정기 개최, 참석자 기준 및 서명, 직전분기 의결사항 결과관리, 근로자 게시를 확인합니다. 비대상 사업장은 자체 안전보건 정기회의를 확인합니다. 배점: 5/4/3/2/1/0점.',submission:'최근 회의일, 주요안건, 직전분기 의결사항 진행결과, 게시장소를 기록하고 비대상 시 근거를 제출하세요.'},
  {code:'9',category:'안전보건 관리 체계',type:'score',name:'안전보건 관련 교육 실시 확인(정기안전교육)',score:5,guide:'정기안전교육 실시, 최근 반기 교육시간, 교육대상 누락, 강사 선정기준, 교육내용 기준을 확인합니다. 배점: 5/4/3/2/1/0점.',submission:'최근 반기 교육대상·실시·미실시 인원, 교육강사, 미참석자 후속조치, 상시근로자와 교육대상 차이 사유를 기록하세요.'},
  {code:'10',category:'안전보건 관리 체계',type:'score',name:'안전보건 관련 교육 실시 확인(채용시, 특별교육)',score:5,guide:'최근 반기 채용시교육·특별교육 실시 여부와 강사, 교육시간, 교육내용 법정기준 준수 여부를 확인합니다. 배점: 5/4/3/2/1/0점.',submission:'채용시교육 및 특별교육 대상·실시·미실시 인원, 강사, 특별교육 대상작업, 교육시간 단축 운영 시 사유를 기록하세요.'},
  {code:'11',category:'유해위험 방지조치',type:'score',name:'유해·위험요인 확인 및 개선절차 마련',score:10,guide:'위험성평가 절차 보유, 정기·수시 위험성평가 실시, 개선대책 이행, 결과 공유 여부를 확인합니다. 4개 기준 모두 만족 시 10점, 1개 이상 미확인 시 0점.',submission:'위험성평가 절차, 측정방법, 최근 정기·수시 위험성평가 실시일, 개선조치 건수와 완료현황, 근로자 공유 근거를 기록하세요.'},
  {code:'12',category:'유해위험 방지조치',type:'score',name:'작업중지 및 비상조치',score:5,guide:'비상대응 매뉴얼, 작업중지·대피·위험요인제거·구호·추가피해 방지, 긴급연락체계, 3개 이상 상황별 시나리오, 모의훈련 또는 교육을 확인합니다. 배점: 5/4/3/2/1/0점.',submission:'비상대응 매뉴얼 보유 여부, 누락 내용, 최근 반기 점검일, 비상대응훈련 일자·참석자·내용·강평·전파교육을 기록하세요.'},
  {code:'13',category:'유해위험 방지조치',type:'score',name:'재해 발생시 재발방지 대책의 수립 및 그 이행에 관한 조치',score:4,guide:'최근 3년 산업재해율확인서와 산재요양 승인·반려 여부 확인서, 재해 발생 시 수시위험성평가와 재발방지대책 이행을 확인합니다. 배점: 4/3/2/1/0점.',submission:'최근 3년 관련 확인서 제출 여부, 재해 발생 건수, 재해 발생 시 재발방지대책 및 조치내용을 기록하세요.'},
  {code:'14',category:'근로자의 보건 관리',type:'score',name:'보호구 관리(지급/기록)',score:5,guide:'보호구 관리 절차, 공정별 보호구 리스트, 지급·교체주기, 양식 일치, 개인 보호구 지급 누락 여부를 확인합니다. 배점: 5/4/3/2/1/0점.',submission:'보호구관리 규정 최근 개정일, 취급 보호구 종류, 지급·교체기준 명시 여부, 지급대장 사용 여부를 기록하세요.'},
  {code:'15',category:'근로자의 보건 관리',type:'score',name:'건강검진',score:5,guide:'일반·특수 건강검진 실시 및 관리, 공단 대상자 명단, 당해년도 수검완료 예정확인서, 특수검진, 개인정보 블라인드 여부를 확인합니다. 배점: 5/3/2/1/0점.',submission:'일반·특수검진 대상·실시·미실시 인원, 미실시 사유, 특수검진 대상 여부 및 최근 배치전검진 일자를 기록하세요.'},
  {code:'16',category:'근로자의 보건 관리',type:'score',name:'작업환경측정',score:3,guide:'최근 작업환경측정 결과, 법적기준 초과 여부, 초과 시 개선대책을 확인합니다. 배점: 3/2/1/0점. N/A는 측정대상 유해인자가 없고 전문 측정기관 또는 경영책임자 확인자료가 있는 경우.',submission:'작업환경측정 대상 여부, 최근 측정일, 법적기준 초과 건수, 개선 여부, 비대상 증빙 제출 여부를 기록하세요.'},
  {code:'17',category:'근로자의 보건 관리',type:'score',name:'근골격계 유해요인 조사',score:3,guide:'가장 최근 근골격계 유해요인 조사 결과와 부담작업에 따른 적절한 조치를 확인합니다. 실시 및 조치 만족 시 3점, 미실시 또는 조치 미실시 0점.',submission:'최근 조사일, 근골격계부담작업 건수, 관련 조치내용을 기록하세요.'},
  {code:'18',category:'근로자의 보건 관리',type:'score',name:'물질안전보건자료(MSDS)',score:5,guide:'사용 중인 화학물질 MSDS 리스트, 개정일자 관리, 현장 게시 여부를 확인합니다. 배점: 5/3/1/0점. 화학물질 미사용은 경영책임자 확인서 제출 시 N/A.',submission:'관리 중인 화학물질 MSDS 수와 최신화 관리 프로세스 또는 주기적 점검 여부를 기록하세요.'},
  {code:'19',category:'도급시 산업재해 예방',type:'score',name:'도급사업시의 안전보건조치',score:6,guide:'수급인·관계수급인 리스트, 최근 월 안전보건협의체, 최근 분기 또는 법정주기 합동점검을 확인합니다. 배점: 6/3/0점. 도급관계 협력사가 없는 경우 N/A.',submission:'협의체 대상 수, 최근 협의체 결과보고일 및 참여 협력사 수, 합동점검 대상 수, 최근 결과보고일, 대리참석 위임서 확인 여부를 기록하세요.'},
  {code:'20',category:'도급시 산업재해 예방',type:'score',name:'도급업체 평가 및 비용 확인',score:6,guide:'협력업체 선정·평가기준, 관계수급인 교육 확인항목, 계약 시 안전보건관리비용 검토 프로세스를 확인합니다. 배점: 6/4/2/0점. 도급관계 협력사가 없는 경우 N/A.',submission:'도급업체 선정기준, 안전보건관리비용 검토내용, 법적교육 확인 절차 보유 여부를 기록하세요.'},
  {code:'21',category:'도급시 산업재해 예방',type:'score',name:'산안법 도급승인',score:2,guide:'황산·질산·불산·염산 1% 이상 취급 설비의 개조·분해·해체·철거 작업 등 도급승인 대상 작업의 재하도 여부를 확인합니다. 직접 수행 2점, 관계수급인 수행 0점. 해당 작업이 없으면 N/A.',submission:'취급물질 여부와 물질명, 재하도 여부를 기록하세요.'}
];

function j(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=utf-8','access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS'}})}
function cleanText(v,max=4000){return String(v??'').trim().slice(0,max)}
function num(v,def=0){const n=Number(v);return Number.isFinite(n)?n:def}
function halfLabel(v){return v==='first'?'상반기':'하반기'}

async function ensureSchema(env){
  await env.partner_evaluation_db.batch([
    env.partner_evaluation_db.prepare(`CREATE TABLE IF NOT EXISTS evaluation_templates_v2 (id TEXT PRIMARY KEY, year INTEGER NOT NULL, half TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', source_template_id TEXT, created_by TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, locked_at TEXT, UNIQUE(year,half,version))`),
    env.partner_evaluation_db.prepare(`CREATE TABLE IF NOT EXISTS evaluation_categories_v2 (id TEXT PRIMARY KEY, template_id TEXT NOT NULL, parent_id TEXT, category_name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    env.partner_evaluation_db.prepare(`CREATE INDEX IF NOT EXISTS idx_eval_categories_v2_template ON evaluation_categories_v2(template_id,sort_order)`),
    env.partner_evaluation_db.prepare(`CREATE TABLE IF NOT EXISTS evaluation_items_v2 (id TEXT PRIMARY KEY, template_id TEXT NOT NULL, category_id TEXT NOT NULL, item_code TEXT, item_name TEXT NOT NULL, item_type TEXT NOT NULL DEFAULT 'score', max_score REAL NOT NULL DEFAULT 0, judgment_guide TEXT, submission_guide TEXT, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    env.partner_evaluation_db.prepare(`CREATE INDEX IF NOT EXISTS idx_eval_items_v2_template ON evaluation_items_v2(template_id,sort_order)`),
    env.partner_evaluation_db.prepare(`CREATE TABLE IF NOT EXISTS evaluation_na_rules_v2 (id TEXT PRIMARY KEY, item_id TEXT NOT NULL, rule_type TEXT NOT NULL, industry_name TEXT, min_worker_count INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0)`),
    env.partner_evaluation_db.prepare(`CREATE INDEX IF NOT EXISTS idx_eval_na_rules_v2_item ON evaluation_na_rules_v2(item_id,sort_order)`),
    env.partner_evaluation_db.prepare(`CREATE TABLE IF NOT EXISTS ipass_policy_settings_v2 (id INTEGER PRIMARY KEY CHECK(id=1), excellence_threshold REAL NOT NULL DEFAULT 90, first_half_exempt_enabled INTEGER NOT NULL DEFAULT 1, normal_first_half_weight REAL NOT NULL DEFAULT 40, normal_second_half_weight REAL NOT NULL DEFAULT 40, exempt_second_half_weight REAL NOT NULL DEFAULT 80, committee_weight REAL NOT NULL DEFAULT 10, industrial_accident_weight REAL NOT NULL DEFAULT 10, updated_by TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    env.partner_evaluation_db.prepare(`INSERT OR IGNORE INTO ipass_policy_settings_v2 (id,excellence_threshold,first_half_exempt_enabled,normal_first_half_weight,normal_second_half_weight,exempt_second_half_weight,committee_weight,industrial_accident_weight) VALUES (1,90,1,40,40,80,10,10)`),
    env.partner_evaluation_db.prepare(`CREATE TABLE IF NOT EXISTS evaluation_template_logs_v2 (id TEXT PRIMARY KEY, template_id TEXT, action TEXT NOT NULL, detail_json TEXT, changed_by TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    env.partner_evaluation_db.prepare(`CREATE TABLE IF NOT EXISTS evaluation_template_settings_v2 (template_id TEXT PRIMARY KEY,concept_text TEXT,excellent_min REAL NOT NULL DEFAULT 90,qualified_min REAL NOT NULL DEFAULT 70,first_half_exempt_enabled INTEGER NOT NULL DEFAULT 1,exemption_threshold REAL NOT NULL DEFAULT 90,normal_first_half_weight REAL NOT NULL DEFAULT 40,normal_second_half_weight REAL NOT NULL DEFAULT 40,exempt_second_half_weight REAL NOT NULL DEFAULT 80,committee_weight REAL NOT NULL DEFAULT 10,industrial_accident_weight REAL NOT NULL DEFAULT 10,score_cap REAL NOT NULL DEFAULT 100,bonus_cap REAL NOT NULL DEFAULT 5,manual_publish INTEGER NOT NULL DEFAULT 1,allow_partner_edits INTEGER NOT NULL DEFAULT 1,preserve_score_on_edit INTEGER NOT NULL DEFAULT 1,updated_by TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    env.partner_evaluation_db.prepare(`CREATE TABLE IF NOT EXISTS evaluation_cycle_settings_v2 (cycle_id TEXT PRIMARY KEY,source_template_id TEXT,concept_text TEXT,excellent_min REAL NOT NULL DEFAULT 90,qualified_min REAL NOT NULL DEFAULT 70,first_half_exempt_enabled INTEGER NOT NULL DEFAULT 1,exemption_threshold REAL NOT NULL DEFAULT 90,normal_first_half_weight REAL NOT NULL DEFAULT 40,normal_second_half_weight REAL NOT NULL DEFAULT 40,exempt_second_half_weight REAL NOT NULL DEFAULT 80,committee_weight REAL NOT NULL DEFAULT 10,industrial_accident_weight REAL NOT NULL DEFAULT 10,score_cap REAL NOT NULL DEFAULT 100,bonus_cap REAL NOT NULL DEFAULT 5,manual_publish INTEGER NOT NULL DEFAULT 1,allow_partner_edits INTEGER NOT NULL DEFAULT 1,preserve_score_on_edit INTEGER NOT NULL DEFAULT 1,updated_by TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
  ]);
}

async function requireAdmin(request,env,ctx,baseWorker){
  const u=new URL(request.url);u.pathname='/api/me';u.search='';
  const r=await baseWorker.fetch(new Request(u.toString(),{method:'GET',headers:request.headers}),env,ctx);
  const d=await r.clone().json().catch(()=>null);
  if(!r.ok||!d?.success)return {ok:false,response:r};
  if(d.auth_state!=='approved'||d.user?.role!=='admin')return {ok:false,response:j({success:false,error:'관리자 권한이 필요합니다.'},403)};
  return {ok:true,user:d.user};
}

async function templateList(env){
  const {results}=await env.partner_evaluation_db.prepare(`SELECT t.*, (SELECT COUNT(*) FROM evaluation_items_v2 i WHERE i.template_id=t.id AND i.item_type='score') AS score_item_count, (SELECT COUNT(*) FROM evaluation_items_v2 i WHERE i.template_id=t.id AND i.item_type='bonus') AS bonus_item_count, COALESCE((SELECT SUM(i.max_score) FROM evaluation_items_v2 i WHERE i.template_id=t.id AND i.item_type='score'),0) AS score_total, COALESCE((SELECT SUM(i.max_score) FROM evaluation_items_v2 i WHERE i.template_id=t.id AND i.item_type='bonus'),0) AS bonus_total FROM evaluation_templates_v2 t ORDER BY t.year DESC, CASE WHEN t.half='second' THEN 2 ELSE 1 END DESC, t.version DESC`).all();
  return results||[];
}

async function templateSettings(env,templateId){
  await env.partner_evaluation_db.prepare(`INSERT OR IGNORE INTO evaluation_template_settings_v2 (template_id) VALUES (?)`).bind(templateId).run();
  return await env.partner_evaluation_db.prepare(`SELECT * FROM evaluation_template_settings_v2 WHERE template_id=? LIMIT 1`).bind(templateId).first()||{template_id:templateId,...DEFAULT_TEMPLATE_SETTINGS};
}
function normalizeSettings(body,current={}){
  const source={...DEFAULT_TEMPLATE_SETTINGS,...current,...(body||{})};
  const excellent=Math.max(0,Math.min(100,num(source.excellent_min,90))),qualified=Math.max(0,Math.min(100,num(source.qualified_min,70)));
  const first=Math.max(0,Math.min(100,num(source.normal_first_half_weight,40))),second=Math.max(0,Math.min(100,num(source.normal_second_half_weight,40))),committee=Math.max(0,Math.min(100,num(source.committee_weight,10))),accident=Math.max(0,Math.min(100,num(source.industrial_accident_weight,10))),exemptSecond=Math.max(0,Math.min(100,num(source.exempt_second_half_weight,80)));
  if(qualified>=excellent)return {error:'적격 협력사 최저점은 안전관리 우수 협력사 최저점보다 낮아야 합니다.'};
  if(Math.round((first+second+committee+accident)*100)/100!==100)return {error:'일반 평가 점수 반영 합계는 100점이어야 합니다.'};
  if(Math.round((exemptSecond+committee+accident)*100)/100!==100)return {error:'면제 평가 점수 반영 합계는 100점이어야 합니다.'};
  return {settings:{concept_text:cleanText(source.concept_text,1000)||null,excellent_min:excellent,qualified_min:qualified,first_half_exempt_enabled:source.first_half_exempt_enabled===false||source.first_half_exempt_enabled===0?0:1,exemption_threshold:Math.max(0,Math.min(100,num(source.exemption_threshold,excellent))),normal_first_half_weight:first,normal_second_half_weight:second,exempt_second_half_weight:exemptSecond,committee_weight:committee,industrial_accident_weight:accident,score_cap:Math.max(0,Math.min(100,num(source.score_cap,100))),bonus_cap:Math.max(0,Math.min(100,num(source.bonus_cap,5))),manual_publish:source.manual_publish===false||source.manual_publish===0?0:1,allow_partner_edits:source.allow_partner_edits===false||source.allow_partner_edits===0?0:1,preserve_score_on_edit:source.preserve_score_on_edit===false||source.preserve_score_on_edit===0?0:1}};
}
async function saveTemplateSettings(env,templateId,body,userId){
  const template=await env.partner_evaluation_db.prepare(`SELECT id FROM evaluation_templates_v2 WHERE id=? LIMIT 1`).bind(templateId).first();if(!template)return {error:'평가표를 찾을 수 없습니다.',status:404};
  const current=await templateSettings(env,templateId),normalized=normalizeSettings(body,current);if(normalized.error)return {error:normalized.error,status:400};const s=normalized.settings;
  await env.partner_evaluation_db.prepare(`UPDATE evaluation_template_settings_v2 SET concept_text=?,excellent_min=?,qualified_min=?,first_half_exempt_enabled=?,exemption_threshold=?,normal_first_half_weight=?,normal_second_half_weight=?,exempt_second_half_weight=?,committee_weight=?,industrial_accident_weight=?,score_cap=?,bonus_cap=?,manual_publish=?,allow_partner_edits=?,preserve_score_on_edit=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE template_id=?`).bind(s.concept_text,s.excellent_min,s.qualified_min,s.first_half_exempt_enabled,s.exemption_threshold,s.normal_first_half_weight,s.normal_second_half_weight,s.exempt_second_half_weight,s.committee_weight,s.industrial_accident_weight,s.score_cap,s.bonus_cap,s.manual_publish,s.allow_partner_edits,s.preserve_score_on_edit,userId,templateId).run();
  await log(env,templateId,'settings_saved',s,userId);return {settings:await templateSettings(env,templateId)};
}

async function loadTemplate(env,id){
  const t=await env.partner_evaluation_db.prepare(`SELECT * FROM evaluation_templates_v2 WHERE id=? LIMIT 1`).bind(id).first();
  if(!t)return null;
  const [cRes,iRes,rRes]=await env.partner_evaluation_db.batch([
    env.partner_evaluation_db.prepare(`SELECT * FROM evaluation_categories_v2 WHERE template_id=? ORDER BY sort_order,category_name`).bind(id),
    env.partner_evaluation_db.prepare(`SELECT * FROM evaluation_items_v2 WHERE template_id=? ORDER BY sort_order,item_code,item_name`).bind(id),
    env.partner_evaluation_db.prepare(`SELECT r.* FROM evaluation_na_rules_v2 r JOIN evaluation_items_v2 i ON i.id=r.item_id WHERE i.template_id=? ORDER BY r.sort_order`).bind(id)
  ]);
  const rulesBy=new Map();for(const r of rRes?.results||[]){if(!rulesBy.has(r.item_id))rulesBy.set(r.item_id,[]);rulesBy.get(r.item_id).push(r)}
  return {...t,settings:await templateSettings(env,id),categories:cRes?.results||[],items:(iRes?.results||[]).map(x=>({...x,na_rules:rulesBy.get(x.id)||[]}))};
}

function validateTemplate(t){
  const errors=[];const items=t?.items||[];const categories=new Set((t?.categories||[]).map(x=>x.id));
  if(!items.length)errors.push('평가항목이 없습니다.');
  let scoreTotal=0,bonusTotal=0;
  for(const item of items){
    if(!cleanText(item.item_name,300))errors.push('평가항목명이 비어 있습니다.');
    if(!categories.has(item.category_id))errors.push(`${item.item_name||'항목'}의 분류가 지정되지 않았습니다.`);
    const s=num(item.max_score,-1);if(s<0)errors.push(`${item.item_name||'항목'}의 배점을 확인하세요.`);
    if(item.item_type==='bonus')bonusTotal+=Math.max(0,s);else scoreTotal+=Math.max(0,s);
  }
  scoreTotal=Math.round(scoreTotal*100)/100;bonusTotal=Math.round(bonusTotal*100)/100;
  if(scoreTotal!==100)errors.push(`평가 배점 합계가 ${scoreTotal}점입니다. 100점이어야 합니다.`);
  return {valid:errors.length===0,errors,score_total:scoreTotal,bonus_total:bonusTotal,final_score_cap:100};
}

async function log(env,templateId,action,detail,userId){await env.partner_evaluation_db.prepare(`INSERT INTO evaluation_template_logs_v2 (id,template_id,action,detail_json,changed_by) VALUES (?,?,?,?,?)`).bind(crypto.randomUUID(),templateId,action,JSON.stringify(detail||{}),userId||null).run()}

async function saveContent(env,templateId,payload,userId){
  const current=await loadTemplate(env,templateId);if(!current)return {error:'평가표를 찾을 수 없습니다.',status:404};
  const categories=Array.isArray(payload.categories)?payload.categories:[];const items=Array.isArray(payload.items)?payload.items:[];
  const catMap=new Map();for(const c of categories)catMap.set(String(c.id||crypto.randomUUID()),crypto.randomUUID());
  const stmts=[
    env.partner_evaluation_db.prepare(`DELETE FROM evaluation_na_rules_v2 WHERE item_id IN (SELECT id FROM evaluation_items_v2 WHERE template_id=?)`).bind(templateId),
    env.partner_evaluation_db.prepare(`DELETE FROM evaluation_items_v2 WHERE template_id=?`).bind(templateId),
    env.partner_evaluation_db.prepare(`DELETE FROM evaluation_categories_v2 WHERE template_id=?`).bind(templateId)
  ];
  categories.forEach((c,idx)=>{const clientId=String(c.id||'');const id=catMap.get(clientId);const parent=cleanText(c.parent_id,100);stmts.push(env.partner_evaluation_db.prepare(`INSERT INTO evaluation_categories_v2 (id,template_id,parent_id,category_name,sort_order) VALUES (?,?,?,?,?)`).bind(id,templateId,parent?catMap.get(parent)||null:null,cleanText(c.category_name,200),Number.isInteger(c.sort_order)?c.sort_order:idx))});
  items.forEach((it,idx)=>{const itemId=crypto.randomUUID();const categoryId=catMap.get(String(it.category_id||''));stmts.push(env.partner_evaluation_db.prepare(`INSERT INTO evaluation_items_v2 (id,template_id,category_id,item_code,item_name,item_type,max_score,judgment_guide,submission_guide,sort_order,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(itemId,templateId,categoryId||'',cleanText(it.item_code,40)||null,cleanText(it.item_name,300),it.item_type==='bonus'?'bonus':'score',Math.max(0,num(it.max_score,0)),cleanText(it.judgment_guide,12000)||null,cleanText(it.submission_guide,8000)||null,Number.isInteger(it.sort_order)?it.sort_order:idx));
    (Array.isArray(it.na_rules)?it.na_rules:[]).forEach((r,ri)=>{const type=r.rule_type==='industry_worker'?'industry_worker':'worker_count';stmts.push(env.partner_evaluation_db.prepare(`INSERT INTO evaluation_na_rules_v2 (id,item_id,rule_type,industry_name,min_worker_count,sort_order) VALUES (?,?,?,?,?,?)`).bind(crypto.randomUUID(),itemId,type,type==='industry_worker'?cleanText(r.industry_name,300)||null:null,Math.max(0,Math.round(num(r.min_worker_count,0))),ri))})
  });
  stmts.push(env.partner_evaluation_db.prepare(`UPDATE evaluation_templates_v2 SET updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(templateId));
  await env.partner_evaluation_db.batch(stmts);await log(env,templateId,'content_saved',{category_count:categories.length,item_count:items.length},userId);return {ok:true};
}

async function seedDefault(env,userId){
  const row=await env.partner_evaluation_db.prepare(`SELECT id FROM evaluation_templates_v2 LIMIT 1`).first();if(row)return;
  const templateId=crypto.randomUUID();
  await env.partner_evaluation_db.prepare(`INSERT INTO evaluation_templates_v2 (id,year,half,version,name,status,created_by) VALUES (?,?,?,?,?,'draft',?)`).bind(templateId,2026,'second',1,'2026년 하반기 평가표',userId).run();
  const names=[...new Set(DEFAULT_ITEMS.map(x=>x.category))];const categories=names.map((name,i)=>({id:`seed-cat-${i}`,category_name:name,parent_id:null,sort_order:i}));
  const catBy=new Map(categories.map(c=>[c.category_name,c.id]));
  const items=DEFAULT_ITEMS.map((x,i)=>({id:`seed-item-${i}`,category_id:catBy.get(x.category),item_code:x.code,item_name:x.name,item_type:x.type,max_score:x.score,judgment_guide:x.guide,submission_guide:x.submission,sort_order:i,na_rules:(x.na||[]).map(r=>({rule_type:r.type,min_worker_count:r.min,industry_name:r.industry||null}))}));
  await saveContent(env,templateId,{categories,items},userId);await log(env,templateId,'seeded',{source:'2026-current-pasted-table'},userId);
}

async function copyTemplate(env,sourceId,year,half,name,userId){
  const source=await loadTemplate(env,sourceId);if(!source)return {error:'복사할 평가표를 찾을 수 없습니다.',status:404};
  const v=await env.partner_evaluation_db.prepare(`SELECT COALESCE(MAX(version),0)+1 AS v FROM evaluation_templates_v2 WHERE year=? AND half=?`).bind(year,half).first();
  const id=crypto.randomUUID();await env.partner_evaluation_db.prepare(`INSERT INTO evaluation_templates_v2 (id,year,half,version,name,status,source_template_id,created_by) VALUES (?,?,?,?,?,'draft',?,?)`).bind(id,year,half,Number(v?.v||1),name||`${year}년 ${halfLabel(half)} 평가표`,sourceId,userId).run();
  const copied=normalizeSettings(source.settings||{},DEFAULT_TEMPLATE_SETTINGS).settings;await env.partner_evaluation_db.prepare(`INSERT OR REPLACE INTO evaluation_template_settings_v2 (template_id,concept_text,excellent_min,qualified_min,first_half_exempt_enabled,exemption_threshold,normal_first_half_weight,normal_second_half_weight,exempt_second_half_weight,committee_weight,industrial_accident_weight,score_cap,bonus_cap,manual_publish,allow_partner_edits,preserve_score_on_edit,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,copied.concept_text,copied.excellent_min,copied.qualified_min,copied.first_half_exempt_enabled,copied.exemption_threshold,copied.normal_first_half_weight,copied.normal_second_half_weight,copied.exempt_second_half_weight,copied.committee_weight,copied.industrial_accident_weight,copied.score_cap,copied.bonus_cap,copied.manual_publish,copied.allow_partner_edits,copied.preserve_score_on_edit,userId).run();
  const categories=source.categories.map(c=>({id:c.id,category_name:c.category_name,parent_id:c.parent_id,sort_order:c.sort_order}));
  const items=source.items.map(i=>({id:i.id,category_id:i.category_id,item_code:i.item_code,item_name:i.item_name,item_type:i.item_type,max_score:i.max_score,judgment_guide:i.judgment_guide,submission_guide:i.submission_guide,sort_order:i.sort_order,na_rules:(i.na_rules||[]).map(r=>({rule_type:r.rule_type,industry_name:r.industry_name,min_worker_count:r.min_worker_count}))}));
  await saveContent(env,id,{categories,items},userId);await log(env,id,'copied',{source_template_id:sourceId},userId);return {id};
}

async function exemptionPreview(request,env,ctx,baseWorker,year,threshold){
  const {results}=await env.partner_evaluation_db.prepare(`SELECT id,company_name FROM companies WHERE status='active' ORDER BY company_name`).all();const out=[];
  for(const c of results||[]){const u=new URL(request.url);u.pathname=`/api/admin/annual-ipass/${encodeURIComponent(c.id)}/${year-1}`;u.search='';const r=await baseWorker.fetch(new Request(u.toString(),{method:'GET',headers:request.headers}),env,ctx);const d=await r.json().catch(()=>null);const score=num(d?.annual?.final_total,NaN);if(Number.isFinite(score)&&score>=threshold)out.push({company_id:c.id,company_name:c.company_name,previous_year:year-1,previous_ipass_score:score,exempt:true})}
  return out;
}

export async function handleEvaluationManagement(request,env,ctx,baseWorker){
  const url=new URL(request.url);const path=url.pathname;if(!path.startsWith('/api/admin/evaluation-management'))return null;
  if(request.method==='OPTIONS')return j({success:true});
  const auth=await requireAdmin(request,env,ctx,baseWorker);if(!auth.ok)return auth.response;const user=auth.user;
  await ensureSchema(env);await seedDefault(env,user.id);

  if(request.method==='GET'&&path==='/api/admin/evaluation-management'){
    const templates=await templateList(env);const requested=cleanText(url.searchParams.get('template_id'),100);const selectedId=requested||templates[0]?.id||null;const template=selectedId?await loadTemplate(env,selectedId):null;const policy=await env.partner_evaluation_db.prepare(`SELECT * FROM ipass_policy_settings_v2 WHERE id=1`).first();
    return j({success:true,templates,template,validation:template?validateTemplate(template):null,policy});
  }

  if(request.method==='GET'&&path==='/api/admin/evaluation-management/exemptions'){
    const policy=await env.partner_evaluation_db.prepare(`SELECT * FROM ipass_policy_settings_v2 WHERE id=1`).first();const year=Math.max(2020,Math.min(2100,Math.round(num(url.searchParams.get('year'),new Date().getFullYear()+1))));const companies=await exemptionPreview(request,env,ctx,baseWorker,year,num(policy?.excellence_threshold,90));return j({success:true,year,threshold:num(policy?.excellence_threshold,90),companies});
  }

  if(request.method==='POST'&&path==='/api/admin/evaluation-management/templates'){
    const b=await request.json();const year=Math.max(2020,Math.min(2100,Math.round(num(b.year,new Date().getFullYear()))));const half=b.half==='first'?'first':'second';const source=cleanText(b.source_template_id,100);
    if(source){const r=await copyTemplate(env,source,year,half,cleanText(b.name,200),user.id);if(r.error)return j({success:false,error:r.error},r.status);return j({success:true,id:r.id},201)}
    const v=await env.partner_evaluation_db.prepare(`SELECT COALESCE(MAX(version),0)+1 AS v FROM evaluation_templates_v2 WHERE year=? AND half=?`).bind(year,half).first();const id=crypto.randomUUID();await env.partner_evaluation_db.prepare(`INSERT INTO evaluation_templates_v2 (id,year,half,version,name,status,created_by) VALUES (?,?,?,?,?,'draft',?)`).bind(id,year,half,Number(v?.v||1),cleanText(b.name,200)||`${year}년 ${halfLabel(half)} 평가표`,user.id).run();await templateSettings(env,id);await log(env,id,'created',{year,half},user.id);return j({success:true,id},201);
  }

  const contentMatch=path.match(/^\/api\/admin\/evaluation-management\/templates\/([^/]+)\/content$/);
  if(contentMatch&&request.method==='PUT'){
    const r=await saveContent(env,decodeURIComponent(contentMatch[1]),await request.json(),user.id);if(r.error)return j({success:false,error:r.error},r.status);const t=await loadTemplate(env,decodeURIComponent(contentMatch[1]));return j({success:true,template:t,validation:validateTemplate(t)});
  }

  const settingsMatch=path.match(/^\/api\/admin\/evaluation-management\/templates\/([^/]+)\/settings$/);
  if(settingsMatch&&request.method==='PATCH'){
    const r=await saveTemplateSettings(env,decodeURIComponent(settingsMatch[1]),await request.json(),user.id);if(r.error)return j({success:false,error:r.error},r.status);return j({success:true,settings:r.settings});
  }

  const templateMatch=path.match(/^\/api\/admin\/evaluation-management\/templates\/([^/]+)$/);
  if(templateMatch&&request.method==='PATCH'){
    const id=decodeURIComponent(templateMatch[1]);const before=await loadTemplate(env,id);if(!before)return j({success:false,error:'평가표를 찾을 수 없습니다.'},404);const b=await request.json();
    const name=cleanText(b.name,200)||before.name,status=before.status==='locked'?'active':before.status;await env.partner_evaluation_db.prepare(`UPDATE evaluation_templates_v2 SET name=?,status=?,locked_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(name,status,id).run();await log(env,id,'template_updated',{name,status},user.id);const t=await loadTemplate(env,id);return j({success:true,template:t,validation:validateTemplate(t)});
  }
  if(templateMatch&&request.method==='DELETE'){
    const id=decodeURIComponent(templateMatch[1]);const t=await loadTemplate(env,id);if(!t)return j({success:false,error:'평가표를 찾을 수 없습니다.'},404);const used=await env.partner_evaluation_db.prepare(`SELECT COUNT(*) AS cnt FROM evaluation_cycles_v2 WHERE template_id=?`).bind(id).first().catch(()=>({cnt:0}));if(Number(used?.cnt||0)>0)return j({success:false,error:'평가회차에 사용된 평가표는 삭제할 수 없습니다. 항목 수정은 언제든 가능합니다.'},409);await env.partner_evaluation_db.batch([env.partner_evaluation_db.prepare(`DELETE FROM evaluation_na_rules_v2 WHERE item_id IN (SELECT id FROM evaluation_items_v2 WHERE template_id=?)`).bind(id),env.partner_evaluation_db.prepare(`DELETE FROM evaluation_items_v2 WHERE template_id=?`).bind(id),env.partner_evaluation_db.prepare(`DELETE FROM evaluation_categories_v2 WHERE template_id=?`).bind(id),env.partner_evaluation_db.prepare(`DELETE FROM evaluation_template_settings_v2 WHERE template_id=?`).bind(id),env.partner_evaluation_db.prepare(`DELETE FROM evaluation_templates_v2 WHERE id=?`).bind(id)]);return j({success:true});
  }

  if(request.method==='PATCH'&&path==='/api/admin/evaluation-management/policy'){
    const b=await request.json();const threshold=Math.max(0,Math.min(100,num(b.excellence_threshold,90)));const enabled=b.first_half_exempt_enabled===false||b.first_half_exempt_enabled===0?0:1;const exempt=Math.max(0,Math.min(100,num(b.exempt_second_half_weight,80)));if(Math.round((exempt+10+10)*100)/100!==100)return j({success:false,error:'면제 연도 배분은 하반기 평가 + 협의체 10점 + 산업재해 10점 = 100점이어야 합니다.'},400);await env.partner_evaluation_db.prepare(`UPDATE ipass_policy_settings_v2 SET excellence_threshold=?,first_half_exempt_enabled=?,exempt_second_half_weight=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=1`).bind(threshold,enabled,exempt,user.id).run();const policy=await env.partner_evaluation_db.prepare(`SELECT * FROM ipass_policy_settings_v2 WHERE id=1`).first();return j({success:true,policy});
  }

  return j({success:false,error:'지원하지 않는 평가관리 요청입니다.'},404);
}
