import worker from './worker.js';
import { handleAdminAccountActions } from './admin-account-actions.js';

const PARTNER_RESET_ID='2026-09-11-reset-partner-portal-accounts-v1';
const DONGHAE_RESET_ID='2026-09-11-reset-donghae-reregister-v1';
let resetPromise=null;
let donghaeResetPromise=null;

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

async function ensureDonghaeReregisterReset(env){
  if(donghaeResetPromise)return donghaeResetPromise;
  donghaeResetPromise=(async()=>{
    await env.partner_evaluation_db.prepare(`CREATE TABLE IF NOT EXISTS system_one_shot_migrations(id TEXT PRIMARY KEY,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
    const applied=await env.partner_evaluation_db.prepare(`SELECT id FROM system_one_shot_migrations WHERE id=? LIMIT 1`).bind(DONGHAE_RESET_ID).first();
    if(applied)return;
    const company=await env.partner_evaluation_db.prepare(`SELECT id FROM companies WHERE company_name='동해산업' LIMIT 1`).first();
    if(company?.id){
      await env.partner_evaluation_db.prepare(`DELETE FROM portal_accounts WHERE company_id=? AND role='partner'`).bind(company.id).run();
      await env.partner_evaluation_db.prepare(`UPDATE companies SET status='active' WHERE id=?`).bind(company.id).run();
      try{
        await env.partner_evaluation_db.prepare(`UPDATE partner_management SET signup_enabled=1,updated_at=CURRENT_TIMESTAMP WHERE company_id=?`).bind(company.id).run();
      }catch(error){console.warn('donghae partner management reset skipped',error)}
    }
    await env.partner_evaluation_db.prepare(`INSERT INTO system_one_shot_migrations(id,applied_at) VALUES(?,CURRENT_TIMESTAMP)`).bind(DONGHAE_RESET_ID).run();
  })().catch(error=>{donghaeResetPromise=null;throw error});
  return donghaeResetPromise;
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
  if(scripts.length){const uniqueScripts=[],seen=new Set();for(const script of scripts){if(seen.has(script))continue;seen.add(script);uniqueScripts.push(script)}const closeBody=output.toLowerCase().lastIndexOf('</body>'),payload=uniqueScripts.join('');output=closeBody<0?output+payload:output.slice(0,closeBody)+payload+output.slice(closeBody)}
  return output.replaceAll('/login-home-redirect.js?v=2','/login-home-redirect.js?v=3').replaceAll('/global-toolbar-v5.js?v=7','/global-toolbar-v5.js?v=8');
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
    await ensureDonghaeReregisterReset(env);
    const accountAction=await handleAdminAccountActions(request,env,ctx,worker);if(accountAction)return accountAction;
    const path=new URL(request.url).pathname;
    if(path==='/admin-partners.html'){const next=new URL(request.url);next.pathname='/admin/partners';return Response.redirect(next.toString(),302)}
    const routedRequest=path==='/admin/partners'?rewritePath(request,'/admin/accounts'):request;
    return normalizeHtmlResponse(await worker.fetch(routedRequest,env,ctx));
  }
};