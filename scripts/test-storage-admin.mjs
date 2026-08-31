import assert from 'node:assert/strict';
import { handleStorageAdmin } from '../src/storage-admin.js';

class Statement {
  constructor(sql) { this.sql = sql; }
  bind() { return this; }
}
const totals = {
  evaluation_evidence_files_v2: { file_count: 2, used_bytes: 1024 },
  education_submission_files: { file_count: 3, used_bytes: 2048 },
  voc_images_v2: { file_count: 4, used_bytes: 4096 },
  portal_content_files_v2: { file_count: 5, used_bytes: 8192 }
};
const d1 = {
  prepare(sql) { return new Statement(sql); },
  async batch(statements) {
    return statements.map(statement => {
      for (const [table, value] of Object.entries(totals)) if (statement.sql.includes(`FROM ${table}`)) return { results: [value] };
      if (statement.sql.includes('evaluation_upload_reservations_v2')) return { results: [{ reserved_bytes: 512 }] };
      return { results: [{ company_id: 'c1', company_name: '테스트', year: 2026, half: 2, used_bytes: 1024, file_count: 2 }] };
    });
  }
};
const baseWorker = { async fetch() { return new Response(JSON.stringify({ success: true, auth_state: 'approved', user: { id: 'admin-1', role: 'admin' } }), { headers: { 'content-type': 'application/json' } }); } };
const response = await handleStorageAdmin(new Request('https://example.test/api/admin/storage-status'), { partner_evaluation_db: d1, EVIDENCE_FILES: {} }, {}, baseWorker);
const data = await response.json();
assert.equal(response.status, 200);
assert.equal(data.storage.global.committed_bytes, 15360);
assert.equal(data.storage.global.used_bytes, 15872);
assert.equal(data.storage.file_count, 14);
assert.deepEqual(data.storage.breakdown.map(item => item.label), ['i-PaSS', '교육 제출', 'VOC', '공지·안전자료']);
assert.equal(data.storage.binding_available, true);

console.log(JSON.stringify({ success: true, tracked_sources: data.storage.breakdown.length, file_count: data.storage.file_count, aggregate_bytes: data.storage.global.used_bytes }));
