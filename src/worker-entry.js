import worker from './worker.js';
import { handleAdminAccountActions } from './admin-account-actions.js';

const PARTNER_RESET_ID='2026-09-11-reset-partner-portal-accounts-v1';
let resetPromise=null;

async function ensurePartnerAccountReset(env){
  if(resetPromise)return resetPromise;
  resetPromise=(async()=>{
    await env.partner_evaluation_db.prepare(`CREATE TABLE IF NOT EXISTS system_one_shot_migrations(id TEXT PRIMARY KEY,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
    const applied=await env.partner_evaluation_db.prepare(`SELECT id FROM system_one_shot_migrations WHERE id=? LIMIT 1`).bind(PARTNER_RESET_ID).first();
    if(applied)return;
    await env.partner_evaluation_db.prepare(`DELETE FROM portal_accounts WHERE role <> 'admin'`).run();
    await env.partner_evaluation_db.prepare(`INSERT INTO system_one_shot_migrations(id,applied_at) VALUES(?,CURRENT_TIMESTAMP)`).bind(PARTNER_RESET_ID).run();
  })().catch(error=>{resetPromise=null;throw error});
  return resetPromise;
}

const BODY_SCRIPT_PATTERNS = [
  /<script\b[^>]*\bdata-global-toolbar-v5=["']true["'][^>]*>[\s\S]*?<\/script>/gi,
  /<script\b[^>]*\bsrc=["']\/login-home-redirect\.js\?[^"']*["'][^>]*><\/script>/gi,
  /<script\b[^>]*\bid=["']ipass-route-v24["'][^>]*>[\s\S]*?<\/script>/gi,
  /<script\b[^>]*\bid=["']partner-eval-route-v21["'][^>]*>[\s\S]*?<\/script>/gi,
  /<script\b[^>]*\bid=["']ipass-grade-v21["'][^>]*>[\s\S]*?<\/script>/gi,
  /<script\b[^>]*\bsrc=["']\/portal-home-v3\.js\?[^"']*["'][^>]*><\/script>/gi,
  /<script\b[^>]*\bsrc=["']\/ipass-ui-v2\.js\?[^"']*["'][^>]*><\/script>/gi,
  /<script\b[^>]*\bsrc=["']\/evaluation-submit-enhance\.js\?[^"']*["'][^>]*><\/script>/gi,
  /<script\b[^>]*\bsrc=["']\/evaluation-submit-nav-v2\.js\?[^"']*["'][^>]*><\/script>/gi
];

export function normalizeInjectedBodyScripts(html) {
  let output=String(html||'');const scripts=[];
  for(const pattern of BODY_SCRIPT_PATTERNS)output=output.replace(pattern,match=>{scripts.push(match);return ''});
  if(!scripts.length)return output;
  const uniqueScripts=[],seen=new Set();for(const script of scripts){if(seen.has(script))continue;seen.add(script);uniqueScripts.push(script)}
  const closeBody=output.toLowerCase().lastIndexOf('</body>'),payload=uniqueScripts.join('');
  return closeBody<0?output+payload:output.slice(0,closeBody)+payload+output.slice(closeBody);
}

async function normalizeHtmlResponse(response){
  const type=response.headers.get('content-type')||'';if(!type.includes('text/html'))return response;
  const normalized=normalizeInjectedBodyScripts(await response.text()),headers=new Headers(response.headers);
  headers.delete('content-length');headers.delete('content-encoding');headers.set('content-type','text/html;charset=utf-8');headers.set('cache-control','no-store');
  return new Response(normalized,{status:response.status,statusText:response.statusText,headers});
}

function rewritePath(request,path){const url=new URL(request.url);url.pathname=path;return new Request(url.toString(),request)}

export default {
  async fetch(request,env,ctx){
    await ensurePartnerAccountReset(env);
    const accountAction=await handleAdminAccountActions(request,env,ctx,worker);if(accountAction)return accountAction;
    const path=new URL(request.url).pathname;
    const routedRequest=path==='/admin/partners'?rewritePath(request,'/admin/accounts'):request;
    return normalizeHtmlResponse(await worker.fetch(routedRequest,env,ctx));
  }
};