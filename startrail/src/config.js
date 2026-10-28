import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function readJson(file) {
  if (!file || !fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function configPath(cwd = process.cwd()) {
  return path.join(cwd, 'startrail.local.json');
}

export function loadConfig({ cwd = process.cwd(), env = process.env, home = os.homedir() } = {}) {
  const file = readJson(env.STARTRAIL_CONFIG) || readJson(configPath(cwd)) || readJson(path.join(home, '.startrail', 'config.json')) || {};
  const primary = {
    baseURL: env.STARTRAIL_MODEL_BASE_URL || file.primary?.baseURL || 'https://api.deepseek.com',
    model: env.STARTRAIL_MODEL_NAME || file.primary?.model || 'deepseek-chat',
    apiKey: env.STARTRAIL_MODEL_API_KEY || file.primary?.apiKey || '',
  };
  const backup = {
    baseURL: env.STARTRAIL_BACKUP_MODEL_BASE_URL || file.backup?.baseURL || '',
    model: env.STARTRAIL_BACKUP_MODEL_NAME || file.backup?.model || '',
    apiKey: env.STARTRAIL_BACKUP_MODEL_API_KEY || file.backup?.apiKey || '',
  };
  const paidKey = env.STARTRAIL_PAID_API_KEY || file.paid?.apiKey || '';
  return {
    primary,
    backup,
    searxngURL: env.STARTRAIL_SEARXNG_URL || file.searxngURL || 'http://127.0.0.1:8088',
    mailto: env.STARTRAIL_MAILTO || file.mailto || '',
    paid: {
      baseURL: env.STARTRAIL_PAID_SEARCH_URL || file.paid?.baseURL || '',
      apiKey: paidKey,
      unitUsd: Number(env.STARTRAIL_PAID_UNIT_USD || file.paid?.unitUsd || 0.01),
    },
    feishuWebhook: env.STARTRAIL_FEISHU_WEBHOOK || file.feishuWebhook || '',
    rssFeeds: Array.isArray(file.rssFeeds) ? file.rssFeeds : [],
    secrets: [primary.apiKey, backup.apiKey, paidKey, env.STARTRAIL_FEISHU_WEBHOOK, file.feishuWebhook].filter(Boolean),
    file: configPath(cwd),
  };
}

export function publicConfig(config) {
  return {
    primaryModel: config.primary.model,
    primaryBaseURL: config.primary.baseURL,
    primaryConfigured: !!config.primary.apiKey,
    backupModel: config.backup.model,
    backupBaseURL: config.backup.baseURL,
    backupConfigured: !!(config.backup.apiKey && config.backup.model),
    searxngURL: config.searxngURL,
    paidConfigured: !!(config.paid.baseURL && config.paid.apiKey),
    feishuConfigured: !!config.feishuWebhook,
    mode: config.primary.apiKey ? 'model' : 'rules',
  };
}

export function saveLocalConfig(partial, cwd = process.cwd()) {
  const file = configPath(cwd);
  const current = readJson(file) || {};
  const next = {
    ...current,
    primary: { ...(current.primary || {}), ...(partial.primary || {}) },
    backup: { ...(current.backup || {}), ...(partial.backup || {}) },
    paid: { ...(current.paid || {}), ...(partial.paid || {}) },
  };
  if (partial.searxngURL) next.searxngURL = partial.searxngURL;
  if (partial.mailto !== undefined) next.mailto = partial.mailto;
  if (partial.feishuWebhook !== undefined) next.feishuWebhook = partial.feishuWebhook;
  if (Array.isArray(partial.rssFeeds)) next.rssFeeds = partial.rssFeeds;
  for (const slot of ['primary', 'backup']) {
    if (partial[slot] && partial[slot].apiKey === '') delete next[slot].apiKey;
  }
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  return file;
}
