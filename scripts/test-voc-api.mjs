import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { handleVocSubmission } from '../src/voc-submission.js';

const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE companies (id TEXT PRIMARY KEY, company_name TEXT, industry_name TEXT);`);
db.exec(await readFile(new URL('../migrations/0009_voc_cases_v2.sql', import.meta.url), 'utf8'));
db.exec(`INSERT INTO companies (id,company_name,industry_name) VALUES ('company-1','테스트협력사','제조업'),('company-2','다른협력사','서비스업');`);

function plainRows(rows) { return rows.map(row => ({ ...row })); }
class D1Statement {
  constructor(sql) { this.sql = sql; this.values = []; }
  bind(...values) { this.values = values; return this; }
  execute() {
    const statement = db.prepare(this.sql);
    if (statement.columns().length) return { results: plainRows(statement.all(...this.values)), success: true };
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
    try {
      const results = statements.map(statement => statement.execute());
      db.exec('COMMIT');
      return results;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
};

const objects = new Map();
const r2 = {
  async put(key, value, options = {}) {
    const bytes = new Uint8Array(await new Response(value).arrayBuffer());
    objects.set(key, { bytes, contentType: options.httpMetadata?.contentType || 'application/octet-stream' });
    return { key, size: bytes.byteLength };
  },
  async get(key) {
    const object = objects.get(key);
    if (!object) return null;
    return {
      body: new Blob([object.bytes]).stream(),
      size: object.bytes.byteLength,
      writeHttpMetadata(headers) { headers.set('content-type', object.contentType); }
    };
  },
  async delete(key) { objects.delete(key); }
};

const env = { partner_evaluation_db: d1, EVIDENCE_FILES: r2 };
const ctx = {};
const baseWorker = {
  async fetch(request) {
    const role = request.headers.get('x-test-role') || 'partner';
    const companyId = request.headers.get('x-test-company') || 'company-1';
    return new Response(JSON.stringify({
      success: true,
      auth_state: 'approved',
      user: { id: `${role}-${companyId}`, role, company_id: role === 'admin' ? null : companyId, company_name: companyId }
    }), { headers: { 'content-type': 'application/json' } });
  }
};

async function call(path, { method = 'GET', role = 'partner', company = 'company-1', body, headers = {} } = {}) {
  const requestHeaders = new Headers(headers);
  requestHeaders.set('x-test-role', role);
  requestHeaders.set('x-test-company', company);
  if (body && !(body instanceof FormData) && !requestHeaders.has('content-type')) requestHeaders.set('content-type', 'application/json');
  const request = new Request(`https://example.test${path}`, { method, headers: requestHeaders, body });
  const response = await handleVocSubmission(request, env, ctx, baseWorker);
  const type = response.headers.get('content-type') || '';
  return { response, data: type.includes('application/json') ? await response.json() : null };
}

const created = await call('/api/voc/drafts', { method: 'POST', body: JSON.stringify({ category: 'safety', title: '', content: '통로 조명 개선이 필요합니다.\n야간에 어둡습니다.' }) });
assert.equal(created.response.status, 201);
assert.equal(created.data.item.title, '통로 조명 개선이 필요합니다.');
assert.equal(created.data.item.image_count, 0);
const noPhotoId = created.data.item.id;

const submitted = await call(`/api/voc/${noPhotoId}/submit`, { method: 'POST', body: '{}' });
assert.equal(submitted.response.status, 200);
assert.equal(submitted.data.item.status, 'received');
assert.equal(submitted.data.item.image_count, 0, '사진 없이도 접수되어야 함');

const denied = await call(`/api/voc/${noPhotoId}`, { company: 'company-2' });
assert.equal(denied.response.status, 403);

const adminList = await call('/api/voc', { role: 'admin' });
assert.equal(adminList.response.status, 200);
assert.equal(adminList.data.items.length, 1);
assert.equal(adminList.data.summary.received, 1);

const missingReply = await call(`/api/admin/voc/${noPhotoId}`, { method: 'PATCH', role: 'admin', body: JSON.stringify({ status: 'answered', admin_reply: '' }) });
assert.equal(missingReply.response.status, 400);
const reviewed = await call(`/api/admin/voc/${noPhotoId}`, { method: 'PATCH', role: 'admin', body: JSON.stringify({ status: 'answered', admin_reply: '조명 보강을 요청했습니다.' }) });
assert.equal(reviewed.response.status, 200);
assert.equal(reviewed.data.item.status, 'answered');

const photoDraft = await call('/api/voc/drafts', { method: 'POST', body: JSON.stringify({ category: 'facility', content: '난간 상태를 확인해 주세요.' }) });
const photoId = photoDraft.data.item.id;
const form = new FormData();
form.append('file', new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9])], 'camera.jpg', { type: 'image/jpeg' }));
const uploaded = await call(`/api/voc/${photoId}/images`, { method: 'POST', body: form });
assert.equal(uploaded.response.status, 201);
assert.equal(uploaded.data.image.content_type, 'image/jpeg');
assert.equal(objects.size, 1);

const ticket = await call(`/api/voc/images/${uploaded.data.image.id}/preview-ticket`, { method: 'POST' });
assert.equal(ticket.response.status, 200);
const previewPath = new URL(ticket.data.source_url).pathname;
const preview = await call(previewPath);
assert.equal(preview.response.status, 200);
assert.equal(preview.response.headers.get('content-type'), 'image/jpeg');
assert.equal((await preview.response.arrayBuffer()).byteLength, 12);

await call(`/api/voc/${photoId}/submit`, { method: 'POST', body: '{}' });
const adminDeletedPhotoCase = await call(`/api/admin/voc/${photoId}`, { method: 'DELETE', role: 'admin' });
assert.equal(adminDeletedPhotoCase.response.status, 200);
assert.equal(adminDeletedPhotoCase.data.deleted_images, 1);
assert.equal(objects.size, 0, '관리자 VOC 삭제 시 R2 사진도 삭제되어야 함');
assert.equal((await call(`/api/voc/${photoId}`)).response.status, 404);
const adminDeletedAnsweredCase = await call(`/api/admin/voc/${noPhotoId}`, { method: 'DELETE', role: 'admin' });
assert.equal(adminDeletedAnsweredCase.response.status, 200);
assert.equal((await call('/api/voc', { role: 'admin' })).data.items.length, 0);

console.log(JSON.stringify({
  success: true,
  no_photo_submission: true,
  automatic_title: true,
  partner_isolation: true,
  admin_workflow: true,
  image_upload: true,
  preview_ticket: true,
  admin_delete: true
}));
