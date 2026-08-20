window.IPASS_STATE = window.IPASS_STATE || {
  session: null,
  currentUser: null
};

window.IPASS_API = (() => {
  const config = window.IPASS_CONFIG;
  const cache = new Map();
  const inflight = new Map();

  const apiBase = location.hostname === "ipass.i-pass-eval.workers.dev"
    ? ""
    : config.productionApiOrigin;

  async function refreshToken() {
    const session = window.IPASS_STATE.session;
    if (!session?.refreshToken) throw new Error("로그인이 필요합니다.");

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: session.refreshToken
    });
    const response = await fetch(
      `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(config.firebaseApiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body
      }
    );
    const data = await response.json();
    if (!response.ok) throw new Error("로그인 세션이 만료되었습니다.");

    session.idToken = data.id_token;
    session.refreshToken = data.refresh_token || session.refreshToken;
    session.expiresAt = Date.now() + Number(data.expires_in || 3600) * 1000;
    sessionStorage.setItem(config.sessionKey, JSON.stringify(session));
    return session.idToken;
  }

  async function token() {
    const session = window.IPASS_STATE.session;
    if (!session) throw new Error("로그인이 필요합니다.");
    if (Date.now() > session.expiresAt - 60000) return refreshToken();
    return session.idToken;
  }

  async function request(path, options = {}) {
    const idToken = await token();
    let response;
    try {
      response = await fetch(apiBase + path, {
        ...options,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${idToken}`,
          ...(options.body ? { "content-type": "application/json" } : {}),
          ...(options.headers || {})
        }
      });
    } catch {
      throw new Error("i-PaSS API에 연결하지 못했습니다.");
    }

    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error("서버 응답을 해석할 수 없습니다.");
    }
    if (!response.ok) {
      const message = response.status === 404 && data.error === "API route not found"
        ? "Worker 백엔드가 이전 버전입니다. 전체 프로젝트를 다시 배포해 주세요."
        : (data.error || `HTTP ${response.status}`);
      throw Object.assign(new Error(message), { status: response.status, data });
    }
    return data;
  }

  async function publicRequest(path) {
    const response = await fetch(apiBase + path, { headers: { Accept: "application/json" } });
    const text = await response.text();
    if (!response.ok) throw new Error(text || `HTTP ${response.status}`);
    return text ? JSON.parse(text) : {};
  }

  function cached(key, loader, ttl = 15000) {
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now) return Promise.resolve(hit.value);
    if (inflight.has(key)) return inflight.get(key);

    const promise = Promise.resolve()
      .then(loader)
      .then(value => {
        cache.set(key, { value, expiresAt: Date.now() + ttl });
        return value;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, promise);
    return promise;
  }

  function cachedRequest(path, ttl = 15000) {
    return cached(`auth:${path}`, () => request(path), ttl);
  }

  function cachedPublicRequest(path, ttl = 30000) {
    return cached(`public:${path}`, () => publicRequest(path), ttl);
  }

  function invalidate(prefix = "") {
    for (const key of cache.keys()) {
      if (!prefix || key.includes(prefix)) cache.delete(key);
    }
  }

  function clear() {
    cache.clear();
    inflight.clear();
  }

  return {
    apiBase,
    refreshToken,
    token,
    request,
    publicRequest,
    cached,
    cachedRequest,
    cachedPublicRequest,
    invalidate,
    clear
  };
})();
