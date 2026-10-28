export const DIRECTION_HOTSPOT = { id: 'hotspot', label: '热点' };

export const STUDY_TRACKS = {
  thesis: { id: 'thesis', label: '论文/毕设' },
  design: { id: 'design', label: '设计作业' },
};

const SHARED = {
  latestDays: 7,
  recentMonths: 3,
  includeHistory: true,
  browserShare: 0.5,
  languageCount: 3,
  scoreFloor: 0.25,
  budgetUsd: 0,
  allowPaid: false,
  paidUnitUsd: 0.01,
  enableXiaohongshu: false,
  enableDouyin: false,
  socialDetailLimit: 3,
  socialMaxPerHour: 8,
};

export const DEFAULTS = {
  work: {
    direction: 'hotspot',
    fetchLimit: 80,
    depth: 2,
    breadth: 4,
    branchUnbounded: false,
    timeUnlimited: false,
    queryBatch: 8,
    ...SHARED,
  },
  thesis: {
    direction: 'hotspot',
    fetchLimit: 300,
    depth: 4,
    breadth: 8,
    branchUnbounded: true,
    timeUnlimited: true,
    queryBatch: 20,
    ...SHARED,
    recentMonths: 36,
  },
  design: {
    direction: 'hotspot',
    fetchLimit: 200,
    depth: 3,
    breadth: 8,
    branchUnbounded: true,
    timeUnlimited: false,
    queryBatch: 12,
    ...SHARED,
    recentMonths: 24,
  },
};

export const PARAM_DEFS = [
  { key: 'fetchLimit', group: '范围与数量', label: '抓取上限', type: 'number', min: 1, max: 2000, description: '这次任务最多保留多少条资料。论文/毕设默认 300，设计作业默认 200，热点默认 80。' },
  { key: 'queryBatch', group: '范围与数量', label: '单次查询抓取', type: 'number', min: 1, max: 80, description: '每一条查询在浏览器侧和 API 侧合计最多新增的资料数，避免第一条查询用完总额。' },
  { key: 'recentMonths', group: '范围与数量', label: '近期月数', type: 'number', min: 1, max: 120, description: '从执行日向前推的日历月。默认三个月；论文/毕设在「时间不限」打开时不截断。' },
  { key: 'latestDays', group: '范围与数量', label: '最新天数', type: 'number', min: 1, max: 90, description: '多少天以内算「最新」。默认 7 天，扩大到 30 天时结果里会分开标注。' },
  { key: 'includeHistory', group: '范围与数量', label: '保留历史线', type: 'boolean', description: '历史热点单独保留，用来对照演变和溯源，不让近期优先把它挤掉。' },
  { key: 'timeUnlimited', group: '范围与数量', label: '时间不限', type: 'boolean', description: '打开后不设近期截断，适合论文和毕设。设计作业默认仍按近期加历史两线。' },
  { key: 'depth', group: '图谱扩展', label: '检索深度', type: 'number', min: 0, max: 8, description: '从原文抽出新查询后最多再走几层。0 表示只搜你确认过的查询。' },
  { key: 'breadth', group: '图谱扩展', label: '每层广度', type: 'number', min: 1, max: 50, description: '工作模式每一层最多扩展多少条新查询。学习模式默认不封顶，这个数只作为偏好。' },
  { key: 'branchUnbounded', group: '图谱扩展', label: '分支不封顶', type: 'boolean', description: '打开后，每一层扩多少由查到的内容决定，不受广度硬上限约束。学习模式默认打开。' },
  { key: 'scoreFloor', group: '图谱扩展', label: '延伸门槛', type: 'number', min: 0, max: 1, step: 0.05, description: '相关性乘以新颖度低于这个值的新查询不再扩展，用来判断收敛。' },
  { key: 'languageCount', group: '语言', label: '语言种数', type: 'number', min: 1, max: 8, description: '按使用人数排序后，再按主题加重，实际采用的语言种数上限。' },
  { key: 'browserShare', group: '渠道与预算', label: '浏览器渠道比例', type: 'number', min: 0, max: 1, step: 0.05, description: '独立检索时浏览器授权渠道所占比例，其余给 API。默认 0.5，两边各半，不把官方 API 排在前面。' },
  { key: 'enableXiaohongshu', group: '渠道与预算', label: '使用小红书', type: 'boolean', description: '用你登录过的浏览器检索小红书。需要先手动登录一次。默认关闭。' },
  { key: 'enableDouyin', group: '渠道与预算', label: '使用抖音', type: 'boolean', description: '用你登录过的浏览器检索抖音。需要先手动登录一次。默认关闭。' },
  { key: 'socialDetailLimit', group: '渠道与预算', label: '社媒原帖数', type: 'number', min: 0, max: 10, description: '每条社媒查询最多打开几篇原帖读正文。打开之间会按真人节奏停顿。' },
  { key: 'socialMaxPerHour', group: '渠道与预算', label: '社媒每小时上限', type: 'number', min: 1, max: 20, description: '同一个平台一小时内最多检索几次，避免连续快速翻页。' },
  { key: 'allowPaid', group: '渠道与预算', label: '允许收费检索', type: 'boolean', description: '免费额度用尽时先提示。只有打开此项，才会改用收费检索。' },
  { key: 'budgetUsd', group: '渠道与预算', label: '收费预算（美元）', type: 'number', min: 0, max: 100, step: 0.01, description: '收费检索的预算上限。达到上限后停止收费调用。默认 0。' },
  { key: 'paidUnitUsd', group: '渠道与预算', label: '单次收费估算', type: 'number', min: 0, max: 5, step: 0.01, description: '每调用一次收费检索计入预算的美元估算。' },
];

export function defaultsFor(mode, track) {
  if (mode === 'study') return { ...DEFAULTS[track === 'design' ? 'design' : 'thesis'] };
  return { ...DEFAULTS.work };
}

function coerce(def, value) {
  if (def.type === 'boolean') return value === true || value === 'true' || value === 1 || value === '1';
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  const stepped = def.step ? Math.round(n / def.step) * def.step : n;
  const rounded = def.step && def.step < 1 ? Number(stepped.toFixed(4)) : stepped;
  return Math.min(def.max, Math.max(def.min, rounded));
}

export function normalizeTaskInput(input = {}) {
  const mode = input.mode === 'study' ? 'study' : 'work';
  const track = mode === 'study' ? (input.track === 'design' ? 'design' : 'thesis') : null;
  const defaults = defaultsFor(mode, track);
  const params = { ...defaults, direction: 'hotspot' };
  const source = input.params || {};
  for (const def of PARAM_DEFS) {
    if (source[def.key] !== undefined) {
      const next = coerce(def, source[def.key]);
      if (next !== undefined) params[def.key] = next;
    }
  }
  if (source.languageWeights && typeof source.languageWeights === 'object' && !Array.isArray(source.languageWeights)) {
    const weights = {};
    for (const [code, value] of Object.entries(source.languageWeights)) {
      const n = Number(value);
      if (Number.isFinite(n)) weights[code] = Math.min(10, Math.max(0, n));
    }
    params.languageWeights = weights;
  } else {
    params.languageWeights = {};
  }
  const topic = String(input.topic || '').trim();
  if (!topic) throw new Error('请填写研究主题');
  if (topic.length > 2000) throw new Error('研究主题过长');
  return { topic, mode, track, direction: 'hotspot', params };
}

export function describeParams(mode, track) {
  const defaults = defaultsFor(mode, track);
  return PARAM_DEFS.map((def) => ({ ...def, default: defaults[def.key] }));
}

export function modeLabel(mode, track) {
  if (mode === 'study') return `学习模式 · ${STUDY_TRACKS[track === 'design' ? 'design' : 'thesis'].label}`;
  return '工作模式 · 热点';
}
