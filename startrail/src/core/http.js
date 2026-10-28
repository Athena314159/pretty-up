export function createLimiter(minIntervalMs, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
  let next = 0;
  return async function limit() {
    if (!minIntervalMs) return;
    const now = Date.now();
    const wait = Math.max(0, next - now);
    next = Math.max(now, next) + minIntervalMs;
    if (wait) await sleep(wait);
  };
}

export async function requestText(url, options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 15000;
  const retries = options.retries ?? 2;
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (options.limiter) await options.limiter();
    const parent = options.signal;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    if (parent) {
      if (parent.aborted) controller.abort();
      else parent.addEventListener('abort', onAbort, { once: true });
    }
    try {
      const response = await fetchImpl(url, { ...options.init, signal: controller.signal, headers: options.headers });
      if (response.status === 429) {
        const error = new Error('免费额度或速率已用尽');
        error.code = 'QUOTA';
        error.status = 429;
        throw error;
      }
      if (response.status >= 500 && attempt < retries) {
        lastError = new Error(`上游暂时失败 ${response.status}`);
        await (options.sleep || ((ms) => new Promise((r) => setTimeout(r, ms))))(200 * (attempt + 1));
        continue;
      }
      if (!response.ok) {
        const error = new Error(`请求失败 ${response.status}`);
        error.status = response.status;
        throw error;
      }
      const text = await response.text();
      return { status: response.status, text, headers: response.headers };
    } catch (error) {
      lastError = error;
      if (error.code === 'QUOTA' || error.status === 401 || error.status === 403 || error.status === 404) throw error;
      if (attempt >= retries) break;
      await (options.sleep || ((ms) => new Promise((r) => setTimeout(r, ms))))(200 * (attempt + 1));
    } finally {
      clearTimeout(timer);
      if (parent) parent.removeEventListener('abort', onAbort);
    }
  }
  throw lastError || new Error('请求失败');
}

export function cacheKey(url) {
  return String(url);
}
