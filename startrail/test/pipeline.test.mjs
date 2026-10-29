import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createLocalIndex } from '../src/core/index/local.js';
import { createLogger } from '../src/core/log.js';
import { executeTask, rulesPlanner } from '../src/core/pipeline.js';
import { openStore } from '../src/core/store.js';
import { createSocialAdapter } from '../src/adapters/social.js';

const now = () => new Date('2026-10-28T12:00:00Z');

function tempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'startrail-'));
  return { dir, store: openStore(dir) };
}

function baseParams(extra = {}) {
  return {
    fetchLimit: 20,
    queryBatch: 6,
    depth: 1,
    breadth: 2,
    branchUnbounded: false,
    recentMonths: 3,
    latestDays: 7,
    includeHistory: false,
    timeUnlimited: true,
    browserShare: 0.5,
    languageCount: 3,
    scoreFloor: 0.2,
    budgetUsd: 0,
    allowPaid: false,
    paidUnitUsd: 0.01,
    enableXiaohongshu: false,
    enableDouyin: false,
    socialDetailLimit: 3,
    socialMaxPerHour: 8,
    languageWeights: {},
    ...extra,
  };
}

async function run(task, extras) {
  const { dir, store } = tempStore();
  const full = { status: 'queued', checkpoint: null, ...task };
  try {
    await executeTask(full, {
      adapters: extras.adapters,
      paid: extras.paid,
      planner: rulesPlanner(),
      store,
      index: createLocalIndex(),
      log: createLogger(),
      now,
      saveImages: extras.saveImages,
      hooks: extras.hooks,
    });
  } catch (error) {
    if (!extras.allowError) throw error;
    return { task: store.getTask(full.id), dir, error };
  }
  return { task: store.getTask(full.id), dir };
}

test('浏览器和 API 各一半，官方 API 不因身份排到前面', async () => {
  const browser = {
    id: 'searxng', kind: 'browser',
    async search() {
      return { ok: true, hasMore: false, items: [1, 2, 3, 4].map((n) => ({ url: `https://example.org/b${n}`, title: '拿破仑衣服', text: '拿破仑衣服的可见版型需要对照原图。', publishedAt: '2026-10-01' })) };
    },
  };
  const api = {
    id: 'openalex', kind: 'api',
    async search() {
      return { ok: true, hasMore: false, items: [1, 2, 3, 4].map((n) => ({ url: `https://example.org/a${n}`, title: '拿破仑广告', text: '拿破仑', publishedAt: '2026-10-01' })) };
    },
  };
  const { task } = await run({
    id: 'task_half',
    topic: '拿破仑衣服',
    mode: 'work',
    track: null,
    params: baseParams({ fetchLimit: 4, queryBatch: 4, depth: 0 }),
    confirmedQueries: [{ text: '拿破仑衣服', language: 'zh', line: 'seed', reason: '测试' }],
  }, { adapters: [browser, api] });
  assert.equal(task.status, 'completed');
  const docs = task.checkpoint.documents;
  assert.equal(docs.length, 4);
  assert.equal(docs.filter((doc) => doc.channel === 'browser').length, 2);
  assert.equal(docs.filter((doc) => doc.channel === 'api').length, 2);
  assert.equal(docs[0].channel, 'browser');
});

test('单个来源失败不影响其他来源，免费额度用尽时才按预算走收费', async () => {
  const browser = { id: 'searxng', kind: 'browser', label: 'SearXNG', async search() { throw new Error('连接被拒绝'); } };
  const api = { id: 'semanticscholar', kind: 'api', label: 'Semantic Scholar', async search() { return { ok: false, items: [], quotaExhausted: true, error: '免费额度已用尽' }; } };
  let paidCalls = 0;
  const paid = {
    id: 'paid',
    enabled: (task) => task.params.allowPaid && task.params.budgetUsd > 0,
    async search() {
      paidCalls += 1;
      return { ok: true, items: [{ url: 'https://example.org/paid', title: '拿破仑衣服', text: '拿破仑衣服在收费结果里出现。', publishedAt: '2026-10-01' }] };
    },
  };
  const blocked = await run({
    id: 'task_free',
    topic: '拿破仑衣服',
    mode: 'work',
    track: null,
    params: baseParams({ fetchLimit: 4, queryBatch: 4, depth: 0 }),
    confirmedQueries: [{ text: '拿破仑衣服', language: 'zh', line: 'seed', reason: '测试' }],
  }, { adapters: [browser, api], paid });
  assert.equal(paidCalls, 0);
  assert.ok(blocked.task.checkpoint.notices.some((item) => item.includes('收费检索未开启')));
  assert.ok(blocked.task.checkpoint.errors.some((item) => item.adapter === 'searxng'));
  paidCalls = 0;
  const allowed = await run({
    id: 'task_paid',
    topic: '拿破仑衣服',
    mode: 'work',
    track: null,
    params: baseParams({ fetchLimit: 4, queryBatch: 4, depth: 0, allowPaid: true, budgetUsd: 1 }),
    confirmedQueries: [{ text: '拿破仑衣服', language: 'zh', line: 'seed', reason: '测试' }],
  }, { adapters: [browser, api], paid });
  assert.equal(paidCalls, 1);
  assert.ok(allowed.task.checkpoint.documents.some((doc) => doc.adapter === 'paid'));
  assert.ok(allowed.task.checkpoint.spentUsd > 0);
});

test('学习模式按内容扩展且不封顶，工作模式每层受广度限制', async () => {
  const text = '样本包括（甲款式）（乙款式）（丙款式）（丁款式）（戊款式）（己款式）的照片和说明。';
  function adapter() {
    const calls = [];
    return {
      calls,
      impl: {
        id: 'browser', kind: 'browser',
        async search({ query }) {
          calls.push(query);
          if (query === '版式样本') {
            return { ok: true, hasMore: false, items: [{ url: 'https://example.org/styles', title: '版式样本', text, publishedAt: '2020-01-01' }] };
          }
          return { ok: true, hasMore: false, items: [] };
        },
      },
    };
  }
  const work = adapter();
  await run({
    id: 'task_work',
    topic: '版式样本',
    mode: 'work',
    track: null,
    params: baseParams({ branchUnbounded: false, breadth: 2 }),
    confirmedQueries: [{ text: '版式样本', language: 'zh', line: 'seed', reason: '测试' }],
  }, { adapters: [work.impl] });
  assert.equal(work.calls.filter((query) => query !== '版式样本').length, 2);

  const study = adapter();
  await run({
    id: 'task_study',
    topic: '版式样本',
    mode: 'study',
    track: 'thesis',
    params: baseParams({ branchUnbounded: true, breadth: 2 }),
    confirmedQueries: [{ text: '版式样本', language: 'zh', line: 'seed', reason: '测试' }],
  }, { adapters: [study.impl] });
  assert.equal(study.calls.filter((query) => query !== '版式样本').length, 6);
  assert.ok(study.calls.some((query) => /甲款式/.test(query)));
});

test('失败后从断点继续，不重复已完成的查询', async () => {
  const calls = [];
  const adapter = {
    id: 'browser', kind: 'browser',
    async search({ query }) {
      calls.push(query);
      return { ok: true, hasMore: false, items: [{ url: `https://example.org/${encodeURIComponent(query)}`, title: query, text: `${query}的正文足够作为摘抄保存下来。`, publishedAt: '2026-10-01' }] };
    },
  };
  let failed = false;
  const { dir, store } = tempStore();
  const task = {
    id: 'task_resume',
    topic: '第一',
    mode: 'work',
    track: null,
    status: 'queued',
    params: baseParams({ depth: 0, fetchLimit: 10, queryBatch: 2 }),
    confirmedQueries: [
      { text: '第一', language: 'zh', line: 'seed', reason: '测试' },
      { text: '第二', language: 'zh', line: 'seed', reason: '测试' },
    ],
    checkpoint: null,
  };
  await assert.rejects(executeTask(task, {
    adapters: [adapter],
    planner: rulesPlanner(),
    store,
    index: createLocalIndex(),
    log: createLogger(),
    now,
    hooks: { afterCheckpoint() { if (!failed) { failed = true; throw new Error('中断'); } } },
  }));
  assert.equal(store.getTask(task.id).status, 'failed');
  const resumed = store.getTask(task.id);
  await executeTask(resumed, {
    adapters: [adapter],
    planner: rulesPlanner(),
    store,
    index: createLocalIndex(),
    log: createLogger(),
    now,
  });
  assert.equal(calls.filter((query) => query === '第一').length, 1);
  assert.equal(calls.filter((query) => query === '第二').length, 1);
  assert.equal(store.getTask(task.id).status, 'completed');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('小红书按真人间隔限流，未登录时只返回提示', async () => {
  const { dir, store } = tempStore();
  const sleeps = [];
  let opens = 0;
  const adapter = createSocialAdapter({
    site: 'xiaohongshu',
    store,
    profileDir: dir,
    sleep: async (ms) => { sleeps.push(ms); },
    rng: () => 9000,
    now: () => 1_700_000_000_000,
    driver: { async open() { opens += 1; return { loginRequired: false, items: [{ url: 'https://example.org/note', title: '笔记', text: '这条笔记的正文可以摘抄。' }] }; } },
  });
  const task = { params: { enableXiaohongshu: true, socialMaxPerHour: 2, socialDetailLimit: 1 } };
  assert.equal(adapter.enabled({ params: { enableXiaohongshu: false } }), false);
  await adapter.search({ query: '包袋', task });
  await adapter.search({ query: '包袋', task });
  const blocked = await adapter.search({ query: '包袋', task });
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /上限/);
  assert.equal(opens, 2);
  assert.ok(sleeps[0] >= 8000);
  const login = createSocialAdapter({
    site: 'douyin',
    store: openStore(path.join(dir, 'other')),
    profileDir: dir,
    sleep: async () => {},
    rng: () => 8000,
    now: () => 1_700_000_000_000,
    driver: { async open() { return { loginRequired: true, items: [] }; } },
  });
  const result = await login.search({ query: '包袋', task: { params: { enableDouyin: true, socialMaxPerHour: 5 } } });
  assert.match(result.error, /登录/);
  fs.rmSync(dir, { recursive: true, force: true });
});
