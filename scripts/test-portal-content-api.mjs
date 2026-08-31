import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { handlePortalContent } from '../src/portal-content.js';

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE portal_notices (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL,
    is_important INTEGER NOT NULL DEFAULT 0, show_on_login INTEGER NOT NULL DEFAULT 0,
    show_after_login INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1,
    start_at TEXT, end_at TEXT, created_by TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);
db.exec(await readFile(new URL('../migrations/0010_portal_content.sql', import.meta.url), 'utf8'));

function rows(value) { return value.map(row => ({ ...row })); }
class D1Statement {
  constructor(sql) { this.sql = sql; this.values = []; }
  bind(...values) { this.values = values; return this; }
  execute() {
    const statement = db.prepare(this.sql);
    if (statement.columns().length) return { results: rows(statement.all(...this.values)), success: true };
    const result = statement.run(...this.values);
    return { results: [], success: true, meta: { changes: Number(result.changes || 0) } };
  }
  async first() { return this.execute().results[0] || null; }
  async all() { return this.execute(); }
  async run() { return this.execute(); }
}
const d1 = {
  prepare(sql) { return new D1Statement(sql); },
  async batch(statements) {
    db.exec('BEGIN');
    try { const result = statements.map(statement => statement.execute()); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
};
const objects = new Map();
const r2 = {
  async put(key, value, options = {}) { const bytes = new Uint8Array(await new Response(value).arrayBuffer()); objects.set(key, { bytes, type: options.httpMetadata?.contentType }); },
  async get(key) { const object = objects.get(key); return object ? { body: new Blob([object.bytes]).stream(), size: object.bytes.byteLength, writeHttpMetadata(headers) { headers.set('content-type', object.type); } } : null; },
  async delete(key) { objects.delete(key); }
};
const env = { partner_evaluation_db: d1, EVIDENCE_FILES: r2 };
const ctx = {};
const baseWorker = { async fetch(request) { const role = request.headers.get('x-test-role') || 'partner'; return new Response(JSON.stringify({ success: true, auth_state: 'approved', user: { id: `${role}-1`, role, company_id: role === 'admin' ? null : 'company-1' } }), { headers: { 'content-type': 'application/json' } }); } };
async function call(path, { method = 'GET', role = 'partner', body } = {}) {
  const headers = new Headers({ 'x-test-role': role });
  if (body && !(body instanceof FormData)) headers.set('content-type', 'application/json');
  const response = await handlePortalContent(new Request(`https://example.test${path}`, { method, headers, body }), env, ctx, baseWorker);
  const type = response.headers.get('content-type') || '';
  return { response, data: type.includes('application/json') ? await response.json() : null };
}

const denied = await call('/api/admin/content/notices', { method: 'POST', body: JSON.stringify({ title: 'x', content: 'x' }) });
assert.equal(denied.response.status, 403);

const noticeCreated = await call('/api/admin/content/notices', { method: 'POST', role: 'admin', body: JSON.stringify({ title: '중요 안전공지', is_important: true, show_on_login: true, show_after_login: true, start_at: '2020-01-02T09:30' }) });
assert.equal(noticeCreated.response.status, 201);
assert.equal(noticeCreated.data.notice.content, '', '공지 내용은 비워도 등록되어야 함');
assert.equal(noticeCreated.data.notice.start_at, '2020-01-02 00:30:00', '한국시간 입력값을 UTC로 정확히 저장해야 함');
const noticeId = noticeCreated.data.notice.id;

const popupForm = new FormData();
popupForm.append('role', 'popup_image');
popupForm.append('file', new File([new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0])], 'popup.png', { type: 'image/png' }));
const popup = await call(`/api/admin/content/notices/${noticeId}/files`, { method: 'POST', role: 'admin', body: popupForm });
assert.equal(popup.response.status, 201);

const publicList = await call('/api/public/notices?placement=login');
assert.equal(publicList.response.status, 200);
assert.equal(publicList.data.notices[0].popup_image_url, `https://example.test/api/content/public/notices/${noticeId}/popup-image`);
const publicImage = await call(new URL(publicList.data.notices[0].popup_image_url).pathname);
assert.equal(publicImage.response.status, 200);
assert.equal(publicImage.response.headers.get('content-type'), 'image/png');

const resourceCreated = await call('/api/admin/content/resources', { method: 'POST', role: 'admin', body: JSON.stringify({ title: '작업 전 점검표', description: '현장 점검 양식', category: 'form', is_pinned: true }) });
assert.equal(resourceCreated.response.status, 201);
const resourceId = resourceCreated.data.resource.id;
const fileForm = new FormData();
fileForm.append('role', 'attachment');
fileForm.append('file', new File([new TextEncoder().encode('%PDF-1.4\n%%EOF')], 'checklist.pdf', { type: 'application/pdf' }));
const uploaded = await call(`/api/admin/content/resources/${resourceId}/files`, { method: 'POST', role: 'admin', body: fileForm });
assert.equal(uploaded.response.status, 201);

const resourceList = await call('/api/content/resources');
assert.equal(resourceList.response.status, 200);
assert.equal(resourceList.data.resources[0].file_count, 1);
const resourceDetail = await call(`/api/content/resources/${resourceId}`);
assert.equal(resourceDetail.data.resource.files[0].file_name, 'checklist.pdf');

const ticket = await call(`/api/content/files/${uploaded.data.file.id}/preview-ticket`, { method: 'POST' });
assert.equal(ticket.response.status, 200);
const preview = await call(new URL(ticket.data.source_url).pathname);
assert.equal(preview.response.status, 200);
assert.equal(preview.response.headers.get('content-type'), 'application/pdf');

const forgedForm = new FormData();
forgedForm.append('file', new File([new TextEncoder().encode('not a pdf')], 'forged.pdf', { type: 'application/pdf' }));
const forged = await call(`/api/admin/content/resources/${resourceId}/files`, { method: 'POST', role: 'admin', body: forgedForm });
assert.equal(forged.response.status, 400);

const deletedResource = await call(`/api/admin/content/resources/${resourceId}`, { method: 'DELETE', role: 'admin' });
assert.equal(deletedResource.response.status, 200);
assert.equal(deletedResource.data.deleted_files, 1);
assert.equal((await call(`/api/content/resources/${resourceId}`)).response.status, 404);
assert.equal((await call(new URL(ticket.data.source_url).pathname)).response.status, 410);
const deletedNotice = await call(`/api/admin/content/notices/${noticeId}`, { method: 'DELETE', role: 'admin' });
assert.equal(deletedNotice.response.status, 200);
assert.equal(deletedNotice.data.deleted_files, 1);
assert.equal((await call(`/api/content/notices/${noticeId}`)).response.status, 404);
assert.equal(objects.size, 0, '게시물 삭제 시 R2 첨부파일도 모두 삭제되어야 함');

console.log(JSON.stringify({ success: true, admin_write_guard: true, title_only_notice: true, kst_schedule: true, public_popup: true, resource_library: true, attachment_preview: true, signature_validation: true, hard_delete: true, r2_objects: objects.size }));
