import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readPageBundle } from './page-bundle.mjs';

const [homeBundle,contentBundle,faqBundle,ipassBundle,adminAccountsBundle,adminSystemBundle]=await Promise.all([
  readPageBundle('public/index.html'),readPageBundle('public/content-hub.html'),readPageBundle('public/faq.html'),
  readPageBundle('public/ipass.html'),readPageBundle('public/admin-accounts.html'),readPageBundle('public/admin-system.html')
]);
const [common,css,foundation,toolbar,worker]=await Promise.all([
  readFile(new URL('../public/ehs-common.js',import.meta.url),'utf8'),readFile(new URL('../public/ehs-common.css',import.meta.url),'utf8'),
  readFile(new URL('../public/ehs-ui-foundation.css',import.meta.url),'utf8'),readFile(new URL('../public/global-toolbar-v5.js',import.meta.url),'utf8'),
  readFile(new URL('../src/worker.js',import.meta.url),'utf8')
]);
const home=homeBundle.source,content=contentBundle.source,faq=faqBundle.source,ipass=ipassBundle.source,adminAccounts=adminAccountsBundle.source,adminSystem=adminSystemBundle.source;
const services=[['/home','홈'],['/notices','공지사항'],['/committee','안전보건협의체'],['/education','교육자료'],['/resources','자료실'],['/ipass','i-PaSS'],['/voc','VOC'],['/faq','FAQ']];
for(const [href,label] of services)assert.ok(toolbar.includes(`['${href}','${label}']`),`공통 툴바에 ${label} 필요`);
assert.ok(toolbar.includes('회원가입 승인')&&toolbar.includes('/admin/approvals'),'관리자 회원가입 승인 진입점 필요');assert.ok(toolbar.includes('협력사 계정 관리')&&toolbar.includes('/admin/accounts'),'협력사 계정 관리 진입점 필요');assert.ok(toolbar.includes('시스템 상태')&&toolbar.includes('/admin/system'),'시스템 상태 진입점 필요');assert.ok(toolbar.includes('i-PaSS 관리')&&toolbar.includes('data-admin-route="/ipass"'),'i-PaSS 관리 진입점 필요');
assert.ok(worker.includes("path==='/admin/approvals'||path==='/admin/accounts'")&&worker.includes("path==='/admin/system'"),'독립 관리자 경로 필요');assert.ok(adminAccounts.includes('/api/admin/registrations')&&adminAccounts.includes("user.role!=='admin'"),'계정 화면 권한검증 필요');assert.ok(adminSystem.includes('/api/admin/system/summary')&&adminSystem.includes("requireUser({role:'admin'})"),'시스템 화면 권한검증 필요');
assert.ok(!content.includes('id="noticeTab"')&&!content.includes('id="resourceTab"'),'게시판 교차 탭 제거 필요');assert.ok(!home.includes('<h2>EHS 서비스</h2>'),'구형 서비스 제목 제거 필요');assert.ok(css.includes('border:0!important'),'공통 장식 테두리 최소화 필요');assert.ok(common.includes('Cloudflare R2 저장공간')&&css.includes('.ehs-storage-capacity'),'관리자 저장공간 UI 필요');assert.ok(!common.includes('setInterval('),'공통 런타임 폴링 금지');assert.ok(worker.includes("path==='/faq'"),'독립 FAQ 라우트 필요');assert.ok(faq.includes('<h1>FAQ</h1>'),'FAQ 페이지 필요');
assert.ok(ipass.includes('id="ipassShell"')&&ipass.includes('class="workspace-nav"'),'i-PaSS 전체 폭 메뉴 필요');assert.ok(!ipass.includes('<aside class="side" id="sideNav">')&&!ipass.includes('grid-template-columns:220px'),'구형 좌측 메뉴 제거 필요');assert.ok(ipass.includes('aria-current="page"'),'현재 i-PaSS 탭 접근성 필요');assert.ok(ipass.includes('renderPartnerOverview')&&ipass.includes('renderPartnerEvaluations'),'협력사 요약·이력 화면 분리 필요');assert.ok(ipass.includes('class="partner-overview"')&&ipass.includes('지금 해야 할 평가'),'협력사 업무 요약 필요');assert.ok(ipass.includes('scoreComponent'),'점수 구성요소 필요');assert.ok(!ipass.includes('renderIframe')&&!ipass.includes('embedded=1'),'i-PaSS iframe 제거 필요');
assert.ok(foundation.includes('--ehs-font-page-title: 28px')&&foundation.includes('--ehs-font-body: 14px')&&foundation.includes('--ehs-font-meta: 12px'),'공통 글자 토큰 필요');assert.ok(foundation.includes('--ehs-control-height: 40px')&&foundation.includes('--ehs-control-height-small: 34px')&&foundation.includes('--ehs-control-height-touch: 44px'),'컨트롤 크기 토큰 필요');assert.ok(foundation.includes(':focus-visible')&&foundation.includes('--ehs-focus-ring'),'키보드 포커스 필요');assert.ok(worker.includes('/ehs-ui-foundation.css?v=2')&&worker.includes('/global-toolbar-v5.js?v=8'),'공통 UI 단일 주입 필요');
for(const script of [...homeBundle.scripts,...contentBundle.scripts,...faqBundle.scripts,...ipassBundle.scripts,...adminAccountsBundle.scripts,...adminSystemBundle.scripts])new Function(script);
console.log(JSON.stringify({success:true,services:services.length,admin_routes:true,system_operations:true,consolidated_worker:true,faq_route:true,ipass_full_width:true,ipass_partner_views:true,iframe_free:true,modular_pages:true}));
