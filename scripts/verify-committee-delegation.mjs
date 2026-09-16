import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [page, handler, worker, baseMigration, reviewMigration] = await Promise.all([
  readFile(new URL('../public/committee.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/committee-delegation.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/worker-entry.js', import.meta.url), 'utf8'),
  readFile(new URL('../migrations/0013_committee_delegations.sql', import.meta.url), 'utf8'),
  readFile(new URL('../migrations/0014_committee_delegation_review.sql', import.meta.url), 'utf8')
]);

const inlineScripts = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
assert.ok(inlineScripts.length > 0, 'committee page must include its runtime script');
for (const source of inlineScripts) new Function(source);

assert.match(page, /안전보건협의체는 사업주 참석이 어려운 경우에 한해 대리인이 참석할 수 있으며, 이때 위임장을 작성하여야 합니다/);
assert.match(page, /대리인이 매번 협의체 대리 참석하는 경우 법위반으로 판단될 여지가 있고/);
assert.match(page, /관리자가 저장한 직급·성명입니다/);
assert.match(page, /사업주가 참석하기 어려운 부득이한 사유/);
assert.match(page, /form\.append\('delegation_reason',reason\)/);
assert.match(page, /\/api\/committee\/meetings\/\$\{encodeURIComponent\(m\.id\)\}\/delegation/);
assert.match(page, /\/api\/admin\/committee\/delegations\/\$\{encodeURIComponent\(b\.dataset\.reviewSubmission\)\}\/review/);
assert.match(page, /승인 전에는 불참으로 처리됩니다/);
assert.match(page, /관리자가 저장하면 위임장 제출 가능/);
assert.match(page, /id="saveBtn" type="button">저장/);
assert.match(page, /finalize:true/);
assert.doesNotMatch(page, /id="draftSaveBtn"|임시저장|회의 확정/);
assert.doesNotMatch(page, /name="attendeeType"/);
assert.match(page, /EHSApi\.download\(`\/api\/committee\/delegation-files\//);

assert.match(handler, /CREATE TABLE IF NOT EXISTS committee_attendance_records/);
assert.match(handler, /협의체 참석자명단이 저장된 후 위임장을 제출할 수 있습니다/);
assert.match(handler, /관리자가 참석자명단을 저장한 뒤 위임장을 제출할 수 있습니다/);
assert.match(handler, /const form=await request\.formData\(\),reason=clean\(form\.get\('delegation_reason'\),1000\)/);
assert.match(handler, /위임장과 위임 사유가 모두 제출되어야 승인할 수 있습니다/);
assert.match(handler, /review_status='pending'/);
assert.match(handler, /review_status==='approved'/);
assert.match(handler, /attendance_status:'absent',attendee_position:null,attendee_name:null/);
assert.match(handler, /UPDATE committee_partner_attendance SET attendance_status='absent'/);
assert.match(handler, /recognized_status:'absent'/);
assert.match(handler, /recognized_status:approved\?'present':'absent'/);
assert.match(handler, /file\.size>MAX_FILE_BYTES/);
assert.match(handler, /file\.company_id!==auth\.user\.company_id/);
assert.match(handler, /cm\.status IN \('draft','finalized'\)/);

assert.match(worker, /handleCommitteeDelegation/);
assert.match(baseMigration, /CREATE TABLE IF NOT EXISTS committee_attendance_submissions/);
assert.match(reviewMigration, /CREATE TABLE IF NOT EXISTS committee_attendance_records/);
assert.match(reviewMigration, /ADD COLUMN delegation_reason TEXT/);
assert.match(reviewMigration, /ADD COLUMN review_status TEXT NOT NULL DEFAULT 'pending'/);
assert.match(reviewMigration, /ADD COLUMN reviewed_by TEXT/);

console.log('Committee delegation review verification passed.');
