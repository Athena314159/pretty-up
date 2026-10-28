import { clamp, jaccard, normalizeQuery, termOverlap, uid } from './text.js';

export function scoreCandidate({ query, topic, existingQueries, documentRelevance = 0.6 }) {
  const novelty = existingQueries.length
    ? 1 - Math.max(...existingQueries.map((item) => jaccard(query, item)))
    : 1;
  const lexical = termOverlap(`${query} ${topic}`, topic);
  const relevance = clamp(Math.max(documentRelevance, lexical));
  const safeNovelty = clamp(novelty);
  return { relevance, novelty: safeNovelty, score: Number((relevance * safeNovelty).toFixed(4)) };
}

export function resolveTake({ unbounded, breadth, modelTake, eligible }) {
  const pool = Math.max(0, eligible);
  if (unbounded) {
    const n = modelTake == null ? pool : modelTake;
    return Math.max(0, Math.min(pool, n));
  }
  const cap = Math.max(0, breadth);
  const n = modelTake == null ? cap : modelTake;
  return Math.max(0, Math.min(cap, pool, n));
}

export function createFrontier(queries = []) {
  const items = [];
  const seen = new Set();
  function push(input) {
    const query = String(input.query || '').trim();
    const key = normalizeQuery(query);
    if (!key) return { accepted: false, reason: 'empty' };
    if (seen.has(key)) return { accepted: false, reason: 'duplicate' };
    const depth = input.depth ?? 0;
    if (input.depthLimit != null && depth > input.depthLimit) return { accepted: false, reason: 'depth' };
    if (input.score != null && input.floor != null && input.score < input.floor && depth > 0) {
      return { accepted: false, reason: 'below-floor' };
    }
    seen.add(key);
    const item = {
      id: input.id || uid('q'),
      query,
      key,
      depth,
      parentId: input.parentId || null,
      language: input.language || '',
      line: input.line || 'expand',
      reason: input.reason || '',
      score: input.score ?? 1,
      relevance: input.relevance ?? 1,
      novelty: input.novelty ?? 1,
      state: input.state || 'queued',
    };
    items.push(item);
    return { accepted: true, item };
  }
  for (const query of queries) push({ ...query, score: query.score ?? 1, depth: query.depth ?? 0 });
  return {
    items,
    push,
    queued(depth) {
      return items
        .filter((item) => item.state === 'queued' && (depth == null || item.depth === depth))
        .sort((a, b) => b.score - a.score);
    },
  };
}

export function converged(state) {
  if ((state.quietRounds || 0) >= 2) return { stop: true, reason: '连续两轮没有新的相关资料或查询' };
  if (state.fetched >= state.fetchLimit) return { stop: true, reason: '已达到抓取上限' };
  return { stop: false, reason: '' };
}
