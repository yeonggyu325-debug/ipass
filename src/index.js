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
        return json({ success: true, service: "ipass", status: "ok" });
      }

      const auth = await authenticate(request, env);
      if (!auth.ok) return json({ success: false, error: auth.error }, auth.status || 401);
      const user = auth.user;

      if (request.method === "GET" && path === "/api/me") {
        return json({
          success: true,
          user: {
            id: user.id,
            email: user.email || auth.firebase.email || "",
            role: user.role,
            company_id: user.company_id || null,
            status: user.status || "active",
            firebase_uid: auth.firebase.localId
          }
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
              v.cycle_id,
              v.cycle_name,
              v.target_company_count,
              v.submitted_count,
              v.evaluating_count,
              v.completed_count,
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
              v.cycle_id,
              v.cycle_name,
              v.target_company_count,
              v.submitted_count,
              v.evaluating_count,
              v.completed_count,
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
            et.id, et.cycle_id, et.company_id,
            c.company_name, c.industry_name,
            et.is_selected, et.exclusion_reason, et.status,
            et.submitted_at, et.finalized_at, et.published_at,
            tcp.worker_count
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
        if (!user.company_id) return json({ success: false, error: "No company linked to this account" }, 400);

        const { results } = await env.partner_evaluation_db.prepare(`
          SELECT
            et.id, et.cycle_id, et.company_id, et.status,
            et.submitted_at, et.finalized_at, et.published_at,
            ec.cycle_name, ec.year, ec.half, ec.start_at, ec.end_at,
            c.company_name, c.industry_name,
            tcp.worker_count
          FROM evaluation_targets et
          JOIN evaluation_cycles ec ON ec.id = et.cycle_id
          JOIN companies c ON c.id = et.company_id
          LEFT JOIN target_company_profiles tcp ON tcp.target_id = et.id
          WHERE et.company_id = ?
            AND et.is_selected = 1
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
            et.id AS target_id,
            et.status, et.submitted_at, et.finalized_at, et.published_at,
            et.company_id,
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

        if (user.role === "partner" && target.company_id !== user.company_id) {
          return forbidden();
        }

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

      return json({ success: false, error: "API route not found" }, 404);
    } catch (error) {
      console.error(error);
      return json({ success: false, error: error?.message || "Internal server error" }, 500);
    }
  }
};

async function authenticate(request, env) {
  const header = request.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return { ok: false, status: 401, error: "Login required" };

  const idToken = match[1];

  const verifyResponse = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_API_KEY)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken })
    }
  );

  if (!verifyResponse.ok) {
    return { ok: false, status: 401, error: "Invalid or expired login" };
  }

  const firebaseData = await verifyResponse.json();
  const firebaseUser = firebaseData.users?.[0];

  if (!firebaseUser?.localId || firebaseUser.disabled) {
    return { ok: false, status: 401, error: "Invalid Firebase user" };
  }

  const user = await env.partner_evaluation_db
    .prepare(`SELECT * FROM users WHERE firebase_uid = ? LIMIT 1`)
    .bind(firebaseUser.localId)
    .first();

  if (!user) {
    return { ok: false, status: 403, error: "Firebase account is not linked to I-PASS" };
  }

  if (user.status && user.status !== "active") {
    return { ok: false, status: 403, error: "I-PASS account is inactive" };
  }

  return { ok: true, user, firebase: firebaseUser };
}

function forbidden() {
  return json({ success: false, error: "Forbidden" }, 403);
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization"
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
