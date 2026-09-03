import { test, expect } from '@playwright/test';

const future=Date.now()+60*60*1000;

function session(uid){return{idToken:`test-token-${uid}`,refreshToken:'test-refresh',expiresAt:future,email:`${uid}@example.test`,uid}}
function user(role){return role==='admin'?{
  id:'admin-account',role:'admin',email:'admin@example.test',name:'관리자',position:'부장',company_id:null,company_name:null,approval_status:'approved',unread_notification_count:2
}:{
  id:'partner-account',role:'partner',email:'partner@example.test',name:'홍길동',position:'팀장',company_id:'company-1',company_name:'테스트협력사',industry_name:'전기장비 제조업',approval_status:'approved',unread_notification_count:1
}}
function json(route,data,status=200){return route.fulfill({status,contentType:'application/json;charset=utf-8',body:JSON.stringify(data)})}

async function mockPortal(page,role){
  const account=user(role);
  await page.addInitScript(({accountSession})=>sessionStorage.setItem('ipass.session.v10',JSON.stringify(accountSession)),{accountSession:session(role)});
  await page.route('**/api/**',route=>{
    const url=new URL(route.request().url()),path=url.pathname,method=route.request().method();
    if(path==='/api/me')return json(route,{success:true,auth_state:'approved',user:account});
    if(path==='/api/public/companies')return json(route,{success:true,companies:[]});
    if(path==='/api/public/notices')return json(route,{success:true,notices:[]});
    if(path==='/api/admin/dashboard-bundle')return json(route,{success:true,dashboard:{target_company_count:2,submitted_count:1,evaluating_count:0,completed_count:0},cycles:[],targets:[]});
    if(path==='/api/admin/evaluation-management')return json(route,{success:true,templates:[],template:null,policy:{first_half_exempt_enabled:1,excellence_threshold:90,exempt_second_half_weight:80},validation:{valid:false,errors:['평가표가 없습니다.'],score_total:0,bonus_total:0}});
    if(path==='/api/admin/evaluation-runtime')return json(route,{success:true,cycles:[],templates:[],cycle:null,companies:[],settings:null,policy:{excellence_threshold:90,exempt_second_half_weight:80}});
    if(path==='/api/annual-ipass')return json(route,{success:true,annual:{year:new Date().getFullYear(),current_reflected_score:0,current_reflected_max:60,final_total:null,first_half_score:null,second_half_score:null,committee_score:0,industrial_accident_score:10,first_half_weight:40,second_half_weight:40,committee_weight:10,industrial_accident_weight:10}});
    if(path==='/api/my/evaluations')return json(route,{success:true,evaluations:[]});
    if(path==='/api/notifications')return json(route,method==='PATCH'?{success:true,unread_count:0}:{success:true,unread_count:role==='admin'?2:1,notifications:[]});
    if(path==='/api/admin/storage-status')return json(route,{success:true,storage:{global:{used_bytes:0,remaining_bytes:9126805504,limit_gb:8.5,percent:0},file_count:0}});
    if(path==='/api/admin/registrations')return json(route,{success:true,registrations:[]});
    if(path==='/api/admin/system/summary')return json(route,{success:true,generated_at:new Date().toISOString(),diagnostics:{checks:{d1:true,r2:true,assets:true,analytics:true},missing_tables:[]},database:{schema_version:'0013',fast_path_ready:true,indexes:{installed:[],required:[],missing:[]},rows:{approved_accounts:2,targets:0,target_items:0,undetermined_items:0,active_files:0},active_file_bytes:0},requests:{errors_24h:0,recent:[],slow_routes:[]}});
    if(path==='/api/admin/system/requests')return json(route,{success:true,requests:[]});
    if(path==='/api/committee')return json(route,{success:true,meetings:[],options:{companies:[],departments:[]}});
    if(path==='/api/education')return json(route,{success:true,submissions:[],companies:[]});
    if(path==='/api/voc')return json(route,{success:true,cases:[]});
    if(path==='/api/content/notices')return json(route,{success:true,notices:[]});
    if(path==='/api/content/resources')return json(route,{success:true,resources:[]});
    if(path.includes('/edit-lease'))return json(route,{success:true,lease_token:'test-lease-token',expires_at:new Date(future).toISOString(),minutes:30});
    return json(route,{success:false,error:'Mock route not configured',path},404);
  });
}

async function gotoChecked(page,path){
  const response=await page.goto(path);
  const status=response?.status()||0;
  if(status<200||status>=400)console.log(JSON.stringify({path,status,url:page.url(),title:await page.title(),body:(await page.locator('body').innerText()).slice(0,1200)}));
  expect(status,`${path} should return a successful document`).toBeGreaterThanOrEqual(200);
  expect(status,`${path} should return a successful document`).toBeLessThan(400);
  return response;
}
async function expectHeading(page,path,text=''){
  const headings=page.locator('h1'),count=await headings.count();
  if(!count)console.log(JSON.stringify({path,url:page.url(),title:await page.title(),body:(await page.locator('body').innerText()).slice(0,1800)}));
  await expect(headings.first()).toBeVisible();if(text)await expect(headings.first()).toContainText(text);
}
async function assertNoCodeLeak(page){
  const text=await page.locator('body').innerText();
  expect(text).not.toContain('function renderAdminDetail');expect(text).not.toContain('const blob=new Blob');expect(text).not.toContain('window.after=true');
}

test('로그인 페이지는 앱 화면을 노출하지 않고 독립 운용된다',async({page})=>{
  await gotoChecked(page,'/');await expect(page.locator('#loginForm')).toBeVisible();await expect(page.locator('#loginEmail')).toBeVisible();await expect(page.locator('#loginPassword')).toBeVisible();await expect(page.locator('#app')).toBeHidden();await assertNoCodeLeak(page);
});

test('관리자는 신규 홈과 모든 관리자 경로를 일관되게 사용한다',async({page})=>{
  await mockPortal(page,'admin');const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
  await gotoChecked(page,'/home');await expect(page).toHaveURL(/\/home$/);await expect(page.locator('.home-v3-shell')).toBeVisible();await expect(page.locator('#homeV3Title')).toContainText('관리자님 안녕하세요');await expect(page.locator('#ehsGlobalNav .ehs-global-link')).toHaveCount(8);await expect(page.locator('#ehsGlobalName')).toHaveText('관리자 부장');await expect(page.locator('body')).not.toContainText('admin@example');
  await page.locator('#ehsGlobalUserBtn').click();await expect(page.getByRole('button',{name:'회원가입 승인'})).toBeVisible();await expect(page.getByRole('button',{name:'협력사 계정 관리'})).toBeVisible();await expect(page.getByRole('button',{name:'시스템 상태'})).toBeVisible();
  await gotoChecked(page,'/admin/approvals');await expectHeading(page,'/admin/approvals','회원가입 승인');await gotoChecked(page,'/admin/accounts');await expectHeading(page,'/admin/accounts','협력사 계정 관리');await gotoChecked(page,'/admin/system');await expectHeading(page,'/admin/system','시스템 상태');await gotoChecked(page,'/ipass');await expect(page.locator('#ipassShell')).toBeVisible();
  await gotoChecked(page,'/ipass/templates');await expect(page.locator('iframe')).toHaveCount(0);await expect(page.locator('.side-title strong')).toHaveText('평가표');await expect(page.locator('#workspace')).toContainText('평가표를 선택하세요.');
  await gotoChecked(page,'/ipass/cycles');await expect(page.locator('iframe')).toHaveCount(0);await expect(page.locator('#cycleList')).toContainText('연결된 평가회차가 없습니다.');await expect(page.locator('#workspace')).toContainText('평가회차를 선택하거나 평가표를 연결하세요.');
  await assertNoCodeLeak(page);expect(pageErrors).toEqual([]);
});

test('협력사는 이름 직급 순서와 제한된 메뉴를 사용한다',async({page})=>{
  await mockPortal(page,'partner');const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
  await gotoChecked(page,'/home');await expect(page.locator('.home-v3-shell')).toBeVisible();await expect(page.locator('#ehsGlobalName')).toHaveText('홍길동 팀장');await expect(page.locator('#ehsGlobalCompany')).toHaveText('테스트협력사');await page.locator('#ehsGlobalUserBtn').click();await expect(page.getByRole('button',{name:'회원가입 승인'})).toHaveCount(0);await gotoChecked(page,'/ipass');await expect(page.locator('#ipassShell')).toBeVisible();await expect(page.locator('#sideNav .nav-btn')).toHaveCount(2);await gotoChecked(page,'/ipass/evaluations');await expect(page.locator('#ipassShell')).toBeVisible();await assertNoCodeLeak(page);expect(pageErrors).toEqual([]);
});
