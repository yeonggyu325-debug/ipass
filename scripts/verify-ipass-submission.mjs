import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [client,submitPage,api,sharedApi,auth,requestMigration,stabilizationMigration,submitCss,common,ipass,runtime,worker,quota]=await Promise.all([
  readFile(new URL('../public/evaluation-submit-enhance.js',import.meta.url),'utf8'),
  readFile(new URL('../public/evaluation-submit.html',import.meta.url),'utf8'),
  readFile(new URL('../src/partner-submission.js',import.meta.url),'utf8'),
  readFile(new URL('../public/shared/api.js',import.meta.url),'utf8'),
  readFile(new URL('../public/shared/auth.js',import.meta.url),'utf8'),
  readFile(new URL('../migrations/0011_submission_requests.sql',import.meta.url),'utf8'),
  readFile(new URL('../migrations/0013_enterprise_stabilization.sql',import.meta.url),'utf8'),
  readFile(new URL('../public/evaluation-submit.css',import.meta.url),'utf8'),
  readFile(new URL('../public/ehs-common.js',import.meta.url),'utf8'),
  readFile(new URL('../public/ipass.html',import.meta.url),'utf8'),
  readFile(new URL('../src/evaluation-runtime.js',import.meta.url),'utf8'),
  readFile(new URL('../src/worker.js',import.meta.url),'utf8'),
  readFile(new URL('../src/partner-submission-quota.js',import.meta.url),'utf8')
]);

new Function(client);
assert.ok(client.includes('submitting=false')&&client.includes('if(submitting)return'),'제출 중복 클릭 방지가 필요');
assert.ok(client.includes('location.replace(safeUrl)'),'제출 성공 후 평가현황으로 즉시 이동해야 함');
assert.ok(!client.includes('render();await progress.complete()'),'제출 성공 후 전체 제출화면을 다시 렌더링하면 안 됨');
assert.ok(!client.includes('setInterval(()=>{patchFunctions'),'제출 보강 스크립트의 반복 DOM 탐색은 제거해야 함');
assert.ok(!client.includes('estimated=')&&!client.includes('submit-progress-buffer')&&!client.includes('submitProgressNote'),'시간 추정·무한 버퍼를 사용하면 안 됨');
assert.ok(client.includes('function boot(){installLeaseAwareApi();patchFunctions();installActionCapture();enhanceLayout()'),'제출 함수와 편집 세션은 페이지 로드와 경쟁하지 않도록 즉시 연결해야 함');
assert.ok(client.includes('ensureEditLease()')&&client.includes("headers.set('x-edit-lease',editLeaseToken)"),'마감 직전 편집 세션 토큰을 모든 쓰기 요청에 전달해야 함');
assert.ok(quota.includes('/edit-lease')&&quota.includes('evaluation_edit_leases_v2'),'서버가 편집 세션을 발급하고 검증해야 함');
assert.ok(stabilizationMigration.includes('evaluation_edit_leases_v2'),'편집 세션 스키마 migration이 필요');
assert.ok(!client.includes('lastSubmissionTiming')&&!client.includes('performance.now()-startedAt'),'제출 처리시간을 사용자 화면에 기록하거나 전달하면 안 됨');
assert.ok(client.includes('progress.update(20)')&&api.includes('send({progress:40})')&&api.includes('onProgress(60)')&&api.includes('onProgress(80)')&&api.includes('send({progress:result.pending?80:100,result})'),'완료된 실제 제출 단계에만 진행률을 갱신해야 함');
assert.ok(client.includes("setTimeout(()=>controller.abort(),12000)")&&sharedApi.includes('DEFAULT_TIMEOUT_MS=15000')&&auth.includes('AUTH_TIMEOUT_MS=5000'),'인증·제출 무한 대기를 제한해야 함');
assert.ok(client.includes('submissionStatus(requestId)')&&api.includes('submit-status')&&requestMigration.includes('evaluation_submission_requests_v2'),'제출 요청 ID와 상태 확인으로 안전한 재시도를 지원해야 함');
assert.ok(client.includes('submitFast(existingRequestId')&&client.includes('submitFast(requestId)'),'실패 후에도 같은 요청 ID로 다시 확인·제출해야 함');
assert.ok(client.includes("modal('평가자료 제출 확인'")&&!client.includes("modal(resubmit?'변경사항 재제출'"),'제출 확인창은 과거 시간값과 무관하게 중립적으로 표시해야 함');
assert.ok(submitPage.includes("function hasSubmission(t)")&&submitPage.includes("document.addEventListener('keydown'")&&!submitPage.includes("data.workspace.target.submitted_at?'변경사항 재제출'"),'기본 제출화면도 실제 로그 판정과 즉시 닫기를 사용해야 함');
assert.ok(submitPage.includes('function setModalBackgroundPaused(paused)')&&submitPage.includes('el.inert=true')&&submitPage.includes("classList.toggle('modal-open',paused)"),'제출 확인창이 열린 동안 배경 화면의 입력·스크롤 작업을 중지해야 함');
assert.ok(submitPage.includes('animation-play-state:paused!important')&&submitPage.includes('backdrop-filter:none!important'),'확인창 배경의 애니메이션과 고비용 블러를 중지해야 함');
assert.ok(client.includes("document.addEventListener('ehs:modal-closed',clearPreviewObjectUrl)")&&!client.includes('new MutationObserver'),'확인창 상태를 지속 감시하지 말고 닫힘 이벤트로 정리해야 함');
assert.ok(api.includes("function wasSubmitted(target)")&&api.includes("sl.action IN ('submitted','resubmitted')")&&runtime.includes('has_submission_record'),'실제 제출 로그로 제출 이력을 판정해야 함');
assert.ok(ipass.includes('effectiveEvaluationStatus')&&ipass.includes('has_submission_record'),'평가현황도 잘못 남은 제출시간을 제출완료로 표시하면 안 됨');
assert.ok(api.includes("postSubmit&&!changed.length")&&api.includes("unchanged:true"),'변경 없는 재제출은 빠른 경로를 사용해야 함');
assert.ok(!api.includes('summaryStatement('),'제출 응답을 위해 전체 작성률을 다시 집계하면 안 됨');
assert.ok(api.includes("next_url:'/ipass/evaluations?submitted=1'"),'제출 API가 다음 화면을 명시해야 함');
assert.ok(quota.includes('APPLICABILITY_UNDETERMINED')&&quota.includes('notifyAdmins'),'판정 대기 제출 차단과 관리자 변경 알림이 필요');
assert.ok(client.includes('allowExternalViewers:false'),'평가 증빙은 외부 문서뷰어로 전송하지 않아야 함');
assert.ok(submitCss.includes('background:#fff')&&!submitCss.includes('linear-gradient(135deg'),'제출 화면의 장식성 색상 띠를 제거해야 함');
assert.match(submitCss,/\.progressbar\{[\s\S]*?height:6px/,'작성률 퍼센트 막대가 보여야 함');
assert.ok(submitCss.includes('submit-progress-ring')&&submitCss.includes('@keyframes submit-ring-spin'),'제출 중에는 화면 전환형 원형 진행률을 표시해야 함');
assert.ok(!common.includes('setInterval('),'공통 런타임은 제출 화면에서도 반복 DOM 스캔을 하면 안 됨');
assert.ok(ipass.includes('submissionReturnNotice')&&!ipass.includes('처리시간')&&ipass.includes('route-notice'),'제출 후 완료 피드백에서 처리시간을 표시하면 안 됨');
assert.ok(worker.includes('evaluation-submit.css?v=1')&&worker.includes('evaluation-submit-enhance.js?v=17')&&worker.includes('/shared/auth.js?v=5')&&worker.includes('/shared/api.js?v=7'),'통합 제출·인증 자산의 캐시 버전이 필요');

console.log(JSON.stringify({success:true,immediate_redirect:true,duplicate_submit_guard:true,unchanged_resubmit_fast_path:true,repeated_dom_polling:false,elapsed_time_visible:false,exact_stage_progress:true,request_timeout:true,idempotent_retry:true,neutral_submit_confirmation:true,submission_history_verified:true,idle_confirmation_isolated:true,circular_submission_progress:true,edit_lease:true,applicability_guard:true,admin_change_notification:true,sensitive_preview_policy:true,consolidated_submission_css:true}));
