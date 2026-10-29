import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

export const CATEGORIES = new Set(['collage', 'makeup', 'template', 'other']);

export function blank(category) {
  return {
    library_schema: 1,
    resource_category: category,
    records: [],
    tasks: [],
    searches: [],
    events: [],
    blacklist: [],
  };
}

export function validate(payload, category) {
  if (!CATEGORIES.has(category) || payload?.library_schema !== 1 || payload?.resource_category !== category) {
    throw Object.assign(new Error('资源分类或版本不匹配'), { status: 400 });
  }
  for (const key of ['records', 'tasks', 'searches', 'events', 'blacklist']) {
    const rows = payload[key] || [];
    if (!Array.isArray(rows) || rows.length > 50000) throw Object.assign(new Error('资源数组无效'), { status: 400 });
    for (const row of rows) {
      if (!row || typeof row !== 'object' || typeof row.id !== 'string') throw Object.assign(new Error('记录缺少id'), { status: 400 });
      if ((row.resource_category || category) !== category) throw Object.assign(new Error('不同类别不得混入同一资源库'), { status: 400 });
    }
  }
  return payload;
}

function ledgerPath(root, category) {
  return path.join(root, category, 'ledger.json.gz');
}

export function read(root, category) {
  if (!CATEGORIES.has(category)) throw Object.assign(new Error('未知分类'), { status: 400 });
  const file = ledgerPath(root, category);
  if (!fs.existsSync(file)) return blank(category);
  return validate(JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8')), category);
}

function stamp(row) {
  const value = Date.parse(row?.updated_at || '');
  return Number.isFinite(value) ? value : 0;
}

function canonical(raw, media) {
  const url = new URL(raw);
  const drop = new Set(['xsec_token', 'xsec_source', 'fbclid', 'gclid', 'region']);
  const params = [...url.searchParams.entries()].filter(([key]) => !key.toLowerCase().startsWith('utm_') && !drop.has(key.toLowerCase()));
  params.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  const query = new URLSearchParams(params).toString();
  const pathname = url.pathname.replace(/\/$/, '');
  return `${url.protocol}//${url.host.toLowerCase()}${pathname}${query ? `?${query}` : ''}#${media}`;
}

function identity(row, key) {
  if (key !== 'records' && key !== 'blacklist') return row.id;
  const media = row.media_index ?? 'source';
  if (row.platform_post_id) return `${String(row.platform || '').toLowerCase()}:${row.platform_post_id}#${media}`;
  const raw = row.canonical_url || row.url;
  if (raw) {
    try {
      return canonical(raw, media);
    } catch {
      return row.id;
    }
  }
  return row.id;
}

function write(root, category, payload) {
  validate(payload, category);
  const directory = path.join(root, category);
  fs.mkdirSync(directory, { recursive: true });
  const file = ledgerPath(root, category);
  if (fs.existsSync(file)) {
    const snapshotsDir = path.join(directory, 'snapshots');
    fs.mkdirSync(snapshotsDir, { recursive: true });
    const old = fs.readFileSync(file);
    const digest = crypto.createHash('sha256').update(old).digest('hex').slice(0, 10);
    const name = `${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '')}-${digest}.json.gz`;
    fs.writeFileSync(path.join(snapshotsDir, name), old);
  }
  const body = zlib.gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'));
  const temp = path.join(directory, 'ledger.tmp');
  fs.writeFileSync(temp, body);
  fs.renameSync(temp, file);
}

export function merge(root, category, payload) {
  validate(payload, category);
  const current = read(root, category);
  for (const key of ['records', 'tasks', 'searches', 'events', 'blacklist']) {
    const index = new Map((current[key] || []).map((row) => [identity(row, key), row]));
    for (const row of payload[key] || []) {
      const rowKey = identity(row, key);
      const old = index.get(rowKey);
      if (!old) index.set(rowKey, row);
      else if (stamp(row) > stamp(old)) {
        const merged = { ...old, ...row, id: old.id };
        if (old.seen) merged.seen = true;
        index.set(rowKey, merged);
      } else if (row.seen) old.seen = true;
    }
    current[key] = [...index.values()];
  }
  current.updated_at = new Date().toISOString();
  write(root, category, current);
  return current;
}

export function snapshots(root, category) {
  if (!CATEGORIES.has(category)) throw Object.assign(new Error('未知分类'), { status: 400 });
  const dir = path.join(root, category, 'snapshots');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => name.endsWith('.json.gz')).sort().reverse();
}

export function restore(root, category, name) {
  if (!snapshots(root, category).includes(name)) throw Object.assign(new Error('快照不存在'), { status: 400 });
  const old = validate(JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, category, 'snapshots', name))).toString('utf8')), category);
  const current = read(root, category);
  const known = new Set(old.records.map((row) => row.id));
  old.records.push(...current.records.filter((row) => !known.has(row.id)).map((row) => ({ ...row, review_status: 'rollback-seen', seen: true })));
  const now = new Date().toISOString();
  for (const row of old.records) row.updated_at = now;
  old.events.push({ id: `restore-${now}`, type: 'restore', snapshot: name, updated_at: now });
  old.updated_at = now;
  write(root, category, old);
  return old;
}
