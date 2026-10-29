import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createLocalIndex } from '../src/core/index/local.js';
import { createLogger } from '../src/core/log.js';
import { buildPackage, pushFeishu } from '../src/core/export.js';
import { saveImageFiles } from '../src/core/images.js';
import { executeTask, rulesPlanner } from '../src/core/pipeline.js';
import { createService } from '../src/core/service.js';
import { openStore } from '../src/core/store.js';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/server/app.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('资料包带版本、摘抄、原图、BibTeX 和预留的飞书块', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'startrail-export-'));
  const store = openStore(dir);
  const task = {
    id: 'task_export',
    topic: '拿破仑的衣服',
    mode: 'study',
    track: 'thesis',
    status: 'queued',
    params: {
      fetchLimit: 5, queryBatch: 4, depth: 1, breadth: 4, branchUnbounded: true, recentMonths: 3, latestDays: 7,
      includeHistory: false, timeUnlimited: true, browserShare: 0.5, languageCount: 1, scoreFloor: 0.2,
      budgetUsd: 0, allowPaid: false, paidUnitUsd: 0.01, enableXiaohongshu: false, enableDouyin: false,
      socialDetailLimit: 0, socialMaxPerHour: 8, languageWeights: {},
    },
    confirmedQueries: [{ text: '拿破仑的衣服', language: 'zh', line: 'seed', reason: '测试' }],
  };
  const text = '拿破仑加冕礼上的女性服饰采用高腰帝国式连衣裙（Empire waist），这种版型把腰线抬高。';
  await executeTask(task, {
    adapters: [{
      id: 'openalex', kind: 'api',
      async search({ query }) {
        if (query !== '拿破仑的衣服') return { ok: true, items: [], hasMore: false };
        return { ok: true, hasMore: false, items: [{ url: 'https://example.org/napoleon', title: '拿破仑服饰', text, publishedAt: '2024-01-01', authors: ['Ada'], doi: '10.1000/napoleon', imagePayloads: [{ url: 'https://cdn.example.org/a.png', bytes: PNG }] }] };
      },
    }],
    planner: rulesPlanner(),
    store,
    index: createLocalIndex(),
    log: createLogger(),
    now: () => new Date('2026-10-28T12:00:00Z'),
    saveImages: (record, payloads) => saveImageFiles(record, payloads, { dir: path.join(dir, 'tasks', task.id, 'images'), fetchImpl: async () => { throw new Error('skip'); } }),
  });
  const saved = store.getTask(task.id);
  assert.equal(saved.status, 'completed');
  assert.ok(saved.checkpoint.documents[0].quotes.some((quote) => saved.checkpoint.documents[0].text.includes(quote.text)));
  assert.match(saved.checkpoint.review, /事实/);
  assert.match(saved.checkpoint.review, /推断/);
  const service = createService({ store, dataDir: dir, planner: rulesPlanner(), adapters: [], log: createLogger(), index: createLocalIndex() });
  const { pack } = service.exportTask(task.id);
  assert.equal(pack.bundle.schema, 'startrail.bundle');
  assert.equal(pack.bundle.schema_version, '4.0.0');
  assert.ok(pack.bundle.items[0].images[0].path.startsWith('images/'));
  assert.match(pack.files.find((file) => file.name === 'references.bib').data.toString(), /10\.1000\/napoleon/);
  const zipPath = path.join(dir, 'out.zip');
  fs.writeFileSync(zipPath, pack.zip);
  const listed = spawnSync('python3', ['-c', 'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); print("\\n".join(z.namelist()))', zipPath], { encoding: 'utf8' });
  assert.equal(listed.status, 0, listed.stderr);
  assert.match(listed.stdout, /bundle\.json/);
  assert.match(listed.stdout, /quotes\.md/);
  assert.match(listed.stdout, /feishu\.blocks\.json/);
  assert.match(listed.stdout, /images\//);
  const feishu = await pushFeishu(pack.feishu, {});
  assert.equal(feishu.status, 'reserved');
  const follow = saved.checkpoint.frontier.some((item) => /Empire waist/.test(item.query) && /来源/.test(item.query));
  assert.equal(follow, true);
});

test('网页接口先确认查询，再执行，并隐藏密钥', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'startrail-http-'));
  const calls = [];
  const runtime = {
    cwd: dir,
    dataDir: dir,
    config: loadConfig({ cwd: dir, env: {}, home: dir }),
    store: openStore(dir),
    index: createLocalIndex(),
    log: createLogger(),
    planner: rulesPlanner(),
    paid: { id: 'paid', enabled: () => false, async search() { return { ok: true, items: [] }; } },
    adapters: [{
      id: 'browser', kind: 'browser',
      async search({ query }) {
        calls.push(query);
        return { ok: true, hasMore: false, items: [{ url: 'https://example.org/bag', title: query, text: `${query}的资料正文足够摘抄，并保留出处。`, publishedAt: '2026-10-01' }] };
      },
    }],
    now: () => new Date('2026-10-28T12:00:00Z'),
    probe: async () => ({ searxng: 'offline', xiaohongshu: 'absent', douyin: 'absent' }),
    fetchImpl: async () => { throw new Error('不应访问外网'); },
  };
  const server = createApp(runtime);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(`${base}/`);
    const html = await page.text();
    assert.match(html, /热点/);
    assert.match(html, /论文\/毕设/);
    assert.match(html, /设计作业/);
    assert.match(html, /调用模型/);
    assert.match(html, /纯规则/);
    assert.equal(html.includes('Pretty Up'), false);
    const meta = await (await fetch(`${base}/api/meta`)).json();
    assert.equal(meta.version, '4.1.0');
    assert.equal(meta.defaultEngine, 'model');
    assert.equal(meta.direction.label, '热点');
    assert.equal(meta.params.thesis.find((item) => item.key === 'fetchLimit').default, 300);
    assert.equal(meta.params.design.find((item) => item.key === 'fetchLimit').default, 200);
    const secret = 'sk-http-secret-value';
    const saved = await (await fetch(`${base}/api/settings`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ primary: { apiKey: secret, model: 'deepseek-chat', baseURL: 'https://api.deepseek.com' } }) })).json();
    assert.equal(JSON.stringify(saved).includes(secret), false);
    assert.equal(saved.primaryConfigured, true);
    const created = await (await fetch(`${base}/api/tasks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ topic: '包袋外观', mode: 'work' }) })).json();
    assert.equal(created.status, 'awaiting_confirm');
    assert.equal(created.engine, 'model');
    assert.equal(created.direction, 'hotspot');
    assert.ok(created.rewrittenQueries.length > 0);
    assert.equal(calls.length, 0);
    const early = await fetch(`${base}/api/tasks/${created.id}/run?wait=1`, { method: 'POST' });
    assert.equal(early.status, 400);
    const queued = await (await fetch(`${base}/api/tasks/${created.id}/confirm`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ queries: created.rewrittenQueries }) })).json();
    assert.equal(queued.status, 'queued');
    assert.equal(calls.length, 0);
    const done = await (await fetch(`${base}/api/tasks/${created.id}/run?wait=1`, { method: 'POST' })).json();
    assert.equal(done.status, 'completed');
    assert.ok(calls.length > 0);
    const exported = await fetch(`${base}/api/tasks/${created.id}/export`);
    assert.equal(exported.status, 200);
    assert.match(exported.headers.get('content-type'), /zip/);
    assert.equal(exported.headers.get('x-feishu-status'), 'reserved');
    const presets = await (await fetch(`${base}/api/presets`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '毕设', mode: 'study', track: 'thesis', params: { fetchLimit: 300 } }) })).json();
    assert.equal(presets[0].params.fetchLimit, 300);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('v3 记忆脚本仍可导入，且旧核验不能覆盖新核验', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'startrail-v3-'));
  const script = path.resolve('legacy/v3.2.0/skill/scripts/memory.py');
  const db = path.join(dir, 'memory.sqlite3');
  const file = path.join(dir, 'bundle.json');
  const bundle = (verification, at, id) => ({
    schema_version: 1,
    tasks: [],
    searches: [],
    observations: [],
    deliveries: [],
    sources: [{ id, url: 'https://Example.com/a?utm_source=x&b=1', title: '甲', verification, verification_updated_at: at, task_ids: ['t1'] }],
  });
  fs.writeFileSync(file, JSON.stringify(bundle('verified', '2026-10-02T00:00:00+00:00', 's1')));
  const init = spawnSync('python3', [script, '--db', db, 'init'], { encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr);
  const first = spawnSync('python3', [script, '--db', db, 'import', file], { encoding: 'utf8' });
  assert.equal(first.status, 0, first.stderr);
  fs.writeFileSync(file, JSON.stringify(bundle('lead', '2026-09-01T00:00:00+00:00', 's2')));
  const second = spawnSync('python3', [script, '--db', db, 'import', file], { encoding: 'utf8' });
  assert.equal(second.status, 0, second.stderr);
  const exported = path.join(dir, 'out.json');
  const third = spawnSync('python3', [script, '--db', db, 'export', exported], { encoding: 'utf8' });
  assert.equal(third.status, 0, third.stderr);
  const data = JSON.parse(fs.readFileSync(exported, 'utf8'));
  assert.equal(data.sources.length, 1);
  assert.equal(data.sources[0].verification, 'verified');
  assert.equal(data.sources[0].id, 's1');
});
