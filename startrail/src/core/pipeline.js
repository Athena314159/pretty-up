import { assessDuplicate } from './dedupe.js';
import { extractEntities } from './entities.js';
import { converged, createFrontier, resolveTake, scoreCandidate } from './frontier.js';
import { asUntrusted, isInjection } from './injection.js';
import { extractQuotes } from './quotes.js';
import { assignPriority, splitQuota } from './scoring.js';
import { rulesSynthesize } from './synthesize.js';
import { inScope, timeWindow } from './time.js';
import { termOverlap, uid } from './text.js';
import { canonicalUrl, isSafePublicUrl } from './url.js';

async function isolate(adapter, fn) {
  try {
    const result = await fn();
    if (!result || typeof result.ok !== 'boolean' || !Array.isArray(result.items)) {
      return { ok: false, items: [], error: `${adapter.id} 返回了无法识别的结果` };
    }
    return result;
  } catch (error) {
    return { ok: false, items: [], error: error.message || String(error) };
  }
}

function relevanceOf(item, query) {
  return termOverlap(`${item.title || ''} ${item.snippet || ''} ${item.text || ''}`, query);
}

async function pullQuota(adapters, queryItem, quota, task, state, deps) {
  const out = [];
  const enabled = adapters.filter((adapter) => (adapter.enabled ? adapter.enabled(task) : true));
  if (!enabled.length || quota <= 0) return out;
  let remaining = quota;
  for (let i = 0; i < enabled.length && remaining > 0; i += 1) {
    const adapter = enabled[i];
    let got = 0;
    let page = 1;
    const allot = Math.ceil(remaining / (enabled.length - i));
    while (got < allot && page <= 5) {
      const result = await isolate(adapter, () => adapter.search({
        query: queryItem.query,
        language: queryItem.language,
        limit: allot - got,
        page,
        signal: deps.signal,
        task,
      }));
      deps.log?.write({
        taskId: task.id,
        event: result.ok ? 'search.page' : 'search.error',
        adapter: adapter.id,
        msg: result.ok ? queryItem.query : result.error,
        data: { page, quotaExhausted: !!result.quotaExhausted },
      });
      if (!result.ok) {
        state.errors.push({ adapter: adapter.id, message: result.error || '失败', quotaExhausted: !!result.quotaExhausted });
        if (result.quotaExhausted) await noteQuota(adapter, allot - got, queryItem, task, state, deps, out);
        break;
      }
      if (!result.items.length) break;
      const slice = result.items.slice(0, allot - got);
      out.push(...slice.map((item) => ({ ...item, channel: adapter.kind, adapter: adapter.id })));
      got += slice.length;
      if (!result.hasMore) break;
      page += 1;
    }
    remaining = quota - out.length;
  }
  return out.slice(0, quota);
}

async function noteQuota(adapter, limit, queryItem, task, state, deps, out) {
  const message = `${adapter.label || adapter.id} 免费额度已用尽。`;
  if (!state.notices.includes(message)) state.notices.push(message);
  if (deps.paid?.enabled(task)) {
    const cost = Number(task.params.paidUnitUsd) || 0;
    if (state.spentUsd + cost <= task.params.budgetUsd) {
      const paid = await isolate(deps.paid, () => deps.paid.search({
        query: queryItem.query,
        language: queryItem.language,
        limit,
        page: 1,
        signal: deps.signal,
        task,
      }));
      state.spentUsd = Number((state.spentUsd + cost).toFixed(4));
      state.notices.push('已在预算内改用收费检索。');
      if (paid.ok) out.push(...paid.items.map((item) => ({ ...item, channel: 'api', adapter: deps.paid.id })));
      else state.errors.push({ adapter: 'paid', message: paid.error || '收费检索失败' });
    } else {
      state.notices.push('收费预算已到上限，没有继续调用收费检索。');
    }
    return;
  }
  if (!state.notices.some((item) => item.includes('收费检索未开启'))) {
    state.notices.push('收费检索未开启。可以在参数里打开「允许收费检索」并设置预算上限。');
  }
}

async function ingest(raw, queryItem, task, state, frontier, deps) {
  if (state.fetched >= task.params.fetchLimit) return;
  let url = raw.url;
  try {
    url = canonicalUrl(raw.url);
  } catch {
    state.errors.push({ adapter: raw.adapter, message: '链接无效' });
    return;
  }
  if (!deps.allowUnsafeUrls && !isSafePublicUrl(url)) {
    state.errors.push({ adapter: raw.adapter, message: '已跳过内网或带凭据的链接' });
    return;
  }
  if (state.seenUrls.includes(url)) return;
  let text = raw.text || '';
  let title = raw.title || '';
  let publishedAt = raw.publishedAt || null;
  let imageUrls = raw.imageUrls || [];
  if (!text && deps.web) {
    const fetched = await isolate(deps.web, () => deps.web.fetchDocument(url, { signal: deps.signal }));
    if (!fetched.ok) {
      state.errors.push({ adapter: 'web', message: fetched.error || '正文抓取失败' });
      state.seenUrls.push(url);
      return;
    }
    const doc = fetched.document || {};
    text = doc.text || '';
    title = title || doc.title || '';
    publishedAt = publishedAt || doc.publishedAt || null;
    imageUrls = imageUrls.length ? imageUrls : (doc.imageUrls || []);
  }
  const untrusted = asUntrusted(text, { url });
  const blob = `${title} ${untrusted.text} ${raw.snippet || ''}`;
  if (termOverlap(blob, queryItem.query) < 0.12 && termOverlap(blob, task.topic) < 0.12) {
    state.filtered += 1;
    state.seenUrls.push(url);
    return;
  }
  const scope = inScope(publishedAt, deps.now(), task.params);
  if (!scope.keep) {
    state.filtered += 1;
    state.seenUrls.push(url);
    return;
  }
  const record = {
    id: uid('doc'),
    url,
    canonicalUrl: url,
    title: title || url,
    text: untrusted.text,
    snippet: raw.snippet || untrusted.text.slice(0, 240),
    publishedAt,
    capturedAt: deps.now().toISOString(),
    channel: raw.channel,
    adapter: raw.adapter,
    language: queryItem.language,
    authors: raw.authors || [],
    author: raw.author || raw.authors?.[0] || '',
    doi: raw.doi || '',
    arxivId: raw.arxivId || '',
    metrics: raw.metrics || null,
    bucket: scope.bucket,
    verification: text ? 'extracted' : 'lead',
    injection: untrusted.injection,
    imageUrls,
    images: [],
    platform: raw.platform || raw.adapter,
    platformId: raw.platformId || '',
  };
  const dup = assessDuplicate(record, state.documents);
  if (dup.drop) {
    state.duplicates += 1;
    state.seenUrls.push(url);
    return;
  }
  record.possibleDuplicate = dup.possibleDuplicate;
  const priority = assignPriority(record, deps.now(), task.params);
  record.priority = priority.priority;
  record.growth = priority.growth;
  record.quotes = text ? extractQuotes(text, `${task.topic} ${queryItem.query}`, record) : [];
  if (deps.saveImages) record.images = await deps.saveImages(record, raw.imagePayloads || []);
  state.documents.push(record);
  state.seenUrls.push(url);
  state.fetched += 1;
  deps.index?.add(record);
  deps.store?.saveIndexDoc?.(record);
  if (queryItem.depth < task.params.depth) {
    const existing = frontier.items.map((item) => item.query);
    for (const entity of extractEntities(text)) {
      if (isInjection(entity.followupQuery) || isInjection(entity.sentence)) continue;
      const scored = scoreCandidate({
        query: entity.followupQuery,
        topic: task.topic,
        existingQueries: existing,
        documentRelevance: Math.max(0.55, termOverlap(text, task.topic)),
      });
      const added = frontier.push({
        query: entity.followupQuery,
        depth: queryItem.depth + 1,
        parentId: record.id,
        language: queryItem.language,
        line: 'expand',
        reason: `从原文延伸：${entity.name}`,
        ...scored,
        floor: task.params.scoreFloor,
        depthLimit: task.params.depth,
      });
      if (added.accepted) {
        existing.push(entity.followupQuery);
        deps.log?.write({ taskId: task.id, event: 'frontier.push', msg: entity.followupQuery, data: { score: scored.score } });
      }
    }
  }
}

async function runQuery(item, task, state, frontier, deps) {
  const remaining = task.params.fetchLimit - state.fetched;
  const budget = Math.max(0, Math.min(task.params.queryBatch, remaining));
  const quotas = splitQuota(budget, task.params.browserShare);
  const adapters = deps.adapters || [];
  const browserItems = await pullQuota(adapters.filter((adapter) => adapter.kind === 'browser'), item, quotas.browser, task, state, deps);
  const apiItems = await pullQuota(adapters.filter((adapter) => adapter.kind === 'api'), item, quotas.api, task, state, deps);
  const localItems = [];
  for (const adapter of adapters.filter((entry) => entry.kind === 'local')) {
    const result = await isolate(adapter, () => adapter.search({ query: item.query, limit: 5, page: 1, task, signal: deps.signal }));
    if (result.ok) localItems.push(...result.items.map((row) => ({ ...row, channel: 'local', adapter: adapter.id })));
    else state.errors.push({ adapter: adapter.id, message: result.error || '本地索引失败' });
  }
  const merged = [...browserItems, ...apiItems, ...localItems]
    .map((row) => ({ ...row, relevance: relevanceOf(row, item.query) }))
    .sort((a, b) => b.relevance - a.relevance);
  const before = state.documents.length;
  for (const raw of merged) {
    if (state.fetched >= task.params.fetchLimit) break;
    await ingest(raw, item, task, state, frontier, deps);
  }
  return state.documents.length - before;
}

function blankState() {
  return {
    frontier: [],
    documents: [],
    seenUrls: [],
    round: 0,
    quietRounds: 0,
    fetched: 0,
    filtered: 0,
    duplicates: 0,
    errors: [],
    notices: [],
    gaps: [],
    spentUsd: 0,
    review: '',
    timeWindow: null,
  };
}

export async function executeTask(task, deps) {
  const state = task.checkpoint ? structuredClone(task.checkpoint) : blankState();
  if (!state.frontier?.length) {
    const seeded = createFrontier();
    for (const query of task.confirmedQueries || []) {
      seeded.push({ ...query, query: query.text || query.query, depth: 0, score: 1, state: 'queued' });
    }
    state.frontier = seeded.items;
  }
  const frontier = createFrontier(state.frontier);
  state.frontier = frontier.items;
  state.timeWindow = timeWindow(deps.now(), task.params);
  task.status = 'running';
  task.error = null;
  task.checkpoint = state;
  await deps.store.saveTask(task);
  try {
    for (let guard = 0; guard < 40; guard += 1) {
      if (state.fetched >= task.params.fetchLimit) {
        state.gaps.push('已达到抓取上限');
        break;
      }
      const decision = await deps.planner.decide({ task, state });
      if (decision.stop && state.round > 0) {
        state.gaps.push(decision.reason || '规划器判断可以停止');
        break;
      }
      const pending = frontier.queued();
      const roots = pending.filter((item) => item.depth === 0);
      const extensions = pending.filter((item) => item.depth > 0 && item.score >= task.params.scoreFloor);
      let batch = [];
      if (roots.length && state.round === 0) batch = roots;
      else {
        const take = resolveTake({
          unbounded: !!task.params.branchUnbounded,
          breadth: task.params.breadth,
          modelTake: decision.take,
          eligible: extensions.length,
        });
        batch = extensions.slice(0, take);
        if (!task.params.branchUnbounded) {
          for (const extra of extensions.slice(take)) extra.state = 'skipped';
        }
      }
      if (!batch.length) {
        const extra = await deps.planner.reflect({ task, state });
        let added = 0;
        for (const query of extra || []) {
          if (isInjection(query.text)) continue;
          const scored = scoreCandidate({
            query: query.text,
            topic: task.topic,
            existingQueries: frontier.items.map((item) => item.query),
            documentRelevance: 0.5,
          });
          const result = frontier.push({
            query: query.text,
            language: query.language,
            line: query.line || 'expand',
            reason: query.reason || '反思补搜',
            depth: Math.min(task.params.depth, state.round + 1),
            ...scored,
            floor: task.params.scoreFloor,
            depthLimit: task.params.depth,
          });
          if (result.accepted) added += 1;
        }
        state.quietRounds += 1;
        if (!added || state.quietRounds >= 2 || converged(state).stop) {
          state.gaps.push('没有更多值得扩展的查询');
          break;
        }
        continue;
      }
      let gained = 0;
      for (const item of batch) {
        gained += await runQuery(item, task, state, frontier, deps);
        item.state = 'done';
        task.checkpoint = state;
        await deps.store.saveTask(task);
        if (deps.hooks?.afterCheckpoint) await deps.hooks.afterCheckpoint(task, state);
        if (state.fetched >= task.params.fetchLimit) break;
      }
      state.quietRounds = gained ? 0 : state.quietRounds + 1;
      state.round += 1;
      if (state.quietRounds >= 2) {
        state.gaps.push('连续两轮没有新的相关资料');
        break;
      }
    }
    state.review = await deps.planner.synthesize({ task, state });
    task.checkpoint = state;
    task.status = 'completed';
    await deps.store.saveTask(task);
    deps.log?.write({ taskId: task.id, event: 'task.completed', msg: task.topic, data: { fetched: state.fetched } });
    return task;
  } catch (error) {
    task.status = 'failed';
    task.error = error.message || String(error);
    task.checkpoint = state;
    await deps.store.saveTask(task);
    deps.log?.write({ taskId: task.id, level: 'error', event: 'task.failed', msg: task.error });
    throw error;
  }
}

export function rulesPlanner() {
  return {
    available: false,
    mode: 'rules',
    async rewrite(task) {
      const { rulesRewrite } = await import('./rewrite.js');
      return rulesRewrite(task);
    },
    async decide() {
      return { stop: false, take: null, reason: '规则模式按分数扩展' };
    },
    async reflect({ task, state }) {
      const { rulesReflect } = await import('./synthesize.js');
      return rulesReflect(task, state);
    },
    async synthesize({ task, state }) {
      return rulesSynthesize(task, state);
    },
  };
}
