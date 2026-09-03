import worker from './worker.js';

const BODY_SCRIPT_PATTERNS = [
  /<script\b[^>]*\bdata-global-toolbar-v5=["']true["'][^>]*>[\s\S]*?<\/script>/gi,
  /<script\b[^>]*\bsrc=["']\/login-home-redirect\.js\?[^"']*["'][^>]*><\/script>/gi,
  /<script\b[^>]*\bid=["']ipass-route-v24["'][^>]*>[\s\S]*?<\/script>/gi,
  /<script\b[^>]*\bid=["']partner-eval-route-v21["'][^>]*>[\s\S]*?<\/script>/gi,
  /<script\b[^>]*\bid=["']ipass-grade-v21["'][^>]*>[\s\S]*?<\/script>/gi,
  /<script\b[^>]*\bsrc=["']\/portal-home-v3\.js\?[^"']*["'][^>]*><\/script>/gi,
  /<script\b[^>]*\bsrc=["']\/ipass-ui-v2\.js\?[^"']*["'][^>]*><\/script>/gi,
  /<script\b[^>]*\bsrc=["']\/evaluation-submit-enhance\.js\?[^"']*["'][^>]*><\/script>/gi,
  /<script\b[^>]*\bsrc=["']\/evaluation-submit-nav-v2\.js\?[^"']*["'][^>]*><\/script>/gi,
  /<script\b[^>]*\bsrc=["']\/resource-preview-v2\.js\?[^"']*["'][^>]*><\/script>/gi
];

export function normalizeInjectedBodyScripts(html) {
  let output = String(html || '');
  const scripts = [];

  for (const pattern of BODY_SCRIPT_PATTERNS) {
    output = output.replace(pattern, match => {
      scripts.push(match);
      return '';
    });
  }

  if (!scripts.length) return output;

  const uniqueScripts = [];
  const seen = new Set();
  for (const script of scripts) {
    if (seen.has(script)) continue;
    seen.add(script);
    uniqueScripts.push(script);
  }

  const closeBody = output.toLowerCase().lastIndexOf('</body>');
  const payload = uniqueScripts.join('');
  if (closeBody < 0) return output + payload;
  return output.slice(0, closeBody) + payload + output.slice(closeBody);
}

function injectBeforeLast(html, marker, content, closingTag) {
  if (html.includes(marker)) return html;
  const index = html.toLowerCase().lastIndexOf(closingTag);
  if (index < 0) return html + content;
  return html.slice(0, index) + content + html.slice(index);
}

function injectResourcePreview(html, path) {
  if (path !== '/resources') return html;
  let output = html;
  output = injectBeforeLast(output, '/resource-preview-v2.css?v=1', '<link rel="stylesheet" href="/resource-preview-v2.css?v=1" data-resource-preview-v2="true">', '</head>');
  output = injectBeforeLast(output, '/resource-preview-v2.js?v=1', '<script src="/resource-preview-v2.js?v=1" data-resource-preview-v2="true"></script>', '</body>');
  return output;
}

async function normalizeHtmlResponse(response, path) {
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) return response;

  const html = await response.text();
  let normalized = normalizeInjectedBodyScripts(html);
  normalized = injectResourcePreview(normalized, path);

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.set('content-type', 'text/html;charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(normalized, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default {
  async fetch(request, env, ctx) {
    const response = await worker.fetch(request, env, ctx);
    return normalizeHtmlResponse(response, new URL(request.url).pathname);
  }
};
