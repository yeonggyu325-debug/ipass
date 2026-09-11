function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=utf-8'}})}

async function requireAdmin(request,env,ctx,worker){
  const url=new URL(request.url);url.pathname='/api/me';url.search='';
  const response=await worker.fetch(new Request(url.toString(),{method:'GET',headers:request.headers}),env,ctx);
  const data=await response.clone().json().catch(()=>null);
  if(!response.ok||data?.auth_state!=='approved'||data?.user?.role!=='admin')return {ok:false,response:json({success:false,error:'관리자 권한이 필요합니다.'},403)};
  return {ok:true,user:data.user};
}

export async function handleAdminAccountActions(request,env,ctx,worker){
  const path=new URL(request.url).pathname;
  const match=path.match(/^\/api\/admin\/registrations\/([^/]+)$/);
  if(!match||request.method!=='DELETE')return null;
  const auth=await requireAdmin(request,env,ctx,worker);if(!auth.ok)return auth.response;
  const accountId=decodeURIComponent(match[1]);
  try{
    const account=await env.partner_evaluation_db.prepare(`SELECT id,firebase_uid,email,role FROM portal_accounts WHERE id=? LIMIT 1`).bind(accountId).first();
    if(!account||account.role!=='partner')return json({success:false,error:'삭제할 협력사 계정을 찾을 수 없습니다.'},404);
    await env.partner_evaluation_db.prepare(`DELETE FROM portal_accounts WHERE id=? AND role='partner'`).bind(accountId).run();
    return json({success:true,deleted_account_id:accountId,email:account.email||null,firebase_identity_deleted:false});
  }catch(error){
    console.error('partner account delete failed',error);
    return json({success:false,error:'연결된 업무 이력 때문에 계정을 삭제할 수 없습니다. 먼저 비활성 처리해 주세요.'},409);
  }
}
