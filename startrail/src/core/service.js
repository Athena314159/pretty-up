import fs from 'node:fs';
import path from 'node:path';
import { buildPackage } from './export.js';
import { saveImageFiles } from './images.js';
import { mergeV3 } from './memory-v3.js';
import { workPolicy } from '../library/resources.js';
import { createPlanner } from '../model/planner.js';
import { normalizeTaskInput } from './modes.js';
import { executeTask, rulesPlanner } from './pipeline.js';
import { sanitizeQueries } from './rewrite.js';
import { uid } from './text.js';

function must(store, id) {
  const task = store.getTask(id);
  if (!task) {
    const error = new Error('找不到这个任务');
    error.status = 404;
    throw error;
  }
  return task;
}

export function createService(runtime) {
  const running = new Set();
  const { store, adapters, paid, web, log, index, dataDir } = runtime;

  function plannerFor(task) {
    const engine = task?.engine === 'rules' ? 'rules' : 'model';
    if (!runtime.config) return engine === 'rules' ? rulesPlanner() : runtime.planner;
    return createPlanner(runtime.config, { fetchImpl: runtime.fetchImpl || globalThis.fetch, engine });
  }

  function seedDeps(task) {
    return {
      adapters,
      paid,
      web,
      planner: plannerFor(task),
      store,
      index,
      log,
      now: runtime.now || (() => new Date()),
      signal: runtime.signal,
      saveImages: (record, payloads) => saveImageFiles(record, payloads, {
        dir: path.join(dataDir, 'tasks', task.id, 'images'),
        fetchImpl: runtime.fetchImpl || globalThis.fetch,
      }),
      hooks: runtime.hooks,
    };
  }

  return {
    create(input) {
      const normalized = normalizeTaskInput(input);
      const planner = plannerFor(normalized);
      const task = {
        id: uid('task'),
        ...normalized,
        workPolicy: workPolicy(normalized),
        plannerNotice: planner.notice || '',
        status: 'awaiting_confirm',
        rewrittenQueries: [],
        languages: [],
        confirmedQueries: null,
        checkpoint: null,
        error: null,
        planner: planner.mode,
      };
      return planner.rewrite(task).then((rewritten) => {
        task.rewrittenQueries = rewritten.queries;
        task.languages = rewritten.languages;
        task.planner = rewritten.planner || planner.mode;
        task.plannerNotice = rewritten.notice || planner.notice || '';
        store.saveTask(task);
        log.write({ taskId: task.id, event: 'task.created', msg: task.topic });
        return task;
      });
    },
    confirm(id, queries) {
      const task = must(store, id);
      if (!['awaiting_confirm', 'queued'].includes(task.status)) {
        const error = new Error('这个任务已经开始执行');
        error.status = 409;
        throw error;
      }
      const accepted = queries?.length ? sanitizeQueries({ queries }, task) : { queries: task.rewrittenQueries };
      if (!accepted?.queries?.length) {
        const error = new Error('没有可执行的查询');
        error.status = 400;
        throw error;
      }
      task.confirmedQueries = accepted.queries;
      task.status = 'queued';
      store.saveTask(task);
      log.write({ taskId: task.id, event: 'task.confirmed', msg: String(accepted.queries.length) });
      return task;
    },
    async run(id) {
      const task = must(store, id);
      if (task.status === 'awaiting_confirm') {
        const error = new Error('请先确认查询');
        error.status = 400;
        throw error;
      }
      const stale = task.status === 'running' && !running.has(id);
      if (!['queued', 'failed'].includes(task.status) && !stale) {
        const error = new Error('这个任务当前不能执行');
        error.status = 409;
        throw error;
      }
      if (running.has(id)) {
        const error = new Error('这个任务正在执行');
        error.status = 409;
        throw error;
      }
      running.add(id);
      try {
        return await executeTask(task, seedDeps(task));
      } finally {
        running.delete(id);
      }
    },
    async runQueue() {
      const queued = store.listTasks().filter((task) => task.status === 'queued').reverse();
      const done = [];
      for (const task of queued) done.push(await this.run(task.id));
      return done;
    },
    get(id) {
      return must(store, id);
    },
    list() {
      return store.listTasks().map((task) => ({
        id: task.id,
        topic: task.topic,
        mode: task.mode,
        track: task.track,
        direction: '热点',
        status: task.status,
        updatedAt: task.updatedAt,
        fetched: task.checkpoint?.fetched || 0,
        error: task.error || null,
        resumable: task.status === 'failed' || (task.status === 'running' && !running.has(task.id)),
      }));
    },
    savePreset(body) {
      const name = String(body.name || '').trim();
      if (!name || name.length > 40 || /[\\/]/.test(name)) {
        const error = new Error('请填写可用的预设名称');
        error.status = 400;
        throw error;
      }
      const normalized = normalizeTaskInput({ topic: body.topic || '预设', mode: body.mode, track: body.track, params: body.params });
      store.savePreset(name, { mode: normalized.mode, track: normalized.track, params: normalized.params });
      return store.listPresets();
    },
    presets() {
      return store.listPresets();
    },
    deletePreset(name) {
      store.deletePreset(name);
    },
    exportTask(id) {
      const task = must(store, id);
      if (!task.checkpoint) {
        const error = new Error('任务还没有可导出的结果');
        error.status = 409;
        throw error;
      }
      const images = [];
      for (const doc of task.checkpoint.documents || []) {
        for (const image of doc.images || []) {
          const base = path.basename(image.path || '');
          const full = path.join(dataDir, 'tasks', task.id, 'images', base);
          if (base && fs.existsSync(full)) images.push({ name: `images/${base}`, data: fs.readFileSync(full) });
        }
      }
      return { task, pack: buildPackage(task, images) };
    },
    importV3(bundle) {
      const current = store.cacheGet('v3-bundle');
      const prior = current ? JSON.parse(current) : null;
      const merged = mergeV3(prior, bundle);
      store.cacheSet('v3-bundle', JSON.stringify(merged), 1000 * 60 * 60 * 24 * 3650);
      return {
        tasks: merged.tasks.length,
        sources: merged.sources.length,
        searches: merged.searches.length,
      };
    },
  };
}
