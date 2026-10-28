export function clamp(n, min = 0, max = 1) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function normalizeQuery(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[“”"「」『』]/g, '');
}

export function tokenize(text) {
  const raw = String(text || '');
  const out = [];
  const lower = raw.toLowerCase();
  for (const m of lower.matchAll(/[a-z0-9]{2,}/g)) out.push(m[0]);
  for (const run of raw.matchAll(/\p{Script=Han}+/gu)) {
    const s = run[0];
    if (s.length === 1) out.push(s);
    for (let i = 0; i < s.length - 1; i += 1) out.push(s.slice(i, i + 2));
  }
  return out;
}

export function jaccard(a, b) {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (!A.size && !B.size) return 1;
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / (A.size + B.size - inter);
}

export function termOverlap(text, query) {
  const q = tokenize(query);
  if (!q.length) return 0;
  const bag = new Set(tokenize(text));
  let hit = 0;
  for (const t of q) if (bag.has(t)) hit += 1;
  return hit / q.length;
}

export function splitSentences(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[。！？!?；;\n])\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8);
}

export function hashString(text) {
  let h = 2166136261;
  const s = String(text);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function uid(prefix = 'st') {
  const n = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${n}`;
}
