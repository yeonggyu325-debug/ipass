import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const paths = {
  page: 'public/content-hub.html',
  home: 'public/index.html',
  preview: 'public/attachment-preview.js',
  api: 'src/portal-content.js',
  worker: 'src/worker-v20.js',
  migration: 'migrations/0010_portal_content.sql',
  config: 'wrangler.jsonc',
  package: 'package.json'
};
const files = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, 'utf8')])));
const requireText = (source, value, label = value) => { if (!source.includes(value)) throw new Error(`공지·자료실 검증 실패: ${label}`); };

for (const table of ['safety_resources_v2', 'portal_content_files_v2', 'portal_content_preview_tickets_v2', 'portal_content_logs_v2']) {
  requireText(files.migration, `CREATE TABLE IF NOT EXISTS ${table}`, `${table} 테이블 누락`);
}
for (const category of ['guide', 'form', 'education', 'law', 'other']) requireText(files.api, `'${category}'`, `${category} 분류 누락`);
for (const extension of ['pdf', 'hwp', 'hwpx', 'xls', 'xlsx', 'doc', 'docx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'webp']) {
  requireText(files.api, `'${extension}'`, `${extension} 업로드 허용 누락`);
}
requireText(files.api, 'inspectFile(file', '파일 시그니처 검사 누락');
requireText(files.api, 'normalizeKstDate', '한국시간 게시시간 변환 누락');
requireText(files.api, "if (!title) return { error: '제목을 입력하세요.'", '공지 제목 단독 필수검증 누락');
requireText(files.api, 'file.stream()', 'R2 스트리밍 업로드 누락');
requireText(files.api, 'PREVIEW_TICKET_MINUTES = 5', '단기 미리보기 권한 누락');
requireText(files.api, "user.role !== 'admin'", '관리자 쓰기 권한 누락');
requireText(files.page, 'navigator.clipboard.read()', '클립보드 이미지 읽기 누락');
requireText(files.page, '게시 시작 (한국시간)', '한국시간 게시 입력 표시 누락');
requireText(files.page, '내용 없이 제목만으로도 등록할 수 있습니다.', '공지 내용 선택입력 누락');
requireText(files.page, "document.addEventListener('paste'", 'Ctrl+V 이미지 처리 누락');
requireText(files.page, 'object-fit:contain', '원본비율 이미지 표시 누락');
requireText(files.page, 'window.AttachmentPreview.init', '공통 첨부 웹뷰어 누락');
requireText(files.home, '일주일 동안 보지 않기', '7일 숨김 UI 누락');
requireText(files.home, 'Date.now()+7*24*60*60*1000', '7일 숨김 만료 계산 누락');
requireText(files.home, 'noticeImagePlus', '공지 이미지 확대 누락');
requireText(files.home, 'noticeImageMinus', '공지 이미지 축소 누락');
requireText(files.home, 'grid-auto-flow:column', '홈 서비스 한 줄 배치 누락');
requireText(files.home, 'border-radius:22px', '홈 서비스 둥근 정사각형 누락');
requireText(files.preview, "'webp'", 'WebP 미리보기 누락');
requireText(files.worker, 'handlePortalContent', '콘텐츠 API Worker 연결 누락');
requireText(files.worker, "path==='/notices'", '공지 페이지 라우팅 누락');
requireText(files.worker, "path==='/resources'", '자료실 페이지 라우팅 누락');
requireText(files.config, '"/notices"', '공지 Worker 우선 경로 누락');
requireText(files.config, '"/resources"', '자료실 Worker 우선 경로 누락');
requireText(files.package, '"verify:content"', '검증 명령 누락');

const inlineScript = [...files.page.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1] || '';
new Function(inlineScript);
const homeScript = [...files.home.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1] || '';
new Function(homeScript);

const staticMarkup = files.page.replace(/<script[\s\S]*?<\/script>/g, '');
const ids = [...staticMarkup.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
assert.deepEqual([...new Set(ids)].length, ids.length, '콘텐츠 화면에 중복 DOM id가 있습니다.');

const db = new DatabaseSync(':memory:');
db.exec(files.migration);
db.prepare(`INSERT INTO safety_resources_v2 (id,category,title,description,is_pinned) VALUES ('r1','guide','안전 가이드','설명',1)`).run();
db.prepare(`INSERT INTO portal_content_files_v2 (id,owner_type,owner_id,file_role,object_key,file_name,content_type,file_size) VALUES ('f1','resource','r1','attachment','key','guide.pdf','application/pdf',100)`).run();
assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM portal_content_files_v2 WHERE owner_type='resource' AND owner_id='r1'`).get().count, 1);
assert.throws(() => db.prepare(`INSERT INTO safety_resources_v2 (id,category,title) VALUES ('bad','invalid','x')`).run());

console.log(JSON.stringify({
  success: true,
  content_tables: 4,
  resource_categories: 5,
  allowed_extensions: 13,
  clipboard_popup: true,
  seven_day_dismissal: true,
  image_zoom: true,
  shared_preview: true,
  dom_ids: ids.length
}));
