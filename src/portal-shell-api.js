import { handleFastEducationOverview } from './education-overview-fast.js';

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
    entity_type:row.entity_type||null,
    entity_id:row.entity_id||null,
    is_read:Number(row.is_read||0)===1,
    created_at:row.created_at||row.updated_at||null
  };
}

function recipientClause(){
  return `(
    recipient_account_id = ?
    OR (
      recipient_account_id IS NULL
      AND recipient_user_id IN (
        SELECT u.id
        FROM users u
        JOIN portal_accounts pa ON LOWER(pa.email)=LOWER(u.email)
        WHERE pa.id=?
      )
    )
  )`;
}

export async function handlePortalShellApi(request,env,ctx,baseWorker){
  const fastEducation=await handleFastEducationOverview(request,env,ctx,baseWorker);if(fastEducation)return fastEducation;
  const url=new URL(request.url),path=url.pathname;
  if(path!=='/api/notifications'&&path!=='/api/profile/display-name')return null;
  const auth=await currentUser(request,env,ctx,baseWorker);if(!auth.ok)return auth.response;
  const user=auth.user;

  if(path==='/api/notifications'&&request.method==='GET'){
    try{
      const limit=Math.min(100,Math.max(1,Number(url.searchParams.get('limit')||50)));
      const result=await env.partner_evaluation_db.prepare(`
        SELECT id,title,message,type,is_read,created_at,updated_at,entity_type,entity_id
        FROM notifications
        WHERE ${recipientClause()}
        ORDER BY created_at DESC
        LIMIT ?
      `).bind(user.id,user.id,limit).all();
      const notifications=(result?.results||[]).map(normalizeNotification);
      const unread=await env.partner_evaluation_db.prepare(`
        SELECT COUNT(*) AS count
        FROM notifications
        WHERE ${recipientClause()} AND is_read=0
      `).bind(user.id,user.id).first();
      return json({success:true,notifications,unread_count:Number(unread?.count||0)});
    }catch(error){
      console.error('notification list failed',error);
      return json({success:false,error:'알림 목록을 불러오지 못했습니다.'},500);
    }
  }

  if(path==='/api/notifications'&&request.method==='PATCH'){
    const body=await request.json().catch(()=>({}));
    try{
      if(body.all===true){
        await env.partner_evaluation_db.prepare(`UPDATE notifications SET is_read=1,updated_at=CURRENT_TIMESTAMP WHERE ${recipientClause()}`).bind(user.id,user.id).run();
      }else if(body.id){
        await env.partner_evaluation_db.prepare(`UPDATE notifications SET is_read=1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND ${recipientClause()}`).bind(String(body.id),user.id,user.id).run();
      }else return json({success:false,error:'읽음 처리할 알림을 선택하세요.'},400);
      return json({success:true});
    }catch(error){
      console.error('notification update failed',error);
      return json({success:false,error:'알림 읽음 처리에 실패했습니다.'},500);
    }
  }

  if(path==='/api/profile/display-name'&&request.method==='PATCH'){
    if(user.role!=='admin')return json({success:false,error:'관리자만 표시 이름을 변경할 수 있습니다.'},403);
    const body=await request.json().catch(()=>({}));const name=String(body.name||'').trim();
    if(!name||name.length>40)return json({success:false,error:'관리자 이름을 1~40자로 입력하세요.'},400);
    try{
      await env.partner_evaluation_db.prepare(`UPDATE portal_accounts SET name=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND role='admin'`).bind(name,user.id).run();
      return json({success:true,name});
    }catch(error){return json({success:false,error:'관리자 이름 저장에 실패했습니다.'},500)}
  }
  return json({success:false,error:'지원하지 않는 요청입니다.'},405);
}
