import { languageName, rankLanguages } from './languages.js';
import { isInjection } from './injection.js';
import { LANGUAGES } from './languages.js';
import { uid } from './text.js';

const LINES = new Set(['seed', 'recent', 'history', 'expand']);
const CODES = new Set(LANGUAGES.map((item) => item.code));

export function rulesRewrite(task) {
  const languages = rankLanguages({
    topic: task.topic,
    userWeights: task.params.languageWeights,
    limit: task.params.languageCount,
  });
  const queries = [];
  const seen = new Set();
  function add(text, language, line, reason) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean || isInjection(clean)) return;
    const key = `${clean.toLowerCase()}|${language}|${line}`;
    if (seen.has(key)) return;
    seen.add(key);
    queries.push({ id: uid('q'), text: clean, language, line, reason, depth: 0 });
  }
  const primary = languages[0];
  add(task.topic, primary.code, 'seed', '用户主题');
  for (const lang of languages.slice(1)) {
    add(task.topic, lang.code, 'seed', `按主题加重${lang.name}`);
  }
  if (!task.params.timeUnlimited) add(`${task.topic} 最新`, primary.code, 'recent', '近期线');
  if (task.params.includeHistory) add(`${task.topic} 历史`, primary.code, 'history', '历史线，避免被近期结果挤掉');
  return { queries, languages, planner: 'rules' };
}

export function sanitizeQueries(input, task) {
  const list = Array.isArray(input?.queries) ? input.queries : Array.isArray(input) ? input : null;
  if (!list) return null;
  const queries = [];
  const seen = new Set();
  for (const row of list) {
    if (!row || typeof row.text !== 'string') continue;
    const text = row.text.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (text.length < 1 || text.length > 180) continue;
    if (isInjection(text)) continue;
    const language = CODES.has(row.language) ? row.language : rankLanguages({ topic: task.topic, limit: 1 })[0].code;
    const line = LINES.has(row.line) ? row.line : 'seed';
    const key = `${text.toLowerCase()}|${language}|${line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    queries.push({
      id: uid('q'),
      text,
      language,
      line,
      reason: String(row.reason || '模型改写').slice(0, 80),
      depth: 0,
    });
    if (queries.length >= 12) break;
  }
  if (!queries.length) return null;
  const languages = rankLanguages({ topic: task.topic, userWeights: task.params.languageWeights, limit: task.params.languageCount });
  return { queries, languages, planner: 'model' };
}

export function describeQuery(query) {
  return `${query.text}（${languageName(query.language)} · ${query.reason}）`;
}
