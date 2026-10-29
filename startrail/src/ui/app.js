const state = { meta: null, mode: 'work', track: 'thesis', engine: 'model', task: null, weights: {} };

const $ = (id) => document.getElementById(id);

function toast(text) {
  const node = $('toast');
  node.textContent = text;
  node.classList.add('show');
  setTimeout(() => node.classList.remove('show'), 2400);
}

async function api(path, options) {
  const response = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...options,
  });
  if (response.headers.get('content-type')?.includes('application/zip')) return response;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || '请求失败');
  return body;
}

function currentParams() {
  const key = state.mode === 'work' ? 'work' : state.track;
  const defs = state.meta.params[key];
  const params = { languageWeights: { ...state.weights } };
  for (const def of defs) {
    const input = document.querySelector(`[data-param="${def.key}"]`);
    if (!input) continue;
    if (def.type === 'boolean') params[def.key] = input.checked;
    else params[def.key] = input.value;
  }
  return params;
}

function renderParams() {
  const key = state.mode === 'work' ? 'work' : state.track;
  const defs = state.meta.params[key];
  const groups = new Map();
  for (const def of defs) {
    if (!groups.has(def.group)) groups.set(def.group, []);
    groups.get(def.group).push(def);
  }
  const root = $('params');
  root.replaceChildren();
  for (const [group, items] of groups) {
    const fieldset = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = group;
    fieldset.append(legend);
    const grid = document.createElement('div');
    grid.className = 'params';
    for (const def of items) {
      const label = document.createElement('label');
      label.className = 'field';
      label.append(def.label);
      const input = document.createElement('input');
      input.dataset.param = def.key;
      if (def.type === 'boolean') {
        input.type = 'checkbox';
        input.checked = !!def.default;
      } else {
        input.type = 'number';
        input.min = def.min;
        input.max = def.max;
        input.step = def.step || 1;
        input.value = def.default;
      }
      const help = document.createElement('small');
      help.textContent = `${def.description} 默认 ${def.type === 'boolean' ? (def.default ? '开' : '关') : def.default}。`;
      label.append(input, help);
      grid.append(label);
    }
    fieldset.append(grid);
    root.append(fieldset);
  }
}

function renderLanguages() {
  const root = $('languages');
  root.replaceChildren();
  for (const lang of state.meta.languages.slice(0, 12)) {
    const label = document.createElement('label');
    label.append(`${lang.name}`);
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.max = '10';
    input.step = '0.1';
    input.value = state.weights[lang.code] ?? 1;
    input.addEventListener('input', () => {
      state.weights[lang.code] = Number(input.value);
    });
    label.append(input);
    root.append(label);
  }
}

function setMode(mode) {
  state.mode = mode;
  for (const button of document.querySelectorAll('[data-mode]')) button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
  $('trackRow').hidden = mode !== 'study';
  $('workResource').hidden = mode !== 'work';
  $('directionLabel').textContent = mode === 'work' ? '调研方向：热点' : '学习模式';
  renderParams();
}

function setEngine(engine) {
  state.engine = engine === 'rules' ? 'rules' : 'model';
  for (const button of document.querySelectorAll('[data-engine]')) button.setAttribute('aria-pressed', String(button.dataset.engine === state.engine));
  updateEnginePill();
}

function updateEnginePill() {
  const configured = state.meta?.model?.mode === 'model';
  if (state.engine === 'rules') $('modePill').textContent = '纯规则';
  else $('modePill').textContent = configured ? '调用模型' : '调用模型·未配置密钥';
}

function setTrack(track) {
  state.track = track;
  for (const button of document.querySelectorAll('[data-track]')) button.setAttribute('aria-pressed', String(button.dataset.track === track));
  renderParams();
}

function applyPreset(preset) {
  if (!preset) return;
  setMode(preset.mode || 'work');
  if (preset.track) setTrack(preset.track);
  state.weights = { ...(preset.params?.languageWeights || {}) };
  renderLanguages();
  renderParams();
  for (const [key, value] of Object.entries(preset.params || {})) {
    const input = document.querySelector(`[data-param="${key}"]`);
    if (!input) continue;
    if (input.type === 'checkbox') input.checked = !!value;
    else input.value = value;
  }
}

async function loadPresets() {
  const presets = await api('/api/presets');
  const select = $('presetList');
  select.replaceChildren(new Option('载入预设', ''));
  for (const preset of presets) select.append(new Option(preset.name, preset.name));
  select.onchange = () => applyPreset(presets.find((item) => item.name === select.value));
}

function renderQueries(task) {
  const root = $('queryList');
  root.replaceChildren();
  for (const query of task.rewrittenQueries || []) {
    const row = document.createElement('div');
    row.className = 'query';
    const text = document.createElement('input');
    text.value = query.text;
    text.dataset.language = query.language;
    text.dataset.line = query.line;
    text.dataset.reason = query.reason;
    const lang = document.createElement('select');
    for (const item of state.meta.languages) {
      const option = new Option(item.name, item.code);
      if (item.code === query.language) option.selected = true;
      lang.append(option);
    }
    row.append(text, lang);
    root.append(row);
  }
  $('confirm').hidden = false;
  $('plannerName').textContent = task.planner === 'model' ? '模型改写' : '规则改写';
  const notes = [task.plannerNotice, task.workPolicy].filter(Boolean);
  $('policyNote').textContent = notes.join(' ');
}

function collectQueries() {
  return [...document.querySelectorAll('#queryList .query')].map((row) => {
    const text = row.querySelector('input');
    const lang = row.querySelector('select');
    return { text: text.value, language: lang.value, line: text.dataset.line || 'seed', reason: text.dataset.reason || '人工确认' };
  });
}

function renderQueue(tasks) {
  const root = $('queue');
  root.replaceChildren();
  if (!tasks.length) {
    root.textContent = '队列是空的。先生成查询并确认。';
    return;
  }
  const labels = { awaiting_confirm: '待确认', queued: '排队中', running: '检索中', completed: '完成', failed: '中断，可继续' };
  for (const task of tasks) {
    const row = document.createElement('div');
    row.className = 'task';
    const text = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = task.topic;
    const meta = document.createElement('div');
    meta.className = 'hint';
    meta.textContent = `${task.mode === 'study' ? '学习' : '工作 · 热点'} · ${labels[task.status] || task.status} · ${task.fetched || 0} 条`;
    text.append(title, meta);
    const actions = document.createElement('div');
    if (task.status === 'queued' || task.resumable) {
      const run = document.createElement('button');
      run.className = 'secondary';
      run.textContent = task.status === 'queued' ? '执行' : '继续';
      run.onclick = () => runTask(task.id);
      actions.append(run);
    }
    if (task.status === 'completed' || task.status === 'failed' || task.fetched) {
      const open = document.createElement('button');
      open.className = 'quiet';
      open.textContent = '查看';
      open.onclick = () => showTask(task.id);
      actions.append(open);
    }
    row.append(text, actions);
    root.append(row);
  }
}

async function refreshQueue() {
  renderQueue(await api('/api/tasks'));
}

async function showTask(id) {
  const task = await api(`/api/tasks/${id}`);
  $('result').hidden = false;
  $('resultTitle').textContent = task.topic;
  $('resultMeta').textContent = `${task.mode === 'study' ? (task.track === 'design' ? '设计作业' : '论文/毕设') : '热点'} · ${task.status} · 抓取上限 ${task.params.fetchLimit}`;
  $('exportLink').href = `/api/tasks/${task.id}/export`;
  const notices = $('notices');
  notices.replaceChildren();
  for (const notice of task.checkpoint?.notices || []) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = notice;
    notices.append(p);
  }
  $('review').textContent = task.checkpoint?.review || '还没有综述。';
  const quotes = $('quotes');
  quotes.replaceChildren();
  for (const doc of task.checkpoint?.documents || []) {
    for (const quote of doc.quotes || []) {
      const card = document.createElement('div');
      card.className = 'quote';
      const block = document.createElement('blockquote');
      block.textContent = quote.text;
      const cite = document.createElement('cite');
      cite.textContent = `${doc.title || '未命名'} · ${doc.publishedAt || '时间未核实'} · ${doc.url}`;
      card.append(block, cite);
      if (doc.images?.length) {
        const images = document.createElement('div');
        images.className = 'images';
        for (const image of doc.images) {
          const img = document.createElement('img');
          img.alt = doc.title || '原图';
          img.src = `/api/tasks/${task.id}/images/${image.path.split('/').pop()}`;
          images.append(img);
        }
        card.append(images);
      }
      quotes.append(card);
    }
  }
}

async function runTask(id) {
  try {
    toast('开始检索');
    await api(`/api/tasks/${id}/run`, { method: 'POST' });
    poll();
  } catch (error) {
    toast(error.message);
  }
}

function poll() {
  const timer = setInterval(async () => {
    const tasks = await api('/api/tasks');
    renderQueue(tasks);
    if (tasks.some((task) => task.status === 'running')) return;
    clearInterval(timer);
    const latest = tasks.find((task) => task.status === 'completed' || task.status === 'failed');
    if (latest) showTask(latest.id);
  }, 1200);
}

async function renderHealth() {
  const health = await api('/api/health');
  if (state.meta?.model) state.meta.model.mode = health.model;
  const configured = health.model === 'model';
  const modelName = state.meta?.model?.primaryModel || 'deepseek-chat';
  const items = [
    ['模型', configured ? `已配置 ${modelName}。默认调用模型` : '未配置密钥。默认仍是调用模型；可改选纯规则'],
    ['SearXNG', health.searxng === 'online' ? '已启动' : '未启动'],
    ['小红书', health.xiaohongshu === 'login-recorded' ? '已记录登录' : '尚未登录'],
    ['抖音', health.douyin === 'login-recorded' ? '已记录登录' : '尚未登录'],
  ];
  const root = $('health');
  root.replaceChildren();
  for (const [name, value] of items) {
    const li = document.createElement('li');
    li.textContent = `${name}：${value}`;
    root.append(li);
  }
  updateEnginePill();
}

const CATEGORY_LABELS = { collage: '拼图', makeup: '美妆', template: '模板', other: '其他' };

async function renderLibrary() {
  const category = $('libraryCategory').value;
  const data = await api(`/api/library?category=${category}`);
  const rows = data.records || [];
  const accepted = rows.reduce((sum, row) => sum + (row.cases || []).length, 0);
  $('libraryStatus').textContent = `${CATEGORY_LABELS[category] || category}：${rows.length} 个已查来源；${accepted} 款本规则下合格。`;
  const deliveries = $('libraryDeliveries');
  deliveries.replaceChildren();
  for (const task of (data.tasks || []).filter((item) => /^\/library\//.test(item.gallery_url || ''))) {
    const p = document.createElement('p');
    const link = document.createElement('a');
    link.href = task.gallery_url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = `${task.title || '打开本批图册'} ↗`;
    p.append(link);
    deliveries.append(p);
  }
  const names = await api(`/api/library/snapshots?category=${category}`);
  const select = $('librarySnapshot');
  select.replaceChildren();
  for (const name of names) select.append(new Option(name, name));
  const list = $('libraryRows');
  list.replaceChildren();
  for (const row of rows.slice(0, 50)) {
    const article = document.createElement('article');
    article.className = 'library-row';
    const title = document.createElement('strong');
    title.textContent = row.title || row.id;
    const meta = document.createElement('small');
    meta.textContent = `${row.platform || ''} · ${row.region || '地区未知'} · ${row.review_status || '待核验'}`;
    const summary = document.createElement('p');
    summary.textContent = row.exclusion_reason || row.summary || '';
    article.append(title, meta, summary);
    list.append(article);
  }
}

async function boot() {
  state.meta = await api('/api/meta');
  $('version').textContent = `v${state.meta.version}`;
  setMode('work');
  renderLanguages();
  await loadPresets();
  await renderHealth();
  await refreshQueue();
}

document.querySelectorAll('[data-mode]').forEach((button) => button.onclick = () => setMode(button.dataset.mode));
document.querySelectorAll('[data-track]').forEach((button) => button.onclick = () => setTrack(button.dataset.track));
document.querySelectorAll('[data-engine]').forEach((button) => button.onclick = () => setEngine(button.dataset.engine));

$('taskForm').onsubmit = async (event) => {
  event.preventDefault();
  try {
    const task = await api('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        topic: $('topic').value,
        mode: state.mode,
        track: state.track,
        engine: state.engine,
        resourceCategory: state.mode === 'work' ? $('resourceCategory').value : undefined,
        caseTarget: state.mode === 'work' ? Number($('caseTarget').value) : undefined,
        params: currentParams(),
      }),
    });
    state.task = task;
    renderQueries(task);
    toast('查询已生成，请确认');
  } catch (error) {
    toast(error.message);
  }
};

$('confirmBtn').onclick = async () => {
  if (!state.task) return;
  try {
    await api(`/api/tasks/${state.task.id}/confirm`, { method: 'POST', body: JSON.stringify({ queries: collectQueries() }) });
    $('confirm').hidden = true;
    toast('已加入队列');
    await refreshQueue();
  } catch (error) {
    toast(error.message);
  }
};

$('savePreset').onclick = async () => {
  try {
    await api('/api/presets', {
      method: 'POST',
      body: JSON.stringify({ name: $('presetName').value, mode: state.mode, track: state.track, params: currentParams() }),
    });
    toast('预设已保存');
    await loadPresets();
  } catch (error) {
    toast(error.message);
  }
};

$('runQueue').onclick = async () => {
  await api('/api/queue/run', { method: 'POST' });
  toast('开始执行队列');
  poll();
};

$('resourceLibraryBtn').onclick = async () => {
  $('library').hidden = false;
  try { await renderLibrary(); } catch (error) { $('libraryStatus').textContent = error.message; }
};
$('closeLibrary').onclick = () => { $('library').hidden = true; };
$('libraryCategory').onchange = () => renderLibrary().catch((error) => { $('libraryStatus').textContent = error.message; });
$('libraryExport').onclick = () => { location.href = `/api/library/archive?category=${$('libraryCategory').value}`; };
$('libraryImportBtn').onclick = () => $('libraryImport').click();
$('libraryImport').onchange = async (event) => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    let text;
    if (file.name.endsWith('.gz')) {
      const stream = file.stream().pipeThrough(new DecompressionStream('gzip'));
      text = await new Response(stream).text();
    } else text = await file.text();
    const incoming = JSON.parse(text);
    if (incoming.resource_category !== $('libraryCategory').value) throw new Error('分类不匹配，请先切换对应分类');
    await api('/api/library/merge', { method: 'POST', body: JSON.stringify(incoming) });
    await renderLibrary();
    toast('已合并到分类台账');
  } catch (error) {
    toast(error.message);
  }
};
$('libraryRestore').onclick = async () => {
  const snapshot = $('librarySnapshot').value;
  if (!snapshot) return toast('没有可恢复的快照');
  try {
    await api('/api/library/restore', { method: 'POST', body: JSON.stringify({ resource_category: $('libraryCategory').value, snapshot }) });
    await renderLibrary();
    toast('已恢复，并保留之后看过的标记');
  } catch (error) {
    toast(error.message);
  }
};

$('settingsBtn').onclick = () => {
  $('primaryBase').value = state.meta.model.primaryBaseURL || '';
  $('primaryModel').value = state.meta.model.primaryModel || '';
  $('backupBase').value = state.meta.model.backupBaseURL || '';
  $('backupModel').value = state.meta.model.backupModel || '';
  $('settings').showModal();
};
$('closeSettings').onclick = () => $('settings').close();
$('settingsForm').onsubmit = async (event) => {
  event.preventDefault();
  const body = {
    primary: { baseURL: $('primaryBase').value, model: $('primaryModel').value, apiKey: $('primaryKey').value },
    backup: { baseURL: $('backupBase').value, model: $('backupModel').value, apiKey: $('backupKey').value },
  };
  state.meta.model = await api('/api/settings', { method: 'POST', body: JSON.stringify(body) });
  $('primaryKey').value = '';
  $('backupKey').value = '';
  $('settings').close();
  toast('已写到本机配置');
  await renderHealth();
};

boot().catch((error) => toast(error.message));
