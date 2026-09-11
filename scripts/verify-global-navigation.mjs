import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const common = await readFile(new URL('../public/ehs-common.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/ehs-common.css', import.meta.url), 'utf8');
const foundation = await readFile(new URL('../public/ehs-ui-foundation.css', import.meta.url), 'utf8');
const home = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const toolbarV5 = await readFile(new URL('../public/global-toolbar-v5.js', import.meta.url), 'utf8');
const content = await readFile(new URL('../public/content-hub.html', import.meta.url), 'utf8');
const worker = await readFile(new URL('../src/worker.js', import.meta.url), 'utf8');
const shellApi = await readFile(new URL('../src/portal-shell-api.js', import.meta.url), 'utf8');
const faq = await readFile(new URL('../public/faq.html', import.meta.url), 'utf8');
const ipass = await readFile(new URL('../public/ipass.html', import.meta.url), 'utf8');
const adminAccounts = await readFile(new URL('../public/admin-accounts.html', import.meta.url), 'utf8');
const adminPartners = await readFile(new URL('../public/admin-partners.html', import.meta.url), 'utf8');
const signup = await readFile(new URL('../public/signup.html', import.meta.url), 'utf8');

const services = [
  ['/ipass', 'i-PaSS'], ['/committee', '안전보건협의체'], ['/education', '교육자료'],
  ['/voc', 'VOC'], ['/notices', '공지사항'], ['/faq', 'FAQ'], ['/resources', '자료실']
];
for (const [href, label] of services) assert.ok(toolbarV5.includes(`['${href}','${label}']`), `공통 툴바에 ${label} 필요`);
assert.ok(toolbarV5.includes('회원가입 승인') && toolbarV5.includes('/admin/approvals'), '관리자 메뉴에서 독립 회원가입 승인 화면에 접근할 수 있어야 함');
assert.ok(toolbarV5.includes('협력사 계정 관리') && toolbarV5.includes('/admin/accounts'), '관리자 메뉴에서 독립 협력사 계정 관리 화면에 접근할 수 있어야 함');
assert.ok(toolbarV5.includes('협력사 관리') && toolbarV5.includes('/admin-partners.html'), '관리자 메뉴에 협력사 관리 진입점이 필요');
assert.ok(toolbarV5.includes('i-PaSS 관리') && toolbarV5.includes('data-admin-route="/ipass"'), '관리자 메뉴에 i-PaSS 관리 진입점이 필요');
assert.ok(worker.includes("'/admin/approvals'") && worker.includes("'/admin/accounts'"), 'Worker가 독립 계정 관리자 경로를 제공해야 함');
assert.ok(adminAccounts.includes('/api/admin/registrations') && adminAccounts.includes("user.role!=='admin'"), '관리자 계정 화면은 기존 승인 API와 관리자 권한 검증을 사용해야 함');
assert.ok(adminPartners.includes('/api/admin/partners') && adminPartners.includes('role="switch"') && adminPartners.includes("user.role!=='admin'"), '협력사 관리 화면은 대상 토글과 관리자 권한 검증을 사용해야 함');
for (const page of [adminAccounts, adminPartners]) {
  assert.ok(page.includes('font-size:28px') && page.includes('margin-bottom:24px'), '관리자 화면 제목과 섹션 간격은 공통 리듬을 따라야 함');
  assert.ok(page.includes('grid-template-columns:repeat(4,minmax(0,1fr))') && page.includes('gap:12px'), '관리자 요약 카드 그리드는 동일해야 함');
  assert.ok(page.includes('height:40px') && page.includes('border-radius:9px'), '관리자 상단 컨트롤 높이와 모서리는 동일해야 함');
  assert.ok(page.includes('회원가입 승인') && page.includes('협력사 계정') && page.includes('협력사 관리'), '관리자 협력사 화면은 동일한 3개 업무 탭을 제공해야 함');
}
assert.ok(adminPartners.includes('협력사 마스터') && adminPartners.includes('data-setting="${key}"') && adminPartners.includes('signup_enabled'), '협력사 관리가 공통 마스터와 가입 허용 토글을 제공해야 함');
assert.ok(adminPartners.includes('data-filter="all"') && adminPartners.includes('data-filter="target"') && adminPartners.includes('data-filter="signup"'), '협력사 관리에는 전체/협의체 대상/가입 허용 필터가 필요');
assert.ok(adminPartners.includes('data-logo-paste') && adminPartners.includes("addEventListener('paste'") && adminPartners.includes('navigator.clipboard?.read'), '협력사 로고는 버튼과 Ctrl+V 클립보드 붙여넣기를 지원해야 함');
assert.ok(adminPartners.includes('table-layout:fixed') && adminPartners.includes('text-align:center') && adminPartners.includes('justify-content:center'), '협력사 표와 도형 내부 텍스트는 중앙 정렬 규칙을 사용해야 함');
assert.ok(shellApi.includes('/api/partner-logo/') && shellApi.includes('logo_key') && shellApi.includes('EVIDENCE_FILES.put'), '협력사 로고 저장·조회 API가 필요');
assert.ok(toolbarV5.includes('user.logo_url'), '협력사 로그인 후 상단 프로필에 회사 로고가 표시되어야 함');
assert.ok(shellApi.includes("path==='/api/public/companies'") && shellApi.includes('pm.signup_enabled=1'), '회원가입 회사 목록은 협력사 마스터의 가입 허용 회사만 제공해야 함');
assert.ok(shellApi.includes("path==='/api/auth/register'") && shellApi.includes('회원가입이 허용된 협력사만 가입할 수 있습니다.'), '서버에서도 미등록/가입차단 협력사 가입을 거부해야 함');
assert.ok(shellApi.includes('committee_target_preferences') && shellApi.includes("entity_type,entity_id,is_target"), '협력사 협의체 대상 토글은 협의체 대상 설정과 동기화되어야 함');
assert.ok(signup.includes('/api/public/companies') && signup.includes('id="company"'), '회원가입 화면은 서버가 제공하는 협력사 선택 목록을 사용해야 함');
assert.ok(!content.includes('id="noticeTab"') && !content.includes('id="resourceTab"'), '게시판 내부 교차 탭은 제거되어야 함');
assert.ok(!home.includes('<h2>EHS 서비스</h2>'), 'EHS 서비스 문구는 제거되어야 함');
assert.ok(css.includes('border:0!important'), '공통 UI의 장식성 테두리를 최소화해야 함');
assert.ok(common.includes('Cloudflare R2 저장공간') && css.includes('.ehs-storage-capacity'), '관리자 저장공간 UI가 필요');
assert.ok(worker.includes("'/faq'"), '독립 FAQ 라우트가 필요');
assert.ok(faq.includes('<h1>FAQ</h1>'), 'FAQ 페이지가 필요');
assert.ok(ipass.includes('id="ipassShell"') && ipass.includes('class="workspace-nav"'), 'i-PaSS는 전체 폭 상단 업무 메뉴를 사용해야 함');
assert.ok(!ipass.includes('<aside class="side" id="sideNav">') && !ipass.includes('grid-template-columns:220px'), 'i-PaSS 외부 좌측 메뉴는 제거되어야 함');
assert.ok(ipass.includes('aria-current="page"'), 'i-PaSS 현재 업무 탭에 접근성 상태가 필요');
assert.ok(ipass.includes('renderPartnerOverview') && ipass.includes('renderPartnerEvaluations'), '협력사 점수 요약과 평가 이력은 별도 화면이어야 함');
assert.ok(ipass.includes('class="partner-overview"') && ipass.includes('지금 해야 할 평가'), '협력사 첫 화면은 연간 현황과 현재 업무를 함께 보여줘야 함');
assert.ok(ipass.includes('scoreComponent'), '협력사 점수 구성요소를 보여줘야 함');
assert.ok(foundation.includes('--ehs-font-page-title: 28px') && foundation.includes('--ehs-font-body: 14px') && foundation.includes('--ehs-font-meta: 12px'), '공통 글자 크기 토큰이 필요');
assert.ok(foundation.includes('--ehs-control-height: 40px') && foundation.includes('--ehs-control-height-small: 34px') && foundation.includes('--ehs-control-height-touch: 44px'), '일반·소형·모바일 컨트롤 크기가 필요');
assert.ok(foundation.includes(':focus-visible') && foundation.includes('--ehs-focus-ring'), '키보드 포커스 표시가 필요');
assert.ok(worker.includes('/ehs-ui-foundation.css?v=2') && worker.includes('/global-toolbar-v5.js?v=7'), '통합 Worker가 공통 UI 자산을 단일 주입해야 함');
const inlineScripts = [...ipass.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]).filter(source => source.trim());
for (const source of inlineScripts) new Function(source);
for (const source of [adminAccounts, adminPartners].flatMap(page=>[...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match=>match[1]).filter(code=>code.trim()))) new Function(source);
console.log(JSON.stringify({success:true,services:services.length,admin_routes:true,admin_ui_balanced:true,partner_master:true,signup_whitelist:true,committee_partner_sync:true,partner_logo_clipboard:true,consolidated_worker:true,faq_route:true,ipass_full_width:true,ipass_partner_views:true}));
