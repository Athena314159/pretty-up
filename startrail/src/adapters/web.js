import { requestText } from '../core/http.js';
import { isSafePublicUrl } from '../core/url.js';

function decode(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function meta(html, key) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`, 'i');
  const match = html.match(re);
  return decode(match?.[1] || match?.[2] || '');
}

function abs(value, base) {
  try {
    return new URL(value, base).href;
  } catch {
    return '';
  }
}

export function htmlToDocument(html, url) {
  const source = String(html || '');
  const title = decode((source.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || meta(source, 'og:title'));
  const publishedAt = meta(source, 'article:published_time') || meta(source, 'pubdate') || meta(source, 'date') || null;
  const stripped = source
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ');
  const imageUrls = [];
  const og = meta(source, 'og:image');
  if (og) imageUrls.push(abs(og, url));
  for (const match of stripped.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
    const href = abs(match[1], url);
    if (href && !imageUrls.includes(href)) imageUrls.push(href);
  }
  return {
    url,
    title,
    publishedAt,
    text: decode(stripped.replace(/<[^>]+>/g, ' ')).slice(0, 200000),
    imageUrls: imageUrls.filter(Boolean).slice(0, 8),
  };
}

export function createWebAdapter({ fetchImpl = globalThis.fetch, timeoutMs = 15000, retries = 2, sleep, limiter, cache } = {}) {
  return {
    id: 'web',
    kind: 'fetcher',
    async fetchDocument(url, { signal } = {}) {
      if (!isSafePublicUrl(url)) return { ok: false, items: [], error: '已跳过内网或带凭据的链接' };
      if (cache?.get(url)) return { ok: true, items: [], document: htmlToDocument(cache.get(url), url) };
      try {
        const response = await requestText(url, {
          fetch: fetchImpl,
          timeoutMs,
          retries,
          sleep,
          limiter,
          signal,
          headers: { 'user-agent': 'StarTrail/4.0.0', accept: 'text/html' },
        });
        cache?.set(url, response.text, 24 * 60 * 60 * 1000);
        return { ok: true, items: [], document: htmlToDocument(response.text, url) };
      } catch (error) {
        return { ok: false, items: [], error: error.message || '正文抓取失败' };
      }
    },
    async search() {
      return { ok: false, items: [], error: '网页抓取器不负责发现链接' };
    },
  };
}
