const ATTENDEE_TYPES = new Set(['representative', 'delegate']);
const ALLOWED_EXTENSIONS = new Set(['pdf', 'hwp', 'hwpx', 'doc', 'docx', 'jpg', 'jpeg', 'png']);
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const MIME_BY_EXTENSION = {
  pdf: 'application/pdf',
  hwp: 'application/x-hwp',
  hwpx: 'application/vnd.hancom.hwpx',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png'
};

let schemaReady = null;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json;charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization,content-type,x-request-id',
      'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS'
    }
  });
}

function clean(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

function safeFileName(value) {
  return String(value || 'delegation.pdf')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180) || 'delegation.pdf';
}

function extensionOf(name) {
  const value = String(name || '');
  const index = value.lastIndexOf('.');
  return index > 0 ? value.slice(index + 1).toLowerCase() : '';
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

async function ensureSchema(env) {
  if (schemaReady) return schemaReady;
  schemaReady = env.partner_evaluation_db.batch([
    env.partner_evaluation_db.prepare(`CREATE TABLE IF NOT EXISTS committee_attendance_submissions (
      id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL, company_id TEXT NOT NULL,
      attendee_type TEXT NOT NULL CHECK(attendee_type IN ('representative','delegate')),
      attendee_position TEXT NOT NULL, attendee_name TEXT NOT NULL, submitted_by TEXT,
      submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(meeting_id, company_id))`),
    env.partner_evaluation_db.prepare(`CREATE INDEX IF NOT EXISTS idx_committee_attendance_submissions_meeting ON committee_attendance_submissions(meeting_id, company_id)`),
    env.partner_evaluation_db.prepare(`CREATE TABLE IF NOT EXISTS committee_delegation_files (
      id TEXT PRIMARY KEY, submission_id TEXT NOT NULL, object_key TEXT NOT NULL UNIQUE,
      file_name TEXT NOT NULL, content_type TEXT, file_size INTEGER NOT NULL DEFAULT 0,
      uploaded_by TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, deleted_at TEXT)`),
    env.partner_evaluation_db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_committee_delegation_files_active ON committee_delegation_files(submission_id) WHERE deleted_at IS NULL`),
    env.partner_evaluation_db.prepare(`CREATE TABLE IF NOT EXISTS committee_attendance_submission_logs (
      id TEXT PRIMARY KEY, submission_id TEXT NOT NULL, action TEXT NOT NULL, detail_json TEXT,
      changed_by TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
  ]).catch(error => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

async function validateFile(file) {
  if (!(file instanceof File) || !file.name) return { error: '위임장 파일을 선택하세요.' };
  if (file.size <= 0 || file.size > MAX_FILE_BYTES) return { error: '위임장은 10MB 이하 파일만 첨부할 수 있습니다.' };
  const extension = extensionOf(file.name);
  if (!ALLOWED_EXTENSIONS.has(extension)) return { error: '위임장은 PDF, 한글, Word, JPG, PNG 파일로 제출하세요.' };
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const starts = (...values) => values.every((value, index) => bytes[index] === value);
  const zip = starts(0x50, 0x4b, 0x03, 0x04) || starts(0x50, 0x4b, 0x05, 0x06) || starts(0x50, 0x4b, 0x07, 0x08);
  const ole = starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
  const valid = {
    pdf: starts(0x25, 0x50, 0x44, 0x46),
    hwp: ole, hwpx: zip, doc: ole, docx: zip,
    jpg: starts(0xff, 0xd8, 0xff), jpeg: starts(0xff, 0xd8, 0xff),
    png: starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
  }[extension];
  if (!valid) return { error: '파일 내용과 확장자가 일치하지 않거나 손상된 파일입니다.' };
  return { extension, contentType: MIME_BY_EXTENSION[extension] };
}

async function attendanceAccess(env, user, meetingId, requireDraft = false) {
  if (user.role !== 'partner' || !user.company_id) {
    return { ok: false, response: json({ success: false, error: '협력사 계정이 필요합니다.' }, 403) };
  }
  const row = await env.partner_evaluation_db.prepare(`
    SELECT cm.id AS meeting_id, cm.year, cm.meeting_month, cm.meeting_date, cm.title, cm.status AS meeting_status,
      cpa.attendance_status, cpa.attendee_position, cpa.attendee_name, c.company_name
    FROM committee_meetings cm
    JOIN committee_partner_attendance cpa ON cpa.meeting_id = cm.id
    JOIN companies c ON c.id = cpa.company_id
    WHERE cm.id = ? AND cpa.company_id = ? LIMIT 1
  `).bind(meetingId, user.company_id).first();
  if (!row) return { ok: false, response: json({ success: false, error: '이 협의체의 대상 협력사가 아닙니다.' }, 404) };
  if (requireDraft && row.meeting_status !== 'draft') {
    return { ok: false, response: json({ success: false, error: '완료된 협의체의 참석정보는 수정할 수 없습니다.' }, 409) };
  }
  return { ok: true, row };
}

async function submissionFor(env, meetingId, companyId) {
  return env.partner_evaluation_db.prepare(`
    SELECT s.id, s.meeting_id, s.company_id, s.attendee_type, s.attendee_position, s.attendee_name,
      s.submitted_at, s.updated_at, f.id AS delegation_file_id, f.file_name AS delegation_file_name,
      f.content_type AS delegation_content_type, f.file_size AS delegation_file_size
    FROM committee_attendance_submissions s
    LEFT JOIN committee_delegation_files f ON f.submission_id = s.id AND f.deleted_at IS NULL
    WHERE s.meeting_id = ? AND s.company_id = ? LIMIT 1
  `).bind(meetingId, companyId).first();
}

async function augmentOverview(response, env, user) {
  if (!response.ok) return response;
  const data = await response.clone().json().catch(() => null);
  if (!data?.success || user.role !== 'partner' || !user.company_id) return response;
  const meetingResult = await env.partner_evaluation_db.prepare(`
    SELECT cm.id, cm.meeting_month, cm.meeting_date, cm.title, cm.note, cm.status,
      cpa.attendance_status,
      CASE WHEN cpa.attendance_status = 'present' THEN cpa.attendee_position ELSE NULL END AS attendee_position,
      CASE WHEN cpa.attendance_status = 'present' THEN cpa.attendee_name ELSE NULL END AS attendee_name
    FROM committee_partner_attendance cpa
    JOIN committee_meetings cm ON cm.id = cpa.meeting_id
    WHERE cpa.company_id = ? AND cm.year = ? AND cm.status IN ('draft', 'finalized')
    ORDER BY cm.meeting_month DESC, cm.meeting_date DESC
  `).bind(user.company_id, Number(data.year)).all();
  const meetings = meetingResult.results || [];
  data.meetings = meetings;
  if (!meetings.length) return response;
  const placeholders = meetings.map(() => '?').join(',');
  const result = await env.partner_evaluation_db.prepare(`
    SELECT s.id, s.meeting_id, s.attendee_type, s.attendee_position, s.attendee_name, s.submitted_at,
      f.id AS delegation_file_id, f.file_name AS delegation_file_name, f.file_size AS delegation_file_size
    FROM committee_attendance_submissions s
    LEFT JOIN committee_delegation_files f ON f.submission_id = s.id AND f.deleted_at IS NULL
    WHERE s.company_id = ? AND s.meeting_id IN (${placeholders})
  `).bind(user.company_id, ...meetings.map(meeting => meeting.id)).all();
  const byMeeting = new Map((result.results || []).map(row => [row.meeting_id, row]));
  data.meetings = meetings.map(meeting => ({ ...meeting, attendance_submission: byMeeting.get(meeting.id) || null }));
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(JSON.stringify(data), { status: response.status, headers });
}

async function augmentAdminDetail(response, env) {
  if (!response.ok) return response;
  const data = await response.clone().json().catch(() => null);
  if (!data?.success || !data.meeting?.id) return response;
  const result = await env.partner_evaluation_db.prepare(`
    SELECT s.company_id, s.attendee_type, s.attendee_position AS submitted_attendee_position,
      s.attendee_name AS submitted_attendee_name, s.submitted_at,
      f.id AS delegation_file_id, f.file_name AS delegation_file_name, f.file_size AS delegation_file_size
    FROM committee_attendance_submissions s
    LEFT JOIN committee_delegation_files f ON f.submission_id = s.id AND f.deleted_at IS NULL
    WHERE s.meeting_id = ?
  `).bind(data.meeting.id).all();
  const byCompany = new Map((result.results || []).map(row => [row.company_id, row]));
  data.meeting.partners = (data.meeting.partners || []).map(row => ({ ...row, attendance_submission: byCompany.get(row.company_id) || null }));
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(JSON.stringify(data), { status: response.status, headers });
}

async function saveAttendance(request, env, user, meetingId) {
  const access = await attendanceAccess(env, user, meetingId, true);
  if (!access.ok) return access.response;
  const form = await request.formData();
  const attendeeType = clean(form.get('attendee_type'), 30);
  if (!ATTENDEE_TYPES.has(attendeeType)) return json({ success: false, error: '대표이사 참석 또는 대리 참석을 선택하세요.' }, 400);
  const attendeeName = clean(form.get('attendee_name'), 100);
  const attendeePosition = attendeeType === 'representative' ? '대표이사' : clean(form.get('attendee_position'), 100);
  if (!attendeeName) return json({ success: false, error: '참석자 성명을 입력하세요.' }, 400);
  if (!attendeePosition) return json({ success: false, error: '대리 참석자의 직급을 입력하세요.' }, 400);

  const existing = await submissionFor(env, meetingId, user.company_id);
  const incoming = form.get('file');
  const hasIncoming = attendeeType === 'delegate' && incoming instanceof File && incoming.name && incoming.size > 0;
  if (attendeeType === 'delegate' && !hasIncoming && !existing?.delegation_file_id) {
    return json({ success: false, error: '대표이사가 아닌 대리 참석자는 위임장을 반드시 첨부해야 합니다.' }, 400);
  }

  let uploaded = null;
  if (hasIncoming) {
    if (!env.EVIDENCE_FILES) return json({ success: false, error: '위임장 파일 저장소가 연결되지 않았습니다.' }, 503);
    const validation = await validateFile(incoming);
    if (validation.error) return json({ success: false, error: validation.error }, 400);
    const fileId = crypto.randomUUID();
    const name = safeFileName(incoming.name);
    const objectKey = `committee-delegations/${access.row.year}/${String(access.row.meeting_month).padStart(2, '0')}/${user.company_id}/${meetingId}/${fileId}-${name}`;
    await env.EVIDENCE_FILES.put(objectKey, incoming.stream(), {
      httpMetadata: { contentType: validation.contentType },
      customMetadata: { originalName: name, uploadedBy: String(user.id || ''), meetingId, companyId: String(user.company_id) }
    });
    uploaded = { id: fileId, objectKey, name, contentType: validation.contentType, size: incoming.size };
  }

  const submissionId = existing?.id || `${meetingId}:${user.company_id}`;
  const statements = [
    env.partner_evaluation_db.prepare(`
      INSERT INTO committee_attendance_submissions
        (id, meeting_id, company_id, attendee_type, attendee_position, attendee_name, submitted_by, submitted_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(meeting_id, company_id) DO UPDATE SET attendee_type = excluded.attendee_type,
        attendee_position = excluded.attendee_position, attendee_name = excluded.attendee_name,
        submitted_by = excluded.submitted_by, submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    `).bind(submissionId, meetingId, user.company_id, attendeeType, attendeePosition, attendeeName, user.id || null),
    env.partner_evaluation_db.prepare(`
      UPDATE committee_partner_attendance SET attendance_status = 'present', attendee_position = ?, attendee_name = ?,
        updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE meeting_id = ? AND company_id = ?
    `).bind(attendeePosition, attendeeName, user.id || null, meetingId, user.company_id),
    env.partner_evaluation_db.prepare(`
      INSERT INTO committee_attendance_submission_logs (id, submission_id, action, detail_json, changed_by)
      VALUES (?, ?, ?, ?, ?)
    `).bind(crypto.randomUUID(), submissionId, existing ? 'resubmitted' : 'submitted', JSON.stringify({ attendee_type: attendeeType, attendee_position: attendeePosition, attendee_name: attendeeName, file_replaced: !!uploaded }), user.id || null)
  ];
  if (existing?.delegation_file_id && (uploaded || attendeeType === 'representative')) {
    statements.push(env.partner_evaluation_db.prepare(`UPDATE committee_delegation_files SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(existing.delegation_file_id));
  }
  if (uploaded && attendeeType === 'delegate') {
    statements.push(env.partner_evaluation_db.prepare(`
      INSERT INTO committee_delegation_files
        (id, submission_id, object_key, file_name, content_type, file_size, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(uploaded.id, submissionId, uploaded.objectKey, uploaded.name, uploaded.contentType, uploaded.size, user.id || null));
  }
  try {
    await env.partner_evaluation_db.batch(statements);
  } catch (error) {
    if (uploaded) await env.EVIDENCE_FILES.delete(uploaded.objectKey).catch(() => {});
    throw error;
  }
  if (existing?.delegation_file_id && (uploaded || attendeeType === 'representative')) {
    const old = await env.partner_evaluation_db.prepare(`SELECT object_key FROM committee_delegation_files WHERE id = ?`).bind(existing.delegation_file_id).first();
    if (old?.object_key && env.EVIDENCE_FILES) await env.EVIDENCE_FILES.delete(old.object_key).catch(() => {});
  }
  return json({ success: true, submission: await submissionFor(env, meetingId, user.company_id) });
}

async function validateAdminFinalization(request, env, meetingId) {
  const body = await request.clone().json().catch(() => ({}));
  if (body.finalize !== true) return null;
  const meeting = await env.partner_evaluation_db.prepare(`SELECT status FROM committee_meetings WHERE id = ? LIMIT 1`).bind(meetingId).first();
  if (!meeting || meeting.status === 'finalized') return null;
  const presentIds = (Array.isArray(body.partners) ? body.partners : [])
    .filter(row => row?.attendance_status === 'present')
    .map(row => clean(row.company_id, 100))
    .filter(Boolean);
  if (!presentIds.length) return null;
  const placeholders = presentIds.map(() => '?').join(',');
  const result = await env.partner_evaluation_db.prepare(`
    SELECT s.company_id, s.attendee_type, f.id AS delegation_file_id
    FROM committee_attendance_submissions s
    LEFT JOIN committee_delegation_files f ON f.submission_id = s.id AND f.deleted_at IS NULL
    WHERE s.meeting_id = ? AND s.company_id IN (${placeholders})
  `).bind(meetingId, ...presentIds).all();
  const submissions = new Map((result.results || []).map(row => [row.company_id, row]));
  const missingAttendance = presentIds.filter(companyId => !submissions.has(companyId));
  if (missingAttendance.length) return json({ success: false, error: '참석 협력사의 참석정보 제출이 완료되지 않았습니다. 협력사가 대표이사 참석 또는 대리 참석을 먼저 제출해야 합니다.' }, 400);
  const missingDelegation = presentIds.filter(companyId => {
    const submission = submissions.get(companyId);
    return submission?.attendee_type === 'delegate' && !submission.delegation_file_id;
  });
  if (missingDelegation.length) return json({ success: false, error: '대리 참석 협력사의 위임장이 제출되지 않았습니다.' }, 400);
  return null;
}

async function cleanupRemovedSubmissions(env, meetingId) {
  const result = await env.partner_evaluation_db.prepare(`
    SELECT s.id, f.object_key
    FROM committee_attendance_submissions s
    LEFT JOIN committee_partner_attendance cpa ON cpa.meeting_id = s.meeting_id AND cpa.company_id = s.company_id
    LEFT JOIN committee_delegation_files f ON f.submission_id = s.id AND f.deleted_at IS NULL
    WHERE s.meeting_id = ? AND cpa.company_id IS NULL
  `).bind(meetingId).all();
  const rows = result.results || [];
  if (!rows.length) return;
  const ids = rows.map(row => row.id);
  const placeholders = ids.map(() => '?').join(',');
  await env.partner_evaluation_db.batch([
    env.partner_evaluation_db.prepare(`DELETE FROM committee_attendance_submission_logs WHERE submission_id IN (${placeholders})`).bind(...ids),
    env.partner_evaluation_db.prepare(`DELETE FROM committee_delegation_files WHERE submission_id IN (${placeholders})`).bind(...ids),
    env.partner_evaluation_db.prepare(`DELETE FROM committee_attendance_submissions WHERE id IN (${placeholders})`).bind(...ids)
  ]);
  if (env.EVIDENCE_FILES) await Promise.allSettled(rows.filter(row => row.object_key).map(row => env.EVIDENCE_FILES.delete(row.object_key)));
}

async function deleteMeetingWithDelegations(request, env, ctx, baseWorker, meetingId) {
  const files = await env.partner_evaluation_db.prepare(`
    SELECT f.object_key FROM committee_delegation_files f
    JOIN committee_attendance_submissions s ON s.id = f.submission_id
    WHERE s.meeting_id = ? AND f.deleted_at IS NULL
  `).bind(meetingId).all();
  const response = await baseWorker.fetch(request, env, ctx);
  if (!response.ok) return response;
  const ids = await env.partner_evaluation_db.prepare(`SELECT id FROM committee_attendance_submissions WHERE meeting_id = ?`).bind(meetingId).all();
  const submissionIds = (ids.results || []).map(row => row.id);
  if (submissionIds.length) {
    const placeholders = submissionIds.map(() => '?').join(',');
    await env.partner_evaluation_db.batch([
      env.partner_evaluation_db.prepare(`DELETE FROM committee_attendance_submission_logs WHERE submission_id IN (${placeholders})`).bind(...submissionIds),
      env.partner_evaluation_db.prepare(`DELETE FROM committee_delegation_files WHERE submission_id IN (${placeholders})`).bind(...submissionIds),
      env.partner_evaluation_db.prepare(`DELETE FROM committee_attendance_submissions WHERE id IN (${placeholders})`).bind(...submissionIds)
    ]);
  }
  if (env.EVIDENCE_FILES) await Promise.allSettled((files.results || []).map(file => env.EVIDENCE_FILES.delete(file.object_key)));
  return response;
}

async function downloadFile(request, env, ctx, baseWorker, fileId) {
  const auth = await account(request, env, ctx, baseWorker);
  if (!auth.ok) return auth.response;
  const file = await env.partner_evaluation_db.prepare(`
    SELECT f.*, s.company_id FROM committee_delegation_files f
    JOIN committee_attendance_submissions s ON s.id = f.submission_id
    WHERE f.id = ? AND f.deleted_at IS NULL LIMIT 1
  `).bind(fileId).first();
  if (!file) return json({ success: false, error: '위임장 파일을 찾을 수 없습니다.' }, 404);
  if (auth.user.role !== 'admin' && file.company_id !== auth.user.company_id) return json({ success: false, error: '접근 권한이 없습니다.' }, 403);
  if (!env.EVIDENCE_FILES) return json({ success: false, error: '위임장 파일 저장소가 연결되지 않았습니다.' }, 503);
  const object = await env.EVIDENCE_FILES.get(file.object_key);
  if (!object) return json({ success: false, error: '저장된 위임장 파일을 찾을 수 없습니다.' }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('content-type', file.content_type || 'application/octet-stream');
  headers.set('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.file_name)}`);
  headers.set('content-length', String(object.size));
  headers.set('cache-control', 'private, no-store');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(object.body, { headers });
}

export async function handleCommitteeDelegation(request, env, ctx, baseWorker) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith('/api/committee') && !path.startsWith('/api/admin/committee')) return null;
  if (request.method === 'OPTIONS') return json({ success: true });
  await ensureSchema(env);

  const fileMatch = path.match(/^\/api\/committee\/delegation-files\/([^/]+)$/);
  if (fileMatch && request.method === 'GET') return downloadFile(request, env, ctx, baseWorker, decodeURIComponent(fileMatch[1]));

  const attendanceMatch = path.match(/^\/api\/committee\/meetings\/([^/]+)\/attendance$/);
  if (attendanceMatch && request.method === 'POST') {
    const auth = await account(request, env, ctx, baseWorker);
    if (!auth.ok) return auth.response;
    return saveAttendance(request, env, auth.user, decodeURIComponent(attendanceMatch[1]));
  }

  if (path === '/api/committee' && request.method === 'GET') {
    const auth = await account(request, env, ctx, baseWorker);
    if (!auth.ok) return auth.response;
    const response = await baseWorker.fetch(request, env, ctx);
    return augmentOverview(response, env, auth.user);
  }

  const adminDetailMatch = path.match(/^\/api\/admin\/committee\/([^/]+)$/);
  if (adminDetailMatch && ['GET', 'PATCH', 'DELETE'].includes(request.method)) {
    const auth = await account(request, env, ctx, baseWorker);
    if (!auth.ok) return auth.response;
    if (auth.user.role !== 'admin') return json({ success: false, error: '관리자 권한이 필요합니다.' }, 403);
    const meetingId = decodeURIComponent(adminDetailMatch[1]);
    if (request.method === 'DELETE') return deleteMeetingWithDelegations(request, env, ctx, baseWorker, meetingId);
    if (request.method === 'PATCH') {
      const validation = await validateAdminFinalization(request, env, meetingId);
      if (validation) return validation;
    }
    const response = await baseWorker.fetch(request, env, ctx);
    if (request.method === 'PATCH' && response.ok) await cleanupRemovedSubmissions(env, meetingId);
    return augmentAdminDetail(response, env);
  }
  return null;
}
