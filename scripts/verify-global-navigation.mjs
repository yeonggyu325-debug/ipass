import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const common = await readFile(new URL('../public/ehs-common.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/ehs-common.css', import.meta.url), 'utf8');
const foundation = await readFile(new URL('../public/ehs-ui-foundation.css', import.meta.url), 'utf8');
const home = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const content = await readFile(new URL('../public/content-hub.html', import.meta.url), 'utf8');
const worker = await readFile(new URL('../src/worker-v20.js', import.meta.url), 'utf8');
const faq = await readFile(new URL('../public/faq.html', import.meta.url), 'utf8');
const ipass = await readFile(new URL('../public/ipass.html', import.meta.url), 'utf8');

const services = [
  ['/ipass', 'i-PaSS'], ['/committee', '안전보건협의체'], ['/education', '교육 제출'],
  ['/voc', 'VOC'], ['/notices', '공지사항'], ['/faq', 'FAQ'], ['/resources', '안전자료실']
];
for (const [href, label] of services) {
  assert.ok(common.includes(`['${href}','${label}']`), `공통 툴바에 ${label} 필요`);
  assert.ok(home.includes(`href="${href}"`), `홈 툴바에 ${label} 필요`);
}
assert.ok(!content.includes('id="noticeTab"') && !content.includes('id="resourceTab"'), '게시판 내부 교차 탭은 제거되어야 함');
assert.ok(!home.includes('<h2>EHS 서비스</h2>'), 'EHS 서비스 문구는 제거되어야 함');
assert.ok(home.includes('box-shadow:0 15px 14px -16px') && css.includes('border:0!important'), '기능 타일은 테두리 없이 하단 띠 그림자만 사용해야 함');
assert.ok(css.includes('.ehs-global-link.active{box-shadow:none;border:0}'), '상단 활성 메뉴에 선 또는 테두리가 없어야 함');
assert.ok(common.includes('Cloudflare R2 저장공간') && css.includes('.ehs-storage-capacity'), '관리자 저장공간 UI가 필요');
assert.ok(worker.includes("path==='/faq'"), '독립 FAQ 라우트가 필요');
assert.ok(faq.includes('<h1>FAQ</h1>'), 'FAQ 페이지가 필요');
assert.ok(!common.includes('>포털 홈</a>'), '사용자 메뉴의 홈 버튼은 제거되어야 함');
assert.ok(ipass.includes('id="ipassShell"') && ipass.includes('class="workspace-nav"'), 'i-PaSS는 전체 폭 상단 업무 메뉴를 사용해야 함');
assert.ok(!ipass.includes('<aside class="side" id="sideNav">') && !ipass.includes('grid-template-columns:220px'), 'i-PaSS 외부 좌측 메뉴는 제거되어야 함');
assert.ok(ipass.includes('aria-current="page"'), 'i-PaSS 현재 업무 탭에 접근성 상태가 필요');
assert.ok(ipass.includes('renderPartnerOverview') && ipass.includes('renderPartnerEvaluations'), '협력사 점수 요약과 평가 이력은 별도 화면이어야 함');
assert.ok(ipass.includes('<p id="heroMeta"></p></div><nav class="workspace-nav"'), '2단계에서는 i-PaSS 업무 탭을 페이지 제목 영역에 통합해야 함');
assert.ok(!ipass.includes('id="roleBadge"') && !ipass.includes('INTEGRATED i-PaSS WORKSPACE'), '공통 상단바와 중복되는 역할·영문 안내는 제거되어야 함');
assert.ok(ipass.includes('class="partner-overview"') && ipass.includes('지금 해야 할 평가'), '협력사 첫 화면은 연간 현황과 현재 업무를 함께 보여줘야 함');
assert.ok(ipass.includes('scoreComponent') && !ipass.includes('상반기 40점 + 하반기 40점 + 협의체 10점'), '반복 수식 대신 실제 반영 항목을 간결하게 보여줘야 함');
assert.ok(ipass.includes("[['overview','/ipass','요약'],['evaluations','/ipass/evaluations','평가 제출·이력']]") , '협력사 내부 메뉴는 역할이 명확한 두 단계로 정리되어야 함');
assert.ok(css.includes('#ipassShell .workspace-nav') && css.includes('#ipassShell .nav-btn.active'), 'i-PaSS 탭 스타일은 다른 페이지와 충돌하지 않도록 범위가 지정되어야 함');
assert.ok(foundation.includes('--ehs-font-page-title: 28px') && foundation.includes('--ehs-font-body: 14px') && foundation.includes('--ehs-font-meta: 12px'), '공통 글자 크기 토큰이 필요');
assert.ok(foundation.includes('--ehs-control-height: 40px') && foundation.includes('--ehs-control-height-small: 34px') && foundation.includes('--ehs-control-height-touch: 44px'), '일반·소형·모바일 컨트롤 크기가 필요');
assert.ok(foundation.includes('Top-level surfaces: no visible outline or coloured edge') && foundation.includes('border: 0 !important') && foundation.includes('--ehs-shadow-card'), '상위 카드는 장식 테두리 없이 공통 그림자로 구분해야 함');
assert.ok(foundation.includes('Remove legacy blue strips') && foundation.includes('#app .section-head h2::before') && foundation.includes('#ipassShell .nav-btn.active'), '색 띠와 활성 탭 테두리 효과를 제거해야 함');
assert.ok(foundation.includes(':focus-visible') && foundation.includes('--ehs-focus-ring'), '키보드 포커스 표시가 필요');
assert.ok(worker.includes('/ehs-ui-foundation.css?v=2'), 'UI Foundation v2가 모든 보호 화면에 마지막으로 로드되어야 함');
const inlineScripts = [...ipass.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]).filter(source => source.trim());
for (const source of inlineScripts) new Function(source);

console.log(JSON.stringify({success:true,services:services.length,single_board_pages:true,admin_storage_ui:true,faq_route:true,ipass_full_width:true,ipass_partner_views:true}));
