export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/companies") {
      const { results } = await env.partner_evaluation_db
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

    return env.ASSETS.fetch(request);
  }
};
