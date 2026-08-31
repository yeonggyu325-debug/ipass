import { readFile } from 'node:fs/promises';

const files = Object.fromEntries(await Promise.all([
  ['page', 'public/education.html'],
  ['home', 'public/index.html'],
  ['api', 'src/education-submission.js'],
  ['worker', 'src/worker-v20.js'],
  ['migration', 'migrations/0008_education_submissions.sql'],
  ['config', 'wrangler.jsonc']
].map(async ([key, path]) => [key, await readFile(path, 'utf8')])));

function requireText(source, value, label = value) {
  if (!source.includes(value)) throw new Error(`교육 제출 검증 실패: ${label}`);
}

for (const table of ['education_submissions', 'education_submission_files', 'education_preview_tickets', 'education_submission_logs']) {
  requireText(files.migration, `CREATE TABLE IF NOT EXISTS ${table}`, `${table} 테이블 누락`);
}
for (const status of ['overdue_missing', 'draft', 'under_review', 'approved', 'changes_requested']) {
  requireText(files.api, `'${status}'`, `${status} 상태 누락`);
  requireText(files.page, `${status}`, `${status} 화면 표시 누락`);
}
const allowedExtensions = ['pdf', 'hwp', 'hwpx', 'xls', 'xlsx', 'ppt', 'pptx', 'doc', 'docx', 'jpg', 'jpeg', 'png'];
for (const extension of allowedExtensions) requireText(files.api, `'${extension}'`, `${extension} 업로드 형식 누락`);

requireText(files.api, "if (key < current) return 'overdue_missing'", '지난 월 미제출 자동판정 누락');
requireText(files.api, "user.role !== 'admin'", '관리자 권한검사 누락');
requireText(files.api, "user.role !== 'partner'", '협력사 권한검사 누락');
requireText(files.api, 'validateFileSignature', '파일 시그니처 검사 누락');
requireText(files.worker, "path==='/education'", '교육 페이지 Worker 경로 누락');
requireText(files.worker, 'handleEducationSubmission', '교육 API Worker 연결 누락');
requireText(files.config, '"/education"', '정적 자산 Worker 우선 경로 누락');
requireText(files.home, 'href="/education">교육 제출</a>', '공통 교육 제출 메뉴 누락');
requireText(files.page, "currentUser.role==='admin'", '관리자 현황 화면 권한분기 누락');

if (/department|유관부서/.test(files.api) || /department|유관부서/.test(files.page) || /department|유관부서/.test(files.migration)) {
  throw new Error('교육 제출 검증 실패: 유관부서 모델 또는 화면이 포함되어 있습니다.');
}

const ids = [...files.page.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
if (duplicateIds.length) throw new Error(`교육 제출 검증 실패: 중복 DOM id (${duplicateIds.join(', ')})`);
const scripts = [...files.page.matchAll(/<script>([\s\S]*?)<\/script>/g)];
const inlineScript = scripts.at(-1)?.[1] || '';
const referencedIds = [...inlineScript.matchAll(/\$\('([^']+)'\)/g)].map(match => match[1]);
const missingIds = [...new Set(referencedIds.filter(id => !ids.includes(id)))];
if (missingIds.length) throw new Error(`교육 제출 검증 실패: 존재하지 않는 DOM id 참조 (${missingIds.join(', ')})`);
new Function(inlineScript);

console.log(JSON.stringify({
  success: true,
  education_tables: 4,
  statuses: 5,
  allowed_extensions: allowedExtensions.length,
  department_scope: false,
  dom_ids: ids.length,
  worker_route: true
}));
