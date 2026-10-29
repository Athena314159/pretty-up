import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractEntities } from '../src/core/entities.js';
import { createFrontier, resolveTake } from '../src/core/frontier.js';
import { isInjection } from '../src/core/injection.js';
import { rankLanguages } from '../src/core/languages.js';
import { defaultsFor } from '../src/core/modes.js';
import { keepFaithfulQuotes } from '../src/core/quotes.js';
import { assignPriority, splitQuota } from '../src/core/scoring.js';

const cases = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'cases.json'), 'utf8'));

export function scoreRules() {
  const checks = [];
  const check = (id, ok, detail = '') => checks.push({ id, ok: !!ok, detail });
  const napoleon = cases.find((item) => item.id === 'napoleon-pattern');
  const entities = extractEntities(napoleon.text);
  check('napoleon-entity', entities.some((item) => /empire waist/i.test(item.name)), entities.map((item) => item.name).join(','));
  check('napoleon-followup', entities.some((item) => /来源|origin/i.test(item.followupQuery)), entities.map((item) => item.followupQuery).join(','));
  const spanish = rankLanguages({ topic: cases.find((item) => item.id === 'spanish-history').topic, limit: 3 });
  check('spanish-first', spanish[0]?.code === 'es', spanish.map((item) => item.code).join(','));
  const quoteCase = cases.find((item) => item.id === 'quote-fidelity');
  const kept = keepFaithfulQuotes([{ text: quoteCase.good }, { text: quoteCase.bad }], quoteCase.source);
  check('quote-exact', kept.length === 1 && kept[0].text === quoteCase.good, String(kept.length));
  const injection = cases.find((item) => item.id === 'injection');
  const safeEntities = extractEntities(injection.text);
  check('injection-ignored', isInjection(injection.text.split('。')[0]) && safeEntities.every((item) => !/密码|密钥/.test(item.followupQuery)) && safeEntities.some((item) => /empire waist/i.test(item.name)), safeEntities.map((item) => item.name).join(','));
  const limits = cases.find((item) => item.id === 'limits');
  check('thesis-limit', defaultsFor('study', 'thesis').fetchLimit === limits.thesis);
  check('design-limit', defaultsFor('study', 'design').fetchLimit === limits.design);
  check('quota-split', splitQuota(4, 0.5).browser === 2 && splitQuota(5, 0.5).browser === 3 && splitQuota(1, 0.5).api === 0);
  const frontier = createFrontier([{ query: '拿破仑的衣服', depth: 0 }]);
  check('frontier-dedupe', frontier.push({ query: '拿破仑的衣服' }).accepted === false);
  check('learning-unbounded', resolveTake({ unbounded: true, breadth: 2, modelTake: null, eligible: 6 }) === 6);
  check('work-breadth', resolveTake({ unbounded: false, breadth: 2, modelTake: 9, eligible: 6 }) === 2);
  const now = new Date('2026-10-28T12:00:00Z');
  const params = { recentMonths: 3, latestDays: 7 };
  const p1 = assignPriority({ publishedAt: '2026-09-01', metrics: { growthComparable: true, growthRate: 0.4, growthWindow: 'recent' } }, now, params);
  const likesOnly = assignPriority({ publishedAt: '2026-09-01', metrics: { likes: 1000 } }, now, params);
  check('p1-needs-growth', p1.priority === 'P1' && likesOnly.priority !== 'P1', `${p1.priority}/${likesOnly.priority}`);
  const passed = checks.filter((item) => item.ok).length;
  return { passed, total: checks.length, score: Math.round((passed / checks.length) * 100), checks };
}
