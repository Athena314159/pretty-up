import { modeLabel } from './modes.js';

export function rulesReflect(task, state) {
  const queries = [];
  const frontier = state.frontier || [];
  const docs = state.documents || [];
  const haveHistory = docs.some((doc) => doc.bucket === 'history') || frontier.some((item) => item.line === 'history');
  const haveRecent = docs.some((doc) => doc.bucket === 'recent' || doc.bucket === 'latest') || frontier.some((item) => item.line === 'recent');
  const language = frontier[0]?.language || 'zh';
  if (task.params.includeHistory && !haveHistory) {
    queries.push({ text: `${task.topic} 历史`, language, line: 'history', reason: '反思：补历史线' });
  }
  if (!task.params.timeUnlimited && !haveRecent) {
    queries.push({ text: `${task.topic} 最新`, language, line: 'recent', reason: '反思：补近期线' });
  }
  return queries;
}

export function rulesSynthesize(task, state) {
  const window = state.timeWindow;
  const lines = [
    `# ${task.topic}`,
    '',
    `模式：${modeLabel(task.mode, task.track)}`,
    window
      ? `时间窗口：近期自 ${window.recentStart} 起，最新自 ${window.latestStart} 起，至 ${window.end}。${window.timeUnlimited ? '当前为时间不限。' : ''}`
      : '',
    '',
    '## 事实',
  ];
  let quotes = 0;
  for (const doc of state.documents || []) {
    for (const quote of doc.quotes || []) {
      if (!doc.text?.includes(quote.text)) continue;
      quotes += 1;
      lines.push(`> ${quote.text}`, `> — ${doc.title}，${doc.publishedAt || '时间未核实'}，${doc.url}`, '');
    }
  }
  if (!quotes) lines.push('没有通过逐字核对的摘抄。', '');
  const injected = (state.documents || []).filter((doc) => doc.injection).length;
  lines.push(
    '## 观察',
    `本次保留 ${(state.documents || []).length} 条资料。疑似提示注入 ${injected} 条，只作为数据保存，没有当成指令。`,
    '',
    '## 推断',
    '以下为推断：这些材料只说明已经抓到的样本，不能当成全网覆盖，也不能在没有可比口径时宣称增长最快。',
    '',
    '## 预测',
    '本次没有把预测写成事实。',
    '',
    '## 缺口',
  );
  for (const notice of state.notices || []) lines.push(`- ${notice}`);
  if (state.errors?.length) lines.push(`- ${state.errors.length} 次来源失败已隔离，其它来源继续。`);
  if (!(state.notices || []).length && !(state.errors || []).length) lines.push('- 没有额外缺口。');
  lines.push('', `新增 ${state.fetched || 0} 条，重复跳过 ${state.duplicates || 0} 条，时间过滤 ${state.filtered || 0} 条。`);
  return lines.join('\n');
}

export function guardSynthesis(markdown, documents) {
  const corpus = (documents || []).map((doc) => doc.text || '').join('\n');
  return String(markdown || '')
    .split('\n')
    .filter((line) => {
      if (!line.startsWith('> ')) return true;
      if (line.startsWith('> —') || line.startsWith('> 图片')) return true;
      const quote = line.replace(/^>\s?/, '').trim();
      return corpus.includes(quote);
    })
    .join('\n');
}
