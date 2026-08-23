import fs from 'node:fs';

const path='src/index.js';
let s=fs.readFileSync(path,'utf8');
const marker=`      if (user.role === "admin" && request.method === "POST" && path === "/api/admin/committee") {`;
if(!s.includes(marker)) throw new Error('committee POST marker not found');

const block=`      if (user.role === "admin" && request.method === "GET" && path === "/api/admin/committee-integrity") {
        const year = parseAnnualYear(url.searchParams.get("year"));
        const { results } = await env.partner_evaluation_db.prepare(\`
          SELECT
            c.id AS company_id,
            c.company_name,
            COALESCE(live.absence_count, 0) AS live_absence_count,
            COALESCE(ais.committee_absence_count, 0) AS stored_absence_count,
            MAX(0, 10 - COALESCE(live.absence_count, 0) * 3) AS committee_score,
            CASE
              WHEN COALESCE(live.absence_count, 0) = COALESCE(ais.committee_absence_count, 0) THEN 1
              ELSE 0
            END AS is_consistent
          FROM companies c
          LEFT JOIN (
            SELECT cpa.company_id,
              SUM(CASE WHEN cpa.attendance_status = 'absent' THEN 1 ELSE 0 END) AS absence_count
            FROM committee_partner_attendance cpa
            JOIN committee_meetings cm ON cm.id = cpa.meeting_id
            WHERE cm.year = ? AND cm.status = 'finalized'
            GROUP BY cpa.company_id
          ) live ON live.company_id = c.id
          LEFT JOIN annual_ipass_scores ais
            ON ais.company_id = c.id AND ais.year = ?
          WHERE c.status = 'active'
          ORDER BY c.company_name COLLATE NOCASE
        \`).bind(year, year).all();
        const companies = results || [];
        return json({
          success: true,
          year,
          checked_company_count: companies.length,
          mismatch_count: companies.filter(r => Number(r.is_consistent) !== 1).length,
          companies
        });
      }

      if (user.role === "admin" && request.method === "POST" && path === "/api/admin/committee-integrity") {
        const body = await request.json().catch(() => ({}));
        const year = parseAnnualYear(body.year);
        const { results } = await env.partner_evaluation_db.prepare(\`
          SELECT id FROM companies WHERE status = 'active'
        \`).all();
        const pairs = (results || []).map(r => ({ companyId: r.id, year }));
        await syncCommitteeAnnualCountsBatch(env, pairs);
        return json({ success: true, year, synced_company_count: pairs.length });
      }

      if (user.role === "admin" && request.method === "GET" && path === "/api/admin/committee-logs") {
        const meetingId = String(url.searchParams.get("meeting_id") || "").trim();
        if (!meetingId) return json({ success: false, error: "협의체 회차 ID가 필요합니다." }, 400);
        const [meetingResult, logResult] = await env.partner_evaluation_db.batch([
          env.partner_evaluation_db.prepare(\`
            SELECT id, year, meeting_month, meeting_date, title, status, finalized_at, updated_at
            FROM committee_meetings
            WHERE id = ?
            LIMIT 1
          \`).bind(meetingId),
          env.partner_evaluation_db.prepare(\`
            SELECT l.rowid AS log_rowid, l.*, pa.name AS changed_by_name, pa.email AS changed_by_email
            FROM committee_change_logs l
            LEFT JOIN portal_accounts pa ON pa.id = l.changed_by
            WHERE l.meeting_id = ?
            ORDER BY l.rowid DESC
            LIMIT 200
          \`).bind(meetingId)
        ]);
        const meeting = meetingResult?.results?.[0];
        if (!meeting) return json({ success: false, error: "협의체 회차를 찾을 수 없습니다." }, 404);
        return json({ success: true, meeting, logs: logResult?.results || [] });
      }

`;
s=s.replace(marker,block+marker);
if(!s.includes('/api/admin/committee-integrity')||!s.includes('/api/admin/committee-logs')) throw new Error('committee integrity APIs not installed');
fs.writeFileSync(path,s);
console.log('committee phase3 audit and integrity patch applied');
