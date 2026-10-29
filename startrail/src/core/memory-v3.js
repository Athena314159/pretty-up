import { canonicalUrl } from './url.js';

const KINDS = ['tasks', 'sources', 'searches', 'observations', 'deliveries'];

function timestamp(value) {
  const t = Date.parse(String(value || '').replace('Z', '+00:00').replace(/\+00:00\+00:00/, '+00:00'));
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
}

export function validateV3Bundle(bundle) {
  if (!bundle || bundle.schema_version !== 1) throw new Error('Expected schema_version: 1');
  const clean = Object.fromEntries(KINDS.map((kind) => [kind, []]));
  for (const kind of KINDS) {
    const rows = bundle[kind] || [];
    if (!Array.isArray(rows) || rows.length > 20000) throw new Error(`Invalid ${kind}`);
    for (const row of rows) {
      if (!row || typeof row.id !== 'string' || !row.id || row.id.length > 200) throw new Error('Each record needs a nonempty string id');
      const next = { ...row };
      if (kind === 'sources') {
        next.canonical_url = canonicalUrl(next.url);
        if (next.verification && !['lead', 'verified', 'unavailable'].includes(next.verification)) throw new Error('Invalid verification');
      }
      clean[kind].push(next);
    }
  }
  return clean;
}

export function mergeSource(prior, incoming) {
  const row = {
    ...prior,
    ...incoming,
    id: prior.id,
    task_ids: [...new Set([...(prior.task_ids || []), ...(incoming.task_ids || [])])].sort(),
  };
  if (timestamp(incoming.verification_updated_at) <= timestamp(prior.verification_updated_at)) {
    for (const key of ['verification', 'verification_updated_at', 'content_verified', 'original_opened', 'total_media', 'reviewed_count', 'full_post_review_complete', 'media_items']) {
      if (key in prior) row[key] = prior[key];
    }
  }
  const reviews = { ...(prior.task_reviews || {}) };
  for (const [key, item] of Object.entries(incoming.task_reviews || {})) {
    if (!reviews[key] || timestamp(item?.updated_at) > timestamp(reviews[key]?.updated_at)) reviews[key] = item;
  }
  row.task_reviews = reviews;
  return row;
}

export function mergeV3(state, incoming) {
  const base = state || { schema_version: 1, tasks: [], sources: [], searches: [], observations: [], deliveries: [] };
  const out = {
    schema_version: 1,
    tasks: [...base.tasks],
    sources: [...base.sources],
    searches: [...base.searches],
    observations: [...base.observations],
    deliveries: [...base.deliveries],
  };
  const bundle = validateV3Bundle(incoming);
  const remap = new Map();
  for (const kind of ['sources', 'tasks', 'searches', 'observations', 'deliveries']) {
    for (const row0 of bundle[kind]) {
      const row = { ...row0 };
      if (row.source_id) row.source_id = remap.get(row.source_id) || row.source_id;
      const idx = out[kind].findIndex((item) => (kind === 'sources' ? item.canonical_url === row.canonical_url : item.id === row.id));
      if (idx >= 0) {
        const prior = out[kind][idx];
        if (kind === 'observations') {
          if (JSON.stringify(prior) !== JSON.stringify(row)) throw new Error('Snapshot id collision; preserve history with a new id');
          continue;
        }
        if (kind === 'sources') {
          remap.set(row.id, prior.id);
          out[kind][idx] = mergeSource(prior, { ...row, id: prior.id });
          continue;
        }
        const older = kind === 'tasks' && timestamp(prior.updated_at) > timestamp(row.updated_at);
        out[kind][idx] = older ? { ...row, ...prior, id: prior.id } : { ...prior, ...row, id: prior.id };
      } else {
        if (out[kind].some((item) => item.id === row.id)) throw new Error('Source id collision with a different URL');
        out[kind].push(row);
      }
    }
  }
  return out;
}
