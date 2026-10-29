import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loginMarked } from '../adapters/social.js';
import { LANGUAGES } from '../core/languages.js';
import { DIRECTION_HOTSPOT, STUDY_TRACKS, describeParams } from '../core/modes.js';
import { createService } from '../core/service.js';
import { pushFeishu } from '../core/export.js';
import { CATEGORIES as RESOURCE_CATEGORIES } from '../library/resources.js';
import { merge, read, restore, snapshots } from '../library/store.js';
import { loadConfig, publicConfig, saveLocalConfig } from '../config.js';
import { createPlanner } from '../model/planner.js';
import { VERSION } from '../version.js';
import zlib from 'node:zlib';

const uiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../ui');
const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'cache-control': 'no-store', ...headers });
  res.end(body);
}

function json(res, status, payload) {
  send(res, status, JSON.stringify(payload), { 'content-type': 'application/json; charset=utf-8' });
}

function libraryRoot(runtime) {
  return path.resolve(runtime.libraryDir || path.join(runtime.cwd || process.cwd(), 'library'));
}

async function readBody(req, limit = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error('请求过大');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('请求不是 JSON');
    error.status = 400;
    throw error;
  }
}

async function defaultProbe(runtime) {
  let searxng = 'offline';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 800);
    const response = await fetch(new URL('/healthz', runtime.config.searxngURL), { signal: controller.signal });
    clearTimeout(timer);
    searxng = response.ok ? 'online' : 'offline';
  } catch {
    searxng = 'offline';
  }
  return {
    searxng,
    xiaohongshu: loginMarked(path.join(runtime.dataDir, 'browser', 'xiaohongshu')) ? 'login-recorded' : 'absent',
    douyin: loginMarked(path.join(runtime.dataDir, 'browser', 'douyin')) ? 'login-recorded' : 'absent',
  };
}

export function createApp(runtime) {
  const service = runtime.service || createService(runtime);
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const { pathname } = url;
      if (req.method === 'GET' && STATIC[pathname]) {
        const [file, type] = STATIC[pathname];
        const full = path.join(uiDir, file);
        return send(res, 200, fs.readFileSync(full), { 'content-type': type });
      }
      if (req.method === 'GET' && pathname === '/api/meta') {
        return json(res, 200, {
          version: VERSION,
          product: '星迹',
          direction: DIRECTION_HOTSPOT,
          tracks: STUDY_TRACKS,
          languages: LANGUAGES,
          defaultEngine: 'model',
          engines: [
            { id: 'model', label: '调用模型', default: true },
            { id: 'rules', label: '纯规则', default: false },
          ],
          resourceCategories: RESOURCE_CATEGORIES,
          params: {
            work: describeParams('work'),
            thesis: describeParams('study', 'thesis'),
            design: describeParams('study', 'design'),
          },
          model: publicConfig(runtime.config),
        });
      }
      if (req.method === 'GET' && pathname === '/api/health') {
        const probe = runtime.probe ? await runtime.probe() : await defaultProbe(runtime);
        return json(res, 200, { version: VERSION, ...probe, model: publicConfig(runtime.config).mode });
      }
      if (req.method === 'GET' && pathname === '/api/settings') return json(res, 200, publicConfig(runtime.config));
      if (req.method === 'POST' && pathname === '/api/settings') {
        const body = await readBody(req);
        const partial = {};
        for (const slot of ['primary', 'backup', 'paid']) {
          if (!body[slot]) continue;
          partial[slot] = {};
          for (const key of ['baseURL', 'model', 'apiKey', 'unitUsd']) {
            if (body[slot][key]) partial[slot][key] = body[slot][key];
          }
        }
        if (body.searxngURL) partial.searxngURL = body.searxngURL;
        if (body.mailto !== undefined) partial.mailto = String(body.mailto || '');
        if (body.feishuWebhook) partial.feishuWebhook = body.feishuWebhook;
        saveLocalConfig(partial, runtime.cwd || process.cwd());
        runtime.config = loadConfig({ cwd: runtime.cwd || process.cwd(), env: process.env });
        runtime.planner = createPlanner(runtime.config, { fetchImpl: runtime.fetchImpl || globalThis.fetch });
        return json(res, 200, publicConfig(runtime.config));
      }
      if (req.method === 'GET' && pathname === '/api/presets') return json(res, 200, service.presets());
      if (req.method === 'POST' && pathname === '/api/presets') return json(res, 200, service.savePreset(await readBody(req)));
      if (req.method === 'DELETE' && pathname === '/api/presets') {
        service.deletePreset(url.searchParams.get('name') || '');
        return json(res, 200, service.presets());
      }
      if (req.method === 'POST' && pathname === '/api/tasks') return json(res, 201, await service.create(await readBody(req)));
      if (req.method === 'GET' && pathname === '/api/tasks') return json(res, 200, service.list());
      const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)(?:\/(confirm|run|export|images\/([^/]+)))?$/);
      if (taskMatch) {
        const id = decodeURIComponent(taskMatch[1]);
        if (!/^task_[a-z0-9]+$/i.test(id)) return json(res, 404, { error: '找不到这个任务' });
        const action = taskMatch[2] || '';
        const image = taskMatch[3] ? path.basename(decodeURIComponent(taskMatch[3])) : '';
        if (req.method === 'GET' && !action) return json(res, 200, service.get(id));
        if (req.method === 'POST' && action === 'confirm') return json(res, 200, service.confirm(id, (await readBody(req)).queries));
        if (req.method === 'POST' && action === 'run') {
          if (url.searchParams.get('wait') === '1') return json(res, 200, await service.run(id));
          service.run(id).catch(() => {});
          return json(res, 202, { id, status: 'running' });
        }
        if (req.method === 'GET' && action === 'export') {
          const { pack } = service.exportTask(id);
          const feishu = await pushFeishu(pack.feishu, { fetchImpl: runtime.fetchImpl || globalThis.fetch, webhook: runtime.config.feishuWebhook });
          return send(res, 200, pack.zip, {
            'content-type': 'application/zip',
            'content-disposition': `attachment; filename="startrail-${id}.zip"`,
            'x-feishu-status': feishu.status,
          });
        }
        if (req.method === 'GET' && image) {
          const full = path.join(runtime.dataDir, 'tasks', id, 'images', image);
          if (!full.startsWith(path.join(runtime.dataDir, 'tasks', id, 'images')) || !fs.existsSync(full)) {
            return json(res, 404, { error: '找不到图片' });
          }
          const type = image.endsWith('.png') ? 'image/png' : image.endsWith('.webp') ? 'image/webp' : image.endsWith('.gif') ? 'image/gif' : 'image/jpeg';
          return send(res, 200, fs.readFileSync(full), { 'content-type': type });
        }
      }
      if (req.method === 'POST' && pathname === '/api/queue/run') {
        if (url.searchParams.get('wait') === '1') return json(res, 200, await service.runQueue());
        service.runQueue().catch(() => {});
        return json(res, 202, { status: 'running' });
      }
      if (req.method === 'POST' && pathname === '/api/import/v3') return json(res, 200, service.importV3(await readBody(req)));
      if (pathname === '/api/library' || pathname.startsWith('/api/library/')) {
        const root = libraryRoot(runtime);
        const category = url.searchParams.get('category') || '';
        if (req.method === 'GET' && pathname === '/api/library') return json(res, 200, read(root, category));
        if (req.method === 'GET' && pathname === '/api/library/snapshots') return json(res, 200, snapshots(root, category));
        if (req.method === 'GET' && pathname === '/api/library/archive') {
          const data = read(root, category);
          const body = zlib.gzipSync(Buffer.from(JSON.stringify(data), 'utf8'));
          return send(res, 200, body, {
            'content-type': 'application/gzip',
            'content-disposition': `attachment; filename="startrail-${category}.json.gz"`,
          });
        }
        if (req.method === 'POST' && pathname === '/api/library/merge') {
          const body = await readBody(req, 10_000_000);
          return json(res, 200, merge(root, body.resource_category, body));
        }
        if (req.method === 'POST' && pathname === '/api/library/restore') {
          const body = await readBody(req);
          return json(res, 200, restore(root, body.resource_category, body.snapshot));
        }
      }
      if (req.method === 'GET' && pathname.startsWith('/library/')) {
        const root = libraryRoot(runtime);
        const rel = decodeURIComponent(pathname.slice('/library/'.length));
        const target = path.resolve(root, rel);
        if (!target.startsWith(`${root}${path.sep}`) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
          return json(res, 404, { error: '找不到资源文件' });
        }
        const type = target.endsWith('.html') ? 'text/html; charset=utf-8' : target.endsWith('.json') ? 'application/json; charset=utf-8' : target.endsWith('.gz') ? 'application/gzip' : target.endsWith('.txt') || target.endsWith('.md') ? 'text/plain; charset=utf-8' : 'application/octet-stream';
        return send(res, 200, fs.readFileSync(target), { 'content-type': type });
      }
      return json(res, 404, { error: '没有这个接口' });
    } catch (error) {
      json(res, error.status || 500, { error: error.message || '请求失败' });
    }
  });
}
