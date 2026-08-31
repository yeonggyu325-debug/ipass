import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [client, api, redesign, progress, common, ipass, worker] = await Promise.all([
  readFile(new URL('../public/evaluation-submit-enhance.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/partner-submission.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/evaluation-submit-redesign.css', import.meta.url), 'utf8'),
  readFile(new URL('../public/evaluation-submit-progress.css', import.meta.url), 'utf8'),
  readFile(new URL('../public/ehs-common.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/ipass.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/worker-v20.js', import.meta.url), 'utf8')
]);

new Function(client);
assert.ok(client.includes('submitting=false') && client.includes('if(submitting)return'), '제출 중복 클릭 방지가 필요');
assert.ok(client.includes("location.replace(nextUrl.startsWith('/ipass')"), '제출 성공 후 평가현황으로 즉시 이동해야 함');
assert.ok(!client.includes('render();await progress.complete()'), '제출 성공 후 전체 제출화면을 다시 렌더링하면 안 됨');
assert.ok(!client.includes('setInterval('), '제출 보강 스크립트의 반복 DOM 탐색·진행률 갱신은 제거해야 함');
assert.ok(client.includes('function boot(){patchFunctions();installActionCapture();enhanceLayout()}\n  boot();'), '제출 함수는 페이지 로드와 경쟁하지 않도록 즉시 교체해야 함');
assert.ok(api.includes("postSubmit&&!changed.length") && api.includes("unchanged:true"), '변경 없는 재제출은 빠른 경로를 사용해야 함');
assert.ok(api.includes("next_url:'/ipass/evaluations?submitted=1'"), '제출 API가 다음 화면을 명시해야 함');
assert.ok(redesign.includes('background: #fff;') && !redesign.includes('linear-gradient(135deg'), '제출 화면의 색상 띠를 제거해야 함');
assert.match(redesign, /\.progressbar\s*\{[\s\S]*?display:\s*none;/, '작성률 띠는 표시하지 않아야 함');
assert.ok(progress.includes('submit-progress-spinner') && !progress.includes('submit-progress-track'), '가짜 진행률 띠 대신 경량 상태표시를 사용해야 함');
assert.ok(common.includes("if(path!=='/evaluation-submit.html')"), '제출 화면에서 공통 반복 DOM 스캔을 중지해야 함');
assert.ok(ipass.includes('submissionReturnNotice') && ipass.includes('route-notice'), '제출 후 평가현황에 완료 피드백이 필요');
assert.ok(worker.includes('evaluation-submit-enhance.js?v=11') && worker.includes('ehs-common.js?v=12'), '새 제출 자산의 캐시 버전이 필요');

console.log(JSON.stringify({
  success: true,
  immediate_redirect: true,
  duplicate_submit_guard: true,
  unchanged_resubmit_fast_path: true,
  repeated_dom_polling: false,
  decorative_bands: false
}));
