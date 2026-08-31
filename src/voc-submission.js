const CATEGORIES = new Set(['general', 'safety', 'facility', 'other']);
const STATUSES = new Set(['draft', 'received', 'in_review', 'answered', 'closed']);
const ADMIN_STATUSES = new Set(['received', 'in_review', 'answered', 'closed']);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_CASE_BYTES = 30 * 1024 * 1024;
const MAX_CASE_IMAGES = 5;
const PREVIEW_TICKET_MINUTES = 5;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json;charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization,content-type,x-request-id',
      'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS'
    }
  });
}

function clean(value, max = 4000) {
  return String(value ?? '').trim().slice(0, max);
}

function safeFileName(value) {
  return String(value || 'photo.jpg')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160) || 'photo.jpg';
}

function automaticTitle(content) {
  const firstLine = String(content || '').split(/\r?\n/).map(line => line.trim()).find(Boolean) || 'VOC 접수';
  return firstLine.replace(/\s+/g, ' ').slice(0, 60);
}

async function account(request, env, ctx, baseWorker) {
  const url = new URL(request.url);
  url.pathname = '/api/me';
  url.search = '';
  const response = await baseWorker.fetch(new Request(url.toString(), { method: 'GET', headers: request.headers }), env, ctx);
  const data = await response.clone().json().catch(() => null);
  if (!response.ok || !data?.success) return { ok: false, response };
  if (data.auth_state !== 'approved') return { ok: false, response: json({ success: false, error: '승인된 계정이 필요합니다.' }, 403) };
  return { ok: true, user: data.user };
}

function caseLog(env, caseId, action, before, after, userId) {
  return env.partner_evaluation_db.prepare(`
    INSERT INTO voc_case_logs_v2 (id, case_id, action, before_json, after_json, changed_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(), caseId, action,
    before == null ? null : JSON.stringify(before),
    after == null ? null : JSON.stringify(after),
    userId || null
  );
}

async function detailById(env, caseId, includeLogs = false) {
  const statements = [
    env.partner_evaluation_db.prepare(`
      SELECT v.*, c.company_name, c.industry_name,
        (SELECT COUNT(*) FROM voc_images_v2 i WHERE i.case_id = v.id AND i.deleted_at IS NULL) AS image_count,
        (SELECT COALESCE(SUM(i.file_size), 0) FROM voc_images_v2 i WHERE i.case_id = v.id AND i.deleted_at IS NULL) AS image_bytes
      FROM voc_cases_v2 v
      LEFT JOIN companies c ON c.id = v.company_id
      WHERE v.id = ? LIMIT 1
    `).bind(caseId),
    env.partner_evaluation_db.prepare(`
      SELECT id, case_id, file_name, content_type, file_size, uploaded_by, created_at
      FROM voc_images_v2
      WHERE case_id = ? AND deleted_at IS NULL
      ORDER BY created_at, id
    `).bind(caseId)
  ];
  if (includeLogs) statements.push(env.partner_evaluation_db.prepare(`
    SELECT action, before_json, after_json, changed_by, created_at
    FROM voc_case_logs_v2
    WHERE case_id = ?
    ORDER BY created_at DESC LIMIT 100
  `).bind(caseId));
  const results = await env.partner_evaluation_db.batch(statements);
  const item = results[0]?.results?.[0];
  if (!item) return null;
  return {
    ...item,
    image_count: Number(item.image_count || 0),
    image_bytes: Number(item.image_bytes || 0),
    images: results[1]?.results || [],
    logs: includeLogs ? results[2]?.results || [] : undefined
  };
}

async function accessCase(env, user, caseId, { partnerWrite = false, allowDraftForAdmin = false } = {}) {
  const item = await detailById(env, caseId, user.role === 'admin');
  if (!item) return { ok: false, response: json({ success: false, error: 'VOC 접수내역을 찾을 수 없습니다.' }, 404) };
  if (user.role !== 'admin' && item.company_id !== user.company_id) {
    return { ok: false, response: json({ success: false, error: '접근 권한이 없습니다.' }, 403) };
  }
  if (user.role === 'admin' && item.status === 'draft' && !allowDraftForAdmin) {
    return { ok: false, response: json({ success: false, error: '아직 접수되지 않은 작성중 VOC입니다.' }, 404) };
  }
  if (partnerWrite && user.role !== 'partner') {
    return { ok: false, response: json({ success: false, error: '협력사 계정에서만 VOC를 작성할 수 있습니다.' }, 403) };
  }
  if (partnerWrite && item.status !== 'draft') {
    return { ok: false, response: json({ success: false, error: '접수한 VOC는 수정할 수 없습니다.' }, 409) };
  }
  return { ok: true, item };
}

async function accessImage(env, user, imageId, partnerWrite = false) {
  const image = await env.partner_evaluation_db.prepare(`
    SELECT i.*, v.company_id, v.status AS case_status
    FROM voc_images_v2 i
    JOIN voc_cases_v2 v ON v.id = i.case_id
    WHERE i.id = ? AND i.deleted_at IS NULL LIMIT 1
  `).bind(imageId).first();
  if (!image) return { ok: false, response: json({ success: false, error: '사진을 찾을 수 없습니다.' }, 404) };
  if (user.role !== 'admin' && image.company_id !== user.company_id) {
    return { ok: false, response: json({ success: false, error: '접근 권한이 없습니다.' }, 403) };
  }
  if (user.role === 'admin' && image.case_status === 'draft') {
    return { ok: false, response: json({ success: false, error: '아직 접수되지 않은 VOC 사진입니다.' }, 404) };
  }
  if (partnerWrite && (user.role !== 'partner' || image.case_status !== 'draft')) {
    return { ok: false, response: json({ success: false, error: '작성중인 VOC 사진만 삭제할 수 있습니다.' }, 409) };
  }
  return { ok: true, image };
}

async function listCases(env, user, url) {
  const requestedStatus = clean(url.searchParams.get('status'), 30);
  const requestedCategory = clean(url.searchParams.get('category'), 30);
  const status = STATUSES.has(requestedStatus) ? requestedStatus : '';
  const category = CATEGORIES.has(requestedCategory) ? requestedCategory : '';
  const query = clean(url.searchParams.get('q'), 100);
  const like = `%${query}%`;
  const admin = user.role === 'admin';
  const listStatement = admin
    ? env.partner_evaluation_db.prepare(`
        SELECT v.id, v.company_id, c.company_name, v.category, v.title, v.content, v.status,
          v.admin_reply, v.created_at, v.submitted_at, v.updated_at, v.replied_at,
          (SELECT COUNT(*) FROM voc_images_v2 i WHERE i.case_id = v.id AND i.deleted_at IS NULL) AS image_count
        FROM voc_cases_v2 v
        LEFT JOIN companies c ON c.id = v.company_id
        WHERE v.status <> 'draft'
          AND (? = '' OR v.status = ?)
          AND (? = '' OR v.category = ?)
          AND (? = '' OR v.title LIKE ? OR v.content LIKE ? OR COALESCE(c.company_name, '') LIKE ?)
        ORDER BY CASE v.status WHEN 'received' THEN 1 WHEN 'in_review' THEN 2 WHEN 'answered' THEN 3 ELSE 4 END,
          COALESCE(v.submitted_at, v.created_at) DESC
        LIMIT 300
      `).bind(status, status, category, category, query, like, like, like)
    : env.partner_evaluation_db.prepare(`
        SELECT v.id, v.company_id, c.company_name, v.category, v.title, v.content, v.status,
          v.admin_reply, v.created_at, v.submitted_at, v.updated_at, v.replied_at,
          (SELECT COUNT(*) FROM voc_images_v2 i WHERE i.case_id = v.id AND i.deleted_at IS NULL) AS image_count
        FROM voc_cases_v2 v
        LEFT JOIN companies c ON c.id = v.company_id
        WHERE v.company_id = ?
          AND (? = '' OR v.status = ?)
          AND (? = '' OR v.category = ?)
          AND (? = '' OR v.title LIKE ? OR v.content LIKE ?)
        ORDER BY COALESCE(v.submitted_at, v.created_at) DESC
        LIMIT 300
      `).bind(user.company_id || '', status, status, category, category, query, like, like);
  const summaryStatement = admin
    ? env.partner_evaluation_db.prepare(`SELECT status, COUNT(*) AS count FROM voc_cases_v2 WHERE status <> 'draft' GROUP BY status`)
    : env.partner_evaluation_db.prepare(`SELECT status, COUNT(*) AS count FROM voc_cases_v2 WHERE company_id = ? GROUP BY status`).bind(user.company_id || '');
  const [listResult, summaryResult] = await env.partner_evaluation_db.batch([listStatement, summaryStatement]);
  const summary = { draft: 0, received: 0, in_review: 0, answered: 0, closed: 0 };
  for (const row of summaryResult?.results || []) if (row.status in summary) summary[row.status] = Number(row.count || 0);
  return { items: (listResult?.results || []).map(row => ({ ...row, image_count: Number(row.image_count || 0) })), summary };
}

async function imageSignature(file) {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const starts = (...values) => values.every((value, index) => bytes[index] === value);
  if (starts(0xff, 0xd8, 0xff)) return { extension: 'jpg', contentType: 'image/jpeg' };
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { extension: 'png', contentType: 'image/png' };
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return { extension: 'webp', contentType: 'image/webp' };
  }
  return null;
}

async function addImage(request, env, user, item) {
  if (!env.EVIDENCE_FILES) return { error: '사진 저장소가 연결되지 않았습니다.', status: 503 };
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File) || !file.name) return { error: '등록할 사진을 선택하세요.', status: 400 };
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) return { error: '사진은 한 장당 10MB 이하만 등록할 수 있습니다.', status: 400 };
  const signature = await imageSignature(file);
  if (!signature) return { error: 'JPG, PNG, WebP 사진만 등록할 수 있습니다.', status: 400 };
  if (Number(item.image_count || 0) >= MAX_CASE_IMAGES) return { error: `사진은 최대 ${MAX_CASE_IMAGES}장까지 등록할 수 있습니다.`, status: 409 };
  if (Number(item.image_bytes || 0) + file.size > MAX_CASE_BYTES) return { error: '사진 합계는 30MB를 초과할 수 없습니다.', status: 409 };

  const id = crypto.randomUUID();
  const originalStem = safeFileName(file.name).replace(/\.[^.]+$/, '').slice(0, 120) || 'photo';
  const fileName = `${originalStem}.${signature.extension}`;
  const objectKey = `voc/${item.company_id}/${item.id}/${id}-${fileName}`;
  try {
    await env.EVIDENCE_FILES.put(objectKey, file.stream(), {
      httpMetadata: { contentType: signature.contentType },
      customMetadata: { originalName: fileName, uploadedBy: String(user.id || '') }
    });
    await env.partner_evaluation_db.batch([
      env.partner_evaluation_db.prepare(`
        INSERT INTO voc_images_v2 (id, case_id, object_key, file_name, content_type, file_size, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(id, item.id, objectKey, fileName, signature.contentType, file.size, user.id || null),
      env.partner_evaluation_db.prepare(`UPDATE voc_cases_v2 SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(item.id),
      caseLog(env, item.id, 'image_added', null, { image_id: id, file_name: fileName, file_size: file.size }, user.id)
    ]);
  } catch (error) {
    await env.EVIDENCE_FILES.delete(objectKey).catch(() => {});
    throw error;
  }
  return { image: { id, case_id: item.id, file_name: fileName, content_type: signature.contentType, file_size: file.size, created_at: new Date().toISOString() } };
}

async function publicPreview(env, ticketId) {
  if (!env.EVIDENCE_FILES) return json({ success: false, error: '사진 저장소가 연결되지 않았습니다.' }, 503);
  const ticket = await env.partner_evaluation_db.prepare(`
    SELECT i.* FROM voc_preview_tickets_v2 p
    JOIN voc_images_v2 i ON i.id = p.image_id
    WHERE p.id = ? AND p.expires_at > CURRENT_TIMESTAMP AND i.deleted_at IS NULL
    LIMIT 1
  `).bind(ticketId).first();
  if (!ticket) return json({ success: false, error: '사진 열람 링크가 만료되었거나 유효하지 않습니다.' }, 410);
  const object = await env.EVIDENCE_FILES.get(ticket.object_key);
  if (!object) return json({ success: false, error: '저장된 사진을 찾을 수 없습니다.' }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('content-type', ticket.content_type || 'application/octet-stream');
  headers.set('content-disposition', `inline; filename*=UTF-8''${encodeURIComponent(ticket.file_name)}`);
  headers.set('content-length', String(object.size));
  headers.set('cache-control', 'private, no-store, max-age=0');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('access-control-allow-origin', '*');
  return new Response(object.body, { headers });
}

export async function handleVocSubmission(request, env, ctx, baseWorker) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith('/api/voc') && !path.startsWith('/api/admin/voc')) return null;
  if (request.method === 'OPTIONS') return json({ success: true });

  const publicPreviewMatch = path.match(/^\/api\/voc\/preview\/([^/]+)(?:\/[^/]+)?$/);
  if (publicPreviewMatch && request.method === 'GET') return publicPreview(env, decodeURIComponent(publicPreviewMatch[1]));

  const auth = await account(request, env, ctx, baseWorker);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  if (path === '/api/voc' && request.method === 'GET') {
    if (user.role !== 'admin' && !user.company_id) return json({ success: false, error: '회사 연결정보가 없습니다.' }, 400);
    const data = await listCases(env, user, url);
    return json({ success: true, role: user.role, ...data });
  }

  if (path === '/api/voc/drafts' && request.method === 'POST') {
    if (user.role !== 'partner' || !user.company_id) return json({ success: false, error: '협력사 계정이 필요합니다.' }, 403);
    const body = await request.json().catch(() => ({}));
    const content = clean(body.content, 5000);
    if (!content) return json({ success: false, error: '내용을 입력하세요.' }, 400);
    const title = clean(body.title, 120) || automaticTitle(content);
    const category = CATEGORIES.has(body.category) ? body.category : 'general';
    const id = crypto.randomUUID();
    await env.partner_evaluation_db.batch([
      env.partner_evaluation_db.prepare(`
        INSERT INTO voc_cases_v2 (id, company_id, created_by, category, title, content, status)
        VALUES (?, ?, ?, ?, ?, ?, 'draft')
      `).bind(id, user.company_id, user.id || null, category, title, content),
      caseLog(env, id, 'draft_created', null, { category, title }, user.id)
    ]);
    return json({ success: true, item: await detailById(env, id) }, 201);
  }

  const imageUploadMatch = path.match(/^\/api\/voc\/([^/]+)\/images$/);
  if (imageUploadMatch && request.method === 'POST') {
    const access = await accessCase(env, user, decodeURIComponent(imageUploadMatch[1]), { partnerWrite: true });
    if (!access.ok) return access.response;
    const result = await addImage(request, env, user, access.item);
    if (result.error) return json({ success: false, error: result.error }, result.status);
    return json({ success: true, image: result.image }, 201);
  }

  const submitMatch = path.match(/^\/api\/voc\/([^/]+)\/submit$/);
  if (submitMatch && request.method === 'POST') {
    const caseId = decodeURIComponent(submitMatch[1]);
    const access = await accessCase(env, user, caseId, { partnerWrite: true });
    if (!access.ok) return access.response;
    if (!clean(access.item.content, 5000)) return json({ success: false, error: '내용을 입력하세요.' }, 400);
    await env.partner_evaluation_db.batch([
      env.partner_evaluation_db.prepare(`
        UPDATE voc_cases_v2
        SET status = 'received', submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'draft'
      `).bind(caseId),
      caseLog(env, caseId, 'submitted', { status: 'draft' }, { status: 'received', image_count: access.item.image_count }, user.id)
    ]);
    return json({ success: true, item: await detailById(env, caseId) });
  }

  const previewTicketMatch = path.match(/^\/api\/voc\/images\/([^/]+)\/preview-ticket$/);
  if (previewTicketMatch && request.method === 'POST') {
    const access = await accessImage(env, user, decodeURIComponent(previewTicketMatch[1]));
    if (!access.ok) return access.response;
    const ticketId = crypto.randomUUID();
    await env.partner_evaluation_db.batch([
      env.partner_evaluation_db.prepare(`DELETE FROM voc_preview_tickets_v2 WHERE expires_at <= CURRENT_TIMESTAMP`),
      env.partner_evaluation_db.prepare(`
        INSERT INTO voc_preview_tickets_v2 (id, image_id, issued_by, expires_at)
        VALUES (?, ?, ?, datetime('now', ?))
      `).bind(ticketId, access.image.id, user.id || null, `+${PREVIEW_TICKET_MINUTES} minutes`)
    ]);
    const sourceUrl = `${url.origin}/api/voc/preview/${encodeURIComponent(ticketId)}/${encodeURIComponent(access.image.file_name)}`;
    return json({ success: true, source_url: sourceUrl, expires_in_seconds: PREVIEW_TICKET_MINUTES * 60 });
  }

  const imageMatch = path.match(/^\/api\/voc\/images\/([^/]+)$/);
  if (imageMatch) {
    const imageId = decodeURIComponent(imageMatch[1]);
    const access = await accessImage(env, user, imageId, request.method === 'DELETE');
    if (!access.ok) return access.response;
    if (request.method === 'GET') {
      if (!env.EVIDENCE_FILES) return json({ success: false, error: '사진 저장소가 연결되지 않았습니다.' }, 503);
      const object = await env.EVIDENCE_FILES.get(access.image.object_key);
      if (!object) return json({ success: false, error: '저장된 사진을 찾을 수 없습니다.' }, 404);
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('content-type', access.image.content_type || 'application/octet-stream');
      headers.set('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(access.image.file_name)}`);
      headers.set('content-length', String(object.size));
      headers.set('x-content-type-options', 'nosniff');
      return new Response(object.body, { headers });
    }
    if (request.method === 'DELETE') {
      if (!env.EVIDENCE_FILES) return json({ success: false, error: '사진 저장소가 연결되지 않았습니다.' }, 503);
      await env.EVIDENCE_FILES.delete(access.image.object_key);
      await env.partner_evaluation_db.batch([
        env.partner_evaluation_db.prepare(`UPDATE voc_images_v2 SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(imageId),
        env.partner_evaluation_db.prepare(`UPDATE voc_cases_v2 SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(access.image.case_id),
        caseLog(env, access.image.case_id, 'image_deleted', { image_id: imageId, file_name: access.image.file_name }, null, user.id)
      ]);
      return json({ success: true });
    }
    return json({ success: false, error: '지원하지 않는 요청입니다.' }, 405);
  }

  const detailMatch = path.match(/^\/api\/voc\/([^/]+)$/);
  if (detailMatch) {
    const caseId = decodeURIComponent(detailMatch[1]);
    const access = await accessCase(env, user, caseId, { partnerWrite: ['PATCH', 'DELETE'].includes(request.method) });
    if (!access.ok) return access.response;
    if (request.method === 'GET') return json({ success: true, item: access.item });
    if (request.method === 'PATCH') {
      const body = await request.json().catch(() => ({}));
      const content = clean(body.content, 5000);
      if (!content) return json({ success: false, error: '내용을 입력하세요.' }, 400);
      const title = clean(body.title, 120) || automaticTitle(content);
      const category = CATEGORIES.has(body.category) ? body.category : 'general';
      await env.partner_evaluation_db.batch([
        env.partner_evaluation_db.prepare(`
          UPDATE voc_cases_v2 SET category = ?, title = ?, content = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'draft'
        `).bind(category, title, content, caseId),
        caseLog(env, caseId, 'draft_updated', { category: access.item.category, title: access.item.title }, { category, title }, user.id)
      ]);
      return json({ success: true, item: await detailById(env, caseId) });
    }
    if (request.method === 'DELETE') {
      if (!env.EVIDENCE_FILES) return json({ success: false, error: '사진 저장소가 연결되지 않았습니다.' }, 503);
      const imageRows = await env.partner_evaluation_db.prepare(`
        SELECT object_key FROM voc_images_v2 WHERE case_id = ? AND deleted_at IS NULL
      `).bind(caseId).all();
      const keys = (imageRows.results || []).map(image => image.object_key).filter(Boolean);
      await Promise.all(keys.map(key => env.EVIDENCE_FILES.delete(key)));
      await env.partner_evaluation_db.batch([
        env.partner_evaluation_db.prepare(`DELETE FROM voc_preview_tickets_v2 WHERE image_id IN (SELECT id FROM voc_images_v2 WHERE case_id = ?)`).bind(caseId),
        env.partner_evaluation_db.prepare(`DELETE FROM voc_images_v2 WHERE case_id = ?`).bind(caseId),
        env.partner_evaluation_db.prepare(`DELETE FROM voc_case_logs_v2 WHERE case_id = ?`).bind(caseId),
        env.partner_evaluation_db.prepare(`DELETE FROM voc_cases_v2 WHERE id = ? AND status = 'draft'`).bind(caseId)
      ]);
      return json({ success: true });
    }
    return json({ success: false, error: '지원하지 않는 요청입니다.' }, 405);
  }

  const adminMatch = path.match(/^\/api\/admin\/voc\/([^/]+)$/);
  if (adminMatch && request.method === 'DELETE') {
    if (user.role !== 'admin') return json({ success: false, error: '관리자 권한이 필요합니다.' }, 403);
    const caseId = decodeURIComponent(adminMatch[1]);
    const access = await accessCase(env, user, caseId);
    if (!access.ok) return access.response;
    const imageRows = await env.partner_evaluation_db.prepare(`
      SELECT object_key FROM voc_images_v2 WHERE case_id = ?
    `).bind(caseId).all();
    const keys = (imageRows.results || []).map(image => image.object_key).filter(Boolean);
    await env.partner_evaluation_db.batch([
      env.partner_evaluation_db.prepare(`DELETE FROM voc_preview_tickets_v2 WHERE image_id IN (SELECT id FROM voc_images_v2 WHERE case_id = ?)`).bind(caseId),
      env.partner_evaluation_db.prepare(`DELETE FROM voc_images_v2 WHERE case_id = ?`).bind(caseId),
      env.partner_evaluation_db.prepare(`DELETE FROM voc_case_logs_v2 WHERE case_id = ?`).bind(caseId),
      env.partner_evaluation_db.prepare(`DELETE FROM voc_cases_v2 WHERE id = ?`).bind(caseId)
    ]);
    if (env.EVIDENCE_FILES) await Promise.allSettled(keys.map(key => env.EVIDENCE_FILES.delete(key)));
    return json({ success: true, deleted_images: keys.length });
  }
  if (adminMatch && request.method === 'PATCH') {
    if (user.role !== 'admin') return json({ success: false, error: '관리자 권한이 필요합니다.' }, 403);
    const caseId = decodeURIComponent(adminMatch[1]);
    const access = await accessCase(env, user, caseId);
    if (!access.ok) return access.response;
    const body = await request.json().catch(() => ({}));
    const status = ADMIN_STATUSES.has(body.status) ? body.status : access.item.status;
    const reply = clean(body.admin_reply, 4000) || null;
    if (['answered', 'closed'].includes(status) && !reply) return json({ success: false, error: '답변완료 또는 종결 처리하려면 관리자 답변을 입력하세요.' }, 400);
    const replyChanged = String(reply || '') !== String(access.item.admin_reply || '');
    await env.partner_evaluation_db.batch([
      env.partner_evaluation_db.prepare(`
        UPDATE voc_cases_v2
        SET status = ?, admin_reply = ?, replied_by = ?,
            replied_at = CASE WHEN ? = 1 AND ? IS NOT NULL THEN CURRENT_TIMESTAMP ELSE replied_at END,
            closed_at = CASE WHEN ? = 'closed' THEN COALESCE(closed_at, CURRENT_TIMESTAMP) ELSE NULL END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status <> 'draft'
      `).bind(status, reply, reply ? user.id || null : null, replyChanged ? 1 : 0, reply, status, caseId),
      caseLog(
        env, caseId, 'admin_updated',
        { status: access.item.status, admin_reply: access.item.admin_reply },
        { status, admin_reply: reply }, user.id
      )
    ]);
    return json({ success: true, item: await detailById(env, caseId, true) });
  }

  return json({ success: false, error: '지원하지 않는 VOC 요청입니다.' }, 404);
}
