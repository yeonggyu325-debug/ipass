const FIREBASE_API_KEY = "AIzaSyC0s7buQaayKr84QA_wFNyF6rcs6w1-IoU";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders() });
      }

      if (request.method === "GET" && path === "/api/health") {
        return json({ success: true, service: "ipass", status: "ok", version: "16.2.1", annual_ipass_routes: true });
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

        const company = await env.partner_evaluation_db.prepare(`
          SELECT id FROM companies WHERE id = ? AND status = 'active'
        `).bind(companyId).first();

        if (!company) return json({ success: false, error: "선택한 회사가 유효하지 않습니다." }, 400);

        const existing = await env.partner_evaluation_db.prepare(`
          SELECT id, approval_status
          FROM portal_accounts
          WHERE firebase_uid = ? OR email = ?
          LIMIT 1
        `).bind(firebase.user.localId, firebase.user.email || "").first();

        const countRow = await env.partner_evaluation_db.prepare(`
          SELECT COUNT(*) AS cnt
          FROM portal_accounts
          WHERE company_id = ?
            AND approval_status IN ('pending','approved')
            AND firebase_uid <> ?
        `).bind(companyId, firebase.user.localId).first();

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
            c.company_name, c.industry_name
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
          if (!firebase.user.emailVerified) authState = "email_verification_required";
          else if (account.approval_status === "pending") authState = "pending_approval";
          else if (account.approval_status === "rejected") authState = "rejected";
          else if (account.approval_status === "suspended") authState = "suspended";

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
              email_verified: !!firebase.user.emailVerified
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
        return json({ success: true, annual: summary });
      }

      const annualAdminMatch = path.match(/^\/api\/admin\/annual-ipass\/([^/]+)\/(\d{4})$/);
      if (user.role === "admin" && annualAdminMatch && request.method === "GET") {
        const companyId = decodeURIComponent(annualAdminMatch[1]);
        const year = parseAnnualYear(annualAdminMatch[2]);
        const summary = await annualIpassSummary(env, companyId, year);
        return json({ success: true, annual: summary });
      }

      if (user.role === "admin" && annualAdminMatch && request.method === "PATCH") {
        const companyId = decodeURIComponent(annualAdminMatch[1]);
        const year = parseAnnualYear(annualAdminMatch[2]);
        const body = await request.json();

        await ensureAnnualIpassRow(env, companyId, year);
        const before = await getAnnualIpassRow(env, companyId, year);

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
            sets.push(`${half}_half_score = ?`, `${half}_half_source = 'manual'`, `${half}_half_target_id = NULL`, `${half}_half_updated_by = ?`, `${half}_half_updated_at = CURRENT_TIMESTAMP`);
            binds.push(round1(score), user.id);
            changes.push({ field: `${half}_half_score`, old: before?.[`${half}_half_score`], value: round1(score), source: "manual" });
          } else if (mode === "auto") {
            sets.push(`${half}_half_score = NULL`, `${half}_half_source = NULL`, `${half}_half_target_id = NULL`, `${half}_half_updated_by = ?`, `${half}_half_updated_at = CURRENT_TIMESTAMP`);
            binds.push(user.id);
            changes.push({ field: `${half}_half_score`, old: before?.[`${half}_half_score`], value: null, source: "reset_to_auto" });
          }
        }

        for (const field of ["committee_absence_count", "industrial_accident_count", "unreasonable_finding_count"]) {
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
          binds.push(user.id, companyId, year);
          await env.partner_evaluation_db.prepare(`
            UPDATE annual_ipass_scores
            SET ${sets.join(", ")}
            WHERE company_id = ? AND year = ?
          `).bind(...binds).run();

          for (const c of changes) {
            await logAnnualChange(env, companyId, year, c.field, c.old, c.value, c.source, user.id);
          }
        }

        const summary = await annualIpassSummary(env, companyId, year);
        return json({ success: true, annual: summary });
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
        const target = await env.partner_evaluation_db.prepare(`
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
        `).bind(targetId).first();

        if (!target) return json({ success: false, error: "Evaluation target not found" }, 404);
        if (user.role === "partner" && target.company_id !== user.company_id) return forbidden();

        const { results: items } = await env.partner_evaluation_db.prepare(`
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
        `).bind(targetId).all();

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
          SELECT id, company_id, approval_status
          FROM portal_accounts
          WHERE id = ? AND role = 'partner'
        `).bind(accountId).first();

        if (!target) return json({ success: false, error: "가입 신청을 찾을 수 없습니다." }, 404);

        if (action === "approve") {
          const count = await env.partner_evaluation_db.prepare(`
            SELECT COUNT(*) AS cnt
            FROM portal_accounts
            WHERE company_id = ?
              AND approval_status = 'approved'
              AND id <> ?
          `).bind(target.company_id, accountId).first();

          if (Number(count?.cnt || 0) >= 3) {
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

      return json({ success: false, error: "API route not found", method: request.method, path, version: "16.2.1" }, 404);
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

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_API_KEY)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: match[1] })
    }
  );

  if (!response.ok) return { ok: false, status: 401, error: "로그인이 만료되었거나 유효하지 않습니다." };

  const data = await response.json();
  const user = data.users?.[0];
  if (!user?.localId || user.disabled) return { ok: false, status: 401, error: "유효하지 않은 사용자입니다." };

  return { ok: true, user };
}

async function requireApprovedAccount(request, env) {
  const firebase = await firebaseUserFromRequest(request);
  if (!firebase.ok) return firebase;

  const portal = await env.partner_evaluation_db.prepare(`
    SELECT id, email, role, company_id, approval_status
    FROM portal_accounts
    WHERE firebase_uid = ?
    LIMIT 1
  `).bind(firebase.user.localId).first();

  if (portal) {
    if (!firebase.user.emailVerified) {
      return { ok: false, status: 403, error: "이메일 인증이 필요합니다.", auth_state: "email_verification_required" };
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
    return { ok: true, account: portal, firebase: firebase.user };
  }

  const legacy = await env.partner_evaluation_db.prepare(`
    SELECT id, email, role, company_id, status
    FROM users
    WHERE firebase_uid = ?
    LIMIT 1
  `).bind(firebase.user.localId).first();

  if (!legacy) return { ok: false, status: 403, error: "I-PASS 계정에 연결되지 않은 사용자입니다.", auth_state: "unregistered" };
  if (legacy.status && legacy.status !== "active") return { ok: false, status: 403, error: "사용이 중지된 계정입니다.", auth_state: "suspended" };

  return { ok: true, account: { ...legacy, approval_status: "approved" }, firebase: firebase.user };
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

async function ensureAnnualIpassRow(env, companyId, year) {
  const company = await env.partner_evaluation_db.prepare(`SELECT id FROM companies WHERE id = ? LIMIT 1`).bind(companyId).first();
  if (!company) throw new Error("회사 정보를 찾을 수 없습니다.");
  await env.partner_evaluation_db.prepare(`
    INSERT INTO annual_ipass_scores (id, company_id, year)
    VALUES (?, ?, ?)
    ON CONFLICT(company_id, year) DO NOTHING
  `).bind(crypto.randomUUID(), companyId, year).run();
}

async function getAnnualIpassRow(env, companyId, year) {
  return env.partner_evaluation_db.prepare(`
    SELECT * FROM annual_ipass_scores WHERE company_id = ? AND year = ? LIMIT 1
  `).bind(companyId, year).first();
}

async function publishedAutoHalfScores(env, companyId, year) {
  const { results } = await env.partner_evaluation_db.prepare(`
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
  `).bind(companyId, year).all();

  const out = { first: null, second: null };
  for (const row of results || []) {
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

async function syncAnnualAutoScores(env, companyId, year) {
  await ensureAnnualIpassRow(env, companyId, year);
  const row = await getAnnualIpassRow(env, companyId, year);
  const auto = await publishedAutoHalfScores(env, companyId, year);

  for (const half of ["first", "second"]) {
    const found = auto[half];
    if (!found || row?.[`${half}_half_source`] === "manual") continue;
    const old = row?.[`${half}_half_score`];
    if (Number(old) === Number(found.score) && row?.[`${half}_half_target_id`] === found.target_id) continue;
    await env.partner_evaluation_db.prepare(`
      UPDATE annual_ipass_scores
      SET ${half}_half_score = ?,
          ${half}_half_source = 'auto',
          ${half}_half_target_id = ?,
          ${half}_half_updated_by = NULL,
          ${half}_half_updated_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE company_id = ? AND year = ?
    `).bind(found.score, found.target_id, companyId, year).run();
    await logAnnualChange(env, companyId, year, `${half}_half_score`, old, found.score, "auto", null);
  }
  return auto;
}

async function logAnnualChange(env, companyId, year, field, oldValue, newValue, source, changedBy) {
  if (String(oldValue ?? "") === String(newValue ?? "")) return;
  await env.partner_evaluation_db.prepare(`
    INSERT INTO annual_ipass_score_logs
      (company_id, year, field_name, old_value, new_value, change_source, changed_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(companyId, year, field, oldValue == null ? null : String(oldValue), newValue == null ? null : String(newValue), source, changedBy || null).run();
}

function annualGrade(score) {
  if (score == null || !Number.isFinite(Number(score))) return null;
  const n = Number(score);
  if (n >= 90) return "안전관리 우수협력사";
  if (n >= 70) return "적격 수급사";
  return "역량강화대상 협력사";
}

async function annualIpassSummary(env, companyId, year) {
  const auto = await syncAnnualAutoScores(env, companyId, year);
  const row = await getAnnualIpassRow(env, companyId, year);
  const company = await env.partner_evaluation_db.prepare(`SELECT company_name FROM companies WHERE id = ? LIMIT 1`).bind(companyId).first();

  const first = row?.first_half_score == null ? null : Number(row.first_half_score);
  const second = row?.second_half_score == null ? null : Number(row.second_half_score);
  const committeeAbsence = Number(row?.committee_absence_count || 0);
  const accidentCount = Number(row?.industrial_accident_count || 0);
  const unreasonableCount = Number(row?.unreasonable_finding_count || 0);
  const committeeScore = committeeAbsence === 0 ? 10 : 0;
  const accidentScore = accidentCount === 0 ? 10 : 0;
  const unreasonableDeduction = unreasonableCount * 3;
  const base = (first || 0) + committeeScore + accidentScore - unreasonableDeduction;
  const finalTotal = second == null ? null : round1(Math.max(0, Math.min(100, base + second)));
  const maintainProjection = first == null || second != null ? null : round1(Math.max(0, Math.min(100, base + first)));
  const perfectProjection = first == null || second != null ? null : round1(Math.max(0, Math.min(100, base + 40)));

  return {
    company_id: companyId,
    company_name: company?.company_name || null,
    year,
    first_half_score: first,
    first_half_source: row?.first_half_source || null,
    second_half_score: second,
    second_half_source: row?.second_half_source || null,
    auto_first_half_score: auto.first?.score ?? null,
    auto_second_half_score: auto.second?.score ?? null,
    committee_absence_count: committeeAbsence,
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
    second_half_pending: second == null
  };
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
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders()
    }
  });
}
