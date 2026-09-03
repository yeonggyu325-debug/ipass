import { readFile } from 'node:fs/promises';
import { readPageBundle } from './page-bundle.mjs';

const [pageBundle,homeBundle]=await Promise.all([readPageBundle('public/education.html'),readPageBundle('public/index.html')]);
const files=Object.fromEntries(await Promise.all([
  ['api','src/education-submission.js'],['fastApi','src/education-overview-fast.js'],['worker','src/worker.js'],
  ['migration','migrations/0008_education_submissions.sql'],['performanceMigration','migrations/0012_performance_hot_paths.sql'],['config','wrangler.jsonc']
].map(async([key,path])=>[key,await readFile(path,'utf8')])));
files.page=pageBundle.source;files.home=homeBundle.source;
function requireText(source,value,label=value){if(!source.includes(value))throw new Error(`교육 제출 검증 실패: ${label}`)}
for(const table of ['education_submissions','education_submission_files','education_preview_tickets','education_submission_logs'])requireText(files.migration,`CREATE TABLE IF NOT EXISTS ${table}`,`${table} 테이블 누락`);
for(const status of ['overdue_missing','draft','under_review','approved','changes_requested']){requireText(files.api,`'${status}'`,`${status} 상태 누락`);requireText(files.page,status,`${status} 화면 표시 누락`)}
const allowedExtensions=['pdf','hwp','hwpx','xls','xlsx','ppt','pptx','doc','docx','jpg','jpeg','png'];for(const extension of allowedExtensions)requireText(files.api,`'${extension}'`,`${extension} 업로드 형식 누락`);
requireText(files.api,"if (key < current) return 'overdue_missing'",'지난 월 미제출 자동판정 누락');requireText(files.api,"user.role !== 'admin'",'관리자 권한검사 누락');requireText(files.api,"user.role !== 'partner'",'협력사 권한검사 누락');requireText(files.api,'validateFileSignature','파일 시그니처 검사 누락');requireText(files.fastApi,'GROUP BY submission_id','교육 연간현황 첨부 집계 fast-path 누락');requireText(files.performanceMigration,'idx_education_files_live_cover','교육 첨부 집계 covering index 누락');requireText(files.worker,"path==='/education'",'교육 페이지 Worker 경로 누락');requireText(files.worker,'handleEducationSubmission','교육 API Worker 연결 누락');requireText(files.config,'"/education"','정적 자산 Worker 우선 경로 누락');requireText(files.home,'href="/education">교육 제출</a>','공통 교육 제출 메뉴 누락');requireText(files.page,"currentUser.role==='admin'",'관리자 현황 화면 권한분기 누락');
if(/department|유관부서/.test(files.api)||/department|유관부서/.test(files.page)||/department|유관부서/.test(files.migration))throw new Error('교육 제출 검증 실패: 유관부서 모델 또는 화면이 포함되어 있습니다.');
const staticIds=[...pageBundle.html.matchAll(/\sid="([^"]+)"/g)].map(match=>match[1]),duplicateIds=[...new Set(staticIds.filter((id,index)=>staticIds.indexOf(id)!==index))];if(duplicateIds.length)throw new Error(`교육 제출 검증 실패: 중복 정적 DOM id (${duplicateIds.join(', ')})`);
const declaredIds=new Set([...staticIds,...pageBundle.scripts.flatMap(script=>[...script.matchAll(/\bid=["']([^"']+)["']/g)].map(match=>match[1]))]);
for(const script of pageBundle.scripts){const referencedIds=[...script.matchAll(/\$\('([^']+)'\)/g)].map(match=>match[1]),missingIds=[...new Set(referencedIds.filter(id=>!declaredIds.has(id)))];if(missingIds.length)throw new Error(`교육 제출 검증 실패: 존재하지 않는 DOM id 참조 (${missingIds.join(', ')})`);new Function(script)}
console.log(JSON.stringify({success:true,education_tables:4,statuses:5,allowed_extensions:allowedExtensions.length,department_scope:false,static_dom_ids:staticIds.length,dynamic_dom_ids:declaredIds.size-staticIds.length,worker_route:true,aggregated_overview:true,modular_page:true}));
