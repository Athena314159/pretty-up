const TRACK = new Set(['fbclid', 'gclid', 'igshid', 'xsec_token', 'xsec_source', 'spm']);

export function canonicalUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('Source URL must be HTTP(S) without credentials');
  }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) {
    throw new Error('Source URL must be HTTP(S) without credentials');
  }
  const pairs = [...u.searchParams.entries()].filter(([k]) => {
    const key = k.toLowerCase();
    return !key.startsWith('utm_') && !TRACK.has(key);
  });
  pairs.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  const query = pairs
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const path = u.pathname || '/';
  return `${u.protocol}//${u.host.toLowerCase()}${path}${query ? `?${query}` : ''}`;
}

export function isSafePublicUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return false;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (host === '0.0.0.0' || host === '::1' || host === '::') return false;
  const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a === 192 && b === 168) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
  }
  return true;
}
