import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const common=await readFile(new URL('../public/ehs-common.js',import.meta.url),'utf8');
const css=await readFile(new URL('../public/ehs-common.css',import.meta.url),'utf8');
const foundation=await readFile(new URL('../public/ehs-ui-foundation.css',import.meta.url),'utf8');
const home=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
const toolbar=await readFile(new URL('../public/global-toolbar-v5.js',import.meta.url),'utf8');
const content=await readFile(new URL('../public/content-hub.html',import.meta.url),'utf8');
const worker=await readFile(new URL('../src/worker.js',import.meta.url),'utf8');
const faq=await readFile(new URL('../public/faq.html',import.meta.url),'utf8');
const ipass=await readFile(new URL('../public/ipass.html',import.meta.url),'utf8');
const adminAccounts=await readFile(new URL('../public/admin-accounts.html',import.meta.url),'utf8');
const adminSystem=await readFile(new URL('../public/admin-system.html',import.meta.url),'utf8');

const services=[
  ['/home','홈'],['/notices','공지사항'],['/committee','안전보건협의체'],['/education','교육자료'],
  ['/resources','자료실'],['/ipass','i-PaSS'],['/voc','VOC'],['/faq','FAQ']
];
for(const [href,label] of services)assert.ok(toolbar.includes(`['${href}','${label}']`),`공통 툴바에 ${label} 필요`);
assert.ok(toolbar.includes('회원가입 승인')&&toolbar.includes('/admin/approvals'),'관리자 메뉴에서 독립 회원가입 승인 화면에 접근할 수 있어야 함');
assert.ok(toolbar.includes('협력사 계정 관리')&&toolbar.includes('/admin/accounts'),'관리자 메뉴에서 독립 협력사 계정 관리 화면에 접근할 수 있어야 함');
assert.ok(toolbar.includes('시스템 상태')&&toolbar.includes('/admin/system'),'관리자 메뉴에서 시스템 상태 화면에 접근할 수 있어야 함');
assert.ok(toolbar.includes('i-PaSS 관리')&&toolbar.includes('data-admin-route="/ipass"'),'관리자 메뉴에 i-PaSS 관리 진입점이 필요');
assert.ok(worker.includes("path==='/admin/approvals'||path==='/admin/accounts'")&&worker.includes("path==='/admin/system'"),'Worker가 독립 관리자 경로를 제공해야 함');
assert.ok(adminAccounts.includes('/api/admin/registrations')&&adminAccounts.includes("user.role!=='admin'"),'관리자 계정 화면은 기존 승인 API와 관리자 권한 검증을 사용해야 함');
assert.ok(adminSystem.includes('/api/admin/system/summary')&&adminSystem.includes("requireUser({role:'admin'})"),'시스템 상태 화면은 관리자 진단 API를 사용해야 함');
assert.ok(!content.includes('id="noticeTab"')&&!content.includes('id="resourceTab"'),'게시판 내부 교차 탭은 제거되어야 함');
assert.ok(!home.includes('<h2>EHS 서비스</h2>'),'EHS 서비스 문구는 제거되어야 함');
assert.ok(css.includes('border:0!important'),'공통 UI의 장식성 테두리를 최소화해야 함');
assert.ok(common.includes('Cloudflare R2 저장공간')&&css.includes('.ehs-storage-capacity'),'관리자 저장공간 UI가 필요');
assert.ok(!common.includes('setInterval('),'공통 런타임은 반복 폴링을 사용하지 않아야 함');
assert.ok(worker.includes("path==='/faq'"),'독립 FAQ 라우트가 필요');
assert.ok(faq.includes('<h1>FAQ</h1>'),'FAQ 페이지가 필요');
assert.ok(ipass.includes('id="ipassShell"')&&ipass.includes('class="workspace-nav"'),'i-PaSS는 전체 폭 상단 업무 메뉴를 사용해야 함');
assert.ok(!ipass.includes('<aside class="side" id="sideNav">')&&!ipass.includes('grid-template-columns:220px'),'i-PaSS 외부 좌측 메뉴는 제거되어야 함');
assert.ok(ipass.includes('aria-current="page"'),'i-PaSS 현재 업무 탭에 접근성 상태가 필요');
assert.ok(ipass.includes('renderPartnerOverview')&&ipass.includes('renderPartnerEvaluations'),'협력사 점수 요약과 평가 이력은 별도 화면이어야 함');
assert.ok(ipass.includes('class="partner-overview"')&&ipass.includes('지금 해야 할 평가'),'협력사 첫 화면은 연간 현황과 현재 업무를 함께 보여줘야 함');
assert.ok(ipass.includes('scoreComponent'),'협력사 점수 구성요소를 보여줘야 함');
assert.ok(!ipass.includes('renderIframe')&&!ipass.includes('embedded=1'),'i-PaSS 관리 화면은 iframe을 사용하지 않아야 함');
assert.ok(foundation.includes('--ehs-font-page-title: 28px')&&foundation.includes('--ehs-font-body: 14px')&&foundation.includes('--ehs-font-meta: 12px'),'공통 글자 크기 토큰이 필요');
assert.ok(foundation.includes('--ehs-control-height: 40px')&&foundation.includes('--ehs-control-height-small: 34px')&&foundation.includes('--ehs-control-height-touch: 44px'),'일반·소형·모바일 컨트롤 크기가 필요');
assert.ok(foundation.includes(':focus-visible')&&foundation.includes('--ehs-focus-ring'),'키보드 포커스 표시가 필요');
assert.ok(worker.includes('/ehs-ui-foundation.css?v=2')&&worker.includes('/global-toolbar-v5.js?v=8'),'통합 Worker가 공통 UI 자산을 단일 주입해야 함');
const inlineScripts=[...ipass.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match=>match[1]).filter(source=>source.trim());
for(const source of inlineScripts)new Function(source);
console.log(JSON.stringify({success:true,services:services.length,admin_routes:true,system_operations:true,consolidated_worker:true,faq_route:true,ipass_full_width:true,ipass_partner_views:true,iframe_free:true}));
