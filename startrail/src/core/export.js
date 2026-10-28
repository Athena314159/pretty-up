import { zipStore } from './zip.js';
import { VERSION } from '../version.js';

export const EXPORT_SCHEMA = 'startrail.bundle';
export const EXPORT_SCHEMA_VERSION = '4.0.0';

function bibKey(item, index) {
  const base = (item.authors?.[0] || 'source').split(/\s+/).pop() || 'source';
  const year = (item.published_at || '').slice(0, 4) || 'nd';
  const slug = `${base}${year}${index}`.replace(/[^A-Za-z0-9]/g, '') || `ref${index}`;
  return slug;
}

function bibEscape(value) {
  return String(value || '').replace(/[{}\\]/g, '');
}

export function toBibTeX(items) {
  return items
    .filter((item) => item.doi || item.arxiv_id || item.adapter === 'openalex' || item.adapter === 'arxiv' || item.adapter === 'crossref' || item.adapter === 'semanticscholar')
    .map((item, index) => {
      const key = bibKey(item, index + 1);
      const lines = [
        `@online{${key},`,
        `  title = {${bibEscape(item.title)}},`,
        `  author = {${bibEscape((item.authors || []).join(' and '))}},`,
        `  year = {${bibEscape((item.published_at || '').slice(0, 4))}},`,
        `  url = {${bibEscape(item.url)}},`,
      ];
      if (item.doi) lines.push(`  doi = {${bibEscape(item.doi)}}`);
      if (item.arxiv_id) lines.push(`  eprint = {${bibEscape(item.arxiv_id)}}`);
      lines.push('}');
      return lines.join('\n');
    })
    .join('\n\n');
}

export function quotesMarkdown(items) {
  const lines = ['# 摘抄卡', ''];
  for (const item of items) {
    for (const quote of item.quotes || []) {
      lines.push(`> ${quote.text}`);
      lines.push(`> — ${item.title || '未命名'}，${item.published_at || '时间未核实'}，${item.url}`);
      if (item.images?.length) lines.push(`> 图片：${item.images.map((image) => image.path).join('、')}`);
      lines.push('');
    }
  }
  if (lines.length === 2) lines.push('这次没有可逐字核对的摘抄。');
  return lines.join('\n');
}

export function buildBundle(task) {
  const state = task.checkpoint || {};
  const items = (state.documents || []).map((doc) => ({
    id: doc.id,
    url: doc.url,
    canonical_url: doc.canonicalUrl || doc.url,
    title: doc.title || '',
    channel: doc.channel || '',
    adapter: doc.adapter || '',
    language: doc.language || '',
    authors: doc.authors || [],
    author: doc.author || '',
    published_at: doc.publishedAt || null,
    captured_at: doc.capturedAt || null,
    priority: doc.priority || 'P5',
    growth: doc.growth || '',
    verification: doc.verification || 'lead',
    doi: doc.doi || '',
    arxiv_id: doc.arxivId || '',
    possible_duplicate: !!doc.possibleDuplicate,
    injection_suspected: !!doc.injection,
    quotes: (doc.quotes || []).map((quote) => ({
      text: quote.text,
      source_url: doc.url,
      source_title: doc.title || '',
      published_at: doc.publishedAt || null,
      captured_at: doc.capturedAt || null,
    })),
    images: (doc.images || []).map((image) => ({
      path: image.path,
      source_url: image.sourceUrl || image.source_url || '',
      role: image.role || 'original',
    })),
  }));
  return {
    schema: EXPORT_SCHEMA,
    schema_version: EXPORT_SCHEMA_VERSION,
    generator: `startrail/${VERSION}`,
    generated_at: new Date().toISOString(),
    task: {
      id: task.id,
      topic: task.topic,
      mode: task.mode,
      track: task.track,
      direction: '热点',
      params: task.params,
      time_window: state.timeWindow || null,
    },
    review_file: 'review.md',
    quotes_file: 'quotes.md',
    bibtex_file: 'references.bib',
    feishu_file: 'feishu.blocks.json',
    items,
    gaps: state.gaps || [],
    notices: state.notices || [],
    trace: {
      queries: (state.frontier || []).map((item) => ({
        id: item.id,
        query: item.query,
        language: item.language,
        line: item.line,
        depth: item.depth,
        score: item.score,
        state: item.state,
        reason: item.reason,
      })),
      rounds: state.round || 0,
      errors: state.errors || [],
      fetched: state.fetched || 0,
      planner: task.planner || 'rules',
    },
  };
}

export function buildFeishuDocument(bundle) {
  const blocks = [
    { type: 'heading', level: 1, text: bundle.task.topic },
    { type: 'text', text: bundle.task.mode === 'study' ? '学习模式' : '工作模式 · 热点' },
  ];
  for (const item of bundle.items) {
    blocks.push({ type: 'heading', level: 2, text: item.title || item.url });
    for (const quote of item.quotes || []) {
      blocks.push({ type: 'quote', text: quote.text, source: item.url, published_at: item.published_at });
    }
    for (const image of item.images || []) blocks.push({ type: 'image', path: image.path, source: image.source_url });
  }
  return {
    schema: 'startrail.feishu',
    schema_version: EXPORT_SCHEMA_VERSION,
    title: bundle.task.topic,
    blocks,
  };
}

export async function pushFeishu(document, { fetchImpl = globalThis.fetch, webhook = '' } = {}) {
  if (!webhook) {
    return { status: 'reserved', reason: '未配置飞书凭证。blocks 已放进资料包，其它工具可以直接拿去写文档。', document };
  }
  const response = await fetchImpl(webhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(document),
  });
  if (!response.ok) return { status: 'failed', reason: `飞书接口返回 ${response.status}` };
  return { status: 'sent' };
}

export function renderReview(task) {
  return task.checkpoint?.review || `# ${task.topic}\n\n还没有综述。`;
}

export function buildPackage(task, imageFiles = []) {
  const bundle = buildBundle(task);
  const feishu = buildFeishuDocument(bundle);
  const review = renderReview(task);
  const quotes = quotesMarkdown(bundle.items);
  const bib = toBibTeX(bundle.items);
  const files = [
    { name: 'bundle.json', data: JSON.stringify(bundle, null, 2) },
    { name: 'review.md', data: review },
    { name: 'quotes.md', data: quotes },
    { name: 'references.bib', data: bib || '% 这次没有可写入的学术条目\n' },
    { name: 'feishu.blocks.json', data: JSON.stringify(feishu, null, 2) },
    ...imageFiles.map((file) => ({ name: file.name, data: file.data })),
  ];
  return { bundle, feishu, zip: zipStore(files), files };
}
