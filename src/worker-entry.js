import worker from './worker.js';
import { handleAdminAccountActions } from './admin-account-actions.js';

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
  let output = String(html || '');
  const scripts = [];
  for (const pattern of BODY_SCRIPT_PATTERNS) {
    output = output.replace(pattern, match => { scripts.push(match); return ''; });
  }
  if (!scripts.length) return output;
  const uniqueScripts = [];
  const seen = new Set();
  for (const script of scripts) { if (seen.has(script)) continue; seen.add(script); uniqueScripts.push(script); }
  const closeBody = output.toLowerCase().lastIndexOf('</body>');
  const payload = uniqueScripts.join('');
  if (closeBody < 0) return output + payload;
  return output.slice(0, closeBody) + payload + output.slice(closeBody);
}

async function normalizeHtmlResponse(response) {
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) return response;
  const html = await response.text();
  const normalized = normalizeInjectedBodyScripts(html);
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.set('content-type', 'text/html;charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(normalized, { status: response.status, statusText: response.statusText, headers });
}

function rewritePath(request,path){
  const url=new URL(request.url);url.pathname=path;
  return new Request(url.toString(),request);
}

export default {
  async fetch(request, env, ctx) {
    const accountAction=await handleAdminAccountActions(request,env,ctx,worker);
    if(accountAction)return accountAction;
    const path=new URL(request.url).pathname;
    const routedRequest=path==='/admin/partners'?rewritePath(request,'/admin/accounts'):request;
    const response = await worker.fetch(routedRequest, env, ctx);
    return normalizeHtmlResponse(response);
  }
};