import { hashString, tokenize } from '../text.js';

const DIM = 256;

export function embed(text) {
  const vector = new Float32Array(DIM);
  for (const token of tokenize(text)) vector[hashString(token) % DIM] += 1;
  let norm = 0;
  for (const n of vector) norm += n * n;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < DIM; i += 1) vector[i] /= norm;
  return vector;
}

export function cosine(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i];
  return sum;
}

export function createVectorIndex() {
  const docs = [];
  return {
    add(id, text) {
      docs.push({ id, vector: embed(text) });
    },
    search(query, limit = 10) {
      const probe = embed(query);
      return docs
        .map((doc) => ({ id: doc.id, score: cosine(probe, doc.vector) }))
        .filter((item) => item.score > 0.05)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    },
    size: () => docs.length,
  };
}
