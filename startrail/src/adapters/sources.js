import { requestText } from '../core/http.js';
import { termOverlap } from '../core/text.js';

async function read(url, options) {
  const key = String(url);
  if (options.cache?.get(key)) return { ok: true, text: options.cache.get(key) };
  try {
    const response = await requestText(url, options);
    options.cache?.set(key, response.text, options.ttlMs || 6 * 60 * 60 * 1000);
    return { ok: true, text: response.text };
  } catch (error) {
    if (error.code === 'QUOTA') return { ok: false, quotaExhausted: true, error: '免费额度已用尽', items: [] };
    return { ok: false, items: [], error: error.message || '请求失败' };
  }
}

function pageItems(items, limit) {
  return { ok: true, items, hasMore: items.length >= limit };
}

export function createSearxng({ baseURL = 'http://127.0.0.1:8088', fetchImpl, timeoutMs, retries, sleep, limiter, cache } = {}) {
  return {
    id: 'searxng',
    kind: 'browser',
    label: 'SearXNG',
    enabled() { return true; },
    async search({ query, language, limit = 5, page = 1, signal }) {
      const url = new URL('/search', baseURL);
      url.searchParams.set('q', query);
      url.searchParams.set('format', 'json');
      url.searchParams.set('pageno', String(page));
      if (language) url.searchParams.set('language', language);
      const response = await read(url, { fetch: fetchImpl, timeoutMs, retries, sleep, limiter, signal, cache, headers: { accept: 'application/json' } });
      if (!response.ok) return { ...response, items: [] };
      const data = JSON.parse(response.text);
      const items = (data.results || []).slice(0, limit).map((item) => ({
        url: item.url,
        title: item.title || '',
        snippet: item.content || '',
        publishedAt: item.publishedDate || null,
      }));
      return pageItems(items, limit);
    },
  };
}

function abstractText(inverted) {
  if (!inverted || typeof inverted !== 'object') return '';
  const words = [];
  for (const [word, positions] of Object.entries(inverted)) {
    for (const pos of positions) words[pos] = word;
  }
  return words.filter(Boolean).join(' ');
}

export function createOpenAlex({ mailto = '', fetchImpl, timeoutMs, retries, sleep, limiter, cache } = {}) {
  return {
    id: 'openalex',
    kind: 'api',
    label: 'OpenAlex',
    enabled() { return true; },
    async search({ query, language, limit = 5, page = 1, signal }) {
      const url = new URL('https://api.openalex.org/works');
      url.searchParams.set('search', query);
      url.searchParams.set('per-page', String(limit));
      url.searchParams.set('page', String(page));
      if (mailto) url.searchParams.set('mailto', mailto);
      if (language) url.searchParams.set('filter', `language:${language}`);
      const response = await read(url, { fetch: fetchImpl, timeoutMs, retries, sleep, limiter, signal, cache, headers: { accept: 'application/json', 'user-agent': 'StarTrail/4.0.0' } });
      if (!response.ok) return { ...response, items: [] };
      const data = JSON.parse(response.text);
      const items = (data.results || []).slice(0, limit).map((work) => ({
        url: work.primary_location?.landing_page_url || work.id,
        title: work.display_name || '',
        snippet: abstractText(work.abstract_inverted_index),
        text: abstractText(work.abstract_inverted_index),
        publishedAt: work.publication_date || null,
        authors: (work.authorships || []).map((row) => row.author?.display_name).filter(Boolean),
        doi: work.doi || '',
      }));
      return pageItems(items, limit);
    },
  };
}

export function createSemanticScholar({ fetchImpl, timeoutMs, retries, sleep, limiter, cache } = {}) {
  return {
    id: 'semanticscholar',
    kind: 'api',
    label: 'Semantic Scholar',
    enabled() { return true; },
    async search({ query, limit = 5, page = 1, signal }) {
      const url = new URL('https://api.semanticscholar.org/graph/v1/paper/search');
      url.searchParams.set('query', query);
      url.searchParams.set('limit', String(limit));
      url.searchParams.set('offset', String((page - 1) * limit));
      url.searchParams.set('fields', 'title,abstract,url,year,externalIds,authors,publicationDate');
      const response = await read(url, { fetch: fetchImpl, timeoutMs, retries, sleep, limiter, signal, cache, headers: { 'user-agent': 'StarTrail/4.0.0' } });
      if (!response.ok) return { ...response, items: [], quotaExhausted: !!response.quotaExhausted };
      const data = JSON.parse(response.text);
      const items = (data.data || []).slice(0, limit).map((paper) => ({
        url: paper.url || `https://www.semanticscholar.org/paper/${paper.paperId}`,
        title: paper.title || '',
        snippet: paper.abstract || '',
        text: paper.abstract || '',
        publishedAt: paper.publicationDate || (paper.year ? `${paper.year}-01-01` : null),
        authors: (paper.authors || []).map((author) => author.name).filter(Boolean),
        doi: paper.externalIds?.DOI || '',
        arxivId: paper.externalIds?.ArXiv || '',
      }));
      return pageItems(items, limit);
    },
  };
}

function issuedDate(parts) {
  if (!parts?.length) return null;
  const [year, month = 1, day = 1] = parts;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function tag(block, name) {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return (match?.[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
}

export function createArxiv({ fetchImpl, timeoutMs, retries, sleep, limiter, cache } = {}) {
  return {
    id: 'arxiv',
    kind: 'api',
    label: 'arXiv',
    enabled() { return true; },
    async search({ query, limit = 5, page = 1, signal }) {
      const url = new URL('https://export.arxiv.org/api/query');
      url.searchParams.set('search_query', `all:${query}`);
      url.searchParams.set('start', String((page - 1) * limit));
      url.searchParams.set('max_results', String(limit));
      const response = await read(url, { fetch: fetchImpl, timeoutMs, retries, sleep, limiter, signal, cache, headers: { 'user-agent': 'StarTrail/4.0.0' } });
      if (!response.ok) return { ...response, items: [] };
      const entries = [...response.text.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((match) => match[1]);
      const items = entries.slice(0, limit).map((entry) => {
        const id = tag(entry, 'id');
        const arxivId = (id.split('/abs/')[1] || '').replace(/v\d+$/, '');
        return {
          url: id.replace('http://', 'https://'),
          title: tag(entry, 'title').replace(/\s+/g, ' '),
          snippet: tag(entry, 'summary').replace(/\s+/g, ' '),
          text: tag(entry, 'summary').replace(/\s+/g, ' '),
          publishedAt: (tag(entry, 'published') || '').slice(0, 10) || null,
          authors: [...entry.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((match) => match[1].trim()),
          arxivId,
        };
      });
      return pageItems(items, limit);
    },
  };
}

export function createCrossref({ mailto = '', fetchImpl, timeoutMs, retries, sleep, limiter, cache } = {}) {
  return {
    id: 'crossref',
    kind: 'api',
    label: 'Crossref',
    enabled() { return true; },
    async search({ query, limit = 5, page = 1, signal }) {
      const url = new URL('https://api.crossref.org/works');
      url.searchParams.set('query', query);
      url.searchParams.set('rows', String(limit));
      url.searchParams.set('offset', String((page - 1) * limit));
      const response = await read(url, {
        fetch: fetchImpl,
        timeoutMs,
        retries,
        sleep,
        limiter,
        signal,
        cache,
        headers: { 'user-agent': `StarTrail/4.0.0 (mailto:${mailto || 'research@localhost'})` },
      });
      if (!response.ok) return { ...response, items: [] };
      const data = JSON.parse(response.text);
      const items = (data.message?.items || []).slice(0, limit).map((work) => ({
        url: work.URL,
        title: (work.title || []).join(' '),
        snippet: work.abstract ? String(work.abstract).replace(/<[^>]+>/g, ' ') : '',
        publishedAt: issuedDate(work.issued?.['date-parts']?.[0]),
        authors: (work.author || []).map((author) => [author.family, author.given].filter(Boolean).join(' ')).filter(Boolean),
        doi: work.DOI || '',
      }));
      return pageItems(items, limit);
    },
  };
}

export function createRss({ feeds = [], fetchImpl, timeoutMs, retries, sleep, limiter, cache } = {}) {
  return {
    id: 'rss',
    kind: 'api',
    label: 'RSS',
    enabled() { return true; },
    async search({ query, limit = 5, signal }) {
      const items = [];
      for (const feed of feeds) {
        const response = await read(feed, { fetch: fetchImpl, timeoutMs, retries, sleep, limiter, signal, cache, headers: { 'user-agent': 'StarTrail/4.0.0' } });
        if (!response.ok) continue;
        for (const match of response.text.matchAll(/<item>([\s\S]*?)<\/item>|<entry>([\s\S]*?)<\/entry>/g)) {
          const block = match[1] || match[2];
          const title = tag(block, 'title');
          const link = tag(block, 'link') || (block.match(/<link[^>]+href=["']([^"']+)["']/i) || [])[1] || '';
          const description = tag(block, 'description') || tag(block, 'summary');
          const publishedAt = (tag(block, 'pubDate') || tag(block, 'updated') || '').slice(0, 25);
          const blob = `${title} ${description}`;
          if (link && termOverlap(blob, query) > 0) {
            items.push({ url: link, title, snippet: description.replace(/<[^>]+>/g, ' '), text: description.replace(/<[^>]+>/g, ' '), publishedAt: publishedAt || null });
          }
        }
      }
      return { ok: true, items: items.slice(0, limit), hasMore: false };
    },
  };
}

export function createPaid({ baseURL = '', apiKey = '', fetchImpl, timeoutMs, retries = 0, sleep, limiter } = {}) {
  return {
    id: 'paid',
    kind: 'api',
    label: '收费检索',
    configured: !!(baseURL && apiKey),
    enabled(task) {
      return !!(baseURL && apiKey && task.params.allowPaid && task.params.budgetUsd > 0);
    },
    async search({ query, limit = 5, signal }) {
      if (!baseURL || !apiKey) return { ok: false, items: [], error: '未配置收费检索' };
      const url = new URL(baseURL);
      url.searchParams.set('q', query);
      url.searchParams.set('count', String(limit));
      const response = await read(url, {
        fetch: fetchImpl,
        timeoutMs,
        retries,
        sleep,
        limiter,
        signal,
        headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
      });
      if (!response.ok) return { ...response, items: [] };
      const data = JSON.parse(response.text);
      const rows = data.items || data.results || data.organic || [];
      const items = rows.slice(0, limit).map((item) => ({
        url: item.url || item.link,
        title: item.title || '',
        snippet: item.snippet || item.content || '',
      }));
      return { ok: true, items, hasMore: false };
    },
  };
}

export function createLocalAdapter(index) {
  return {
    id: 'local-index',
    kind: 'local',
    label: '本地索引',
    enabled() { return true; },
    async search({ query, limit = 5 }) {
      const items = index.search(query, limit).map((item) => ({
        url: item.url,
        title: item.title,
        snippet: item.snippet,
        text: item.text,
        publishedAt: item.publishedAt,
      }));
      return { ok: true, items, hasMore: false };
    },
  };
}
