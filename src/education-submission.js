const ALLOWED_EXTENSIONS = new Set(['pdf', 'hwp', 'hwpx', 'xls', 'xlsx']);
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_MONTH_BYTES = 100 * 1024 * 1024;
const MAX_MONTH_FILES = 10;
const PREVIEW_TICKET_MINUTES = 5;

const MIME_BY_EXTENSION = {
  pdf: 'application/pdf',
  hwp: 'application/x-hwp',
  hwpx: 'application/vnd.hancom.hwpx',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

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

function clean(value, max = 2000) {
  return String(value ?? '').trim().slice(0, max);
}

function safeFileName(value) {
  return String(value || 'file')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180) || 'file';
}

function extensionOf(name) {
  return (String(name || '').split('.').pop() || '').toLowerCase();
}

function currentKst() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day), date: `${values.year}-${values.month}-${values.day}` };
}

function validPeriod(yearValue, monthValue) {
  const year = Number(yearValue);
  const month = Number(monthValue);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, month };
}

function isFuturePeriod(year, month) {
  const now = currentKst();
  return year * 100 + month > now.year * 100 + now.month;
}

function effectiveStatus(row, year, month, now = currentKst()) {
  const status = String(row?.status || '');
  if (status === 'approved' || status === 'under_review' || status === 'changes_requested') return status;
  const key = year * 100 + month;
  const current = now.year * 100 + now.month;
  if (key < current) return 'overdue_missing';
  if (status === 'draft' && Number(row?.file_count || 0) > 0) return 'draft';
  if (key === current) return 'pending';
  return 'upcoming';
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

function submissionLog(env, submissionId, action, detail, userId) {
  return env.partner_evaluation_db.prepare(`
    INSERT INTO education_submission_logs (id, submission_id, action, detail_json, changed_by)
    VALUES (?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), submissionId, action, JSON.stringify(detail || {}), userId || null);
}

async function findMonthSubmission(env, companyId, year, month) {
  return env.partner_evaluation_db.prepare(`
    SELECT es.*, c.company_name,
      (SELECT COUNT(*) FROM education_submission_files f WHERE f.submission_id = es.id AND f.deleted_at IS NULL) AS file_count,
      (SELECT COALESCE(SUM(f.file_size), 0) FROM education_submission_files f WHERE f.submission_id = es.id AND f.deleted_at IS NULL) AS file_bytes
    FROM education_submissions es
    JOIN companies c ON c.id = es.company_id
    WHERE es.company_id = ? AND es.education_year = ? AND es.education_month = ?
    LIMIT 1
  `).bind(companyId, year, month).first();
}

async function ensureMonthSubmission(env, user, year, month) {
  const companyId = clean(user?.company_id, 100);
  if (!companyId) return null;
  const id = crypto.randomUUID();
  await env.partner_evaluation_db.prepare(`
    INSERT INTO education_submissions
      (id, company_id, education_year, education_month, status, created_by)
    VALUES (?, ?, ?, ?, 'draft', ?)
    ON CONFLICT(company_id, education_year, education_month) DO NOTHING
  `).bind(id, companyId, year, month, user.id || null).run();
  return findMonthSubmission(env, companyId, year, month);
}

async function detailById(env, submissionId, includeLogs = false) {
  const statements = [
    env.partner_evaluation_db.prepare(`
      SELECT es.*, c.company_name,
        (SELECT COUNT(*) FROM education_submission_files f WHERE f.submission_id = es.id AND f.deleted_at IS NULL) AS file_count,
        (SELECT COALESCE(SUM(f.file_size), 0) FROM education_submission_files f WHERE f.submission_id = es.id AND f.deleted_at IS NULL) AS file_bytes
      FROM education_submissions es
      JOIN companies c ON c.id = es.company_id
      WHERE es.id = ? LIMIT 1
    `).bind(submissionId),
    env.partner_evaluation_db.prepare(`
      SELECT id, submission_id, file_name, content_type, file_size, uploaded_by, created_at
      FROM education_submission_files
      WHERE submission_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
    `).bind(submissionId)
  ];
  if (includeLogs) statements.push(env.partner_evaluation_db.prepare(`
    SELECT action, detail_json, changed_by, created_at
    FROM education_submission_logs
    WHERE submission_id = ?
    ORDER BY created_at DESC LIMIT 50
  `).bind(submissionId));
  const results = await env.partner_evaluation_db.batch(statements);
  const submission = results[0]?.results?.[0];
  if (!submission) return null;
  return {
    ...submission,
    effective_status: effectiveStatus(submission, Number(submission.education_year), Number(submission.education_month)),
    files: results[1]?.results || [],
    logs: includeLogs ? results[2]?.results || [] : undefined
  };
}

async function accessSubmission(request, env, ctx, baseWorker, submissionId, { partnerWrite = false, knownUser = null } = {}) {
  const auth = knownUser ? { ok: true, user: knownUser } : await account(request, env, ctx, baseWorker);
  if (!auth.ok) return auth;
  const submission = await detailById(env, submissionId, auth.user.role === 'admin');
  if (!submission) return { ok: false, response: json({ success: false, error: '교육 제출정보를 찾을 수 없습니다.' }, 404) };
  if (auth.user.role !== 'admin' && submission.company_id !== auth.user.company_id) {
    return { ok: false, response: json({ success: false, error: '접근 권한이 없습니다.' }, 403) };
  }
  if (partnerWrite && auth.user.role !== 'partner') {
    return { ok: false, response: json({ success: false, error: '협력사 계정에서만 제출자료를 수정할 수 있습니다.' }, 403) };
  }
  if (partnerWrite && isFuturePeriod(Number(submission.education_year), Number(submission.education_month))) {
    return { ok: false, response: json({ success: false, error: '아직 도래하지 않은 월의 교육자료는 제출할 수 없습니다.' }, 409) };
  }
  return { ok: true, user: auth.user, submission };
}

async function accessFile(request, env, ctx, baseWorker, fileId, partnerWrite = false, knownUser = null) {
  const auth = knownUser ? { ok: true, user: knownUser } : await account(request, env, ctx, baseWorker);
  if (!auth.ok) return auth;
  const file = await env.partner_evaluation_db.prepare(`
    SELECT f.*, es.company_id, es.education_year, es.education_month, es.status AS submission_status
    FROM education_submission_files f
    JOIN education_submissions es ON es.id = f.submission_id
    WHERE f.id = ? AND f.deleted_at IS NULL LIMIT 1
  `).bind(fileId).first();
  if (!file) return { ok: false, response: json({ success: false, error: '첨부파일을 찾을 수 없습니다.' }, 404) };
  if (auth.user.role !== 'admin' && file.company_id !== auth.user.company_id) {
    return { ok: false, response: json({ success: false, error: '접근 권한이 없습니다.' }, 403) };
  }
  if (partnerWrite && auth.user.role !== 'partner') {
    return { ok: false, response: json({ success: false, error: '협력사 계정에서만 파일을 삭제할 수 있습니다.' }, 403) };
  }
  if (partnerWrite && isFuturePeriod(Number(file.education_year), Number(file.education_month))) {
    return { ok: false, response: json({ success: false, error: '아직 도래하지 않은 월의 자료는 수정할 수 없습니다.' }, 409) };
  }
  return { ok: true, user: auth.user, file };
}

async function annualOverview(env, user, year) {
  const companySql = user.role === 'admin'
    ? `SELECT id, company_name, industry_name FROM companies WHERE status = 'active' ORDER BY company_name COLLATE NOCASE`
    : `SELECT id, company_name, industry_name FROM companies WHERE id = ? AND status = 'active' LIMIT 1`;
  const companyStatement = user.role === 'admin'
    ? env.partner_evaluation_db.prepare(companySql)
    : env.partner_evaluation_db.prepare(companySql).bind(user.company_id || '');
  const submissionStatement = user.role === 'admin'
    ? env.partner_evaluation_db.prepare(`
        SELECT es.*,
          (SELECT COUNT(*) FROM education_submission_files f WHERE f.submission_id = es.id AND f.deleted_at IS NULL) AS file_count,
          (SELECT COALESCE(SUM(f.file_size), 0) FROM education_submission_files f WHERE f.submission_id = es.id AND f.deleted_at IS NULL) AS file_bytes
        FROM education_submissions es WHERE es.education_year = ?
        ORDER BY es.education_month, es.company_id
      `).bind(year)
    : env.partner_evaluation_db.prepare(`
        SELECT es.*,
          (SELECT COUNT(*) FROM education_submission_files f WHERE f.submission_id = es.id AND f.deleted_at IS NULL) AS file_count,
          (SELECT COALESCE(SUM(f.file_size), 0) FROM education_submission_files f WHERE f.submission_id = es.id AND f.deleted_at IS NULL) AS file_bytes
        FROM education_submissions es WHERE es.education_year = ? AND es.company_id = ?
        ORDER BY es.education_month
      `).bind(year, user.company_id || '');
  const [companyResult, submissionResult] = await env.partner_evaluation_db.batch([companyStatement, submissionStatement]);
  const submissions = submissionResult?.results || [];
  const byCompanyMonth = new Map(submissions.map(row => [`${row.company_id}:${row.education_month}`, row]));
  const now = currentKst();
  const companies = (companyResult?.results || []).map(company => ({
    ...company,
    months: Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const row = byCompanyMonth.get(`${company.id}:${month}`) || null;
      return {
        month,
        submission_id: row?.id || null,
        status: row?.status || null,
        effective_status: effectiveStatus(row, year, month, now),
        file_count: Number(row?.file_count || 0),
        file_bytes: Number(row?.file_bytes || 0),
        note: row?.note || null,
        review_comment: row?.review_comment || null,
        submitted_at: row?.submitted_at || null,
        reviewed_at: row?.reviewed_at || null,
        updated_at: row?.updated_at || null
      };
    })
  }));
  const monthRows = companies.flatMap(company => company.months);
  const summary = {
    target_company_count: companies.length,
    under_review_count: monthRows.filter(row => row.effective_status === 'under_review').length,
    approved_count: monthRows.filter(row => row.effective_status === 'approved').length,
    overdue_missing_count: monthRows.filter(row => row.effective_status === 'overdue_missing').length,
    changes_requested_count: monthRows.filter(row => row.effective_status === 'changes_requested').length
  };
  return { companies, summary, current_kst: now };
}

async function validateFileSignature(file, extension) {
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const starts = (...values) => values.every((value, index) => bytes[index] === value);
  if (extension === 'pdf') return starts(0x25, 0x50, 0x44, 0x46);
  if (extension === 'xlsx' || extension === 'hwpx') return starts(0x50, 0x4b, 0x03, 0x04) || starts(0x50, 0x4b, 0x05, 0x06) || starts(0x50, 0x4b, 0x07, 0x08);
  if (extension === 'xls' || extension === 'hwp') return starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
  return false;
}

async function addFile(request, env, user, year, month) {
  if (!env.EVIDENCE_FILES) return { error: '교육자료 저장소가 연결되지 않았습니다.', status: 503 };
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File) || !file.name) return { error: '첨부할 파일을 선택하세요.', status: 400 };
  if (file.size <= 0 || file.size > MAX_FILE_BYTES) return { error: '파일은 25MB 이하만 첨부할 수 있습니다.', status: 400 };
  const extension = extensionOf(file.name);
  if (!ALLOWED_EXTENSIONS.has(extension)) return { error: 'PDF, HWP, HWPX, XLS, XLSX 파일만 첨부할 수 있습니다.', status: 400 };
  if (!(await validateFileSignature(file, extension))) return { error: '파일 내용과 확장자가 일치하지 않거나 손상된 파일입니다.', status: 400 };

  const submission = await ensureMonthSubmission(env, user, year, month);
  if (!submission) return { error: '회사 연결정보가 없습니다.', status: 400 };
  if (Number(submission.file_count || 0) >= MAX_MONTH_FILES) return { error: `월별 파일은 최대 ${MAX_MONTH_FILES}개까지 첨부할 수 있습니다.`, status: 409 };
  if (Number(submission.file_bytes || 0) + file.size > MAX_MONTH_BYTES) return { error: '월별 첨부파일 합계는 100MB를 초과할 수 없습니다.', status: 409 };

  const id = crypto.randomUUID();
  const name = safeFileName(file.name);
  const contentType = MIME_BY_EXTENSION[extension];
  const objectKey = `education/${year}/${String(month).padStart(2, '0')}/${user.company_id}/${submission.id}/${id}-${name}`;
  try {
    await env.EVIDENCE_FILES.put(objectKey, file.stream(), {
      httpMetadata: { contentType },
      customMetadata: { originalName: name, uploadedBy: String(user.id || '') }
    });
    await env.partner_evaluation_db.batch([
      env.partner_evaluation_db.prepare(`
        INSERT INTO education_submission_files
          (id, submission_id, object_key, file_name, content_type, file_size, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(id, submission.id, objectKey, name, contentType, file.size, user.id || null),
      env.partner_evaluation_db.prepare(`
        UPDATE education_submissions
        SET status = 'draft', submitted_at = NULL, reviewed_at = NULL, reviewed_by = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(submission.id),
      submissionLog(env, submission.id, 'file_added', { file_id: id, file_name: name, file_size: file.size }, user.id)
    ]);
  } catch (error) {
    await env.EVIDENCE_FILES.delete(objectKey).catch(() => {});
    throw error;
  }
  return { file: { id, submission_id: submission.id, file_name: name, content_type: contentType, file_size: file.size, created_at: new Date().toISOString() } };
}

async function publicPreview(request, env, ticketId) {
  if (!env.EVIDENCE_FILES) return json({ success: false, error: '교육자료 저장소가 연결되지 않았습니다.' }, 503);
  const ticket = await env.partner_evaluation_db.prepare(`
    SELECT f.* FROM education_preview_tickets p
    JOIN education_submission_files f ON f.id = p.file_id
    WHERE p.id = ? AND p.expires_at > CURRENT_TIMESTAMP AND f.deleted_at IS NULL
    LIMIT 1
  `).bind(ticketId).first();
  if (!ticket) return json({ success: false, error: '미리보기 링크가 만료되었거나 유효하지 않습니다.' }, 410);
  const object = await env.EVIDENCE_FILES.get(ticket.object_key);
  if (!object) return json({ success: false, error: '저장된 파일을 찾을 수 없습니다.' }, 404);
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

export async function handleEducationSubmission(request, env, ctx, baseWorker) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith('/api/education') && !path.startsWith('/api/admin/education')) return null;
  if (request.method === 'OPTIONS') return json({ success: true });

  const publicPreviewMatch = path.match(/^\/api\/education\/preview\/([^/]+)$/);
  if (publicPreviewMatch && request.method === 'GET') return publicPreview(request, env, decodeURIComponent(publicPreviewMatch[1]));

  const auth = await account(request, env, ctx, baseWorker);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  if (path === '/api/education' && request.method === 'GET') {
    const year = Number(url.searchParams.get('year') || currentKst().year);
    if (!validPeriod(year, 1)) return json({ success: false, error: '조회 연도가 올바르지 않습니다.' }, 400);
    if (user.role !== 'admin' && !user.company_id) return json({ success: false, error: '회사 연결정보가 없습니다.' }, 400);
    const overview = await annualOverview(env, user, year);
    return json({ success: true, role: user.role, year, ...overview });
  }

  const monthMatch = path.match(/^\/api\/education\/months\/(\d{4})\/(\d{1,2})$/);
  if (monthMatch) {
    const period = validPeriod(monthMatch[1], monthMatch[2]);
    if (!period) return json({ success: false, error: '교육 제출 월이 올바르지 않습니다.' }, 400);
    if (user.role !== 'partner' || !user.company_id) return json({ success: false, error: '협력사 계정이 필요합니다.' }, 403);
    if (request.method === 'GET') {
      const submission = await findMonthSubmission(env, user.company_id, period.year, period.month);
      if (!submission) return json({
        success: true,
        submission: {
          id: null, company_id: user.company_id, company_name: user.company_name,
          education_year: period.year, education_month: period.month,
          status: null, effective_status: effectiveStatus(null, period.year, period.month), files: []
        },
        capabilities: { editable: !isFuturePeriod(period.year, period.month), max_file_size_mb: 25, allowed_extensions: [...ALLOWED_EXTENSIONS] }
      });
      return json({
        success: true,
        submission: await detailById(env, submission.id),
        capabilities: { editable: !isFuturePeriod(period.year, period.month), max_file_size_mb: 25, allowed_extensions: [...ALLOWED_EXTENSIONS] }
      });
    }
    if (request.method === 'PATCH') {
      if (isFuturePeriod(period.year, period.month)) return json({ success: false, error: '아직 도래하지 않은 월의 자료는 수정할 수 없습니다.' }, 409);
      const body = await request.json().catch(() => ({}));
      const note = clean(body.note, 2000) || null;
      const submission = await ensureMonthSubmission(env, user, period.year, period.month);
      if (!submission) return json({ success: false, error: '회사 연결정보가 없습니다.' }, 400);
      if (String(submission.note || '') !== String(note || '')) {
        await env.partner_evaluation_db.batch([
          env.partner_evaluation_db.prepare(`
            UPDATE education_submissions
            SET note = ?, status = 'draft', submitted_at = NULL, reviewed_at = NULL, reviewed_by = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(note, submission.id),
          submissionLog(env, submission.id, 'note_saved', { note_changed: true }, user.id)
        ]);
      }
      return json({ success: true, submission: await detailById(env, submission.id) });
    }
    return json({ success: false, error: '지원하지 않는 요청입니다.' }, 405);
  }

  const uploadMatch = path.match(/^\/api\/education\/months\/(\d{4})\/(\d{1,2})\/files$/);
  if (uploadMatch && request.method === 'POST') {
    const period = validPeriod(uploadMatch[1], uploadMatch[2]);
    if (!period) return json({ success: false, error: '교육 제출 월이 올바르지 않습니다.' }, 400);
    if (user.role !== 'partner' || !user.company_id) return json({ success: false, error: '협력사 계정이 필요합니다.' }, 403);
    if (isFuturePeriod(period.year, period.month)) return json({ success: false, error: '아직 도래하지 않은 월의 교육자료는 제출할 수 없습니다.' }, 409);
    const result = await addFile(request, env, user, period.year, period.month);
    if (result.error) return json({ success: false, error: result.error }, result.status);
    return json({ success: true, file: result.file }, 201);
  }

  const submitMatch = path.match(/^\/api\/education\/months\/(\d{4})\/(\d{1,2})\/submit$/);
  if (submitMatch && request.method === 'POST') {
    const period = validPeriod(submitMatch[1], submitMatch[2]);
    if (!period) return json({ success: false, error: '교육 제출 월이 올바르지 않습니다.' }, 400);
    if (user.role !== 'partner' || !user.company_id) return json({ success: false, error: '협력사 계정이 필요합니다.' }, 403);
    if (isFuturePeriod(period.year, period.month)) return json({ success: false, error: '아직 도래하지 않은 월의 교육자료는 제출할 수 없습니다.' }, 409);
    const body = await request.json().catch(() => ({}));
    const note = clean(body.note, 2000) || null;
    const submission = await ensureMonthSubmission(env, user, period.year, period.month);
    if (!submission) return json({ success: false, error: '회사 연결정보가 없습니다.' }, 400);
    if (Number(submission.file_count || 0) < 1) return json({ success: false, error: '교육자료 파일을 1개 이상 첨부한 뒤 제출하세요.' }, 400);
    const resubmitted = !!submission.submitted_at || submission.status === 'changes_requested' || submission.status === 'approved';
    await env.partner_evaluation_db.batch([
      env.partner_evaluation_db.prepare(`
        UPDATE education_submissions
        SET note = ?, status = 'under_review', review_comment = NULL,
            submitted_at = CURRENT_TIMESTAMP, reviewed_at = NULL, reviewed_by = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(note, submission.id),
      submissionLog(env, submission.id, resubmitted ? 'resubmitted' : 'submitted', { file_count: Number(submission.file_count || 0) }, user.id)
    ]);
    return json({ success: true, submission: await detailById(env, submission.id), resubmitted });
  }

  const previewTicketMatch = path.match(/^\/api\/education\/files\/([^/]+)\/preview-ticket$/);
  if (previewTicketMatch && request.method === 'POST') {
    const access = await accessFile(request, env, ctx, baseWorker, decodeURIComponent(previewTicketMatch[1]), false, user);
    if (!access.ok) return access.response;
    const ticketId = crypto.randomUUID();
    await env.partner_evaluation_db.batch([
      env.partner_evaluation_db.prepare(`DELETE FROM education_preview_tickets WHERE expires_at <= CURRENT_TIMESTAMP`),
      env.partner_evaluation_db.prepare(`
        INSERT INTO education_preview_tickets (id, file_id, issued_by, expires_at)
        VALUES (?, ?, ?, datetime('now', ?))
      `).bind(ticketId, access.file.id, user.id || null, `+${PREVIEW_TICKET_MINUTES} minutes`)
    ]);
    const sourceUrl = `${url.origin}/api/education/preview/${encodeURIComponent(ticketId)}`;
    return json({
      success: true,
      source_url: sourceUrl,
      viewer_url: `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(sourceUrl)}`,
      office_viewer_url: `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(sourceUrl)}`,
      expires_in_seconds: PREVIEW_TICKET_MINUTES * 60
    });
  }

  const fileMatch = path.match(/^\/api\/education\/files\/([^/]+)$/);
  if (fileMatch) {
    const fileId = decodeURIComponent(fileMatch[1]);
    const access = await accessFile(request, env, ctx, baseWorker, fileId, request.method === 'DELETE', user);
    if (!access.ok) return access.response;
    if (request.method === 'GET') {
      if (!env.EVIDENCE_FILES) return json({ success: false, error: '교육자료 저장소가 연결되지 않았습니다.' }, 503);
      const object = await env.EVIDENCE_FILES.get(access.file.object_key);
      if (!object) return json({ success: false, error: '저장된 파일을 찾을 수 없습니다.' }, 404);
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('content-type', access.file.content_type || 'application/octet-stream');
      headers.set('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(access.file.file_name)}`);
      headers.set('content-length', String(object.size));
      headers.set('x-content-type-options', 'nosniff');
      return new Response(object.body, { headers });
    }
    if (request.method === 'DELETE') {
      if (!env.EVIDENCE_FILES) return json({ success: false, error: '교육자료 저장소가 연결되지 않았습니다.' }, 503);
      await env.EVIDENCE_FILES.delete(access.file.object_key);
      await env.partner_evaluation_db.batch([
        env.partner_evaluation_db.prepare(`UPDATE education_submission_files SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(fileId),
        env.partner_evaluation_db.prepare(`
          UPDATE education_submissions
          SET status = 'draft', submitted_at = NULL, reviewed_at = NULL, reviewed_by = NULL, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(access.file.submission_id),
        submissionLog(env, access.file.submission_id, 'file_deleted', { file_id: fileId, file_name: access.file.file_name }, user.id)
      ]);
      return json({ success: true });
    }
    return json({ success: false, error: '지원하지 않는 요청입니다.' }, 405);
  }

  const detailMatch = path.match(/^\/api\/education\/submissions\/([^/]+)$/);
  if (detailMatch && request.method === 'GET') {
    const access = await accessSubmission(request, env, ctx, baseWorker, decodeURIComponent(detailMatch[1]), { knownUser: user });
    if (!access.ok) return access.response;
    return json({ success: true, submission: access.submission });
  }

  const reviewMatch = path.match(/^\/api\/admin\/education\/([^/]+)\/review$/);
  if (reviewMatch && request.method === 'PATCH') {
    if (user.role !== 'admin') return json({ success: false, error: '관리자 권한이 필요합니다.' }, 403);
    const submissionId = decodeURIComponent(reviewMatch[1]);
    const submission = await detailById(env, submissionId, true);
    if (!submission) return json({ success: false, error: '교육 제출정보를 찾을 수 없습니다.' }, 404);
    if (submission.status !== 'under_review') return json({ success: false, error: '심사중 상태의 제출자료만 처리할 수 있습니다.' }, 409);
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || '');
    const comment = clean(body.comment, 2000) || null;
    if (!['approve', 'request_changes'].includes(action)) return json({ success: false, error: '심사 처리방법이 올바르지 않습니다.' }, 400);
    if (action === 'request_changes' && !comment) return json({ success: false, error: '재제출 요청 사유를 입력하세요.' }, 400);
    const nextStatus = action === 'approve' ? 'approved' : 'changes_requested';
    await env.partner_evaluation_db.batch([
      env.partner_evaluation_db.prepare(`
        UPDATE education_submissions
        SET status = ?, review_comment = ?, reviewed_at = CURRENT_TIMESTAMP,
            reviewed_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(nextStatus, comment, user.id || null, submissionId),
      submissionLog(env, submissionId, action === 'approve' ? 'approved' : 'changes_requested', { comment }, user.id)
    ]);
    return json({ success: true, submission: await detailById(env, submissionId, true) });
  }

  return json({ success: false, error: '지원하지 않는 교육 제출 요청입니다.' }, 404);
}
