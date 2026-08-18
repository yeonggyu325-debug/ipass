export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {

      // API 상태 확인
      if (
        request.method === "GET" &&
        path === "/api/health"
      ) {
        return Response.json({
          success: true,
          service: "ipass",
          status: "ok"
        });
      }

      // 협력사 목록
      if (
        request.method === "GET" &&
        path === "/api/companies"
      ) {

        const { results } =
          await env.partner_evaluation_db
            .prepare(`
              SELECT
                id,
                company_name,
                industry_code,
                industry_name,
                status
              FROM companies
              ORDER BY company_name
            `)
            .all();

        return Response.json({
          success: true,
          companies: results
        });
      }

      // 평가회차
      if (
        request.method === "GET" &&
        path === "/api/cycles"
      ) {

        const { results } =
          await env.partner_evaluation_db
            .prepare(`
              SELECT
                id,
                year,
                half,
                cycle_name,
                start_at,
                end_at,
                status,
                template_id
              FROM evaluation_cycles
              ORDER BY
                year DESC,
                CASE
                  WHEN half = 'second' THEN 2
                  ELSE 1
                END DESC
            `)
            .all();

        return Response.json({
          success: true,
          cycles: results
        });
      }

      // 대시보드
      if (
        request.method === "GET" &&
        path === "/api/dashboard"
      ) {

        const result =
          await env.partner_evaluation_db
            .prepare(`
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
                  JOIN users u
                    ON u.id = n.recipient_user_id
                  WHERE
                    n.is_read = 0
                    AND u.role = 'admin'
                )
                AS unread_notification_count

              FROM v_cycle_dashboard v

              JOIN evaluation_cycles ec
                ON ec.id = v.cycle_id

              ORDER BY
                ec.year DESC,
                CASE
                  WHEN ec.half = 'second' THEN 2
                  ELSE 1
                END DESC

              LIMIT 1
            `)
            .first();

        return Response.json({
          success: true,
          dashboard: result
        });
      }

      // 평가대상
      if (
        request.method === "GET" &&
        path === "/api/targets"
      ) {

        const { results } =
          await env.partner_evaluation_db
            .prepare(`
              SELECT
                et.id,
                et.cycle_id,
                et.company_id,

                c.company_name,
                c.industry_name,

                et.is_selected,
                et.exclusion_reason,
                et.status,
                et.submitted_at,
                et.finalized_at,
                et.published_at,

                tcp.worker_count

              FROM evaluation_targets et

              JOIN companies c
                ON c.id = et.company_id

              LEFT JOIN target_company_profiles tcp
                ON tcp.target_id = et.id

              ORDER BY c.company_name
            `)
            .all();

        return Response.json({
          success: true,
          targets: results
        });
      }

      // 평가상세
      const match =
        path.match(
          /^\/api\/evaluations\/([^/]+)$/
        );

      if (
        request.method === "GET" &&
        match
      ) {

        const targetId =
          match[1];

        const target =
          await env.partner_evaluation_db
            .prepare(`
              SELECT
                et.id AS target_id,
                et.status,
                et.submitted_at,
                et.finalized_at,
                et.published_at,

                c.company_name,
                c.industry_code,
                c.industry_name,

                tcp.business_number,
                tcp.representative_name,
                tcp.worker_count,

                ec.cycle_name,
                ec.year,
                ec.half,
                ec.start_at,
                ec.end_at

              FROM evaluation_targets et

              JOIN companies c
                ON c.id = et.company_id

              JOIN evaluation_cycles ec
                ON ec.id = et.cycle_id

              LEFT JOIN target_company_profiles tcp
                ON tcp.target_id = et.id

              WHERE et.id = ?
            `)
            .bind(targetId)
            .first();

        if (!target) {
          return Response.json(
            {
              success: false,
              error: "Evaluation target not found"
            },
            {
              status: 404
            }
          );
        }

        const { results: items } =
          await env.partner_evaluation_db
            .prepare(`
              SELECT
                tis.id
                  AS target_item_state_id,

                ei.id
                  AS item_id,

                ei.item_code,
                ei.item_name,
                ei.guide_text,
                ei.item_type,
                ei.max_score,

                cat.category_name,

                parent.category_name
                  AS parent_category_name,

                tis.applicable,
                tis.na_source,
                tis.manual_na_reason,
                tis.needs_reevaluation,

                sub.description,

                es.earned_score,
                es.max_score_snapshot,
                es.comment
                  AS evaluation_comment

              FROM target_item_states tis

              JOIN evaluation_items ei
                ON ei.id =
                   tis.evaluation_item_id

              JOIN evaluation_categories cat
                ON cat.id =
                   ei.category_id

              LEFT JOIN evaluation_categories parent
                ON parent.id =
                   cat.parent_id

              LEFT JOIN item_submissions sub
                ON sub.target_item_state_id =
                   tis.id

              LEFT JOIN evaluation_scores es
                ON es.target_item_state_id =
                   tis.id

              WHERE tis.target_id = ?

              ORDER BY
                COALESCE(
                  parent.sort_order,
                  cat.sort_order
                ),
                cat.sort_order,
                ei.sort_order
            `)
            .bind(targetId)
            .all();

        return Response.json({
          success: true,
          evaluation: {
            target,
            items
          }
        });
      }

      return Response.json(
        {
          success: false,
          error: "API route not found"
        },
        {
          status: 404
        }
      );

    } catch (error) {

      console.error(error);

      return Response.json(
        {
          success: false,
          error:
            error?.message ||
            "Internal server error"
        },
        {
          status: 500
        }
      );
    }
  }
};
