function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=utf-8','access-control-allow-origin':'*'}})}
function currentKst(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));return{year:Number(values.year),month:Number(values.month),day:Number(values.day),date:`${values.year}-${values.month}-${values.day}`}}
function validYear(value){const year=Number(value);return Number.isInteger(year)&&year>=2020&&year<=2100?year:null}
function effectiveStatus(row,year,month,now=currentKst()){const status=String(row?.status||'');if(status==='approved'||status==='under_review'||status==='changes_requested')return status;const key=year*100+month,current=now.year*100+now.month;if(key<current)return'overdue_missing';if(status==='draft'&&Number(row?.file_count||0)>0)return'draft';if(key===current)return'pending';return'upcoming'}
async function account(request,env,ctx,baseWorker){const url=new URL(request.url);url.pathname='/api/me';url.search='';const response=await baseWorker.fetch(new Request(url.toString(),{method:'GET',headers:request.headers}),env,ctx);const data=await response.clone().json().catch(()=>null);if(!response.ok||data?.auth_state!=='approved'||!data?.user)return{ok:false,response};return{ok:true,user:data.user}}

export async function handleFastEducationOverview(request,env,ctx,baseWorker){
  const url=new URL(request.url);if(request.method!=='GET'||url.pathname!=='/api/education')return null;
  const auth=await account(request,env,ctx,baseWorker);if(!auth.ok)return auth.response;const user=auth.user;
  const year=validYear(url.searchParams.get('year')||currentKst().year);if(!year)return json({success:false,error:'조회 연도가 올바르지 않습니다.'},400);
  if(user.role!=='admin'&&!user.company_id)return json({success:false,error:'회사 연결정보가 없습니다.'},400);
  const companyStatement=user.role==='admin'
    ?env.partner_evaluation_db.prepare(`SELECT id,company_name,industry_name FROM companies WHERE status='active' ORDER BY company_name COLLATE NOCASE`)
    :env.partner_evaluation_db.prepare(`SELECT id,company_name,industry_name FROM companies WHERE id=? AND status='active' LIMIT 1`).bind(user.company_id||'');
  const submissionSql=`
    SELECT es.*,
      COALESCE(f.file_count,0) AS file_count,
      COALESCE(f.file_bytes,0) AS file_bytes
    FROM education_submissions es
    LEFT JOIN (
      SELECT submission_id,COUNT(*) AS file_count,COALESCE(SUM(file_size),0) AS file_bytes
      FROM education_submission_files
      WHERE deleted_at IS NULL
      GROUP BY submission_id
    ) f ON f.submission_id=es.id
    WHERE es.education_year=? ${user.role==='admin'?'':'AND es.company_id=?'}
    ORDER BY es.company_id,es.education_month`;
  const submissionStatement=user.role==='admin'
    ?env.partner_evaluation_db.prepare(submissionSql).bind(year)
    :env.partner_evaluation_db.prepare(submissionSql).bind(year,user.company_id||'');
  const [companyResult,submissionResult]=await env.partner_evaluation_db.batch([companyStatement,submissionStatement]);
  const submissions=submissionResult?.results||[],byCompanyMonth=new Map(submissions.map(row=>[`${row.company_id}:${row.education_month}`,row])),now=currentKst();
  const companies=(companyResult?.results||[]).map(company=>({...company,months:Array.from({length:12},(_,index)=>{const month=index+1,row=byCompanyMonth.get(`${company.id}:${month}`)||null;return{month,submission_id:row?.id||null,status:row?.status||null,effective_status:effectiveStatus(row,year,month,now),file_count:Number(row?.file_count||0),file_bytes:Number(row?.file_bytes||0),note:row?.note||null,review_comment:row?.review_comment||null,submitted_at:row?.submitted_at||null,reviewed_at:row?.reviewed_at||null,updated_at:row?.updated_at||null}})}));
  const monthRows=companies.flatMap(company=>company.months);
  const summary={target_company_count:companies.length,under_review_count:monthRows.filter(row=>row.effective_status==='under_review').length,approved_count:monthRows.filter(row=>row.effective_status==='approved').length,overdue_missing_count:monthRows.filter(row=>row.effective_status==='overdue_missing').length,changes_requested_count:monthRows.filter(row=>row.effective_status==='changes_requested').length};
  return json({success:true,role:user.role,year,companies,summary,current_kst:now});
}
