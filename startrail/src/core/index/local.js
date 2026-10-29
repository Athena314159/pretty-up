import { createBm25 } from './bm25.js';
import { createVectorIndex } from './vector.js';

export function createLocalIndex() {
  const bm25 = createBm25();
  const vectors = createVectorIndex();
  const docs = new Map();
  return {
    add(doc) {
      if (!doc?.id || docs.has(doc.id)) return;
      const text = `${doc.title || ''}\n${doc.text || doc.snippet || ''}`;
      docs.set(doc.id, doc);
      bm25.add(doc.id, text);
      vectors.add(doc.id, text);
    },
    search(query, limit = 5) {
      const lexical = new Map(bm25.search(query, limit * 3).map((item) => [item.id, item.score]));
      const dense = new Map(vectors.search(query, limit * 3).map((item) => [item.id, item.score]));
      const maxLex = Math.max(0.0001, ...lexical.values());
      const ids = new Set([...lexical.keys(), ...dense.keys()]);
      return [...ids]
        .map((id) => {
          const score = 0.6 * ((lexical.get(id) || 0) / maxLex) + 0.4 * (dense.get(id) || 0);
          const doc = docs.get(id);
          return {
            id,
            url: doc.url,
            title: doc.title,
            snippet: (doc.text || '').slice(0, 240),
            text: doc.text,
            publishedAt: doc.publishedAt || null,
            score,
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    },
    size: () => docs.size,
  };
}
