export async function onRequestGet(context) {
  try {
    const { results } = await context.env.partner_evaluation_db
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

  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message
      },
      {
        status: 500
      }
    );
  }
}
