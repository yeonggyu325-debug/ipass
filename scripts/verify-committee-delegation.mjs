import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [page, handler, worker, migration] = await Promise.all([
  readFile(new URL('../public/committee.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/committee-delegation.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/worker-entry.js', import.meta.url), 'utf8'),
  readFile(new URL('../migrations/0013_committee_delegations.sql', import.meta.url), 'utf8')
]);

const inlineScripts = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
assert.ok(inlineScripts.length > 0, 'committee page must include its runtime script');
for (const source of inlineScripts) new Function(source);

assert.match(page, /대표이사가 아닌 임직원이 대리 참석하는 경우에는 <b>대표이사 위임장을 반드시 첨부<\/b>/);
assert.match(page, /name="attendeeType" value="representative"/);
assert.match(page, /name="attendeeType" value="delegate"/);
assert.match(page, /대표이사가 아닌 대리 참석자는 위임장을 반드시 첨부해야 합니다/);
assert.match(page, /\/api\/committee\/meetings\/\$\{encodeURIComponent\(m\.id\)\}\/attendance/);
assert.match(page, /EHSApi\.download\(`\/api\/committee\/delegation-files\//);

assert.match(handler, /attendeeType === 'delegate' && !hasIncoming && !existing\?\.delegation_file_id/);
assert.match(handler, /const hasIncoming = attendeeType === 'delegate'/);
assert.match(handler, /대표이사가 아닌 대리 참석자는 위임장을 반드시 첨부해야 합니다/);
assert.match(handler, /attendance_status = 'present'/);
assert.match(handler, /missingAttendance\.length/);
assert.match(handler, /missingDelegation\.length/);
assert.match(handler, /file\.size > MAX_FILE_BYTES/);
assert.match(handler, /file\.company_id !== auth\.user\.company_id/);

assert.match(worker, /handleCommitteeDelegation/);
assert.match(handler, /cm\.status IN \('draft', 'finalized'\)/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS committee_attendance_submissions/);
assert.match(migration, /CHECK\(attendee_type IN \('representative','delegate'\)\)/);
assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS idx_committee_delegation_files_active/);

console.log('Committee delegation verification passed.');
