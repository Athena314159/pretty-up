import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loginMarked } from '../adapters/social.js';
import { LANGUAGES } from '../core/languages.js';
import { DIRECTION_HOTSPOT, STUDY_TRACKS, describeParams } from '../core/modes.js';
import { createService } from '../core/service.js';
import { pushFeishu } from '../core/export.js';
import { loadConfig, publicConfig, saveLocalConfig } from '../config.js';
import { createPlanner } from '../model/planner.js';
import { VERSION } from '../version.js';

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

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) {
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
      return json(res, 404, { error: '没有这个接口' });
    } catch (error) {
      json(res, error.status || 500, { error: error.message || '请求失败' });
    }
  });
}
