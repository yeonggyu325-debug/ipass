const FIREBASE_API_KEY = "AIzaSyC0s7buQaayKr84QA_wFNyF6rcs6w1-IoU";

// Firebase accounts:lookup is an external network call.
// Keep a short-lived per-isolate cache so consecutive portal API calls do not
// pay the same remote verification latency repeatedly. Portal approval/status
// is cached briefly after a successful /api/me check to remove repeated D1 auth reads.
// Admin account-state changes invalidate the local cache; TTL is intentionally short.
const FIREBASE_LOOKUP_CACHE = new Map();
const FIREBASE_LOOKUP_TTL_MS = 4 * 60 * 1000;
const FIREBASE_LOOKUP_CACHE_MAX = 300;
const APPROVED_ACCOUNT_CACHE = new Map();
const APPROVED_ACCOUNT_TTL_MS = 30 * 1000;
const APPROVED_ACCOUNT_CACHE_MAX = 500;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const background = promise => {
      const safe = Promise.resolve(promise).catch(error => console.error("background task failed", error));
      if (ctx?.waitUntil) ctx.waitUntil(safe);
      else void safe;
    };

    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders() });
      }

      if (request.method === "GET" && path === "/api/health") {
        return json({ success: true, service: "ipass", status: "ok", version: "16.6.0", annual_ipass_routes: true, committee_routes: true, voc_routes: true });
      }

      if (request.method === "GET" && path === "/api/public/companies") {
        const { results } = await env.partner_evaluation_db.prepare(`
          SELECT id, company_name, industry_code, industry_name
          FROM companies
          WHERE status = 'active'
          ORDER BY company_name
        `).all();
        return json({ success: true, companies: results });
      }

      if (request.method === "GET" && path === "/api/public/notices") {
        const placement = url.searchParams.get("placement") === "after_login" ? "after_login" : "login";
        const column = placement === "after_login" ? "show_after_login" : "show_on_login";
        const { results } = await env.partner_evaluation_db.prepare(`
          SELECT id, title, content, is_important, created_at
          FROM portal_notices
          WHERE is_active = 1
            AND ${column} = 1
            AND (start_at IS NULL OR start_at <= CURRENT_TIMESTAMP)
            AND (end_at IS NULL OR end_at >= CURRENT_TIMESTAMP)
          ORDER BY is_important DESC, created_at DESC
          LIMIT 10
        `).all();
        return json({ success: true, notices: results });
      }

      if (request.method === "POST" && path === "/api/auth/register") {
        const firebase = await firebaseUserFromRequest(request);
        if (!firebase.ok) return json({ success: false, error: firebase.error }, firebase.status);

        const body = await request.json();
        const companyId = String(body.company_id || "").trim();
        const name = String(body.name || "").trim();
        const position = String(body.position || "").trim();
        const phone = String(body.phone || "").trim();
        const privacyAgreed = body.privacy_agreed === true || body.privacy_agreed === 1;

        if (!companyId || !name || !position || !phone || !privacyAgreed) {
          return json({ success: false, error: "필수 회원가입 정보가 누락되었습니다." }, 400);
        }

        const [companyResult, existingResult, countResult] = await env.partner_evaluation_db.batch([
          env.partner_evaluation_db.prepare(`SELECT id FROM companies WHERE id = ? AND status = 'active'`).bind(companyId),
          env.partner_evaluation_db.prepare(`
            SELECT id, approval_status
            FROM portal_accounts
            WHERE firebase_uid = ? OR email = ?
            LIMIT 1
          `).bind(firebase.user.localId, firebase.user.email || ""),
          env.partner_evaluation_db.prepare(`
            SELECT COUNT(*) AS cnt
            FROM portal_accounts
            WHERE company_id = ?
              AND approval_status IN ('pending','approved')
              AND firebase_uid <> ?
          `).bind(companyId, firebase.user.localId)
        ]);
        const company = companyResult?.results?.[0];
        const existing = existingResult?.results?.[0];
        const countRow = countResult?.results?.[0];

        if (!company) return json({ success: false, error: "선택한 회사가 유효하지 않습니다." }, 400);
        if (Number(countRow?.cnt || 0) >= 3 && !existing) {
          return json({ success: false, error: "해당 회사는 담당자 계정을 최대 3개까지 등록할 수 있습니다." }, 409);
        }
        const id = existing?.id || crypto.randomUUID();
        await env.partner_evaluation_db.prepare(`
          INSERT INTO portal_accounts (
            id, firebase_uid, email, role, company_id, name, position, phone,
            privacy_agreed, privacy_agreed_at, email_verified, approval_status,
            created_at, updated_at
          )
          VALUES (?, ?, ?, 'partner', ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(firebase_uid) DO UPDATE SET
            email = excluded.email,
            company_id = excluded.company_id,
            name = excluded.name,
            position = excluded.position,
            phone = excluded.phone,
            privacy_agreed = 1,
            privacy_agreed_at = COALESCE(portal_accounts.privacy_agreed_at, CURRENT_TIMESTAMP),
            email_verified = excluded.email_verified,
            updated_at = CURRENT_TIMESTAMP
        `).bind(
          id,
          firebase.user.localId,
          firebase.user.email || "",
          companyId,
          name,
          position,
          phone,
          firebase.user.emailVerified ? 1 : 0
        ).run();

        return json({
          success: true,
          account: {
            id,
            approval_status: "pending",
            email_verified: !!firebase.user.emailVerified
          }
        }, existing ? 200 : 201);
      }

      if (request.method === "GET" && path === "/api/me") {
        const firebase = await firebaseUserFromRequest(request);
        if (!firebase.ok) return json({ success: false, error: firebase.error }, firebase.status);

        let account = await env.partner_evaluation_db.prepare(`
          SELECT
            pa.id, pa.firebase_uid, pa.email, pa.role, pa.company_id,
            pa.name, pa.position, pa.phone, pa.email_verified,
            pa.approval_status, pa.rejection_reason,
            c.company_name, c.industry_name,
            CASE WHEN pa.role = 'admin' THEN (
              SELECT COUNT(*) FROM notifications n
              WHERE n.is_read = 0
                AND n.recipient_user_id IN (SELECT id FROM users WHERE role = 'admin')
            ) ELSE 0 END AS unread_notification_count
          FROM portal_accounts pa
          LEFT JOIN companies c ON c.id = pa.company_id
          WHERE pa.firebase_uid = ?
          LIMIT 1
        `).bind(firebase.user.localId).first();

        if (account) {
          if (Number(account.email_verified || 0) !== (firebase.user.emailVerified ? 1 : 0)) {
            await env.partner_evaluation_db.prepare(`
              UPDATE portal_accounts
              SET email_verified = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).bind(firebase.user.emailVerified ? 1 : 0, account.id).run();
            account.email_verified = firebase.user.emailVerified ? 1 : 0;
          }

          let authState = "approved";
          if (account.role !== "admin" && !firebase.user.emailVerified) authState = "email_verification_required";
          else if (account.approval_status === "pending") authState = "pending_approval";
          else if (account.approval_status === "rejected") authState = "rejected";
          else if (account.approval_status === "suspended") authState = "suspended";

          if (authState === "approved") rememberApprovedAccount(firebase.user.localId, {
            id: account.id, email: account.email, role: account.role, company_id: account.company_id, approval_status: account.approval_status
          });

          return json({
            success: true,
            auth_state: authState,
            user: {
              id: account.id,
              email: account.email,
              role: account.role,
              company_id: account.company_id,
              company_name: account.company_name,
              industry_name: account.industry_name,
              name: account.name,
              position: account.position,
              phone: account.phone,
              approval_status: account.approval_status,
              rejection_reason: account.rejection_reason || null,
              email_verified: !!firebase.user.emailVerified,
              unread_notification_count: Number(account.unread_notification_count || 0)
            }
          });
        }

        const legacy = await env.partner_evaluation_db.prepare(`
          SELECT id, email, role, company_id, status
          FROM users
          WHERE firebase_uid = ?
          LIMIT 1
        `).bind(firebase.user.localId).first();

        if (!legacy) {
          return json({
            success: true,
            auth_state: "unregistered",
            user: {
              email: firebase.user.email || "",
              role: null,
              email_verified: !!firebase.user.emailVerified
            }
          });
        }

        const legacyState = legacy.status && legacy.status !== "active" ? "suspended" : "approved";
        if (legacyState === "approved") rememberApprovedAccount(firebase.user.localId, { ...legacy, approval_status: "approved" });
        return json({
          success: true,
          auth_state: legacyState,
          user: {
            id: legacy.id,
            email: legacy.email || firebase.user.email || "",
            role: legacy.role,
            company_id: legacy.company_id || null,
            approval_status: legacyState === "approved" ? "approved" : "suspended",
            email_verified: !!firebase.user.emailVerified
          }
        });
      }

      const auth = await requireApprovedAccount(request, env);
      if (!auth.ok) return json({ success: false, error: auth.error, auth_state: auth.auth_state }, auth.status);
      const user = auth.account;

      if (request.method === "GET" && path === "/api/annual-ipass") {
        const year = parseAnnualYear(url.searchParams.get("year"));
        const companyId = user.role === "admin"
          ? String(url.searchParams.get("company_id") || "").trim()
          : String(user.company_id || "").trim();

        if (!companyId) return json({ success: false, error: "회사 정보가 필요합니다." }, 400);
        const summary = await annualIpassSummary(env, companyId, year);
        const autoSync = summary._auto_sync || [];
        delete summary._auto_sync;
        if (autoSync.length) background(persistAnnualAutoChanges(env, companyId, year, autoSync));
        return json({ success: true, annual: summary });
      }

      const annualAdminMatch = path.match(/^\/api\/admin\/annual-ipass\/([^/]+)\/(\d{4})$/);
      if (user.role === "admin" && annualAdminMatch && request.method === "GET") {
        const companyId = decodeURIComponent(annualAdminMatch[1]);
        const year = parseAnnualYear(annualAdminMatch[2]);
        const summary = await annualIpassSummary(env, companyId, year);
        const autoSync = summary._auto_sync || [];
        delete summary._auto_sync;
        if (autoSync.length) background(persistAnnualAutoChanges(env, companyId, year, autoSync));
        return json({ success: true, annual: summary });
      }

      if (user.role === "admin" && annualAdminMatch && request.method === "PATCH") {
        const companyId = decodeURIComponent(annualAdminMatch[1]);
        const year = parseAnnualYear(annualAdminMatch[2]);
        const body = await request.json();

        const [ensureResult, beforeResult] = await env.partner_evaluation_db.batch([
          env.partner_evaluation_db.prepare(`
            INSERT INTO annual_ipass_scores (id, company_id, year)
            SELECT ?, id, ? FROM companies WHERE id = ?
            ON CONFLICT(company_id, year) DO NOTHING
          `).bind(crypto.randomUUID(), year, companyId),
          env.partner_evaluation_db.prepare(`SELECT * FROM annual_ipass_scores WHERE company_id = ? AND year = ? LIMIT 1`).bind(companyId, year)
        ]);
        const before = beforeResult?.results?.[0];
        if (!before) return json({ success: false, error: "회사 정보를 찾을 수 없습니다." }, 404);

        const changes = [];
        const sets = [];
        const binds = [];

        for (const half of ["first", "second"]) {
          const modeKey = `${half}_half_mode`;
          const scoreKey = `${half}_half_score`;
          const mode = body[modeKey];
          if (mode === "manual") {
            const score = Number(body[scoreKey]);
            if (!Number.isFinite(score) || score < 0 || score > 40) {
              return json({ success: false, error: `${half === "first" ? "상반기" : "하반기"} 점수는 0~40점으로 입력하세요.` }, 400);
            }
            const value = round1(score);
            sets.push(`${half}_half_score = ?`, `${half}_half_source = 'manual'`, `${half}_half_target_id = NULL`, `${half}_half_updated_by = ?`, `${half}_half_updated_at = CURRENT_TIMESTAMP`);
            binds.push(value, user.id);
            changes.push({ field: `${half}_half_score`, old: before?.[`${half}_half_score`], value, source: "manual" });
          } else if (mode === "auto") {
            sets.push(`${half}_half_score = NULL`, `${half}_half_source = NULL`, `${half}_half_target_id = NULL`, `${half}_half_updated_by = ?`, `${half}_half_updated_at = CURRENT_TIMESTAMP`);
            binds.push(user.id);
            changes.push({ field: `${half}_half_score`, old: before?.[`${half}_half_score`], value: null, source: "reset_to_auto" });
          }
        }

        for (const field of ["industrial_accident_count", "unreasonable_finding_count"]) {
          if (body[field] !== undefined) {
            const n = Number(body[field]);
            if (!Number.isInteger(n) || n < 0) return json({ success: false, error: "건수는 0 이상의 정수로 입력하세요." }, 400);
            sets.push(`${field} = ?`);
            binds.push(n);
            changes.push({ field, old: before?.[field], value: n, source: "manual" });
          }
        }

        if (sets.length) {
          sets.push(`updated_by = ?`, `updated_at = CURRENT_TIMESTAMP`);
          const statements = [
            env.partner_evaluation_db.prepare(`
              UPDATE annual_ipass_scores
              SET ${sets.join(", ")}
              WHERE company_id = ? AND year = ?
            `).bind(...binds, user.id, companyId, year)
          ];
          for (const c of changes) {
            const stmt = annualLogStatement(env, companyId, year, c.field, c.old, c.value, c.source, user.id);
            if (stmt) statements.push(stmt);
          }
          await env.partner_evaluation_db.batch(statements);
        }

        const summary = await annualIpassSummary(env, companyId, year);
        const autoSync = summary._auto_sync || [];
        delete summary._auto_sync;
        if (autoSync.length) background(persistAnnualAutoChanges(env, companyId, year, autoSync));
        return json({ success: true, annual: summary });
      }

      // ===== Safety & Health Committee =====
      if (request.method === "GET" && path === "/api/committee") {
        const year = parseAnnualYear(url.searchParams.get("year"));
        if (user.role === "admin") {
          const [meetingResult, companyResult, departmentResult] = await env.partner_evaluation_db.batch([
            env.partner_evaluation_db.prepare(`
              SELECT
                cm.id, cm.year, cm.meeting_month, cm.meeting_date, cm.title, cm.note, cm.status,
                cm.finalized_at, cm.created_at, cm.updated_at,
                COALESCE(p.partner_target_count, 0) AS partner_target_count,
                COALESCE(p.partner_present_count, 0) AS partner_present_count,
                COALESCE(p.partner_absent_count, 0) AS partner_absent_count,
                COALESCE(p.partner_pending_count, 0) AS partner_pending_count,
                COALESCE(d.department_target_count, 0) AS department_target_count
              FROM committee_meetings cm
              LEFT JOIN (
                SELECT cpa.meeting_id,
                  COUNT(*) AS partner_target_count,
                  SUM(CASE WHEN cpa.attendance_status = 'present' THEN 1 ELSE 0 END) AS partner_present_count,
                  SUM(CASE WHEN cpa.attendance_status = 'absent' THEN 1 ELSE 0 END) AS partner_absent_count,
                  SUM(CASE WHEN cpa.attendance_status = 'pending' THEN 1 ELSE 0 END) AS partner_pending_count
                FROM committee_partner_attendance cpa
                JOIN committee_meetings cm2 ON cm2.id = cpa.meeting_id
                WHERE cm2.year = ?
                GROUP BY cpa.meeting_id
              ) p ON p.meeting_id = cm.id
              LEFT JOIN (
                SELECT cda.meeting_id, COUNT(*) AS department_target_count
                FROM committee_department_attendance cda
                JOIN committee_meetings cm3 ON cm3.id = cda.meeting_id
                WHERE cm3.year = ?
                GROUP BY cda.meeting_id
              ) d ON d.meeting_id = cm.id
              WHERE cm.year = ?
              ORDER BY cm.meeting_month DESC, cm.meeting_date DESC
            `).bind(year, year, year),
            env.partner_evaluation_db.prepare(`
              SELECT id, company_name
              FROM companies
              WHERE status = 'active'
              ORDER BY company_name COLLATE NOCASE
            `),
            env.partner_evaluation_db.prepare(`
              SELECT id, department_name, sort_order
              FROM committee_departments
              WHERE is_active = 1
              ORDER BY sort_order, department_name
            `)
          ]);
          return json({
            success: true,
            year,
            meetings: meetingResult?.results || [],
            options: {
              companies: companyResult?.results || [],
              departments: departmentResult?.results || []
            }
          });
        }
        if (!user.company_id) return json({ success: false, error: "회사 연결정보가 없습니다." }, 400);
        const [summaryResult, meetingResult] = await env.partner_evaluation_db.batch([
          env.partner_evaluation_db.prepare(`
            SELECT
              COUNT(*) AS finalized_meeting_count,
              SUM(CASE WHEN cpa.attendance_status = 'present' THEN 1 ELSE 0 END) AS present_count,
              SUM(CASE WHEN cpa.attendance_status = 'absent' THEN 1 ELSE 0 END) AS absence_count
            FROM committee_partner_attendance cpa
            JOIN committee_meetings cm ON cm.id = cpa.meeting_id
            WHERE cpa.company_id = ? AND cm.year = ? AND cm.status = 'finalized'
          `).bind(user.company_id, year),
          env.partner_evaluation_db.prepare(`
            SELECT
              cm.id, cm.meeting_month, cm.meeting_date, cm.title, cm.note,
              cpa.attendance_status, cpa.attendee_position, cpa.attendee_name
            FROM committee_partner_attendance cpa
            JOIN committee_meetings cm ON cm.id = cpa.meeting_id
            WHERE cpa.company_id = ? AND cm.year = ? AND cm.status = 'finalized'
            ORDER BY cm.meeting_month DESC, cm.meeting_date DESC
          `).bind(user.company_id, year)
        ]);
        const sr = summaryResult?.results?.[0] || {};
        const absence = Number(sr.absence_count || 0);
        const summary = {
          finalized_meeting_count: Number(sr.finalized_meeting_count || 0),
          present_count: Number(sr.present_count || 0),
          absence_count: absence,
          score: Math.max(0, 10 - absence * 3)
        };
        return json({ success: true, year, summary, meetings: meetingResult?.results || [] });
      }

      if (user.role === "admin" && request.method === "POST" && path === "/api/admin/committee") {
        const body = await request.json();
        const year = parseAnnualYear(body.year);
        const month = Number(body.month);
        if (!Number.isInteger(month) || month < 1 || month > 12) return json({ success: false, error: "협의체 월을 선택하세요." }, 400);
        const mm = String(month).padStart(2, "0");
        const meetingDate = String(body.meeting_date || `${year}-${mm}-01`).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(meetingDate) || Number(meetingDate.slice(0,4)) !== year || Number(meetingDate.slice(5,7)) !== month) {
          return json({ success: false, error: "개최일은 선택한 연도와 월 안에서 입력하세요." }, 400);
        }
        const id = crypto.randomUUID();
        const title = `${year}년 ${month}월 안전보건협의체`;
        const note = String(body.note || "").trim() || null;
        try {
          await env.partner_evaluation_db.prepare(`
            INSERT INTO committee_meetings (id, year, meeting_month, meeting_date, title, note, status, created_by)
            VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)
          `).bind(id, year, month, meetingDate, title, note, user.id).run();
        } catch (e) {
          if (String(e?.message || "").toLowerCase().includes("unique")) return json({ success: false, error: `${year}년 ${month}월 협의체는 이미 등록되어 있습니다. 월별 1개만 생성할 수 있습니다.` }, 409);
          throw e;
        }
        return json({ success: true, meeting: { id, year, meeting_month: month, meeting_date: meetingDate, title, note, status: "draft", partners: [], departments: [] } }, 201);
      }

      const committeeAdminMatch = path.match(/^\/api\/admin\/committee\/([^/]+)$/);
      if (user.role === "admin" && committeeAdminMatch && request.method === "GET") {
        const detail = await committeeMeetingDetail(env, decodeURIComponent(committeeAdminMatch[1]));
        if (!detail) return json({ success: false, error: "협의체 회차를 찾을 수 없습니다." }, 404);
        return json({ success: true, meeting: detail });
      }

      if (user.role === "admin" && committeeAdminMatch && request.method === "PATCH") {
        const meetingId = decodeURIComponent(committeeAdminMatch[1]);
        const body = await request.json();
        const [meetingResult, oldPartnerResult, oldDepartmentResult, activeCompanyResult, activeDepartmentResult] = await env.partner_evaluation_db.batch([
          env.partner_evaluation_db.prepare(`SELECT * FROM committee_meetings WHERE id = ? LIMIT 1`).bind(meetingId),
          env.partner_evaluation_db.prepare(`SELECT * FROM committee_partner_attendance WHERE meeting_id = ?`).bind(meetingId),
          env.partner_evaluation_db.prepare(`SELECT * FROM committee_department_attendance WHERE meeting_id = ?`).bind(meetingId),
          env.partner_evaluation_db.prepare(`SELECT id, company_name FROM companies WHERE status = 'active'`),
          env.partner_evaluation_db.prepare(`SELECT id, department_name, sort_order FROM committee_departments WHERE is_active = 1`)
        ]);
        const beforeMeeting = meetingResult?.results?.[0];
        if (!beforeMeeting) return json({ success: false, error: "협의체 회차를 찾을 수 없습니다." }, 404);

        if (beforeMeeting.status === "finalized" && body.reopen !== true) {
          return json({ success: false, error: "확정된 협의체 회차입니다. 재오픈 후에만 수정할 수 있습니다.", locked: true }, 409);
        }
        if (body.expected_updated_at && String(body.expected_updated_at) !== String(beforeMeeting.updated_at)) {
          return json({ success: false, error: "다른 관리자가 먼저 저장했습니다. 새로고침 후 다시 시도하세요.", conflict: true }, 409);
        }

        const meetingDate = String(body.meeting_date ?? beforeMeeting.meeting_date).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(meetingDate)) return json({ success: false, error: "개최일을 확인하세요." }, 400);
        const year = parseAnnualYear(meetingDate.slice(0, 4));
        const month = Number(meetingDate.slice(5, 7));
        if (!Number.isInteger(month) || month < 1 || month > 12) return json({ success: false, error: "개최월을 확인하세요." }, 400);

        const partners = normalizeCommitteeRows(Array.isArray(body.partners) ? body.partners : [], "company_id", "협력사");
        const departments = normalizeCommitteeRows(Array.isArray(body.departments) ? body.departments : [], "department_id", "부서");
        const activeCompanies = new Map((activeCompanyResult?.results || []).map(r => [r.id, r]));
        const activeDepartments = new Map((activeDepartmentResult?.results || []).map(r => [r.id, r]));
        for (const row of partners) if (!activeCompanies.has(row.company_id)) return json({ success: false, error: "등록되지 않았거나 비활성화된 협력사가 포함되어 있습니다." }, 400);
        for (const row of departments) if (!activeDepartments.has(row.department_id)) return json({ success: false, error: "등록되지 않았거나 비활성화된 부서가 포함되어 있습니다." }, 400);

        const requestedStatus = body.finalize === true ? "finalized" : (body.status === "draft" ? "draft" : beforeMeeting.status);
        if (requestedStatus === "finalized") {
          if (!partners.length) return json({ success: false, error: "이 달 협의체 대상 협력사를 1개 이상 선택하세요." }, 400);
          if (partners.some(r => r.attendance_status === "pending")) return json({ success: false, error: "선택한 모든 협력사의 참석 또는 불참을 지정한 뒤 확정하세요." }, 400);
          if (departments.some(r => r.attendance_status === "pending")) return json({ success: false, error: "선택한 사내 부서의 참석 또는 불참을 지정한 뒤 확정하세요." }, 400);
        }

        const title = `${year}년 ${month}월 안전보건협의체`;
        const note = String(body.note ?? beforeMeeting.note ?? "").trim() || null;
        const oldPartners = new Map((oldPartnerResult?.results || []).map(r => [r.company_id, r]));
        const oldDepartments = new Map((oldDepartmentResult?.results || []).map(r => [r.department_id, r]));
        const nextPartnerIds = new Set(partners.map(r => r.company_id));
        const nextDepartmentIds = new Set(departments.map(r => r.department_id));
        const statements = [];

        statements.push(env.partner_evaluation_db.prepare(`
          UPDATE committee_meetings
          SET year = ?, meeting_month = ?, meeting_date = ?, title = ?, note = ?, status = ?,
              finalized_by = CASE WHEN ? = 'finalized' THEN ? ELSE NULL END,
              finalized_at = CASE WHEN ? = 'finalized' THEN COALESCE(finalized_at, CURRENT_TIMESTAMP) ELSE NULL END,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(year, month, meetingDate, title, note, requestedStatus, requestedStatus, user.id, requestedStatus, meetingId));

        for (const row of partners) {
          const old = oldPartners.get(row.company_id) || null;
          statements.push(env.partner_evaluation_db.prepare(`
            INSERT INTO committee_partner_attendance
              (id, meeting_id, company_id, attendance_status, attendee_position, attendee_name, note, updated_by, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, NULL, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(meeting_id, company_id) DO UPDATE SET
              attendance_status = excluded.attendance_status,
              attendee_position = excluded.attendee_position,
              attendee_name = excluded.attendee_name,
              note = NULL,
              updated_by = excluded.updated_by,
              updated_at = CURRENT_TIMESTAMP
          `).bind(old?.id || crypto.randomUUID(), meetingId, row.company_id, row.attendance_status, row.attendee_position, row.attendee_name, user.id));
          const log = committeeLogStatement(env, meetingId, "partner", row.company_id, old, row, user.id);
          if (log) statements.push(log);
        }
        if (partners.length) {
          const ph = partners.map(() => "?").join(",");
          statements.push(env.partner_evaluation_db.prepare(`DELETE FROM committee_partner_attendance WHERE meeting_id = ? AND company_id NOT IN (${ph})`).bind(meetingId, ...partners.map(r => r.company_id)));
        } else {
          statements.push(env.partner_evaluation_db.prepare(`DELETE FROM committee_partner_attendance WHERE meeting_id = ?`).bind(meetingId));
        }
        for (const [companyId, old] of oldPartners) {
          if (!nextPartnerIds.has(companyId)) {
            const log = committeeLogStatement(env, meetingId, "partner", companyId, old, null, user.id);
            if (log) statements.push(log);
          }
        }

        for (const row of departments) {
          const old = oldDepartments.get(row.department_id) || null;
          statements.push(env.partner_evaluation_db.prepare(`
            INSERT INTO committee_department_attendance
              (id, meeting_id, department_id, attendance_status, attendee_position, attendee_name, note, updated_by, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, NULL, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(meeting_id, department_id) DO UPDATE SET
              attendance_status = excluded.attendance_status,
              attendee_position = excluded.attendee_position,
              attendee_name = excluded.attendee_name,
              note = NULL,
              updated_by = excluded.updated_by,
              updated_at = CURRENT_TIMESTAMP
          `).bind(old?.id || crypto.randomUUID(), meetingId, row.department_id, row.attendance_status, row.attendee_position, row.attendee_name, user.id));
          const log = committeeLogStatement(env, meetingId, "department", row.department_id, old, row, user.id);
          if (log) statements.push(log);
        }
        if (departments.length) {
          const ph = departments.map(() => "?").join(",");
          statements.push(env.partner_evaluation_db.prepare(`DELETE FROM committee_department_attendance WHERE meeting_id = ? AND department_id NOT IN (${ph})`).bind(meetingId, ...departments.map(r => r.department_id)));
        } else {
          statements.push(env.partner_evaluation_db.prepare(`DELETE FROM committee_department_attendance WHERE meeting_id = ?`).bind(meetingId));
        }
        for (const [departmentId, old] of oldDepartments) {
          if (!nextDepartmentIds.has(departmentId)) {
            const log = committeeLogStatement(env, meetingId, "department", departmentId, old, null, user.id);
            if (log) statements.push(log);
          }
        }

        const afterMeeting = { year, meeting_month: month, meeting_date: meetingDate, title, note, status: requestedStatus };
        const meetingLog = committeeLogStatement(env, meetingId, "meeting", meetingId, beforeMeeting, afterMeeting, user.id);
        if (meetingLog) statements.push(meetingLog);

        try {
          await env.partner_evaluation_db.batch(statements);
        } catch (e) {
          if (String(e?.message || "").toLowerCase().includes("unique")) return json({ success: false, error: `${year}년 ${month}월 협의체가 이미 있습니다. 월별 1개만 운영할 수 있습니다.` }, 409);
          throw e;
        }

        const oldCompanyIds = [...oldPartners.keys()];
        const newCompanyIds = partners.map(r => r.company_id);
        const syncPairs = [
          ...oldCompanyIds.map(companyId => ({ companyId, year: Number(beforeMeeting.year) })),
          ...newCompanyIds.map(companyId => ({ companyId, year }))
        ];
        background(syncCommitteeAnnualCountsBatch(env, syncPairs));

        const partnerDetails = partners.map(row => ({ ...row, company_name: activeCompanies.get(row.company_id)?.company_name || row.company_id }))
          .sort((a,b) => String(a.company_name).localeCompare(String(b.company_name), "ko"));
        const departmentDetails = departments.map(row => ({ ...row, department_name: activeDepartments.get(row.department_id)?.department_name || row.department_id, sort_order: activeDepartments.get(row.department_id)?.sort_order || 0 }))
          .sort((a,b) => Number(a.sort_order)-Number(b.sort_order) || String(a.department_name).localeCompare(String(b.department_name), "ko"));
        const detail = {
          ...beforeMeeting,
          ...afterMeeting,
          finalized_by: requestedStatus === "finalized" ? user.id : null,
          finalized_at: requestedStatus === "finalized" ? (beforeMeeting.finalized_at || new Date().toISOString()) : null,
          updated_at: new Date().toISOString(),
          partners: partnerDetails,
          departments: departmentDetails
        };
        return json({ success: true, meeting: detail, optimized: true });
      }

      if (user.role === "admin" && committeeAdminMatch && request.method === "DELETE") {
        const meetingId = decodeURIComponent(committeeAdminMatch[1]);
        const [meetingResult, partnerResult] = await env.partner_evaluation_db.batch([
          env.partner_evaluation_db.prepare(`SELECT year, status FROM committee_meetings WHERE id = ? LIMIT 1`).bind(meetingId),
          env.partner_evaluation_db.prepare(`SELECT company_id FROM committee_partner_attendance WHERE meeting_id = ?`).bind(meetingId)
        ]);
        const before = meetingResult?.results?.[0];
        if (!before) return json({ success: false, error: "협의체 회차를 찾을 수 없습니다." }, 404);
        if (before.status === "finalized" && !url.searchParams.has("force")) {
          return json({ success: false, error: "확정된 협의체 회차는 삭제할 수 없습니다. 필요하면 재오픈 후 삭제하세요.", locked: true }, 409);
        }
        await env.partner_evaluation_db.prepare(`DELETE FROM committee_meetings WHERE id = ?`).bind(meetingId).run();
        const pairs = (partnerResult?.results || []).map(r => ({ companyId: r.company_id, year: Number(before.year) }));
        background(syncCommitteeAnnualCountsBatch(env, pairs));
        return json({ success: true });
      }

      // ===== VOC (건의) =====
      if (request.method === "POST" && path === "/api/voc") {
        if (user.role !== "partner") return forbidden();
        if (!user.company_id) return json({ success: false, error: "회사 연결정보가 없습니다." }, 400);
        const body = await request.json();
        const title = String(body.title || "").trim();
        const content = String(body.content || "").trim();
        const category = ["general","safety","facility","other"].includes(body.category) ? body.category : "general";
        if (!title || !content) return json({ success: false, error: "제목과 내용을 입력하세요." }, 400);

        const id = crypto.randomUUID();
        await env.partner_evaluation_db.prepare(`
          INSERT INTO voc_submissions (id, company_id, created_by, category, title, content, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'received', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).bind(id, user.company_id, user.id, category, title, content).run();

        return json({ success: true, voc: { id, company_id: user.company_id, category, title, content, status: "received" } }, 201);
      }

      if (request.method === "GET" && path === "/api/voc") {
        if (user.role === "admin") {
          const { results } = await env.partner_evaluation_db.prepare(`
            SELECT v.id, v.company_id, c.company_name, v.category, v.title, v.status,
                   v.created_at, v.updated_at, v.replied_at
            FROM voc_submissions v
            LEFT JOIN companies c ON c.id = v.company_id
            ORDER BY
              CASE v.status WHEN 'received' THEN 1 WHEN 'in_review' THEN 2 WHEN 'resolved' THEN 3 ELSE 4 END,
              v.created_at DESC
          `).all();
          return json({ success: true, voc: results });
        }
        if (!user.company_id) return json({ success: false, error: "회사 연결정보가 없습니다." }, 400);
        const { results } = await env.partner_evaluation_db.prepare(`
          SELECT id, category, title, status, admin_reply, replied_at, created_at, updated_at
          FROM voc_submissions
          WHERE company_id = ?
          ORDER BY created_at DESC
        `).bind(user.company_id).all();
        return json({ success: true, voc: results });
      }

      const vocDetailMatch = path.match(/^\/api\/voc\/([^/]+)$/);
      if (request.method === "GET" && vocDetailMatch) {
        const item = await env.partner_evaluation_db.prepare(`
          SELECT v.*, c.company_name
          FROM voc_submissions v
          LEFT JOIN companies c ON c.id = v.company_id
          WHERE v.id = ?
          LIMIT 1
        `).bind(vocDetailMatch[1]).first();
        if (!item) return json({ success: false, error: "건의 내역을 찾을 수 없습니다." }, 404);
        if (user.role !== "admin" && item.company_id !== user.company_id) return forbidden();
        return json({ success: true, voc: item });
      }

      const vocAdminMatch = path.match(/^\/api\/admin\/voc\/([^/]+)$/);
      if (user.role === "admin" && vocAdminMatch && request.method === "PATCH") {
        const vocId = vocAdminMatch[1];
        const body = await request.json();
        const before = await env.partner_evaluation_db.prepare(`SELECT * FROM voc_submissions WHERE id = ? LIMIT 1`).bind(vocId).first();
        if (!before) return json({ success: false, error: "건의 내역을 찾을 수 없습니다." }, 404);

        const status = ["received","in_review","resolved","closed"].includes(body.status) ? body.status : before.status;
        const adminReply = body.admin_reply !== undefined ? String(body.admin_reply || "").trim() || null : before.admin_reply;
        const repliedAt = (adminReply && adminReply !== before.admin_reply) ? new Date().toISOString() : before.replied_at;
        const repliedBy = (adminReply && adminReply !== before.admin_reply) ? user.id : before.replied_by;

        await env.partner_evaluation_db.batch([
          env.partner_evaluation_db.prepare(`
            UPDATE voc_submissions
            SET status = ?, admin_reply = ?, replied_by = ?, replied_at = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(status, adminReply, repliedBy, repliedAt, vocId),
          env.partner_evaluation_db.prepare(`
            INSERT INTO voc_change_logs (voc_id, before_json, after_json, changed_by)
            VALUES (?, ?, ?, ?)
          `).bind(vocId, JSON.stringify({ status: before.status, admin_reply: before.admin_reply }), JSON.stringify({ status, admin_reply: adminReply }), user.id)
        ]);

        return json({ success: true, voc: { id: vocId, status, admin_reply: adminReply, replied_by: repliedBy, replied_at: repliedAt } });
      }

      if (request.method === "GET" && path === "/api/admin/dashboard-bundle") {
        if (user.role !== "admin") return forbidden();
        const [cycleResult, dashboardResult, targetResult] = await env.partner_evaluation_db.batch([
          env.partner_evaluation_db.prepare(`
            SELECT id, year, half, cycle_name, start_at, end_at, status, template_id
            FROM evaluation_cycles
            ORDER BY year DESC, CASE WHEN half = 'second' THEN 2 ELSE 1 END DESC
          `),
          env.partner_evaluation_db.prepare(`
            SELECT
              v.cycle_id, v.cycle_name, v.target_company_count,
              v.submitted_count, v.evaluating_count, v.completed_count,
              (
                SELECT COUNT(*)
                FROM notifications n
                WHERE n.is_read = 0
                  AND n.recipient_user_id IN (SELECT id FROM users WHERE role = 'admin')
              ) AS unread_notification_count
            FROM v_cycle_dashboard v
            JOIN evaluation_cycles ec ON ec.id = v.cycle_id
            ORDER BY ec.year DESC, CASE WHEN ec.half = 'second' THEN 2 ELSE 1 END DESC
            LIMIT 1
          `),
          env.partner_evaluation_db.prepare(`
            SELECT
              et.id, et.cycle_id, et.company_id, c.company_name, c.industry_name,
              et.is_selected, et.exclusion_reason, et.status, et.submitted_at,
              et.finalized_at, et.published_at, tcp.worker_count
            FROM evaluation_targets et
            JOIN companies c ON c.id = et.company_id
            LEFT JOIN target_company_profiles tcp ON tcp.target_id = et.id
            ORDER BY c.company_name
          `)
        ]);
        return json({
          success: true,
          cycles: cycleResult?.results || [],
          dashboard: dashboardResult?.results?.[0] || null,
          targets: targetResult?.results || []
        });
      }

      if (request.method === "GET" && path === "/api/cycles") {
        const { results } = await env.partner_evaluation_db.prepare(`
          SELECT id, year, half, cycle_name, start_at, end_at, status, template_id
          FROM evaluation_cycles
          ORDER BY year DESC,
            CASE WHEN half = 'second' THEN 2 ELSE 1 END DESC
        `).all();
        return json({ success: true, cycles: results });
      }

      if (request.method === "GET" && path === "/api/dashboard") {
        if (user.role !== "admin") return forbidden();
        const cycleId = url.searchParams.get("cycle_id");
        let row;
        if (cycleId) {
          row = await env.partner_evaluation_db.prepare(`
            SELECT
              v.cycle_id, v.cycle_name, v.target_company_count,
              v.submitted_count, v.evaluating_count, v.completed_count,
              (
                SELECT COUNT(*)
                FROM notifications n
                JOIN users u ON u.id = n.recipient_user_id
                WHERE n.is_read = 0 AND u.role = 'admin'
              ) AS unread_notification_count
            FROM v_cycle_dashboard v
            WHERE v.cycle_id = ?
          `).bind(cycleId).first();
        } else {
          row = await env.partner_evaluation_db.prepare(`
            SELECT
              v.cycle_id, v.cycle_name, v.target_company_count,
              v.submitted_count, v.evaluating_count, v.completed_count,
              (
                SELECT COUNT(*)
                FROM notifications n
                JOIN users u ON u.id = n.recipient_user_id
                WHERE n.is_read = 0 AND u.role = 'admin'
              ) AS unread_notification_count
            FROM v_cycle_dashboard v
            JOIN evaluation_cycles ec ON ec.id = v.cycle_id
            ORDER BY ec.year DESC,
              CASE WHEN ec.half = 'second' THEN 2 ELSE 1 END DESC
            LIMIT 1
          `).first();
        }
        return json({ success: true, dashboard: row });
      }

      if (request.method === "GET" && path === "/api/targets") {
        if (user.role !== "admin") return forbidden();
        const cycleId = url.searchParams.get("cycle_id");
        let sql = `
          SELECT
            et.id, et.cycle_id, et.company_id, c.company_name, c.industry_name,
            et.is_selected, et.exclusion_reason, et.status, et.submitted_at,
            et.finalized_at, et.published_at, tcp.worker_count
          FROM evaluation_targets et
          JOIN companies c ON c.id = et.company_id
          LEFT JOIN target_company_profiles tcp ON tcp.target_id = et.id
        `;
        if (cycleId) {
          sql += ` WHERE et.cycle_id = ? ORDER BY c.company_name`;
          const { results } = await env.partner_evaluation_db.prepare(sql).bind(cycleId).all();
          return json({ success: true, targets: results });
        }
        sql += ` ORDER BY c.company_name`;
        const { results } = await env.partner_evaluation_db.prepare(sql).all();
        return json({ success: true, targets: results });
      }

      if (request.method === "GET" && path === "/api/my/evaluations") {
        if (user.role !== "partner") return forbidden();
        if (!user.company_id) return json({ success: false, error: "회사 연결정보가 없습니다." }, 400);

        const { results } = await env.partner_evaluation_db.prepare(`
          SELECT
            et.id, et.cycle_id, et.company_id, et.status,
            et.submitted_at, et.finalized_at, et.published_at,
            ec.cycle_name, ec.year, ec.half, ec.start_at, ec.end_at,
            c.company_name, c.industry_name, tcp.worker_count
          FROM evaluation_targets et
          JOIN evaluation_cycles ec ON ec.id = et.cycle_id
          JOIN companies c ON c.id = et.company_id
          LEFT JOIN target_company_profiles tcp ON tcp.target_id = et.id
          WHERE et.company_id = ? AND et.is_selected = 1
          ORDER BY ec.year DESC,
            CASE WHEN ec.half = 'second' THEN 2 ELSE 1 END DESC
        `).bind(user.company_id).all();

        return json({ success: true, evaluations: results });
      }

      const evaluationMatch = path.match(/^\/api\/evaluations\/([^/]+)$/);
      if (request.method === "GET" && evaluationMatch) {
        const targetId = evaluationMatch[1];
        const [targetResult, itemResult] = await env.partner_evaluation_db.batch([
          env.partner_evaluation_db.prepare(`
            SELECT
              et.id AS target_id, et.status, et.submitted_at, et.finalized_at,
              et.published_at, et.company_id,
              c.company_name, c.industry_code, c.industry_name,
              tcp.business_number, tcp.representative_name, tcp.worker_count,
              ec.id AS cycle_id, ec.cycle_name, ec.year, ec.half, ec.start_at, ec.end_at
            FROM evaluation_targets et
            JOIN companies c ON c.id = et.company_id
            JOIN evaluation_cycles ec ON ec.id = et.cycle_id
            LEFT JOIN target_company_profiles tcp ON tcp.target_id = et.id
            WHERE et.id = ?
          `).bind(targetId),
          env.partner_evaluation_db.prepare(`
            SELECT
              tis.id AS target_item_state_id,
              ei.id AS item_id, ei.item_code, ei.item_name, ei.guide_text,
              ei.item_type, ei.max_score,
              cat.id AS category_id, cat.category_name, cat.parent_id,
              parent.category_name AS parent_category_name,
              tis.applicable, tis.na_source, tis.manual_na_reason,
              tis.needs_reevaluation, tis.last_submission_change_at,
              sub.id AS submission_id, sub.description,
              es.earned_score, es.max_score_snapshot,
              es.comment AS evaluation_comment, es.evaluated_at
            FROM target_item_states tis
            JOIN evaluation_items ei ON ei.id = tis.evaluation_item_id
            JOIN evaluation_categories cat ON cat.id = ei.category_id
            LEFT JOIN evaluation_categories parent ON parent.id = cat.parent_id
            LEFT JOIN item_submissions sub ON sub.target_item_state_id = tis.id
            LEFT JOIN evaluation_scores es ON es.target_item_state_id = tis.id
            WHERE tis.target_id = ?
            ORDER BY
              COALESCE(parent.sort_order, cat.sort_order),
              cat.sort_order,
              ei.sort_order
          `).bind(targetId)
        ]);

        const target = targetResult?.results?.[0];
        const items = itemResult?.results || [];
        if (!target) return json({ success: false, error: "Evaluation target not found" }, 404);
        if (user.role === "partner" && target.company_id !== user.company_id) return forbidden();

        if (user.role === "partner" && !target.published_at) {
          for (const item of items) {
            item.earned_score = null;
            item.max_score_snapshot = null;
            item.evaluation_comment = null;
            item.evaluated_at = null;
          }
        }
        return json({ success: true, evaluation: { target, items } });
      }

      if (user.role === "admin" && request.method === "GET" && path === "/api/admin/registrations") {
        const { results } = await env.partner_evaluation_db.prepare(`
          SELECT
            pa.id, pa.company_id, c.company_name,
            pa.name, pa.position, pa.phone, pa.email,
            pa.email_verified, pa.approval_status, pa.rejection_reason,
            pa.created_at
          FROM portal_accounts pa
          LEFT JOIN companies c ON c.id = pa.company_id
          WHERE pa.role = 'partner'
          ORDER BY
            CASE pa.approval_status
              WHEN 'pending' THEN 1
              WHEN 'rejected' THEN 2
              WHEN 'approved' THEN 3
              ELSE 4
            END,
            pa.created_at DESC
        `).all();
        return json({ success: true, registrations: results });
      }

      const regMatch = path.match(/^\/api\/admin\/registrations\/([^/]+)$/);
      if (user.role === "admin" && request.method === "PATCH" && regMatch) {
        const accountId = regMatch[1];
        const body = await request.json();
        const action = String(body.action || "");

        const target = await env.partner_evaluation_db.prepare(`
          SELECT pa.id, pa.firebase_uid, pa.company_id, pa.approval_status,
            (
              SELECT COUNT(*) FROM portal_accounts p2
              WHERE p2.company_id = pa.company_id
                AND p2.approval_status = 'approved'
                AND p2.id <> pa.id
            ) AS approved_peer_count
          FROM portal_accounts pa
          WHERE pa.id = ? AND pa.role = 'partner'
        `).bind(accountId).first();

        if (!target) return json({ success: false, error: "가입 신청을 찾을 수 없습니다." }, 404);
        forgetApprovedAccount(target.firebase_uid);

        if (action === "approve") {
          if (Number(target.approved_peer_count || 0) >= 3) {
            return json({ success: false, error: "해당 회사의 승인된 담당자 계정이 이미 3개입니다." }, 409);
          }

          await env.partner_evaluation_db.prepare(`
            UPDATE portal_accounts
            SET approval_status = 'approved',
                rejection_reason = NULL,
                approved_at = CURRENT_TIMESTAMP,
                approved_by = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(user.id, accountId).run();

          return json({ success: true });
        }

        if (action === "reject") {
          await env.partner_evaluation_db.prepare(`
            UPDATE portal_accounts
            SET approval_status = 'rejected',
                rejection_reason = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(String(body.reason || "").trim() || null, accountId).run();

          return json({ success: true });
        }

        if (action === "suspend") {
          await env.partner_evaluation_db.prepare(`
            UPDATE portal_accounts
            SET approval_status = 'suspended',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(accountId).run();

          return json({ success: true });
        }

        return json({ success: false, error: "지원하지 않는 작업입니다." }, 400);
      }

      if (user.role === "admin" && request.method === "GET" && path === "/api/admin/notices") {
        const { results } = await env.partner_evaluation_db.prepare(`
          SELECT *
          FROM portal_notices
          ORDER BY created_at DESC
        `).all();
        return json({ success: true, notices: results });
      }

      if (user.role === "admin" && request.method === "POST" && path === "/api/admin/notices") {
        const body = await request.json();
        const title = String(body.title || "").trim();
        const content = String(body.content || "").trim();
        if (!title || !content) return json({ success: false, error: "제목과 내용을 입력하세요." }, 400);

        const id = crypto.randomUUID();
        await env.partner_evaluation_db.prepare(`
          INSERT INTO portal_notices (
            id, title, content, is_important, show_on_login, show_after_login,
            is_active, start_at, end_at, created_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).bind(
          id, title, content,
          body.is_important ? 1 : 0,
          body.show_on_login ? 1 : 0,
          body.show_after_login ? 1 : 0,
          body.start_at || null,
          body.end_at || null,
          user.id
        ).run();

        return json({ success: true, id }, 201);
      }

      const noticeMatch = path.match(/^\/api\/admin\/notices\/([^/]+)$/);
      if (user.role === "admin" && noticeMatch && request.method === "PATCH") {
        const id = noticeMatch[1];
        const body = await request.json();
        await env.partner_evaluation_db.prepare(`
          UPDATE portal_notices
          SET title = ?,
              content = ?,
              is_important = ?,
              show_on_login = ?,
              show_after_login = ?,
              is_active = ?,
              start_at = ?,
              end_at = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(
          String(body.title || "").trim(),
          String(body.content || "").trim(),
          body.is_important ? 1 : 0,
          body.show_on_login ? 1 : 0,
          body.show_after_login ? 1 : 0,
          body.is_active === false ? 0 : 1,
          body.start_at || null,
          body.end_at || null,
          id
        ).run();
        return json({ success: true });
      }

      if (user.role === "admin" && noticeMatch && request.method === "DELETE") {
        await env.partner_evaluation_db.prepare(`
          DELETE FROM portal_notices WHERE id = ?
        `).bind(noticeMatch[1]).run();
        return json({ success: true });
      }

      return json({ success: false, error: "API route not found", method: request.method, path, version: "16.6.0" }, 404);
    } catch (error) {
      console.error(error);
      return json({ success: false, error: error?.message || "Internal server error" }, 500);
    }
  }
};

async function firebaseUserFromRequest(request) {
  const header = request.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return { ok: false, status: 401, error: "로그인이 필요합니다." };
  const idToken = match[1];
  const now = Date.now();
  const cached = FIREBASE_LOOKUP_CACHE.get(idToken);
  if (cached && cached.expiresAt > now) return { ok: true, user: cached.user };
  if (cached) FIREBASE_LOOKUP_CACHE.delete(idToken);

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_API_KEY)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken })
    }
  );

  if (!response.ok) return { ok: false, status: 401, error: "로그인이 만료되었거나 유효하지 않습니다." };

  const data = await response.json();
  const user = data.users?.[0];
  if (!user?.localId || user.disabled) return { ok: false, status: 401, error: "유효하지 않은 사용자입니다." };

  if (FIREBASE_LOOKUP_CACHE.size >= FIREBASE_LOOKUP_CACHE_MAX) {
    const oldestKey = FIREBASE_LOOKUP_CACHE.keys().next().value;
    if (oldestKey) FIREBASE_LOOKUP_CACHE.delete(oldestKey);
  }
  FIREBASE_LOOKUP_CACHE.set(idToken, { user, expiresAt: now + FIREBASE_LOOKUP_TTL_MS });
  return { ok: true, user };
}


function rememberApprovedAccount(uid, account) {
  if (!uid || !account) return;
  if (APPROVED_ACCOUNT_CACHE.size >= APPROVED_ACCOUNT_CACHE_MAX) {
    const oldestKey = APPROVED_ACCOUNT_CACHE.keys().next().value;
    if (oldestKey) APPROVED_ACCOUNT_CACHE.delete(oldestKey);
  }
  APPROVED_ACCOUNT_CACHE.set(uid, { account, expiresAt: Date.now() + APPROVED_ACCOUNT_TTL_MS });
}

function forgetApprovedAccount(uid) {
  if (uid) APPROVED_ACCOUNT_CACHE.delete(uid);
}

async function requireApprovedAccount(request, env) {
  const firebase = await firebaseUserFromRequest(request);
  if (!firebase.ok) return firebase;

  const uid = firebase.user.localId;
  const cached = APPROVED_ACCOUNT_CACHE.get(uid);
  if (cached && cached.expiresAt > Date.now()) {
  if (cached.account.role !== "admin" && !firebase.user.emailVerified) return {
    ok: false,
    status: 403,
    error: "이메일 인증이 필요합니다.",
    auth_state: "email_verification_required"
  };
  return { ok: true, account: cached.account, firebase: firebase.user };
}
  if (cached) APPROVED_ACCOUNT_CACHE.delete(uid);

  const portal = await env.partner_evaluation_db.prepare(`
    SELECT id, email, role, company_id, approval_status
    FROM portal_accounts
    WHERE firebase_uid = ?
    LIMIT 1
  `).bind(uid).first();

if (portal) {
  if (portal.role !== "admin" && !firebase.user.emailVerified) {
    return {
      ok: false,
      status: 403,
      error: "이메일 인증이 필요합니다.",
      auth_state: "email_verification_required"
    };
  }
    if (portal.approval_status !== "approved") {
      const messages = {
        pending: "가입 승인 대기중입니다.",
        rejected: "회원가입 신청이 반려된 계정입니다.",
        suspended: "사용이 중지된 계정입니다."
      };
      return {
        ok: false,
        status: 403,
        error: messages[portal.approval_status] || "사용할 수 없는 계정입니다.",
        auth_state: portal.approval_status
      };
    }
    rememberApprovedAccount(uid, portal);
    return { ok: true, account: portal, firebase: firebase.user };
  }

  const legacy = await env.partner_evaluation_db.prepare(`
    SELECT id, email, role, company_id, status
    FROM users
    WHERE firebase_uid = ?
    LIMIT 1
  `).bind(uid).first();

  if (!legacy) return { ok: false, status: 403, error: "I-PASS 계정에 연결되지 않은 사용자입니다.", auth_state: "unregistered" };
  if (legacy.status && legacy.status !== "active") return { ok: false, status: 403, error: "사용이 중지된 계정입니다.", auth_state: "suspended" };

  const account = { ...legacy, approval_status: "approved" };
  rememberApprovedAccount(uid, account);
  return { ok: true, account, firebase: firebase.user };
}

function parseAnnualYear(value) {
  const current = new Date().getFullYear();
  const year = Number(value || current);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return current;
  return year;
}

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function autoHalfScoresFromRows(rows) {
  const out = { first: null, second: null };
  for (const row of rows || []) {
    if (out[row.half]) continue;
    const raw = Number(row.final_score);
    if (!Number.isFinite(raw)) continue;
    out[row.half] = {
      score: round1(Math.max(0, Math.min(100, raw)) * 0.4),
      target_id: row.target_id,
      final_score_100: round1(raw),
      published_at: row.published_at
    };
  }
  return out;
}

function annualLogStatement(env, companyId, year, field, oldValue, newValue, source, changedBy) {
  if (String(oldValue ?? "") === String(newValue ?? "")) return null;
  return env.partner_evaluation_db.prepare(`
    INSERT INTO annual_ipass_score_logs
      (company_id, year, field_name, old_value, new_value, change_source, changed_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(companyId, year, field, oldValue == null ? null : String(oldValue), newValue == null ? null : String(newValue), source, changedBy || null);
}

function annualGrade(score) {
  if (score == null || !Number.isFinite(Number(score))) return null;
  const n = Number(score);
  if (n >= 90) return "안전관리 우수협력사";
  if (n >= 70) return "적격 수급사";
  return "역량강화대상 협력사";
}

// Read-only summary: GET requests never write or create audit logs.
// Manual scores override published automatic scores. Committee counts are read
// directly from finalized attendance, so the UI is immediately consistent even
// when the denormalized annual counter is synchronized in the background.
async function annualIpassSummary(env, companyId, year) {
  const [annualResult, autoResult, committeeResult] = await env.partner_evaluation_db.batch([
    env.partner_evaluation_db.prepare(`
      SELECT ais.*, c.company_name
      FROM companies c
      LEFT JOIN annual_ipass_scores ais
        ON ais.company_id = c.id AND ais.year = ?
      WHERE c.id = ?
      LIMIT 1
    `).bind(year, companyId),
    env.partner_evaluation_db.prepare(`
      SELECT
        ec.half, et.id AS target_id, er.final_score,
        COALESCE(er.published_at, et.published_at) AS published_at
      FROM evaluation_targets et
      JOIN evaluation_cycles ec ON ec.id = et.cycle_id
      JOIN evaluation_results er ON er.target_id = et.id
      WHERE et.company_id = ?
        AND ec.year = ?
        AND et.is_selected = 1
        AND ec.half IN ('first','second')
        AND COALESCE(er.published_at, et.published_at) IS NOT NULL
      ORDER BY COALESCE(er.published_at, et.published_at) DESC
    `).bind(companyId, year),
    env.partner_evaluation_db.prepare(`
      SELECT
        COUNT(*) AS finalized_meeting_count,
        SUM(CASE WHEN cpa.attendance_status = 'present' THEN 1 ELSE 0 END) AS present_count,
        SUM(CASE WHEN cpa.attendance_status = 'absent' THEN 1 ELSE 0 END) AS absence_count
      FROM committee_partner_attendance cpa
      JOIN committee_meetings cm ON cm.id = cpa.meeting_id
      WHERE cpa.company_id = ? AND cm.year = ? AND cm.status = 'finalized'
    `).bind(companyId, year)
  ]);

  const row = annualResult?.results?.[0] || null;
  if (!row?.company_name) throw new Error("회사 정보를 찾을 수 없습니다.");
  const auto = autoHalfScoresFromRows(autoResult?.results || []);
  const committeeRow = committeeResult?.results?.[0] || {};

  const firstManual = row?.first_half_source === "manual";
  const secondManual = row?.second_half_source === "manual";
  const first = firstManual
    ? (row?.first_half_score == null ? null : Number(row.first_half_score))
    : (auto.first?.score ?? (row?.first_half_score == null ? null : Number(row.first_half_score)));
  const second = secondManual
    ? (row?.second_half_score == null ? null : Number(row.second_half_score))
    : (auto.second?.score ?? (row?.second_half_score == null ? null : Number(row.second_half_score)));
  const firstSource = firstManual ? "manual" : (auto.first ? "auto" : (row?.first_half_source || null));
  const secondSource = secondManual ? "manual" : (auto.second ? "auto" : (row?.second_half_source || null));

  const committeeAbsence = Number(committeeRow?.absence_count || 0);
  const committeeMeetingCount = Number(committeeRow?.finalized_meeting_count || 0);
  const committeePresentCount = Number(committeeRow?.present_count || 0);
  const accidentCount = Number(row?.industrial_accident_count || 0);
  const unreasonableCount = Number(row?.unreasonable_finding_count || 0);
  const committeeScore = Math.max(0, 10 - committeeAbsence * 3);
  const accidentScore = accidentCount === 0 ? 10 : 0;
  const unreasonableDeduction = unreasonableCount * 3;
  const base = (first || 0) + committeeScore + accidentScore - unreasonableDeduction;
  const finalTotal = second == null ? null : round1(Math.max(0, Math.min(100, base + second)));
  const maintainProjection = first == null || second != null ? null : round1(Math.max(0, Math.min(100, base + first)));
  const perfectProjection = first == null || second != null ? null : round1(Math.max(0, Math.min(100, base + 40)));

  const autoSync = [];
  for (const half of ["first", "second"]) {
    const found = auto[half];
    if (!found || row?.[`${half}_half_source`] === "manual") continue;
    const storedScore = row?.[`${half}_half_score`];
    const storedSource = row?.[`${half}_half_source`] || null;
    const storedTarget = row?.[`${half}_half_target_id`] || null;
    if (Number(storedScore) === Number(found.score) && storedSource === "auto" && storedTarget === found.target_id) continue;
    autoSync.push({ half, score: found.score, target_id: found.target_id, old: storedScore });
  }

  return {
    company_id: companyId,
    company_name: row.company_name,
    year,
    first_half_score: first,
    first_half_source: firstSource,
    second_half_score: second,
    second_half_source: secondSource,
    auto_first_half_score: auto.first?.score ?? null,
    auto_second_half_score: auto.second?.score ?? null,
    committee_absence_count: committeeAbsence,
    committee_meeting_count: committeeMeetingCount,
    committee_present_count: committeePresentCount,
    industrial_accident_count: accidentCount,
    unreasonable_finding_count: unreasonableCount,
    committee_score: committeeScore,
    industrial_accident_score: accidentScore,
    unreasonable_deduction: unreasonableDeduction,
    final_total: finalTotal,
    final_grade: annualGrade(finalTotal),
    current_reflected_score: round1(Math.max(0, base + (second || 0))),
    current_reflected_max: second == null ? 60 : 100,
    maintain_projection: maintainProjection,
    maintain_grade: annualGrade(maintainProjection),
    perfect_projection: perfectProjection,
    perfect_grade: annualGrade(perfectProjection),
    second_half_pending: second == null,
    _auto_sync: autoSync
  };
}

async function persistAnnualAutoChanges(env, companyId, year, changes) {
  if (!changes?.length) return;
  const statements = [
    env.partner_evaluation_db.prepare(`
      INSERT INTO annual_ipass_scores (id, company_id, year)
      SELECT ?, id, ? FROM companies WHERE id = ?
      ON CONFLICT(company_id, year) DO NOTHING
    `).bind(crypto.randomUUID(), year, companyId)
  ];
  for (const change of changes) {
    const half = change.half === "second" ? "second" : "first";
    statements.push(env.partner_evaluation_db.prepare(`
      INSERT INTO annual_ipass_score_logs
        (company_id, year, field_name, old_value, new_value, change_source, changed_by)
      SELECT company_id, year, ?, CAST(${half}_half_score AS TEXT), ?, 'auto', NULL
      FROM annual_ipass_scores
      WHERE company_id = ? AND year = ?
        AND COALESCE(${half}_half_source, 'auto') <> 'manual'
        AND (${half}_half_score IS NULL OR ${half}_half_score <> ? OR ${half}_half_target_id IS NULL OR ${half}_half_target_id <> ?)
    `).bind(`${half}_half_score`, String(change.score), companyId, year, change.score, change.target_id));
    statements.push(env.partner_evaluation_db.prepare(`
      UPDATE annual_ipass_scores
      SET ${half}_half_score = ?,
          ${half}_half_source = 'auto',
          ${half}_half_target_id = ?,
          ${half}_half_updated_by = NULL,
          ${half}_half_updated_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE company_id = ? AND year = ? AND COALESCE(${half}_half_source, 'auto') <> 'manual'
    `).bind(change.score, change.target_id, companyId, year));
  }
  await env.partner_evaluation_db.batch(statements);
}


function normalizeCommitteeStatus(value) {
  const s = String(value || "pending");
  return ["pending", "present", "absent"].includes(s) ? s : null;
}

function normalizeCommitteeRows(rows, key, label) {
  const out = [];
  const seen = new Set();
  for (const raw of rows || []) {
    const id = String(raw?.[key] || "").trim();
    const status = normalizeCommitteeStatus(raw?.attendance_status);
    const position = String(raw?.attendee_position || "").trim() || null;
    const name = String(raw?.attendee_name || "").trim() || null;
    if (!id || !status) throw new Error(`${label} 참석정보가 올바르지 않습니다.`);
    if (status === "present" && (!position || !name)) throw new Error(`참석 ${label}는 직급과 성명을 모두 입력하세요.`);
    if (seen.has(id)) throw new Error(`같은 ${label}를 중복 선택할 수 없습니다.`);
    seen.add(id);
    out.push({ [key]: id, attendance_status: status, attendee_position: position, attendee_name: name });
  }
  return out;
}

function committeeSnapshotChanged(before, after) {
  const fields = ["year","meeting_month","meeting_date","title","note","status","attendance_status","attendee_position","attendee_name"];
  return fields.some(k => String(before?.[k] ?? "") !== String(after?.[k] ?? ""));
}

function committeeLogStatement(env, meetingId, entityType, entityKey, before, after, changedBy) {
  if (!committeeSnapshotChanged(before, after)) return null;
  const pick = value => {
    if (!value) return null;
    const out = {};
    for (const key of ["year","meeting_month","meeting_date","title","note","status","attendance_status","attendee_position","attendee_name"]) {
      if (value[key] !== undefined) out[key] = value[key];
    }
    return JSON.stringify(out);
  };
  return env.partner_evaluation_db.prepare(`
    INSERT INTO committee_change_logs (meeting_id, entity_type, entity_key, before_json, after_json, changed_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(meetingId, entityType, entityKey, pick(before), pick(after), changedBy || null);
}

async function committeeMeetingDetail(env, meetingId) {
  const [meetingResult, partnerResult, departmentResult] = await env.partner_evaluation_db.batch([
    env.partner_evaluation_db.prepare(`SELECT * FROM committee_meetings WHERE id = ? LIMIT 1`).bind(meetingId),
    env.partner_evaluation_db.prepare(`
      SELECT cpa.company_id, c.company_name, cpa.attendance_status, cpa.attendee_position, cpa.attendee_name
      FROM committee_partner_attendance cpa
      JOIN companies c ON c.id = cpa.company_id
      WHERE cpa.meeting_id = ?
      ORDER BY c.company_name COLLATE NOCASE
    `).bind(meetingId),
    env.partner_evaluation_db.prepare(`
      SELECT cda.department_id, cd.department_name, cd.sort_order, cda.attendance_status, cda.attendee_position, cda.attendee_name
      FROM committee_department_attendance cda
      JOIN committee_departments cd ON cd.id = cda.department_id
      WHERE cda.meeting_id = ?
      ORDER BY cd.sort_order, cd.department_name
    `).bind(meetingId)
  ]);
  const meeting = meetingResult?.results?.[0];
  if (!meeting) return null;
  return { ...meeting, partners: partnerResult?.results || [], departments: departmentResult?.results || [] };
}

function committeeAnnualSyncStatements(env, companyId, year) {
  const absenceSql = `(
    SELECT COUNT(*)
    FROM committee_partner_attendance cpa
    JOIN committee_meetings cm ON cm.id = cpa.meeting_id
    WHERE cpa.company_id = ? AND cm.year = ? AND cm.status = 'finalized' AND cpa.attendance_status = 'absent'
  )`;
  return [
    env.partner_evaluation_db.prepare(`
      INSERT INTO annual_ipass_scores (id, company_id, year)
      SELECT ?, id, ? FROM companies WHERE id = ?
      ON CONFLICT(company_id, year) DO NOTHING
    `).bind(crypto.randomUUID(), year, companyId),
    env.partner_evaluation_db.prepare(`
      INSERT INTO annual_ipass_score_logs
        (company_id, year, field_name, old_value, new_value, change_source, changed_by)
      SELECT ?, ?, 'committee_absence_count', CAST(committee_absence_count AS TEXT), CAST(${absenceSql} AS TEXT), 'auto', NULL
      FROM annual_ipass_scores
      WHERE company_id = ? AND year = ?
        AND committee_absence_count <> ${absenceSql}
    `).bind(companyId, year, companyId, year, companyId, year, companyId, year),
    env.partner_evaluation_db.prepare(`
      UPDATE annual_ipass_scores
      SET committee_absence_count = ${absenceSql}, updated_at = CURRENT_TIMESTAMP
      WHERE company_id = ? AND year = ?
    `).bind(companyId, year, companyId, year)
  ];
}

async function syncCommitteeAnnualCountsBatch(env, pairs) {
  const unique = new Map();
  for (const pair of pairs || []) {
    const companyId = String(pair?.companyId || "").trim();
    const year = Number(pair?.year);
    if (!companyId || !Number.isInteger(year)) continue;
    unique.set(`${companyId}:${year}`, { companyId, year });
  }
  if (!unique.size) return;
  const statements = [];
  for (const { companyId, year } of unique.values()) statements.push(...committeeAnnualSyncStatements(env, companyId, year));
  await env.partner_evaluation_db.batch(statements);
}

function forbidden() {
  return json({ success: false, error: "접근 권한이 없습니다." }, 403);
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization, X-Firebase-Locale"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders()
    }
  });
}
