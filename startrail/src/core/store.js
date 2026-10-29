import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS presets (
  name TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS http_cache (
  cache_key TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  stored_at INTEGER NOT NULL,
  ttl_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  level TEXT NOT NULL,
  task_id TEXT,
  event TEXT NOT NULL,
  data TEXT
);
CREATE TABLE IF NOT EXISTS rate_events (
  adapter TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS index_docs (
  id TEXT PRIMARY KEY,
  url TEXT,
  body TEXT NOT NULL
);
`;

export function openStore(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'startrail.sqlite'));
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(SCHEMA);
  const saveTaskStmt = db.prepare('INSERT INTO tasks (id, status, payload, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status=excluded.status, payload=excluded.payload, updated_at=excluded.updated_at');
  const getTaskStmt = db.prepare('SELECT payload FROM tasks WHERE id = ?');
  const listStmt = db.prepare('SELECT payload FROM tasks ORDER BY updated_at DESC');
  return {
    file: path.join(dataDir, 'startrail.sqlite'),
    saveTask(task) {
      const updated = new Date().toISOString();
      task.updatedAt = updated;
      saveTaskStmt.run(task.id, task.status, JSON.stringify(task), updated);
      return task;
    },
    getTask(id) {
      const row = getTaskStmt.get(id);
      return row ? JSON.parse(row.payload) : null;
    },
    listTasks() {
      return listStmt.all().map((row) => JSON.parse(row.payload));
    },
    savePreset(name, payload) {
      db.prepare('INSERT INTO presets (name, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at')
        .run(name, JSON.stringify(payload), new Date().toISOString());
    },
    listPresets() {
      return db.prepare('SELECT name, payload, updated_at FROM presets ORDER BY name').all().map((row) => ({
        name: row.name,
        updatedAt: row.updated_at,
        ...JSON.parse(row.payload),
      }));
    },
    deletePreset(name) {
      db.prepare('DELETE FROM presets WHERE name = ?').run(name);
    },
    cacheGet(key) {
      const row = db.prepare('SELECT body, stored_at, ttl_ms FROM http_cache WHERE cache_key = ?').get(key);
      if (!row) return null;
      if (Date.now() - row.stored_at > row.ttl_ms) return null;
      return row.body;
    },
    cacheSet(key, body, ttlMs) {
      db.prepare('INSERT INTO http_cache (cache_key, body, stored_at, ttl_ms) VALUES (?, ?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET body=excluded.body, stored_at=excluded.stored_at, ttl_ms=excluded.ttl_ms')
        .run(key, body, Date.now(), ttlMs);
    },
    writeLog(entry) {
      db.prepare('INSERT INTO logs (ts, level, task_id, event, data) VALUES (?, ?, ?, ?, ?)').run(
        entry.ts,
        entry.level,
        entry.taskId,
        entry.event,
        JSON.stringify({ adapter: entry.adapter, msg: entry.msg, data: entry.data ?? null }),
      );
    },
    logsFor(taskId) {
      return db.prepare('SELECT ts, level, event, data FROM logs WHERE task_id = ? ORDER BY id').all(taskId).map((row) => ({
        ts: row.ts,
        level: row.level,
        event: row.event,
        ...JSON.parse(row.data || '{}'),
      }));
    },
    countRate(adapter, since) {
      return db.prepare('SELECT COUNT(*) AS n FROM rate_events WHERE adapter = ? AND ts >= ?').get(adapter, since).n;
    },
    addRate(adapter, ts) {
      db.prepare('INSERT INTO rate_events (adapter, ts) VALUES (?, ?)').run(adapter, ts);
    },
    saveIndexDoc(doc) {
      db.prepare('INSERT INTO index_docs (id, url, body) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET url=excluded.url, body=excluded.body')
        .run(doc.id, doc.url || '', JSON.stringify(doc));
    },
    loadIndexDocs() {
      return db.prepare('SELECT body FROM index_docs').all().map((row) => JSON.parse(row.body));
    },
    close() {
      db.close();
    },
  };
}
