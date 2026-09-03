function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=utf-8'}})}

async function currentUser(request,env,ctx,baseWorker){
  const u=new URL(request.url);u.pathname='/api/me';u.search='';
  const response=await baseWorker.fetch(new Request(u.toString(),{method:'GET',headers:request.headers}),env,ctx);
  if(!response.ok)return {ok:false,response};
  const data=await response.json().catch(()=>null);
  if(!data?.user||data.auth_state!=='approved')return {ok:false,response:json({success:false,error:'로그인이 필요합니다.'},401)};
  return {ok:true,user:data.user};
}

function normalizeNotification(row){
  return {
    id:row.id,
    title:row.title||row.notification_title||row.type||'업무 알림',
    message:row.message||row.content||row.body||'',
    type:row.type||row.notification_type||'general',
    is_read:Number(row.is_read||0)===1,
    created_at:row.created_at||row.updated_at||null
  };
}

export async function handlePortalShellApi(request,env,ctx,baseWorker){
  const url=new URL(request.url),path=url.pathname;
  if(path!=='/api/notifications'&&path!=='/api/profile/display-name')return null;
  const auth=await currentUser(request,env,ctx,baseWorker);if(!auth.ok)return auth.response;
  const user=auth.user;

  if(path==='/api/notifications'&&request.method==='GET'){
    try{
      let result;
      if(user.role==='admin')result=await env.partner_evaluation_db.prepare(`SELECT * FROM notifications WHERE recipient_user_id IN (SELECT id FROM users WHERE role='admin') ORDER BY created_at DESC LIMIT 100`).all();
      else result=await env.partner_evaluation_db.prepare(`SELECT * FROM notifications WHERE recipient_user_id=? ORDER BY created_at DESC LIMIT 100`).bind(user.id).all();
      const notifications=(result?.results||[]).map(normalizeNotification);
      return json({success:true,notifications,unread_count:notifications.filter(n=>!n.is_read).length});
    }catch(error){return json({success:false,error:'알림 목록을 불러오지 못했습니다.'},500)}
  }

  if(path==='/api/notifications'&&request.method==='PATCH'){
    const body=await request.json().catch(()=>({}));
    try{
      if(user.role==='admin'){
        if(body.all===true)await env.partner_evaluation_db.prepare(`UPDATE notifications SET is_read=1 WHERE recipient_user_id IN (SELECT id FROM users WHERE role='admin')`).run();
        else if(body.id)await env.partner_evaluation_db.prepare(`UPDATE notifications SET is_read=1 WHERE id=? AND recipient_user_id IN (SELECT id FROM users WHERE role='admin')`).bind(String(body.id)).run();
      }else{
        if(body.all===true)await env.partner_evaluation_db.prepare(`UPDATE notifications SET is_read=1 WHERE recipient_user_id=?`).bind(user.id).run();
        else if(body.id)await env.partner_evaluation_db.prepare(`UPDATE notifications SET is_read=1 WHERE id=? AND recipient_user_id=?`).bind(String(body.id),user.id).run();
      }
      return json({success:true});
    }catch(error){return json({success:false,error:'알림 읽음 처리에 실패했습니다.'},500)}
  }

  if(path==='/api/profile/display-name'&&request.method==='PATCH'){
    if(user.role!=='admin')return json({success:false,error:'관리자만 표시 이름을 변경할 수 있습니다.'},403);
    const body=await request.json().catch(()=>({}));const name=String(body.name||'').trim();
    if(!name||name.length>40)return json({success:false,error:'관리자 이름을 1~40자로 입력하세요.'},400);
    try{await env.partner_evaluation_db.prepare(`UPDATE portal_accounts SET name=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND role='admin'`).bind(name,user.id).run();return json({success:true,name})}
    catch(error){return json({success:false,error:'관리자 이름 저장에 실패했습니다.'},500)}
  }
  return json({success:false,error:'지원하지 않는 요청입니다.'},405);
}
