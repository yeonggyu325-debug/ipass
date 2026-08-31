import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const common = await readFile(new URL('../public/ehs-common.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/ehs-common.css', import.meta.url), 'utf8');
const home = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const content = await readFile(new URL('../public/content-hub.html', import.meta.url), 'utf8');
const worker = await readFile(new URL('../src/worker-v20.js', import.meta.url), 'utf8');
const faq = await readFile(new URL('../public/faq.html', import.meta.url), 'utf8');

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
assert.ok(common.includes('Cloudflare R2 저장공간') && css.includes('.ehs-storage-capacity'), '관리자 저장공간 UI가 필요');
assert.ok(worker.includes("path==='/faq'"), '독립 FAQ 라우트가 필요');
assert.ok(faq.includes('<h1>FAQ</h1>'), 'FAQ 페이지가 필요');
assert.ok(!common.includes('>포털 홈</a>'), '사용자 메뉴의 홈 버튼은 제거되어야 함');

console.log(JSON.stringify({success:true,services:services.length,single_board_pages:true,admin_storage_ui:true,faq_route:true}));
