const FIREBASE_API_KEY="AIzaSyC0s7buQaayKr84QA_wFNyF6rcs6w1-IoU";
const PRODUCTION_API_ORIGIN="https://ipass.i-pass-eval.workers.dev";
const SAME_ORIGIN_API=location.hostname==="ipass.i-pass-eval.workers.dev"||location.hostname.endsWith(".workers.dev")||location.hostname==="localhost"||location.hostname==="127.0.0.1";
const API_BASE=SAME_ORIGIN_API?"":PRODUCTION_API_ORIGIN;
const SESSION_KEY="ipass.session.v10";
let session=null,currentUser=null,activeNoticeKey=null,noticeImageScale=100;
const $=id=>document.getElementById(id);
function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function tag(s){
  const m={
    pending:["●","승인대기","orange"],
    approved:["✓","승인","green"],
    rejected:["!","반려","red"],
    suspended:["–","사용중지","gray"],
    drafting:["●","작성중","gray"],
    draft:["●","작성중","gray"],
    submitted:["✓","제출완료","green"],
    evaluating:["●","검토중","orange"],
    review:["●","검토중","orange"],
    correction_required:["!","보완필요","red"],
    supplement_required:["!","보완필요","red"],
    revision_requested:["!","보완필요","red"],
    finalized:["✓","최종완료","blue"],
    completed:["✓","완료","blue"]
  };
  const a=m[s]||["",s||"-","gray"];
  return `<span class="tag ${a[2]}">${a[0]?`<span aria-hidden="true">${a[0]}</span>`:""}${esc(a[1])}</span>`;
}

async function firebasePost(endpoint,body,locale=false){
  let r;
  try{r=await fetch(`https://identitytoolkit.googleapis.com/v1/${endpoint}?key=${encodeURIComponent(FIREBASE_API_KEY)}`,{method:"POST",headers:{"content-type":"application/json",...(locale?{"X-Firebase-Locale":"ko"}:{})},body:JSON.stringify(body)})}
  catch{throw new Error("Firebase 인증 서버에 연결하지 못했습니다.")}
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(firebaseMessage(d?.error?.message||"AUTH_ERROR"));
  return d
}
function firebaseMessage(c){const m={EMAIL_NOT_FOUND:"등록되지 않은 이메일입니다.",INVALID_PASSWORD:"비밀번호가 올바르지 않습니다.",INVALID_LOGIN_CREDENTIALS:"이메일 또는 비밀번호가 올바르지 않습니다.",USER_DISABLED:"사용 중지된 계정입니다.",INVALID_EMAIL:"이메일 형식이 올바르지 않습니다.",TOO_MANY_ATTEMPTS_TRY_LATER:"로그인 시도가 너무 많습니다."};return m[c]||c}
async function refreshToken(){return window.EHSAuth.token({forceRefresh:true})}
async function token(){return window.EHSAuth.token()}
async function api(path,options={}){return window.EHSApi.request(path,options)}
async function publicApi(path){const r=await fetch(API_BASE+path,{headers:{Accept:"application/json"}});const t=await r.text();if(!r.ok)throw new Error(t||`HTTP ${r.status}`);return t?JSON.parse(t):{}}
const GET_CACHE=new Map(),GET_INFLIGHT=new Map();
function cachedGet(key,loader,ttl=15000){
  const now=Date.now(),hit=GET_CACHE.get(key);
  if(hit&&hit.expiresAt>now)return Promise.resolve(hit.value);
  if(GET_INFLIGHT.has(key))return GET_INFLIGHT.get(key);
  const p=Promise.resolve().then(loader).then(value=>{GET_CACHE.set(key,{value,expiresAt:Date.now()+ttl});return value}).finally(()=>GET_INFLIGHT.delete(key));
  GET_INFLIGHT.set(key,p);return p;
}
function apiCached(path,ttl=15000){return cachedGet(`auth:${path}`,()=>api(path),ttl)}
function publicApiCached(path,ttl=30000){return cachedGet(`public:${path}`,()=>publicApi(path),ttl)}
function invalidateGetCache(prefix=""){for(const key of GET_CACHE.keys()){if(!prefix||key.includes(prefix))GET_CACHE.delete(key)}}

function formatNoticeDate(v){if(!v)return"";const d=new Date(v);if(Number.isNaN(d.getTime()))return String(v).slice(0,10);return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")}`}
async function showLatestNotice(placement){try{const data=await publicApiCached(`/api/public/notices?placement=${encodeURIComponent(placement)}`,30000);const notice=(data.notices||[])[0];if(!notice)return;const key=`ipass.notice.hideUntil.${placement}.${notice.id}`;if(Number(localStorage.getItem(key)||0)>Date.now())return;activeNoticeKey=key;$("hideNoticeWeek").checked=false;$("noticePopupTitle").textContent=(notice.is_important?"[중요] ":"")+notice.title;$("noticePopupDate").textContent="";$("noticePopupContent").innerHTML=notice.content?`<div style="white-space:pre-wrap">${esc(notice.content)}</div>`:"";const image=$("noticePopupImage"),source=$("noticePopupImageSource");if(notice.popup_image_url){source.src=notice.popup_image_url;source.alt=`${notice.title} 팝업 이미지`;image.classList.remove("hidden");image.onclick=()=>openNoticeImage(notice.popup_image_url)}else{source.removeAttribute("src");image.classList.add("hidden")}$("noticeModal").classList.remove("hidden")}catch{}}
function closeNoticePopup(){if(activeNoticeKey&&$("hideNoticeWeek").checked)localStorage.setItem(activeNoticeKey,String(Date.now()+7*24*60*60*1000));$("noticeModal").classList.add("hidden");activeNoticeKey=null}
$("closeNoticePopup").onclick=closeNoticePopup;$("closeNoticePopupBottom").onclick=closeNoticePopup;$("noticeModal").onclick=e=>{if(e.target===$("noticeModal"))closeNoticePopup()};
function updateNoticeImage(){const image=$("noticeImageFull");$("noticeImagePercent").textContent=`${Math.round(noticeImageScale)}%`;if(image.naturalWidth)image.style.width=`${Math.max(1,Math.round(image.naturalWidth*noticeImageScale/100))}px`}
function fitNoticeImage(){const image=$("noticeImageFull"),stage=$("noticeImageStage");if(!image.naturalWidth||!image.naturalHeight)return;noticeImageScale=Math.min(100,(stage.clientWidth-36)/image.naturalWidth*100,(stage.clientHeight-36)/image.naturalHeight*100);updateNoticeImage()}
function openNoticeImage(url){noticeImageScale=100;$("noticeImageFull").src=url;$("noticeImageViewer").classList.remove("hidden");$("noticeImageFull").onload=fitNoticeImage}
function closeNoticeImage(){$("noticeImageViewer").classList.add("hidden");$("noticeImageFull").removeAttribute("src")}
$("noticeImageMinus").onclick=()=>{noticeImageScale=Math.max(10,noticeImageScale-10);updateNoticeImage()};$("noticeImagePlus").onclick=()=>{noticeImageScale=Math.min(500,noticeImageScale+10);updateNoticeImage()};$("noticeImageFit").onclick=fitNoticeImage;$("noticeImageClose").onclick=closeNoticeImage;$("noticeImageViewer").onclick=e=>{if(e.target===$("noticeImageViewer")||e.target===$("noticeImageStage"))closeNoticeImage()};
$("openTerms").onclick=()=>$("termsModal").classList.remove("hidden");$("closeTerms").onclick=()=>$("termsModal").classList.add("hidden");$("termsModal").onclick=e=>{if(e.target===$("termsModal"))$("termsModal").classList.add("hidden")};
$("openPrivacy").onclick=()=>$("privacyModal").classList.remove("hidden");$("closePrivacy").onclick=()=>$("privacyModal").classList.add("hidden");$("privacyModal").onclick=e=>{if(e.target===$("privacyModal"))$("privacyModal").classList.add("hidden")};

$("loginForm").onsubmit=async e=>{
  e.preventDefault();
  const msg=$("loginMessage"),btn=$("loginBtn");
  const email=$("loginEmail").value.trim();
  if($("saveLoginId").checked)localStorage.setItem("ipass.savedLoginId",email);
  else localStorage.removeItem("ipass.savedLoginId");
  msg.textContent="";
  btn.disabled=true;
  btn.textContent="로그인 중...";
  try{
    await window.EHSAuth.signIn(email,$("loginPassword").value);
    session=window.EHSAuth.readSession();
    const me=await window.EHSApi.request("/api/me");
    await routeAfterLogin(me);
  }catch(err){
    msg.textContent=err.message;
  }finally{
    btn.disabled=false;
    btn.textContent="로그인";
  }
};


let pendingActionResolve=null;

function closeActionModal(result=false){
  $("actionModal").classList.add("hidden");
  const resolver=pendingActionResolve;
  pendingActionResolve=null;
  if(resolver)resolver({confirmed:result,reason:$("actionReason").value.trim()});
}
function askAction({title="확인",message="",confirmText="확인",danger=false,reason=false}={}){
  $("actionModalTitle").textContent=title;
  $("actionModalMessage").textContent=message;
  $("actionModalConfirm").textContent=confirmText;
  $("actionModalConfirm").className=danger?"btn danger":"btn primary-small";
  $("actionReasonWrap").classList.toggle("hidden",!reason);
  $("actionReason").value="";
  $("actionModal").classList.remove("hidden");
  return new Promise(resolve=>{pendingActionResolve=resolve});
}
$("closeActionModal").onclick=()=>closeActionModal(false);
$("actionModalCancel").onclick=()=>closeActionModal(false);
$("actionModalConfirm").onclick=()=>closeActionModal(true);
$("actionModal").onclick=e=>{if(e.target===$("actionModal"))closeActionModal(false)};

function logout(){session=null;currentUser=null;GET_CACHE.clear();GET_INFLIGHT.clear();window.EHSAuth.logout()}
$("logoutBtn").onclick=logout;
async function routeAfterLogin(me){
  if(me.auth_state!=="approved"){
    const stateMessage=me.auth_state==="pending_approval"?"가입 승인 대기중입니다.":me.auth_state==="email_verification_required"?"이메일 인증이 필요합니다.":me.auth_state==="suspended"?"사용 중지된 계정입니다.":"사용할 수 없는 계정입니다.";
    await askAction({title:"로그인 안내",message:stateMessage,confirmText:"확인"});
    logout();
    return;
  }
  currentUser=me.user;
  window.__EHS_PAGE_USER=currentUser;
  document.dispatchEvent(new CustomEvent('ehs:user-ready',{detail:currentUser}));
  $("publicPortal").classList.add("hidden");
  $("app").classList.remove("hidden");
  const displayName=[currentUser.position,currentUser.name].filter(Boolean).join(" ")||currentUser.email||"사용자";
  const company=currentUser.company_name||"협력사";
  $("userLabel").textContent=displayName;
  $("userCompanyLabel").textContent=company;
  $("userDropdownName").textContent=displayName;
  $("rolePill").textContent=currentUser.role==="admin"?"관리자 계정":"협력사 계정";
  setHeaderUnread(Number(currentUser.unread_notification_count||0));
  $("userAvatar").textContent=displayName.trim().slice(0,1).toUpperCase();
  $("homeUserName").textContent=displayName;
  $("portalWelcome").textContent=`${company}의 EHS 업무를 한 화면에서 확인하세요.`;
  document.querySelectorAll('.home-admin-option').forEach(item=>item.classList.toggle('hidden',currentUser.role!=="admin"));
  showPage("portalHome");
  loadPortalHome();
  showLatestNotice("after_login");
}

const PAGE_GROUP={
  portalHome:"home",dashboard:"admin",approvals:"admin",accounts:"admin",notices:"admin",
  partnerHome:"evaluation",evaluation:"evaluation",portalNotices:"communication",faq:"support",
  resources:"support",committee:"ehs",servicePlaceholder:"ehs",notificationCenter:"home"
};
function closeHeaderMenus(){
  $("gnbNav")?.classList.remove("open");
  $("userMenu")?.classList.remove("open");
}
function showPage(name,group){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  $(`page-${name}`)?.classList.add("active");
  const activeGroup=group||PAGE_GROUP[name]||"home";
  document.querySelectorAll(".gnb-item").forEach(n=>n.classList.toggle("active",n.dataset.section===activeGroup));
  document.querySelectorAll(".gnb-home").forEach(n=>n.classList.toggle("active",activeGroup==="home"));
  closeHeaderMenus();
  window.scrollTo(0,0);
}
function navigatePage(name){
  showPage(name);
  if(name==="portalHome")loadPortalHome();
  if(name==="dashboard")loadAdminDashboard();
  if(name==="approvals")loadApprovals();
  if(name==="accounts")loadAccounts();
  if(name==="notices")loadNotices();
  if(name==="partnerHome")loadPartnerHome();
  if(name==="portalNotices")loadPortalNotices();
  if(name==="committee")loadCommittee();
}

function formatHomeDate(){
  const d=new Date();
  const day=["일","월","화","수","목","금","토"][d.getDay()];
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")} (${day})`;
}
function roundScore(v){
  return Math.round(Number(v||0)*10)/10;
}
function formatScore(v){
  if(v==null || Number.isNaN(Number(v)))return "—";
  const n=roundScore(v);
  return Number.isInteger(n)?String(n):n.toFixed(1);
}
function getAnnualGrade(score,complete=true){
  if(!complete || score==null)return {label:"산정 중",cls:"pending"};
  const n=Number(score);
  if(n>=90)return {label:"안전관리 우수협력사",cls:"excellent"};
  if(n>=70)return {label:"적격 수급사",cls:"qualified"};
  return {label:"역량강화대상 협력사",cls:"strengthen"};
}
function ipassSourceBadge(source){
  if(source==="auto")return '<span class="ipass-source auto">자동반영</span>';
  if(source==="manual")return '<span class="ipass-source manual">수동입력</span>';
  return '<span class="ipass-source empty">미입력</span>';
}
function ipassMetric({label,value,unit="",scoreText="",service="",clickable=false,negative=false}){
  return `<div class="ipass-metric ${clickable?"clickable":""}" ${clickable&&service?`onclick="openPortalService('${service}')"`:""}>
    <div class="ipass-metric-label">${esc(label)}</div>
    <div class="ipass-metric-value">${value}<span class="unit">${esc(unit)}</span></div>
    <div class="ipass-metric-score ${negative?"negative":""}">${scoreText}</div>
  </div>`;
}
function projectionCard(title,score,grade,primary=false){
  if(score==null)return "";
  return `<div class="ipass-projection ${primary?"primary":""}"><div class="eyebrow">${esc(title)}</div><div class="score"><b>${formatScore(score)}</b> / 100점</div><div class="grade">${esc(grade||"")}</div></div>`;
}
async function annualApi(year,companyId=""){
  const q=new URLSearchParams({year:String(year)});
  if(companyId)q.set("company_id",companyId);
  return apiCached(`/api/annual-ipass?${q.toString()}`,15000);
}
async function loadAnnualIpassOverview(){
  const box=$("portalIpassOverview");
  if(!box.dataset.loaded)box.innerHTML='<div class="loading">i-PaSS 점수를 불러오는 중...</div>';

  if(currentUser?.role==="admin"){
    box.innerHTML=`<div class="ipass-admin-empty"><div><strong>협력사별 연간 i-PaSS 종합점수</strong><span>i-PaSS 관리에서 협력사를 선택해 상·하반기 점수를 확인하거나 수동 입력할 수 있습니다.</span></div><button class="btn primary-small" type="button" onclick="openPortalService('ipass')">점수 관리</button></div>`;
    box.dataset.loaded="1";
    return;
  }

  try{
    const year=new Date().getFullYear();
    const data=await annualApi(year);
    const a=data.annual||{};
    const first=a.first_half_score;
    const second=a.second_half_score;
    const finalComplete=second!=null;
    const grade=getAnnualGrade(a.final_total,finalComplete);

    const totalLabel=finalComplete?`${year}년 종합점수`:`${year}년 현재 반영점수`;
    const totalScore=finalComplete?a.final_total:a.current_reflected_score;
    const totalMax=finalComplete?100:(a.current_reflected_max||60);

    box.innerHTML=`
      <div class="ipass-score-top">
        <div>
          <div class="ipass-total-label">${esc(totalLabel)}</div>
          <div class="ipass-total-line"><span class="ipass-total-score">${formatScore(totalScore)}</span><span class="ipass-total-unit">/ ${totalMax}점</span></div>
          <span class="ipass-grade ${grade.cls}">${esc(finalComplete?grade.label:"하반기 평가 전")}</span>
        </div>
        <div class="ipass-formula"><div class="ipass-formula-title">연간 i-PaSS 산정기준</div><div class="ipass-formula-text"><b>상반기 40점</b> + <b>하반기 40점</b> + 협의체 참석 10점(불참 1회당 -3점) + 산업재해 10점 − 불합리 적발 건수 × 3점</div></div>
      </div>
      ${!finalComplete&&first!=null?`<div class="ipass-projection-grid">${projectionCard("현재 수준 유지 시",a.maintain_projection,a.maintain_grade,true)}${projectionCard("하반기 만점(40점) 시",a.perfect_projection,a.perfect_grade,false)}</div>`:""}
      <div class="ipass-metric-grid">
        ${ipassMetric({label:"상반기 이행수준평가",value:first==null?"미입력":formatScore(first),unit:first==null?"":" / 40점",scoreText:`${ipassSourceBadge(a.first_half_source)}${a.auto_first_half_score!=null?` 자동산정 ${formatScore(a.auto_first_half_score)}점`:""}`,service:"ipass",clickable:true})}
        ${ipassMetric({label:"하반기 이행수준평가",value:second==null?"미실시":formatScore(second),unit:second==null?"":" / 40점",scoreText:second==null&&first!=null?`현재 수준 가정 ${formatScore(first)}점 · 만점 가정 40점`:`${ipassSourceBadge(a.second_half_source)}${a.auto_second_half_score!=null?` 자동산정 ${formatScore(a.auto_second_half_score)}점`:""}`,service:"ipass",clickable:true})}
        ${ipassMetric({label:"협의체 불참",value:String(a.committee_absence_count||0),unit:"건",scoreText:`참석점수 ${formatScore(a.committee_score)} / 10점 · 확정 협의체 ${Number(a.committee_meeting_count||0)}회`,service:"committee",clickable:true})}
        ${ipassMetric({label:"산업재해 발생 건수",value:String(a.industrial_accident_count||0),unit:"건",scoreText:`재해점수 ${formatScore(a.industrial_accident_score)} / 10점`})}
        ${ipassMetric({label:"불합리 적발 건수",value:String(a.unreasonable_finding_count||0),unit:"건",scoreText:`${Number(a.unreasonable_deduction||0)?`-${formatScore(a.unreasonable_deduction)}점`:"감점 없음"} · 1건당 -3점`,negative:Number(a.unreasonable_deduction||0)>0})}
      </div>`;
    box.dataset.loaded="1";
    setHeaderUnread(0);
  }catch(e){
    box.innerHTML=`<div class="empty">i-PaSS 종합점수를 불러오지 못했습니다.<div class="sub" style="margin-top:6px">연간 점수 DB migration 적용 여부를 확인하세요.</div></div>`;
  }
}
function renderAnnualAdminEditor(a){
  const box=$("annualAdminEditor");
  const sourceText=s=>s==="manual"?"수동입력":s==="auto"?"자동반영":"미입력";
  box.innerHTML=`
    <div class="annual-editor-grid">
      <div class="annual-score-field">
        <div class="label">상반기 이행수준평가 <span class="ipass-source ${a.first_half_source||"empty"}">${sourceText(a.first_half_source)}</span></div>
        <div class="source-line">${a.auto_first_half_score==null?"자동 산정값 없음":`공개 완료 평가 자동값 ${formatScore(a.auto_first_half_score)} / 40점`}</div>
        <div class="annual-score-input-row"><input id="annualFirstScore" type="number" min="0" max="40" step="0.1" value="${a.first_half_score??""}" placeholder="0~40"><button class="btn" id="annualFirstAuto" type="button">자동값 사용</button></div>
        <div class="annual-auto-hint">올해 상반기처럼 기존 자료를 옮길 때는 점수를 직접 입력하고 저장하면 수동값이 우선 적용됩니다.</div>
      </div>
      <div class="annual-score-field">
        <div class="label">하반기 이행수준평가 <span class="ipass-source ${a.second_half_source||"empty"}">${sourceText(a.second_half_source)}</span></div>
        <div class="source-line">${a.auto_second_half_score==null?"평가 미실시 또는 공개 전":`공개 완료 평가 자동값 ${formatScore(a.auto_second_half_score)} / 40점`}</div>
        <div class="annual-score-input-row"><input id="annualSecondScore" type="number" min="0" max="40" step="0.1" value="${a.second_half_score??""}" placeholder="미실시"><button class="btn" id="annualSecondAuto" type="button">자동값 사용</button></div>
        <div class="annual-auto-hint">하반기 미실시 시 협력사 화면에는 상반기 점수 유지 가정과 40점 만점 가정이 자동 표시됩니다.</div>
      </div>
    </div>
    <div class="annual-score-actions"><button class="btn primary-small" id="annualSaveBtn" type="button">수동점수 저장</button></div>`;

  $("annualFirstAuto").onclick=()=>saveAnnualAdminScore("first","auto");
  $("annualSecondAuto").onclick=()=>saveAnnualAdminScore("second","auto");
  $("annualSaveBtn").onclick=()=>saveAnnualAdminScore("both","manual");
}
async function loadAnnualAdminScore(){
  const companyId=$("annualCompanySelect")?.value;
  const year=Number($("annualYearInput")?.value||new Date().getFullYear());
  if(!companyId){$("annualAdminEditor").innerHTML='<div class="empty">협력사를 선택하세요.</div>';return}
  $("annualAdminEditor").innerHTML='<div class="loading">연간 점수를 불러오는 중...</div>';
  try{const d=await annualApi(year,companyId);renderAnnualAdminEditor(d.annual||{})}catch(e){$("annualAdminEditor").innerHTML=`<div class="error">${esc(e.message)}</div>`}
}
async function saveAnnualAdminScore(target,mode){
  const companyId=$("annualCompanySelect").value;
  const year=Number($("annualYearInput").value);
  if(!companyId)return;
  const body={};
  if(target==="first"&&mode==="auto")body.first_half_mode="auto";
  if(target==="second"&&mode==="auto")body.second_half_mode="auto";
  if(target==="both"&&mode==="manual"){
    const f=$("annualFirstScore").value.trim(),s=$("annualSecondScore").value.trim();
    if(f!==""){body.first_half_mode="manual";body.first_half_score=Number(f)}
    if(s!==""){body.second_half_mode="manual";body.second_half_score=Number(s)}
    if(f===""&&s===""){await askAction({title:"점수 입력",message:"저장할 상반기 또는 하반기 점수를 입력하세요.",confirmText:"확인"});return}
  }
  try{
    const d=await api(`/api/admin/annual-ipass/${encodeURIComponent(companyId)}/${year}`,{method:"PATCH",body:JSON.stringify(body)});
    renderAnnualAdminEditor(d.annual||{});
  }catch(e){await askAction({title:"저장 실패",message:e.message,confirmText:"확인"})}
}
async function initAnnualAdminManager(targets){
  if(currentUser?.role!=="admin"||!$("annualCompanySelect"))return;
  const map=new Map();
  for(const t of targets||[]){if(t.company_id&&!map.has(t.company_id))map.set(t.company_id,t.company_name||t.company_id)}
  const select=$("annualCompanySelect");
  select.innerHTML='<option value="">협력사를 선택하세요</option>'+[...map.entries()].sort((a,b)=>String(a[1]).localeCompare(String(b[1]),"ko")).map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join("");
  $("annualYearInput").value=String(new Date().getFullYear());
  $("annualLoadBtn").onclick=loadAnnualAdminScore;
  select.onchange=()=>{if(select.value)loadAnnualAdminScore()};
}

async function loadHomeNotices(){
  const listBox=$("homeNoticeList"),banner=$("homeImportantBanner");
  try{
    const data=await publicApiCached("/api/public/notices?placement=after_login",30000);
    const list=data.notices||[];
    const important=list.find(n=>Number(n.is_important)===1)||list[0];
    if(important){
      $("homeImportantTitle").textContent=important.title||"공지사항";
      $("homeImportantDate").textContent=formatNoticeDate(important.created_at);
      banner.classList.add("show");
    }else banner.classList.remove("show");
    listBox.innerHTML=list.length?list.slice(0,4).map(n=>`<div class="notice-home-row" onclick="openPortalService('notices')"><span class="notice-type ${n.is_important?"important":""}">${n.is_important?"중요":"안내"}</span><span class="notice-home-title">${esc(n.title)}</span><span class="notice-home-date">${esc(String(n.created_at||"").slice(0,10))}</span></div>`).join(""):'<div class="empty">등록된 공지사항이 없습니다.</div>';
  }catch(e){
    banner.classList.remove("show");
    listBox.innerHTML='<div class="empty">공지사항을 불러오지 못했습니다.</div>';
  }
}
function loadPortalHome(){
  $("homeDate").textContent=formatHomeDate();
  // Render the home shell immediately, then load independent data in parallel.
  void Promise.allSettled([loadHomeNotices(),loadAnnualIpassOverview()]);
}
function setHeaderUnread(count){
  const b=$("headerUnreadBadge"),n=Number(count||0);
  b.textContent=n>99?"99+":String(n);
  b.classList.toggle("show",n>0);
}

let committeeAdminOptions={companies:[],departments:[]};
let committeeMeetingsCache=[];
const committeeDetailCache=new Map();

function committeeStatusLabel(status){
  const map={present:["참석","present"],absent:["불참","absent"],pending:["확인 전",""]};
  const v=map[status]||map.pending;
  return `<span class="committee-state ${v[1]}">${v[0]}</span>`;
}
function committeeOptions(value){
  return [["pending","선택"],["present","참석"],["absent","불참"]].map(([v,t])=>`<option value="${v}" ${value===v?"selected":""}>${t}</option>`).join("");
}
function initCommitteeYear(){
  const y=$("committeeYear");if(!y)return;
  const now=new Date().getFullYear();
  if(!y.options.length){for(let i=now+1;i>=now-4;i--){const o=document.createElement("option");o.value=String(i);o.textContent=`${i}년`;if(i===now)o.selected=true;y.appendChild(o)}}
  y.onchange=()=>loadCommittee(true);
}
async function loadCommittee(force=false){
  initCommitteeYear();
  const year=Number($("committeeYear")?.value||new Date().getFullYear());
  const content=$("committeeContent"),summary=$("committeeSummary"),createBtn=$("committeeCreateBtn");
  if(!content)return;
  createBtn.classList.toggle("hidden",currentUser?.role!=="admin");
  createBtn.textContent="+ 월 협의체 생성";
  createBtn.onclick=showCommitteeCreateForm;
  if(!content.dataset.loaded)content.innerHTML='<div class="loading">협의체 현황을 불러오는 중...</div>';
  try{
    if(force)invalidateGetCache('/api/committee?');
    const d=await apiCached(`/api/committee?year=${year}`,force?1:8000);
    content.dataset.loaded="1";
    if(currentUser?.role==="admin"){
      committeeAdminOptions=d.options||{companies:[],departments:[]};
      committeeMeetingsCache=d.meetings||[];
      renderCommitteeAdminList(committeeMeetingsCache,year,false);
    }else renderCommitteePartner(d.summary||{},d.meetings||[],year);
  }catch(e){summary.innerHTML="";content.innerHTML=`<div class="error">${esc(e.message)}</div>`}
}
function renderCommitteePartner(s,meetings,year){
  $("committeeSummary").innerHTML=`<div class="committee-score-strip">
    <div class="committee-score-card"><div class="label">협의체 참석점수</div><div class="value">${formatScore(s.score??10)} / 10</div><div class="meta">불참 1회당 -3점</div></div>
    <div class="committee-score-card"><div class="label">대상 협의체</div><div class="value">${Number(s.finalized_meeting_count||0)}회</div><div class="meta">${year}년 나의 대상 회차</div></div>
    <div class="committee-score-card"><div class="label">참석</div><div class="value">${Number(s.present_count||0)}회</div><div class="meta">참석 완료</div></div>
    <div class="committee-score-card"><div class="label">불참</div><div class="value">${Number(s.absence_count||0)}회</div><div class="meta">-${Number(s.absence_count||0)*3}점</div></div>
  </div>`;
  $("committeeContent").innerHTML=meetings.length?`<div class="committee-partner-list">${meetings.map(m=>`<div class="committee-partner-row"><div class="date">${Number(m.meeting_month||String(m.meeting_date||'').slice(5,7))}월</div><div class="title">${esc(m.title||"")}</div><div class="person">${m.attendance_status==="present"?`${esc(m.attendee_position||"")} ${esc(m.attendee_name||"")}`.trim():"-"}</div>${committeeStatusLabel(m.attendance_status)}</div>`).join("")}</div>`:'<div class="committee-empty">올해 확정된 대상 협의체가 없습니다.</div>';
}
function renderCommitteeAdminList(meetings,year,autoOpen=true){
  const used=new Set(meetings.map(m=>Number(m.meeting_month||String(m.meeting_date||"").slice(5,7))));
  $("committeeSummary").innerHTML=`<div class="committee-note">월별 협의체는 <b>1개만</b> 생성됩니다. 각 월마다 대상 협력사와 사내 부서를 직접 선택하고 <b>참석/불참 · 직급 · 성명</b>을 기록합니다. 협력사 불참만 i-PaSS 점수에 반영됩니다.</div>`;
  const content=$("committeeContent");
  content.innerHTML=`<div class="committee-admin-layout"><div class="committee-list"><div class="committee-list-head"><strong>${year}년 협의체</strong><span class="sub">${meetings.length}/12개월</span></div><div id="committeeMeetingList">${meetings.length?meetings.map(m=>`<button class="committee-meeting-item" data-id="${esc(m.id)}" type="button"><div class="title">${Number(m.meeting_month||0)}월 협의체</div><div class="meta">${esc(m.meeting_date)} · <span class="committee-status-badge ${m.status}">${m.status==="finalized"?"확정":"작성중"}</span> · 대상 ${Number(m.partner_target_count||0)}개사 · 불참 ${Number(m.partner_absent_count||0)}개사</div></button>`).join(""):'<div class="committee-empty">등록된 협의체가 없습니다.</div>'}</div></div><div class="committee-editor" id="committeeEditor"><div class="committee-empty">월 협의체를 생성하거나 좌측 회차를 선택하세요.</div></div></div>`;
  content.querySelectorAll(".committee-meeting-item").forEach(btn=>btn.onclick=()=>loadCommitteeMeetingEditor(btn.dataset.id));
  $("committeeCreateBtn").disabled=used.size>=12;
  if(autoOpen&&meetings[0])loadCommitteeMeetingEditor(meetings[0].id);
}
function showCommitteeCreateForm(){
  const editor=$("committeeEditor");if(!editor)return;
  const year=Number($("committeeYear")?.value||new Date().getFullYear());
  const used=new Set(committeeMeetingsCache.map(m=>Number(m.meeting_month||String(m.meeting_date||"").slice(5,7))));
  const months=Array.from({length:12},(_,i)=>i+1).filter(m=>!used.has(m));
  if(!months.length){editor.innerHTML='<div class="committee-empty">12개월 협의체가 모두 등록되어 있습니다.</div>';return}
  const now=new Date();
  const preferred=months.includes(now.getMonth()+1)?now.getMonth()+1:months[0];
  editor.innerHTML=`<div class="committee-editor-head"><strong>${year}년 월 협의체 생성</strong><span class="committee-status-badge draft">신규</span></div><div class="committee-editor-body"><div class="committee-create-grid"><div><label>월</label><select id="committeeCreateMonth">${months.map(m=>`<option value="${m}" ${m===preferred?"selected":""}>${m}월</option>`).join("")}</select></div><div><label>개최일</label><input id="committeeCreateDate" type="date"></div></div><div class="committee-note">월별 1개만 생성됩니다. 생성 후 해당 월의 대상 협력사와 부서를 선택하세요.</div><div class="committee-actions"><button class="btn primary-small" id="committeeCreateConfirm" type="button">생성</button></div></div>`;
  const setDate=()=>{const m=Number($("committeeCreateMonth").value);const mm=String(m).padStart(2,"0");const d=(year===now.getFullYear()&&m===now.getMonth()+1)?String(now.getDate()).padStart(2,"0"):"01";$("committeeCreateDate").value=`${year}-${mm}-${d}`};
  $("committeeCreateMonth").onchange=setDate;setDate();
  $("committeeCreateConfirm").onclick=createCommitteeMeeting;
}
async function createCommitteeMeeting(){
  const year=Number($("committeeYear")?.value||new Date().getFullYear());
  const month=Number($("committeeCreateMonth")?.value);
  const meeting_date=$("committeeCreateDate")?.value;
  const btn=$("committeeCreateConfirm");if(btn){btn.disabled=true;btn.textContent="생성 중..."}
  try{
    const d=await api('/api/admin/committee',{method:'POST',body:JSON.stringify({year,month,meeting_date})});
    invalidateGetCache('/api/committee?');
    committeeMeetingsCache=[{...d.meeting,partner_target_count:0,partner_absent_count:0,partner_present_count:0,partner_pending_count:0,department_target_count:0},...committeeMeetingsCache].sort((a,b)=>Number(b.meeting_month)-Number(a.meeting_month));
    committeeDetailCache.set(d.meeting.id,d.meeting);
    renderCommitteeAdminList(committeeMeetingsCache,year,false);
    renderCommitteeEditor(d.meeting);
  }catch(e){await askAction({title:"등록 실패",message:e.message,confirmText:"확인"})}
  finally{if(btn){btn.disabled=false;btn.textContent="생성"}}
}
async function loadCommitteeMeetingEditor(id){
  const editor=$("committeeEditor");if(!editor)return;
  document.querySelectorAll(".committee-meeting-item").forEach(b=>b.classList.toggle("active",b.dataset.id===id));
  const local=committeeDetailCache.get(id);
  if(local){renderCommitteeEditor(local);return}
  editor.innerHTML='<div class="loading">상세를 불러오는 중...</div>';
  try{const d=await apiCached(`/api/admin/committee/${encodeURIComponent(id)}`,15000);committeeDetailCache.set(id,d.meeting);renderCommitteeEditor(d.meeting)}catch(e){editor.innerHTML=`<div class="error">${esc(e.message)}</div>`}
}
function renderCommitteeTargetRows(options,selected,type){
  const map=new Map((selected||[]).map(r=>[type==="partner"?r.company_id:r.department_id,r]));
  return (options||[]).map(o=>{
    const id=o.id,name=type==="partner"?o.company_name:o.department_name,row=map.get(id),checked=!!row,status=row?.attendance_status||"pending";
    const position=row?.attendee_position||"",personName=row?.attendee_name||"";
    return `<div class="committee-target-row" data-target-id="${esc(id)}"><label class="committee-target-check"><input type="checkbox" class="target-check" ${checked?"checked":""}><span>${esc(name)}</span></label><select class="committee-att-status" ${checked?"":"disabled"}>${committeeOptions(status)}</select><input class="committee-person-input committee-position" type="text" placeholder="직급" value="${esc(position)}" ${checked?"":"disabled"}><input class="committee-person-input committee-name" type="text" placeholder="성명" value="${esc(personName)}" ${checked?"":"disabled"}></div>`;
  }).join("");
}
function bindCommitteeTargetRows(containerId){
  const box=$(containerId);if(!box)return;
  box.querySelectorAll('.committee-target-row').forEach(row=>{
    const check=row.querySelector('.target-check'),select=row.querySelector('.committee-att-status');
    const inputs=[...row.querySelectorAll('.committee-person-input')];
    const sync=()=>{
      select.disabled=!check.checked;
      inputs.forEach(i=>i.disabled=!check.checked);
      if(!check.checked){select.value='pending';inputs.forEach(i=>i.value='')}
    };
    check.onchange=sync;
    sync();
  });
}
function renderCommitteeEditor(m){
  const editor=$("committeeEditor");
  const month=Number(m.meeting_month||String(m.meeting_date||"").slice(5,7));
  editor.innerHTML=`<div class="committee-editor-head"><strong>${month}월 안전보건협의체</strong><span class="committee-status-badge ${m.status}">${m.status==="finalized"?"확정":"작성중"}</span></div><div class="committee-editor-body">
    <div class="committee-meeting-fields simple"><div><label>개최일</label><input id="committeeMeetingDate" type="date" value="${esc(m.meeting_date||"")}"></div><div class="wide"><label>비고</label><textarea id="committeeMeetingNote" placeholder="필요한 메모만 입력하세요.">${esc(m.note||"")}</textarea></div></div>
    <div class="committee-subhead"><h3>대상 협력사</h3><span>월마다 직접 선택 · 참석 시 직급/성명 입력 · 불참 1회당 -3점</span></div>
    <div class="committee-batch"><button class="btn" type="button" onclick="committeeSetAll('committeePartnerRows','present')">선택 대상 모두 참석</button><button class="btn" type="button" onclick="committeeClearTargets('committeePartnerRows')">선택 해제</button></div>
    <div class="committee-target-grid" id="committeePartnerRows">${renderCommitteeTargetRows(committeeAdminOptions.companies,m.partners,'partner')}</div>
    <div class="committee-subhead"><h3>대상 사내 부서</h3><span>월마다 직접 선택 · 참석 시 직급/성명 입력 · 점수 미적용</span></div>
    <div class="committee-batch"><button class="btn" type="button" onclick="committeeSetAll('committeeDepartmentRows','present')">선택 대상 모두 참석</button><button class="btn" type="button" onclick="committeeClearTargets('committeeDepartmentRows')">선택 해제</button></div>
    <div class="committee-target-grid departments" id="committeeDepartmentRows">${renderCommitteeTargetRows(committeeAdminOptions.departments,m.departments,'department')}</div>
    <div class="committee-note">선택하지 않은 협력사·부서는 해당 월 협의체 대상이 아닙니다. 참석 대상은 직급과 성명을 입력해야 확정할 수 있으며, 협력사의 불참만 i-PaSS 점수에 반영됩니다.</div>
    <div class="committee-actions"><button class="btn danger" id="committeeDelete" type="button">회차 삭제</button><span class="committee-action-spacer"></span><span class="committee-save-state" id="committeeSaveState"></span><button class="btn" id="committeeSaveDraft" type="button">${m.status==="finalized"?"수정 저장":"임시저장"}</button><button class="btn primary-small" id="committeeFinalize" type="button">${m.status==="finalized"?"확정 내용 저장":"회의 확정"}</button></div>
  </div>`;
  bindCommitteeTargetRows('committeePartnerRows');bindCommitteeTargetRows('committeeDepartmentRows');
  $("committeeSaveDraft").onclick=()=>saveCommitteeMeeting(m.id,false,m.status);
  $("committeeFinalize").onclick=()=>saveCommitteeMeeting(m.id,true,m.status);
  $("committeeDelete").onclick=()=>deleteCommitteeMeeting(m.id,month);
}
function committeeSetAll(containerId,status){
  const box=$(containerId);if(!box)return;
  box.querySelectorAll('.committee-target-row').forEach(row=>{const c=row.querySelector('.target-check'),s=row.querySelector('.committee-att-status');if(c.checked){s.disabled=false;s.value=status}});
}
function committeeClearTargets(containerId){
  const box=$(containerId);if(!box)return;
  box.querySelectorAll('.committee-target-row').forEach(row=>{const c=row.querySelector('.target-check'),s=row.querySelector('.committee-att-status');c.checked=false;s.value='pending';s.disabled=true;row.querySelectorAll('.committee-person-input').forEach(i=>{i.value='';i.disabled=true})});
}
function collectCommitteeRows(){
  const collect=(containerId,key)=>[...document.querySelectorAll(`#${containerId} .committee-target-row`)]
    .filter(row=>row.querySelector('.target-check').checked)
    .map(row=>({
      [key]:row.dataset.targetId,
      attendance_status:row.querySelector('.committee-att-status').value,
      attendee_position:row.querySelector('.committee-position').value.trim(),
      attendee_name:row.querySelector('.committee-name').value.trim()
    }));
  return {partners:collect('committeePartnerRows','company_id'),departments:collect('committeeDepartmentRows','department_id')};
}
function committeeListEntryFromDetail(m){
  const partners=m.partners||[],departments=m.departments||[];
  return {
    ...m,
    partner_target_count:partners.length,
    partner_present_count:partners.filter(r=>r.attendance_status==="present").length,
    partner_absent_count:partners.filter(r=>r.attendance_status==="absent").length,
    partner_pending_count:partners.filter(r=>r.attendance_status==="pending").length,
    department_target_count:departments.length
  };
}
function updateCommitteeLocalMeeting(detail){
  const row=committeeListEntryFromDetail(detail);
  const idx=committeeMeetingsCache.findIndex(x=>x.id===detail.id);
  if(idx>=0)committeeMeetingsCache[idx]={...committeeMeetingsCache[idx],...row};
  else committeeMeetingsCache.push(row);
  committeeMeetingsCache.sort((a,b)=>Number(b.meeting_month||0)-Number(a.meeting_month||0));
}
function setCommitteeSaving(saving,label=""){
  const a=$("committeeSaveDraft"),b=$("committeeFinalize"),state=$("committeeSaveState");
  if(a)a.disabled=saving;if(b)b.disabled=saving;
  if(state)state.textContent=label;
}
async function saveCommitteeMeeting(id,finalize,currentStatus){
  const rows=collectCommitteeRows();
  const body={meeting_date:$("committeeMeetingDate").value,note:$("committeeMeetingNote").value.trim(),partners:rows.partners,departments:rows.departments,finalize:finalize===true};
  if(!finalize&&currentStatus==="draft")body.status="draft";
  setCommitteeSaving(true,"저장 중...");
  try{
    const d=await api(`/api/admin/committee/${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify(body)});
    invalidateGetCache('/api/committee');invalidateGetCache(`/api/admin/committee/${encodeURIComponent(id)}`);invalidateGetCache('/api/annual-ipass');
    committeeDetailCache.set(id,d.meeting);
    updateCommitteeLocalMeeting(d.meeting);
    const year=Number($("committeeYear")?.value||new Date().getFullYear());
    renderCommitteeAdminList(committeeMeetingsCache,year,false);
    renderCommitteeEditor(d.meeting);
    const state=$("committeeSaveState");if(state)state.textContent=`✓ 저장됨 ${new Date().toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"})}`;
    if(finalize)void loadAnnualIpassOverview();
  }catch(e){
    setCommitteeSaving(false,"");
    await askAction({title:"저장 실패",message:e.message,confirmText:"확인"});
  }
}
async function deleteCommitteeMeeting(id,month){
  const result=await askAction({title:"협의체 삭제",message:`${month}월 협의체를 삭제할까요? 참석기록도 함께 삭제됩니다.`,confirmText:"삭제",danger:true});
  if(!result.confirmed)return;
  const btn=$("committeeDelete");if(btn){btn.disabled=true;btn.textContent="삭제 중..."}
  try{
    await api(`/api/admin/committee/${encodeURIComponent(id)}`,{method:"DELETE"});
    invalidateGetCache('/api/committee');invalidateGetCache(`/api/admin/committee/${encodeURIComponent(id)}`);invalidateGetCache('/api/annual-ipass');
    committeeDetailCache.delete(id);
    committeeMeetingsCache=committeeMeetingsCache.filter(x=>x.id!==id);
    const year=Number($("committeeYear")?.value||new Date().getFullYear());
    renderCommitteeAdminList(committeeMeetingsCache,year,false);
    void loadAnnualIpassOverview();
  }catch(e){
    if(btn){btn.disabled=false;btn.textContent="회차 삭제"}
    await askAction({title:"삭제 실패",message:e.message,confirmText:"확인"});
  }
}

function showServicePlaceholder(service){
  const config={
    committee:{group:"EHS 업무",title:"안전보건협의체 참석 현황",meta:"협의체 일정과 참석 현황을 관리합니다.",icon:"C"},
    photos:{group:"EHS 업무",title:"TBM·작업사진",meta:"현장 TBM 및 작업사진을 등록합니다.",icon:"P"},
    training:{group:"평가·교육",title:"교육 제출 현황",meta:"안전보건 교육자료 제출 현황을 확인합니다.",icon:"T"},
    voc:{group:"소통",title:"VOC 건의",meta:"EHS 관련 문의와 개선 건의를 접수합니다.",icon:"V"}
  }[service];
  if(!config)return;
  $("placeholderGroup").textContent=config.group;
  $("placeholderTitle").textContent=config.title;
  $("placeholderMeta").textContent=config.meta;
  $("placeholderIcon").textContent=config.icon;
  $("placeholderHeading").textContent=`${config.title} UI가 준비되었습니다.`;
  $("placeholderBody").textContent="현재는 서비스 진입 구조와 화면 골격을 먼저 구성했습니다. 다음 단계에서 실제 등록·조회 기능을 연결하면 됩니다.";
  const group={"EHS 업무":"ehs","평가·교육":"evaluation","소통":"communication"}[config.group]||"ehs";
  showPage("servicePlaceholder",group);
}
function openPortalService(service){
  if(service==="ipass"){
    if(currentUser?.role==="admin")navigatePage("dashboard");else navigatePage("partnerHome");
    return;
  }
  if(service==="notices"){location.href="/notices";return}
  if(service==="faq"){location.href="/faq";return}
  if(service==="resources"){location.href="/resources";return}
  if(service==="notifications"){navigatePage("notificationCenter");return}
  if(service==="committee"){location.href="/committee.html";return}
  if(service==="training"){location.href="/education";return}
  if(service==="voc"){location.href="/voc";return}
  showServicePlaceholder(service);
}

async function loadPortalNotices(){
  const box=$("portalNoticeList");
  box.innerHTML='<div class="loading">불러오는 중...</div>';
  try{
    const data=await publicApiCached("/api/public/notices?placement=after_login",30000);
    const list=data.notices||[];
    box.innerHTML=list.length
      ? `<div class="table-wrap"><table><thead><tr><th>구분</th><th>제목</th><th>게시일</th></tr></thead><tbody>${list.map(n=>`<tr><td>${n.is_important?'<span class="tag red">중요</span>':'<span class="tag gray">일반</span>'}</td><td><b>${esc(n.title)}</b><div class="sub" style="margin-top:5px">${esc(n.content||"")}</div></td><td>${esc(String(n.created_at||"").slice(0,10))}</td></tr>`).join("")}</tbody></table></div>`
      : '<div class="empty">등록된 공지사항이 없습니다.</div>';
  }catch(e){
    box.innerHTML=`<div class="error">${esc(e.message)}</div>`;
  }
}

async function loadAdminDashboard(){
  try{
    const data=await apiCached("/api/admin/dashboard-bundle",8000);
    const cycle=data.cycles?.[0];
    if(cycle)$("cycleText").textContent=`${cycle.cycle_name} · ${cycle.start_at||"-"} ~ ${cycle.end_at||"-"}`;

    const d=data.dashboard||{};
    const target=Number(d.target_company_count||0);
    const submitted=Number(d.submitted_count||0);
    $("targetCount").textContent=target;
    $("submittedCount").textContent=submitted;
    $("evaluatingCount").textContent=d.evaluating_count??0;
    $("completedCount").textContent=d.completed_count??0;
    $("unreadCount").textContent=d.unread_notification_count??0;
    $("unsubmittedCount").textContent=Math.max(0,target-submitted);
    setHeaderUnread(Number(d.unread_notification_count||0));

    const targets=data.targets||[];
    await initAnnualAdminManager(targets);
    const list=targets.filter(x=>Number(x.is_selected)===1);
    $("companyTable").innerHTML=list.length
      ? `<div class="table-wrap"><table class="mobile-stack"><thead><tr><th>협력사</th><th>업종</th><th>상시근로자</th><th>상태</th></tr></thead><tbody>${list.map(x=>`<tr class="clickable" onclick="openEvaluation('${String(x.id).replaceAll("'","\\'")}')"><td data-label="협력사"><b>${esc(x.company_name)}</b></td><td data-label="업종">${esc(x.industry_name||"-")}</td><td data-label="상시근로자">${x.worker_count??"-"}</td><td data-label="상태">${tag(x.status)}</td></tr>`).join("")}</tbody></table></div>`
      : '<div class="empty">평가대상이 없습니다.</div>';
  }catch(e){
    $("companyTable").innerHTML=`<div class="error">${esc(e.message)}</div>`;
  }
}
async function registrationData(force=false){
  if(force)invalidateGetCache('/api/admin/registrations');
  return apiCached('/api/admin/registrations',force?1:8000);
}
function renderRegistrationViews(data){
  const all=data.registrations||[];
  const pending=all.filter(x=>x.approval_status==="pending");
  if($("approvalTable"))$("approvalTable").innerHTML=pending.length?renderRegTable(pending,true):'<div class="empty">승인 대기 회원이 없습니다.</div>';
  if($("accountTable"))$("accountTable").innerHTML=all.length?renderRegTable(all,false):'<div class="empty">등록된 협력사 계정이 없습니다.</div>';
}
async function loadApprovals(){try{renderRegistrationViews(await registrationData())}catch(e){$("approvalTable").innerHTML=`<div class="error">${esc(e.message)}</div>`}}
async function loadAccounts(){try{renderRegistrationViews(await registrationData())}catch(e){$("accountTable").innerHTML=`<div class="error">${esc(e.message)}</div>`}}
function renderRegTable(list,approvalOnly){
  return `<div class="table-wrap"><table class="mobile-stack"><thead><tr><th>회사명</th><th>이름</th><th>직급</th><th>연락처</th><th>이메일</th><th>가입일</th>${approvalOnly?"":"<th>상태</th>"}<th>처리</th></tr></thead><tbody>${list.map(x=>`<tr><td data-label="회사명">${esc(x.company_name||"-")}</td><td data-label="이름">${esc(x.name)}</td><td data-label="직급">${esc(x.position)}</td><td data-label="연락처">${esc(x.phone)}</td><td data-label="이메일">${esc(x.email)}</td><td data-label="가입일">${esc(String(x.created_at||"-").slice(0,10))}</td>${approvalOnly?"":`<td data-label="상태">${tag(x.approval_status)}</td>`}<td data-label="처리"><div class="toolbar">${x.approval_status!=="approved"?`<button class="btn primary-small" onclick="accountAction('${x.id}','approve','${String(x.name||"").replaceAll("'","\\'")}')">승인</button>`:""}${x.approval_status==="pending"?`<button class="btn danger" onclick="accountAction('${x.id}','reject','${String(x.name||"").replaceAll("'","\\'")}')">반려</button>`:""}${x.approval_status==="approved"?`<button class="btn danger" onclick="accountAction('${x.id}','suspend','${String(x.name||"").replaceAll("'","\\'")}')">사용중지</button>`:""}</div></td></tr>`).join("")}</tbody></table></div>`;
}
async function accountAction(id,action,name=""){
  const labels={approve:["회원 승인",`${name||"선택한 회원"} 계정을 승인하시겠습니까?`,"승인",false,false],reject:["회원 반려",`${name||"선택한 회원"} 가입 신청을 반려하시겠습니까?`,"반려",true,true],suspend:["계정 사용중지",`${name||"선택한 회원"} 계정을 사용중지하시겠습니까?`,"사용중지",true,false]};
  const cfg=labels[action];
  if(!cfg)return;
  const result=await askAction({title:cfg[0],message:cfg[1],confirmText:cfg[2],danger:cfg[3],reason:cfg[4]});
  if(!result.confirmed)return;
  await api(`/api/admin/registrations/${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify({action,reason:result.reason||""})});
  renderRegistrationViews(await registrationData(true));
}
async function loadNotices(){const data=await api("/api/admin/notices"),list=data.notices||[];$("noticeAdminList").innerHTML=list.length?`<div class="table-wrap"><table><thead><tr><th>제목</th><th>중요</th><th>로그인</th><th>로그인 후</th><th>상태</th><th>작업</th></tr></thead><tbody>${list.map(n=>`<tr><td>${esc(n.title)}</td><td>${n.is_important?"Y":"-"}</td><td>${n.show_on_login?"Y":"-"}</td><td>${n.show_after_login?"Y":"-"}</td><td>${n.is_active?"게시":"중지"}</td><td><button class="btn danger" onclick="deleteNotice('${n.id}')">삭제</button></td></tr>`).join("")}</tbody></table></div>`:'<div class="empty">등록된 공지가 없습니다.</div>'}
$("createNotice").onclick=async()=>{await api("/api/admin/notices",{method:"POST",body:JSON.stringify({title:$("noticeTitle").value,content:$("noticeContent").value,is_important:$("noticeImportant").checked,show_on_login:$("noticeLogin").checked,show_after_login:$("noticeAfter").checked})});$("noticeTitle").value="";$("noticeContent").value="";await loadNotices()}
async function deleteNotice(id){
  const result=await askAction({title:"공지 삭제",message:"이 공지사항을 삭제하시겠습니까?",confirmText:"삭제",danger:true});
  if(!result.confirmed)return;
  await api(`/api/admin/notices/${encodeURIComponent(id)}`,{method:"DELETE"});
  await loadNotices();
}
async function loadPartnerHome(){
  try{
    const d=await api("/api/my/evaluations"),list=d.evaluations||[];
    $("myEvaluationTable").innerHTML=list.length
      ? `<div class="table-wrap"><table class="mobile-stack"><thead><tr><th>평가회차</th><th>기간</th><th>상태</th></tr></thead><tbody>${list.map(x=>`<tr class="clickable" onclick="openEvaluation('${String(x.id).replaceAll("'","\\'")}')"><td data-label="평가회차"><b>${esc(x.cycle_name)}</b></td><td data-label="기간">${esc((x.start_at||"-")+" ~ "+(x.end_at||"-"))}</td><td data-label="상태">${tag(x.status)}</td></tr>`).join("")}</tbody></table></div>`
      : '<div class="empty">현재 배정된 평가가 없습니다.</div>';
  }catch(e){
    $("myEvaluationTable").innerHTML=`<div class="error">${esc(e.message)}</div>`;
  }
}
async function openEvaluation(id){
  showPage("evaluation");
  $("evaluationItems").innerHTML='<div class="loading">평가항목 불러오는 중...</div>';
  $("evaluationSummary").innerHTML='<span class="meta">불러오는 중...</span>';
  try{
    const d=await api(`/api/evaluations/${encodeURIComponent(id)}`),e=d.evaluation||{},t=e.target||{},items=e.items||[];
    $("evaluationTitle").textContent=`${t.company_name||"협력사"} 평가`;
    $("evaluationSummary").innerHTML=`${tag(t.status)}<span class="meta">${esc(t.cycle_name||"")}</span>${t.industry_name?`<span class="meta">${esc(t.industry_name)}</span>`:""}${t.worker_count!=null?`<span class="meta">상시근로자 ${t.worker_count}명</span>`:""}`;

    $("evaluationItems").innerHTML=items.length
      ? items.map((i,n)=>`<div class="item ${n===0?"open":""}"><div class="item-head" onclick="this.parentElement.classList.toggle('open')"><div><b>${esc(i.item_code||"")} ${esc(i.item_name||"")}</b> <span class="tag blue">배점 ${i.max_score??0}점</span> ${Number(i.applicable)===0?'<span class="tag gray">N/A</span>':""}</div><div aria-hidden="true">⌄</div></div><div class="item-body"><div class="guide"><b>제출 가이드</b><br>${esc(i.guide_text||"등록된 가이드 없음")}</div><div class="detail"><div class="box"><b>협력사 설명</b><p>${esc(i.description||"등록된 설명 없음")}</p></div><div class="box"><b>평가 결과</b><p>${i.earned_score==null?"최종 공개 전":`${i.earned_score} / ${i.max_score_snapshot??i.max_score??0}점`}</p><p>${esc(i.evaluation_comment||"")}</p></div></div></div></div>`).join("")
      : '<div class="empty">등록된 평가항목이 없습니다.</div>';
  }catch(e){
    $("evaluationSummary").innerHTML="";
    $("evaluationItems").innerHTML=`<div class="error">${esc(e.message)}</div>`;
  }
}
$("backBtn").onclick=()=>navigatePage(currentUser?.role==="admin"?"dashboard":"partnerHome");


$("mobileMenuBtn").onclick=e=>{e.stopPropagation();$("gnbNav").classList.toggle("open");$("userMenu").classList.remove("open")};
$("userMenuBtn").onclick=e=>{e.stopPropagation();$("userMenu").classList.toggle("open");$("gnbNav").classList.remove("open")};
$("notificationBtn").onclick=()=>navigatePage("notificationCenter");
document.addEventListener("click",e=>{if(!$("userMenu").contains(e.target))$("userMenu").classList.remove("open");if(!$("gnbNav").contains(e.target)&&e.target!==$("mobileMenuBtn"))$("gnbNav").classList.remove("open")});

(async function boot(){
  const savedId=localStorage.getItem("ipass.savedLoginId")||"";
  if(savedId){$("loginEmail").value=savedId;$("saveLoginId").checked=true;}
  showLatestNotice("login");try{if(window.EHSAuth.readSession()){session=window.EHSAuth.readSession();const me=await window.EHSApi.request("/api/me");await routeAfterLogin(me)}}catch(e){if(e?.status===401){window.EHSAuth.clearSession();location.replace("/")}else console.error("session restore failed",e)}})();
