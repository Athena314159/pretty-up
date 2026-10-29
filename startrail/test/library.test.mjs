import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createLocalIndex } from '../src/core/index/local.js';
import { createLogger } from '../src/core/log.js';
import { openStore } from '../src/core/store.js';
import { loadConfig } from '../src/config.js';
import { merge, read, restore, snapshots } from '../src/library/store.js';
import { createApp } from '../src/server/app.js';

function put(root, rows, category = 'collage') {
  return merge(root, category, { library_schema: 1, resource_category: category, records: rows, tasks: [], searches: [], events: [], blacklist: [] });
}

test('分类台账按来源合并，较新判定优先，回退保留 seen', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'startrail-lib-'));
  const base = { id: 'device-a', platform: '小红书', platform_post_id: 'abc', seen: true, review_status: 'excluded', updated_at: '2026-10-28T10:00:00+08:00' };
  put(root, [base]);
  let out = put(root, [{ ...base, id: 'device-b', review_status: 'accepted', seen: false, updated_at: '2026-10-27T10:00:00+08:00' }]);
  assert.equal(out.records.length, 1);
  assert.equal(out.records[0].review_status, 'excluded');
  assert.equal(out.records[0].seen, true);
  out = put(root, [{ ...base, id: 'device-b', review_status: 'lead', seen: false, updated_at: '2026-10-29T10:00:00+08:00' }]);
  assert.equal(out.records[0].id, 'device-a');
  assert.equal(out.records[0].seen, true);
  const urls = fs.mkdtempSync(path.join(os.tmpdir(), 'startrail-lib-'));
  put(urls, [{ id: 'a', url: 'https://example.org/p?utm_source=x#here', seen: true }]);
  out = put(urls, [{ id: 'b', url: 'https://example.org/p' }]);
  assert.equal(out.records.length, 1);
  assert.deepEqual(read(root, 'makeup').records, []);
  assert.throws(() => merge(root, 'collage', { library_schema: 1, resource_category: 'collage', records: [{ id: 'bad', resource_category: 'makeup' }] }));
  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'startrail-lib-'));
  put(fresh, [{ id: 'a', seen: true }]);
  put(fresh, [{ id: 'b', seen: true }]);
  const name = snapshots(fresh, 'collage')[0];
  out = restore(fresh, 'collage', name);
  assert.deepEqual(new Set(out.records.map((row) => row.id)), new Set(['a', 'b']));
  assert.equal(out.records.every((row) => row.seen), true);
  assert.equal(out.events.at(-1).type, 'restore');
  const posts = fs.mkdtempSync(path.join(os.tmpdir(), 'startrail-lib-'));
  out = put(posts, [{ id: 'one', platform: 'A', platform_post_id: 'p', media_index: 1 }, { id: 'two', platform: 'A', platform_post_id: 'p', media_index: 2 }]);
  assert.equal(out.records.length, 2);
});

test('资源库接口按分类隔离，美妆空库不混入拼图', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'startrail-lib-http-'));
  const runtime = {
    cwd: dir,
    dataDir: dir,
    libraryDir: path.join(dir, 'library'),
    config: loadConfig({ cwd: dir, env: {}, home: dir }),
    store: openStore(dir),
    index: createLocalIndex(),
    log: createLogger(),
    planner: { mode: 'rules', async rewrite() { return { queries: [], languages: [], planner: 'rules' }; } },
    adapters: [],
    paid: { id: 'paid', enabled: () => false, async search() { return { ok: true, items: [] }; } },
    probe: async () => ({ searxng: 'offline', xiaohongshu: 'absent', douyin: 'absent' }),
  };
  const server = createApp(runtime);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const empty = await (await fetch(`${base}/api/library?category=makeup`)).json();
    assert.equal(empty.resource_category, 'makeup');
    assert.deepEqual(empty.records, []);
    const merged = await (await fetch(`${base}/api/library/merge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ library_schema: 1, resource_category: 'collage', records: [{ id: 'post-1', seen: true, title: '人物拼图' }] }),
    })).json();
    assert.equal(merged.records.length, 1);
    const makeup = await (await fetch(`${base}/api/library?category=makeup`)).json();
    assert.deepEqual(makeup.records, []);
    const bad = await fetch(`${base}/api/library?category=nope`);
    assert.equal(bad.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
