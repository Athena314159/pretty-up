export function day(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function monthsAgo(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const targetDay = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() - n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(targetDay, last));
  return d;
}

export function addDays(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + n);
  return d;
}

export function parseDay(value) {
  if (!value) return null;
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) {
    const t = Date.parse(value);
    return Number.isFinite(t) ? new Date(t) : null;
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function timeWindow(now, params) {
  const end = day(now);
  const recentStart = day(monthsAgo(now, params.recentMonths ?? 3));
  const latestStart = day(addDays(now, -1 * (params.latestDays ?? 7)));
  return { end, recentStart, latestStart, timeUnlimited: !!params.timeUnlimited };
}

export function classifyPublished(publishedAt, now, params) {
  const window = timeWindow(now, params);
  if (!publishedAt) return { bucket: 'undated', window };
  const when = parseDay(publishedAt);
  if (!when) return { bucket: 'undated', window };
  const stamp = day(when);
  if (stamp >= window.latestStart && stamp <= window.end) return { bucket: 'latest', window };
  if (stamp >= window.recentStart && stamp <= window.end) return { bucket: 'recent', window };
  return { bucket: 'history', window };
}

export function inScope(publishedAt, now, params) {
  const found = classifyPublished(publishedAt, now, params);
  if (params.timeUnlimited) return { keep: true, ...found };
  if (found.bucket === 'undated') return { keep: true, ...found };
  if (found.bucket === 'latest' || found.bucket === 'recent') return { keep: true, ...found };
  if (found.bucket === 'history' && params.includeHistory) return { keep: true, ...found };
  return { keep: false, ...found };
}
