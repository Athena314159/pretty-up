import path from 'node:path';
import { createLocalIndex } from './core/index/local.js';
import { createLimiter } from './core/http.js';
import { createLogger } from './core/log.js';
import { openStore } from './core/store.js';
import { loadConfig } from './config.js';
import { createPlanner } from './model/planner.js';
import { createWebAdapter } from './adapters/web.js';
import { createSocialAdapter } from './adapters/social.js';
import {
  createArxiv,
  createCrossref,
  createLocalAdapter,
  createOpenAlex,
  createPaid,
  createRss,
  createSearxng,
  createSemanticScholar,
} from './adapters/sources.js';

export function createRuntime({
  dataDir,
  cwd = process.cwd(),
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const config = loadConfig({ cwd, env });
  const store = openStore(dataDir);
  const index = createLocalIndex();
  for (const doc of store.loadIndexDocs()) index.add(doc);
  const limiter = createLimiter(700);
  const cache = {
    get: (key) => store.cacheGet(key),
    set: (key, body, ttl) => store.cacheSet(key, body, ttl),
  };
  const net = { fetchImpl, limiter, cache, timeoutMs: 15000, retries: 2 };
  const adapters = [
    createSearxng({ baseURL: config.searxngURL, ...net }),
    createOpenAlex({ mailto: config.mailto, ...net }),
    createSemanticScholar(net),
    createArxiv(net),
    createCrossref({ mailto: config.mailto, ...net }),
    createRss({ feeds: config.rssFeeds, ...net }),
    createLocalAdapter(index),
    createSocialAdapter({
      site: 'xiaohongshu',
      store,
      profileDir: path.join(dataDir, 'browser', 'xiaohongshu'),
      headless: env.STARTRAIL_BROWSER_HEADLESS === '1',
    }),
    createSocialAdapter({
      site: 'douyin',
      store,
      profileDir: path.join(dataDir, 'browser', 'douyin'),
      headless: env.STARTRAIL_BROWSER_HEADLESS === '1',
    }),
  ];
  const paid = createPaid({ baseURL: config.paid.baseURL, apiKey: config.paid.apiKey, fetchImpl, limiter, retries: 0 });
  const web = createWebAdapter(net);
  const planner = createPlanner(config, { fetchImpl });
  const log = createLogger({
    secrets: config.secrets,
    sink: (entry) => store.writeLog(entry),
  });
  return { config, store, index, adapters, paid, web, planner, log, dataDir };
}
