import { tokenize } from '../text.js';

export function createBm25(k1 = 1.2, b = 0.75) {
  const docs = [];
  const df = new Map();
  let total = 0;
  function add(id, text) {
    const tokens = tokenize(text);
    const tf = new Map();
    for (const token of tokens) tf.set(token, (tf.get(token) || 0) + 1);
    docs.push({ id, tf, len: tokens.length || 1 });
    total += tokens.length || 1;
    for (const token of tf.keys()) df.set(token, (df.get(token) || 0) + 1);
  }
  function search(query, limit = 10) {
    const q = tokenize(query);
    const avg = docs.length ? total / docs.length : 1;
    const scored = docs.map((doc) => {
      let score = 0;
      for (const token of q) {
        const freq = doc.tf.get(token) || 0;
        if (!freq) continue;
        const n = df.get(token) || 0;
        const idf = Math.log(1 + (docs.length - n + 0.5) / (n + 0.5));
        score += idf * ((freq * (k1 + 1)) / (freq + k1 * (1 - b + b * (doc.len / avg))));
      }
      return { id: doc.id, score };
    });
    return scored.filter((item) => item.score > 0).sort((a, b2) => b2.score - a.score).slice(0, limit);
  }
  return { add, search, size: () => docs.length };
}
