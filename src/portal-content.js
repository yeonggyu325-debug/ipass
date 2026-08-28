const RESOURCE_CATEGORIES = new Set(['guide', 'form', 'education', 'law', 'other']);
const OWNER_TYPES = new Set(['notice', 'resource']);
const FILE_ROLES = new Set(['attachment', 'popup_image']);
const ALLOWED_EXTENSIONS = new Set(['pdf', 'hwp', 'hwpx', 'xls', 'xlsx', 'doc', 'docx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'webp']);
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const MAX_FILE_BYTES = 25 * 1024 * 1024;
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

function bool(value, fallback = false) {
  if (value === undefined || value === null) return fallback ? 1 : 0;
  return value === true || value === 1 || value === '1' ? 1 : 0;
}

function safeFileName(value) {
  return String(value || 'attachment')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180) || 'attachment';
}

function extensionOf(name) {
  const value = String(name || '');
  const index = value.lastIndexOf('.');
  return index > 0 ? value.slice(index + 1).toLowerCase() : '';
}

function normalizeDate(value) {
  const text = clean(value, 40);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
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

function logStatement(env, ownerType, ownerId, action, detail, userId) {
  return env.partner_evaluation_db.prepare(`
    INSERT INTO portal_content_logs_v2 (id, owner_type, owner_id, action, detail_json, changed_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), ownerType, ownerId, action, detail == null ? null : JSON.stringify(detail), userId || null);
}

function previewMime(file) {
  const ext = extensionOf(file.file_name);
  const map = {
    pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    hwp: 'application/x-hwp', hwpx: 'application/vnd.hancom.hwpx',
    xls: 'application/vnd.ms-excel', doc: 'application/msword', ppt: 'application/vnd.ms-powerpoint'
  };
  return map[ext] || file.content_type || 'application/octet-stream';
}

async function inspectFile(file, popupImage = false) {
  const extension = extensionOf(file.name);
  if (!ALLOWED_EXTENSIONS.has(extension)) return { error: 'PDF, 한글, Excel, Word, PowerPoint 또는 이미지 파일만 등록할 수 있습니다.' };
  if (popupImage && !IMAGE_EXTENSIONS.has(extension)) return { error: '팝업 이미지는 JPG, PNG, WebP 파일만 등록할 수 있습니다.' };
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const starts = (...values) => values.every((value, index) => bytes[index] === value);
  const zip = starts(0x50, 0x4b, 0x03, 0x04) || starts(0x50, 0x4b, 0x05, 0x06) || starts(0x50, 0x4b, 0x07, 0x08);
  const ole = starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
  const valid = {
    pdf: starts(0x25, 0x50, 0x44, 0x46),
    jpg: starts(0xff, 0xd8, 0xff), jpeg: starts(0xff, 0xd8, 0xff),
    png: starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
    webp: starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50,
    xlsx: zip, docx: zip, pptx: zip, hwpx: zip,
    xls: ole, doc: ole, ppt: ole, hwp: ole
  }[extension];
  if (!valid) return { error: '파일 내용과 확장자가 일치하지 않습니다.' };
  const contentTypes = {
    pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    hwpx: 'application/vnd.hancom.hwpx', hwp: 'application/x-hwp',
    xls: 'application/vnd.ms-excel', doc: 'application/msword', ppt: 'application/vnd.ms-powerpoint'
  };
  return { extension, contentType: contentTypes[extension] };
}

async function ownerExists(env, ownerType, ownerId, includeInactive = false) {
  if (ownerType === 'notice') {
    return env.partner_evaluation_db.prepare(`SELECT id, is_active FROM portal_notices WHERE id = ? ${includeInactive ? '' : 'AND is_active = 1'} LIMIT 1`).bind(ownerId).first();
  }
  return env.partner_evaluation_db.prepare(`SELECT id, is_active FROM safety_resources_v2 WHERE id = ? ${includeInactive ? '' : 'AND is_active = 1'} LIMIT 1`).bind(ownerId).first();
}

async function contentFile(env, fileId) {
  return env.partner_evaluation_db.prepare(`
    SELECT * FROM portal_content_files_v2 WHERE id = ? AND deleted_at IS NULL LIMIT 1
  `).bind(fileId).first();
}

async function fileAccess(env, user, fileId) {
  const file = await contentFile(env, fileId);
  if (!file) return { ok: false, response: json({ success: false, error: '첨부파일을 찾을 수 없습니다.' }, 404) };
  const owner = await ownerExists(env, file.owner_type, file.owner_id, user.role === 'admin');
  if (!owner) return { ok: false, response: json({ success: false, error: '첨부파일에 접근할 수 없습니다.' }, 404) };
  return { ok: true, file };
}

async function streamObject(env, file, disposition = 'inline') {
  if (!env.EVIDENCE_FILES) return json({ success: false, error: '파일 저장소가 연결되지 않았습니다.' }, 503);
  const object = await env.EVIDENCE_FILES.get(file.object_key);
  if (!object) return json({ success: false, error: '저장된 파일을 찾을 수 없습니다.' }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('content-type', previewMime(file));
  headers.set('content-disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(file.file_name)}`);
  headers.set('content-length', String(object.size));
  headers.set('cache-control', 'private, no-store, max-age=0');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('access-control-allow-origin', '*');
  return new Response(object.body, { headers });
}

async function publicNotices(request, env) {
  const url = new URL(request.url);
  const placement = url.searchParams.get('placement') === 'after_login' ? 'after_login' : 'login';
  const column = placement === 'after_login' ? 'show_after_login' : 'show_on_login';
  const result = await env.partner_evaluation_db.prepare(`
    SELECT n.id, n.title, n.content, n.is_important, n.created_at,
      pf.id AS popup_image_id, pf.file_name AS popup_image_name,
      pf.content_type AS popup_image_type, pf.file_size AS popup_image_size
    FROM portal_notices n
    LEFT JOIN portal_content_files_v2 pf
      ON pf.owner_type = 'notice' AND pf.owner_id = n.id
      AND pf.file_role = 'popup_image' AND pf.deleted_at IS NULL
    WHERE n.is_active = 1 AND n.${column} = 1
      AND (n.start_at IS NULL OR n.start_at <= CURRENT_TIMESTAMP)
      AND (n.end_at IS NULL OR n.end_at >= CURRENT_TIMESTAMP)
    ORDER BY n.is_important DESC, n.created_at DESC
    LIMIT 50
  `).all();
  const origin = url.origin;
  const notices = (result.results || []).map(row => ({
    ...row,
    popup_image_url: row.popup_image_id
      ? `${origin}/api/content/public/notices/${encodeURIComponent(row.id)}/popup-image`
      : null
  }));
  return json({ success: true, notices });
}

async function publicPopupImage(env, noticeId) {
  const file = await env.partner_evaluation_db.prepare(`
    SELECT f.* FROM portal_content_files_v2 f
    JOIN portal_notices n ON n.id = f.owner_id
    WHERE f.owner_type = 'notice' AND f.owner_id = ? AND f.file_role = 'popup_image'
      AND f.deleted_at IS NULL AND n.is_active = 1
      AND (n.show_on_login = 1 OR n.show_after_login = 1)
      AND (n.start_at IS NULL OR n.start_at <= CURRENT_TIMESTAMP)
      AND (n.end_at IS NULL OR n.end_at >= CURRENT_TIMESTAMP)
    LIMIT 1
  `).bind(noticeId).first();
  if (!file) return json({ success: false, error: '팝업 이미지를 찾을 수 없습니다.' }, 404);
  return streamObject(env, file, 'inline');
}

async function noticeDetail(env, noticeId, includeInactive = false) {
  const statements = [
    env.partner_evaluation_db.prepare(`SELECT * FROM portal_notices WHERE id = ? ${includeInactive ? '' : 'AND is_active = 1'} LIMIT 1`).bind(noticeId),
    env.partner_evaluation_db.prepare(`
      SELECT id, owner_type, owner_id, file_role, file_name, content_type, file_size, created_at
      FROM portal_content_files_v2
      WHERE owner_type = 'notice' AND owner_id = ? AND deleted_at IS NULL
      ORDER BY CASE file_role WHEN 'popup_image' THEN 0 ELSE 1 END, created_at, id
    `).bind(noticeId)
  ];
  const results = await env.partner_evaluation_db.batch(statements);
  const notice = results[0]?.results?.[0];
  if (!notice) return null;
  return { ...notice, files: results[1]?.results || [] };
}

async function resourceDetail(env, resourceId, includeInactive = false) {
  const statements = [
    env.partner_evaluation_db.prepare(`SELECT * FROM safety_resources_v2 WHERE id = ? ${includeInactive ? '' : 'AND is_active = 1'} LIMIT 1`).bind(resourceId),
    env.partner_evaluation_db.prepare(`
      SELECT id, owner_type, owner_id, file_role, file_name, content_type, file_size, created_at
      FROM portal_content_files_v2
      WHERE owner_type = 'resource' AND owner_id = ? AND deleted_at IS NULL
      ORDER BY created_at, id
    `).bind(resourceId)
  ];
  const results = await env.partner_evaluation_db.batch(statements);
  const resource = results[0]?.results?.[0];
  if (!resource) return null;
  return { ...resource, files: results[1]?.results || [] };
}

async function listNotices(env, user, url) {
  const query = clean(url.searchParams.get('q'), 100);
  const like = `%${query}%`;
  const includeInactive = user.role === 'admin' && url.searchParams.get('include_inactive') === '1';
  const result = await env.partner_evaluation_db.prepare(`
    SELECT n.*,
      (SELECT COUNT(*) FROM portal_content_files_v2 f WHERE f.owner_type = 'notice' AND f.owner_id = n.id AND f.deleted_at IS NULL) AS file_count,
      (SELECT id FROM portal_content_files_v2 f WHERE f.owner_type = 'notice' AND f.owner_id = n.id AND f.file_role = 'popup_image' AND f.deleted_at IS NULL LIMIT 1) AS popup_image_id
    FROM portal_notices n
    WHERE (${includeInactive ? '1 = 1' : 'n.is_active = 1'})
      AND (? = '' OR n.title LIKE ? OR n.content LIKE ?)
    ORDER BY n.is_active DESC, n.is_important DESC, n.created_at DESC
    LIMIT 300
  `).bind(query, like, like).all();
  return (result.results || []).map(row => ({ ...row, file_count: Number(row.file_count || 0) }));
}

async function listResources(env, user, url) {
  const query = clean(url.searchParams.get('q'), 100);
  const categoryInput = clean(url.searchParams.get('category'), 30);
  const category = RESOURCE_CATEGORIES.has(categoryInput) ? categoryInput : '';
  const like = `%${query}%`;
  const includeInactive = user.role === 'admin' && url.searchParams.get('include_inactive') === '1';
  const result = await env.partner_evaluation_db.prepare(`
    SELECT r.*,
      (SELECT COUNT(*) FROM portal_content_files_v2 f WHERE f.owner_type = 'resource' AND f.owner_id = r.id AND f.deleted_at IS NULL) AS file_count
    FROM safety_resources_v2 r
    WHERE (${includeInactive ? '1 = 1' : 'r.is_active = 1'})
      AND (? = '' OR r.category = ?)
      AND (? = '' OR r.title LIKE ? OR COALESCE(r.description, '') LIKE ?)
    ORDER BY r.is_active DESC, r.is_pinned DESC, r.created_at DESC
    LIMIT 500
  `).bind(category, category, query, like, like).all();
  return (result.results || []).map(row => ({ ...row, file_count: Number(row.file_count || 0) }));
}

async function createNotice(env, user, body) {
  const title = clean(body.title, 160);
  const content = clean(body.content, 12000);
  if (!title || !content) return { error: '제목과 내용을 입력하세요.', status: 400 };
  const id = crypto.randomUUID();
  await env.partner_evaluation_db.batch([
    env.partner_evaluation_db.prepare(`
      INSERT INTO portal_notices (
        id, title, content, is_important, show_on_login, show_after_login,
        is_active, start_at, end_at, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(
      id, title, content, bool(body.is_important), bool(body.show_on_login),
      bool(body.show_after_login, true), bool(body.is_active, true),
      normalizeDate(body.start_at), normalizeDate(body.end_at), user.id || null
    ),
    logStatement(env, 'notice', id, 'created', { title }, user.id)
  ]);
  return { notice: await noticeDetail(env, id, true) };
}

async function updateNotice(env, user, noticeId, body) {
  const before = await noticeDetail(env, noticeId, true);
  if (!before) return { error: '공지사항을 찾을 수 없습니다.', status: 404 };
  const title = clean(body.title ?? before.title, 160);
  const content = clean(body.content ?? before.content, 12000);
  if (!title || !content) return { error: '제목과 내용을 입력하세요.', status: 400 };
  await env.partner_evaluation_db.batch([
    env.partner_evaluation_db.prepare(`
      UPDATE portal_notices SET title = ?, content = ?, is_important = ?,
        show_on_login = ?, show_after_login = ?, is_active = ?, start_at = ?, end_at = ?,
        updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(
      title, content, bool(body.is_important, Number(before.is_important) === 1),
      bool(body.show_on_login, Number(before.show_on_login) === 1),
      bool(body.show_after_login, Number(before.show_after_login) === 1),
      bool(body.is_active, Number(before.is_active) === 1),
      body.start_at === undefined ? before.start_at : normalizeDate(body.start_at),
      body.end_at === undefined ? before.end_at : normalizeDate(body.end_at), noticeId
    ),
    logStatement(env, 'notice', noticeId, 'updated', { title }, user.id)
  ]);
  return { notice: await noticeDetail(env, noticeId, true) };
}

async function createResource(env, user, body) {
  const title = clean(body.title, 180);
  const description = clean(body.description, 8000);
  const category = RESOURCE_CATEGORIES.has(body.category) ? body.category : 'guide';
  if (!title) return { error: '자료 제목을 입력하세요.', status: 400 };
  const id = crypto.randomUUID();
  await env.partner_evaluation_db.batch([
    env.partner_evaluation_db.prepare(`
      INSERT INTO safety_resources_v2 (id, category, title, description, is_pinned, is_active, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(id, category, title, description || null, bool(body.is_pinned), bool(body.is_active, true), user.id || null),
    logStatement(env, 'resource', id, 'created', { title, category }, user.id)
  ]);
  return { resource: await resourceDetail(env, id, true) };
}

async function updateResource(env, user, resourceId, body) {
  const before = await resourceDetail(env, resourceId, true);
  if (!before) return { error: '안전자료를 찾을 수 없습니다.', status: 404 };
  const title = clean(body.title ?? before.title, 180);
  const description = clean(body.description ?? before.description, 8000);
  const category = RESOURCE_CATEGORIES.has(body.category) ? body.category : before.category;
  if (!title) return { error: '자료 제목을 입력하세요.', status: 400 };
  await env.partner_evaluation_db.batch([
    env.partner_evaluation_db.prepare(`
      UPDATE safety_resources_v2 SET category = ?, title = ?, description = ?, is_pinned = ?,
        is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(
      category, title, description || null,
      bool(body.is_pinned, Number(before.is_pinned) === 1),
      bool(body.is_active, Number(before.is_active) === 1), resourceId
    ),
    logStatement(env, 'resource', resourceId, 'updated', { title, category }, user.id)
  ]);
  return { resource: await resourceDetail(env, resourceId, true) };
}

async function uploadFile(request, env, user, ownerType, ownerId) {
  if (!env.EVIDENCE_FILES) return { error: '파일 저장소가 연결되지 않았습니다.', status: 503 };
  if (!OWNER_TYPES.has(ownerType)) return { error: '지원하지 않는 자료 유형입니다.', status: 400 };
  const owner = await ownerExists(env, ownerType, ownerId, true);
  if (!owner) return { error: '첨부 대상을 찾을 수 없습니다.', status: 404 };
  const form = await request.formData();
  const file = form.get('file');
  const requestedRole = clean(form.get('role'), 30);
  const fileRole = FILE_ROLES.has(requestedRole) ? requestedRole : 'attachment';
  if (ownerType === 'resource' && fileRole !== 'attachment') return { error: '안전자료에는 일반 첨부파일만 등록할 수 있습니다.', status: 400 };
  if (!(file instanceof File) || !file.name) return { error: '등록할 파일을 선택하세요.', status: 400 };
  if (file.size <= 0 || file.size > MAX_FILE_BYTES) return { error: '파일은 개당 25MB 이하만 등록할 수 있습니다.', status: 400 };
  const inspection = await inspectFile(file, fileRole === 'popup_image');
  if (inspection.error) return { error: inspection.error, status: 400 };
  const id = crypto.randomUUID();
  const fileName = safeFileName(file.name);
  const objectKey = `portal-content/${ownerType}/${ownerId}/${id}-${fileName}`;
  const oldPopup = fileRole === 'popup_image'
    ? await env.partner_evaluation_db.prepare(`
        SELECT * FROM portal_content_files_v2
        WHERE owner_type = 'notice' AND owner_id = ? AND file_role = 'popup_image' AND deleted_at IS NULL LIMIT 1
      `).bind(ownerId).first()
    : null;
  try {
    await env.EVIDENCE_FILES.put(objectKey, file.stream(), {
      httpMetadata: { contentType: inspection.contentType },
      customMetadata: { originalName: fileName, uploadedBy: String(user.id || ''), ownerType, ownerId, fileRole }
    });
    const statements = [];
    if (oldPopup) statements.push(env.partner_evaluation_db.prepare(`UPDATE portal_content_files_v2 SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(oldPopup.id));
    statements.push(
      env.partner_evaluation_db.prepare(`
        INSERT INTO portal_content_files_v2 (
          id, owner_type, owner_id, file_role, object_key, file_name, content_type, file_size, uploaded_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(id, ownerType, ownerId, fileRole, objectKey, fileName, inspection.contentType, file.size, user.id || null),
      logStatement(env, ownerType, ownerId, fileRole === 'popup_image' ? 'popup_image_added' : 'file_added', { file_id: id, file_name: fileName, file_size: file.size }, user.id)
    );
    await env.partner_evaluation_db.batch(statements);
    if (oldPopup) await env.EVIDENCE_FILES.delete(oldPopup.object_key).catch(() => {});
  } catch (error) {
    await env.EVIDENCE_FILES.delete(objectKey).catch(() => {});
    if (String(error?.message || error).includes('PORTAL_CONTENT_FILE_QUOTA_EXCEEDED')) {
      return { error: '첨부파일은 게시물당 최대 10개, 합계 100MB까지 등록할 수 있습니다.', status: 409 };
    }
    throw error;
  }
  return { file: { id, owner_type: ownerType, owner_id: ownerId, file_role: fileRole, file_name: fileName, content_type: inspection.contentType, file_size: file.size, created_at: new Date().toISOString() } };
}

export async function handlePortalContent(request, env, ctx, baseWorker) {
  const url = new URL(request.url);
  const path = url.pathname;
  const relevant = path === '/api/public/notices' || path.startsWith('/api/content/') || path.startsWith('/api/admin/content/');
  if (!relevant) return null;
  if (request.method === 'OPTIONS') return json({ success: true });

  if (path === '/api/public/notices' && request.method === 'GET') return publicNotices(request, env);
  const popupMatch = path.match(/^\/api\/content\/public\/notices\/([^/]+)\/popup-image$/);
  if (popupMatch && request.method === 'GET') return publicPopupImage(env, decodeURIComponent(popupMatch[1]));
  const publicPreviewMatch = path.match(/^\/api\/content\/preview\/([^/]+)(?:\/[^/]+)?$/);
  if (publicPreviewMatch && request.method === 'GET') {
    const file = await env.partner_evaluation_db.prepare(`
      SELECT f.* FROM portal_content_preview_tickets_v2 p
      JOIN portal_content_files_v2 f ON f.id = p.file_id
      WHERE p.id = ? AND p.expires_at > CURRENT_TIMESTAMP AND f.deleted_at IS NULL LIMIT 1
    `).bind(decodeURIComponent(publicPreviewMatch[1])).first();
    if (!file) return json({ success: false, error: '미리보기 링크가 만료되었거나 유효하지 않습니다.' }, 410);
    return streamObject(env, file, 'inline');
  }

  const auth = await account(request, env, ctx, baseWorker);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  if (path === '/api/content/notices' && request.method === 'GET') return json({ success: true, notices: await listNotices(env, user, url), user: { role: user.role } });
  const noticeMatch = path.match(/^\/api\/content\/notices\/([^/]+)$/);
  if (noticeMatch && request.method === 'GET') {
    const notice = await noticeDetail(env, decodeURIComponent(noticeMatch[1]), user.role === 'admin');
    return notice ? json({ success: true, notice }) : json({ success: false, error: '공지사항을 찾을 수 없습니다.' }, 404);
  }
  if (path === '/api/content/resources' && request.method === 'GET') return json({ success: true, resources: await listResources(env, user, url), user: { role: user.role } });
  const resourceMatch = path.match(/^\/api\/content\/resources\/([^/]+)$/);
  if (resourceMatch && request.method === 'GET') {
    const resource = await resourceDetail(env, decodeURIComponent(resourceMatch[1]), user.role === 'admin');
    return resource ? json({ success: true, resource }) : json({ success: false, error: '안전자료를 찾을 수 없습니다.' }, 404);
  }

  const previewTicketMatch = path.match(/^\/api\/content\/files\/([^/]+)\/preview-ticket$/);
  if (previewTicketMatch && request.method === 'POST') {
    const access = await fileAccess(env, user, decodeURIComponent(previewTicketMatch[1]));
    if (!access.ok) return access.response;
    const id = crypto.randomUUID();
    await env.partner_evaluation_db.batch([
      env.partner_evaluation_db.prepare(`DELETE FROM portal_content_preview_tickets_v2 WHERE expires_at <= CURRENT_TIMESTAMP`),
      env.partner_evaluation_db.prepare(`
        INSERT INTO portal_content_preview_tickets_v2 (id, file_id, issued_by, expires_at)
        VALUES (?, ?, ?, datetime('now', ?))
      `).bind(id, access.file.id, user.id || null, `+${PREVIEW_TICKET_MINUTES} minutes`)
    ]);
    const sourceUrl = `${url.origin}/api/content/preview/${encodeURIComponent(id)}/${encodeURIComponent(access.file.file_name)}`;
    return json({
      success: true,
      source_url: sourceUrl,
      viewer_url: `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(sourceUrl)}`,
      office_viewer_url: `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(sourceUrl)}`,
      expires_in_seconds: PREVIEW_TICKET_MINUTES * 60
    });
  }
  const fileMatch = path.match(/^\/api\/content\/files\/([^/]+)$/);
  if (fileMatch && request.method === 'GET') {
    const access = await fileAccess(env, user, decodeURIComponent(fileMatch[1]));
    return access.ok ? streamObject(env, access.file, 'attachment') : access.response;
  }

  if (user.role !== 'admin') return json({ success: false, error: '관리자 권한이 필요합니다.' }, 403);

  if (path === '/api/admin/content/notices' && request.method === 'POST') {
    const result = await createNotice(env, user, await request.json());
    return result.error ? json({ success: false, error: result.error }, result.status) : json({ success: true, notice: result.notice }, 201);
  }
  const adminNoticeMatch = path.match(/^\/api\/admin\/content\/notices\/([^/]+)$/);
  if (adminNoticeMatch && request.method === 'PATCH') {
    const result = await updateNotice(env, user, decodeURIComponent(adminNoticeMatch[1]), await request.json());
    return result.error ? json({ success: false, error: result.error }, result.status) : json({ success: true, notice: result.notice });
  }
  if (adminNoticeMatch && request.method === 'DELETE') {
    const id = decodeURIComponent(adminNoticeMatch[1]);
    const result = await updateNotice(env, user, id, { is_active: false });
    return result.error ? json({ success: false, error: result.error }, result.status) : json({ success: true, notice: result.notice });
  }
  const noticeUploadMatch = path.match(/^\/api\/admin\/content\/notices\/([^/]+)\/files$/);
  if (noticeUploadMatch && request.method === 'POST') {
    const result = await uploadFile(request, env, user, 'notice', decodeURIComponent(noticeUploadMatch[1]));
    return result.error ? json({ success: false, error: result.error }, result.status) : json({ success: true, file: result.file }, 201);
  }

  if (path === '/api/admin/content/resources' && request.method === 'POST') {
    const result = await createResource(env, user, await request.json());
    return result.error ? json({ success: false, error: result.error }, result.status) : json({ success: true, resource: result.resource }, 201);
  }
  const adminResourceMatch = path.match(/^\/api\/admin\/content\/resources\/([^/]+)$/);
  if (adminResourceMatch && request.method === 'PATCH') {
    const result = await updateResource(env, user, decodeURIComponent(adminResourceMatch[1]), await request.json());
    return result.error ? json({ success: false, error: result.error }, result.status) : json({ success: true, resource: result.resource });
  }
  if (adminResourceMatch && request.method === 'DELETE') {
    const id = decodeURIComponent(adminResourceMatch[1]);
    const result = await updateResource(env, user, id, { is_active: false });
    return result.error ? json({ success: false, error: result.error }, result.status) : json({ success: true, resource: result.resource });
  }
  const resourceUploadMatch = path.match(/^\/api\/admin\/content\/resources\/([^/]+)\/files$/);
  if (resourceUploadMatch && request.method === 'POST') {
    const result = await uploadFile(request, env, user, 'resource', decodeURIComponent(resourceUploadMatch[1]));
    return result.error ? json({ success: false, error: result.error }, result.status) : json({ success: true, file: result.file }, 201);
  }

  const adminFileMatch = path.match(/^\/api\/admin\/content\/files\/([^/]+)$/);
  if (adminFileMatch && request.method === 'DELETE') {
    const file = await contentFile(env, decodeURIComponent(adminFileMatch[1]));
    if (!file) return json({ success: false, error: '첨부파일을 찾을 수 없습니다.' }, 404);
    await env.partner_evaluation_db.batch([
      env.partner_evaluation_db.prepare(`UPDATE portal_content_files_v2 SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(file.id),
      logStatement(env, file.owner_type, file.owner_id, 'file_deleted', { file_id: file.id, file_name: file.file_name }, user.id)
    ]);
    if (env.EVIDENCE_FILES) await env.EVIDENCE_FILES.delete(file.object_key).catch(() => {});
    return json({ success: true });
  }

  return json({ success: false, error: '지원하지 않는 요청입니다.' }, 405);
}
