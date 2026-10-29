import { canonicalUrl } from './url.js';
import { jaccard } from './text.js';

export function sourceKey(doc) {
  if (doc.platformId) return `platform:${doc.platform}:${doc.platformId}`;
  try {
    return `url:${canonicalUrl(doc.url)}`;
  } catch {
    return `raw:${doc.url || ''}`;
  }
}

export function assessDuplicate(doc, existing) {
  const key = sourceKey(doc);
  const same = existing.find((item) => sourceKey(item) === key);
  if (same) return { drop: true, layer: 'source', matchId: same.id, possibleDuplicate: false };
  const title = `${doc.title || ''} ${doc.author || ''}`;
  let flagged = null;
  for (const item of existing) {
    const score = jaccard(title, `${item.title || ''} ${item.author || ''}`);
    if (score >= 0.82 && doc.author && item.author && doc.author === item.author) {
      flagged = item;
      break;
    }
  }
  if (flagged) return { drop: false, layer: 'case', matchId: flagged.id, possibleDuplicate: true };
  return { drop: false, layer: null, possibleDuplicate: false };
}
