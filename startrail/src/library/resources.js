export const CATEGORIES = { collage: '拼图', makeup: '美妆', template: '模板', other: '其他' };

export function categoryOf(task) {
  if (task.resource_category in CATEGORIES) return task.resource_category;
  if (task.resourceCategory in CATEGORIES) return task.resourceCategory;
  const text = `${task.brief || task.topic || ''} ${task.focus || ''}`;
  if (/拼图|拼贴|collage|scrapbook/i.test(text)) return 'collage';
  if (/美妆|妆容|makeup/i.test(text)) return 'makeup';
  if (/模板|template/i.test(text)) return 'template';
  return 'other';
}

export function caseTarget(task) {
  const explicit = task.case_target ?? task.caseTarget ?? task.quantity ?? ((task.brief || task.topic || '').match(/(?:查找|抓取|找|新增|需要|整理)?\s*(\d{1,4})\s*(?:个|条|款)\s*(?:案例|资源|拼图|款式)?/) || [])[1];
  const n = explicit === undefined ? 50 : Number(explicit);
  if (!Number.isInteger(n) || n < 20 || n > 100) {
    throw Object.assign(new Error('单次案例数须为20—100；请将更大任务拆批'), { status: 400 });
  }
  return n;
}

export function workPolicy(task) {
  if (task.mode !== 'work') return '';
  const category = categoryOf(task);
  return `【工作模式资源规则】资源分类：${CATEGORIES[category]}（${category}），有效案例目标：${caseTarget(task)}。开始前查 library/${category}/ledger.json.gz；已交付、已查、已排除全部去重。URL/帖子ID、图片哈希、款式结构签名分别核对，只换照片/颜色/文案不算新款。至少跨 2 个平台、2 个已核验地区，记录实际覆盖和限制，入口市场不等于作者地区。每帖全部图片逐张看完，未核验不计数。${category === 'collage' ? '拼图必须人物出镜且有设计；非人物、无装饰纯四宫格/九宫格、基础纯拼接加入拼图黑名单，不交付。' : ''}每批按分类压缩回存 library，更新 seen 及判定，保留快照。换设备先导入最新压缩记录再合并增量；未交换记录不能宣称自动去重。大图媒体不在仓库里，需另行携带。`;
}

export function styleSignature(features) {
  if (!features || !['slots', 'hierarchy', 'crop', 'overlap', 'decoration'].every((key) => typeof features[key] === 'string' && features[key].trim())) return null;
  return ['slots', 'hierarchy', 'crop', 'overlap', 'decoration'].map((key) => features[key].trim().toLowerCase().replace(/\s+/g, ' ')).join('|');
}

export function auditCases(rows, task, history = []) {
  const category = categoryOf(task);
  const target = caseTarget(task);
  const roots = history.filter((row) => row.resource_category === category);
  const old = roots.flatMap((row) => [row, ...(row.cases || []), ...(row.media_assets || []).map((asset) => ({ media_sha256: asset.sha256 }))]);
  const errors = [];
  const styles = new Set(old.map((row) => row.style_signature).filter(Boolean));
  const urls = new Set(old.map((row) => row.canonical_url || row.url));
  const ids = new Set(old.map((row) => row.platform_post_id).filter(Boolean));
  const batchImages = new Set();
  const hashes = new Set(old.map((row) => row.media_sha256).filter(Boolean));
  for (const row of rows) {
    if (row.resource_category !== category) errors.push(`${row.id}:分类不符`);
    if (!row.full_post_review_complete || row.reviewed_count !== row.total_media || !row.total_media) errors.push(`${row.id}:全帖未核验`);
    if (category === 'collage' && (row.person_visible !== true || row.designed_composition !== true || row.plain_grid === true)) errors.push(`${row.id}:人物或设计门槛不符`);
    if (urls.has(row.canonical_url || row.url) || (row.platform_post_id && ids.has(row.platform_post_id))) errors.push(`${row.id}:原帖重复`);
    if (!row.style_signature) errors.push(`${row.id}:款式待判定`);
    else if (styles.has(row.style_signature)) errors.push(`${row.id}:同款重复`);
    else styles.add(row.style_signature);
    const mediaKey = `${row.platform_post_id || row.url}#${row.media_index ?? 'unknown'}`;
    if (batchImages.has(mediaKey)) errors.push(`${row.id}:同帖同图重复`);
    batchImages.add(mediaKey);
    if (row.media_sha256 && hashes.has(row.media_sha256)) errors.push(`${row.id}:媒体重复`);
    if (row.media_sha256) hashes.add(row.media_sha256);
  }
  if (rows.length !== target) errors.push(`有效案例数量不足或超额：${rows.length}/${target}`);
  if (new Set(rows.map((row) => row.platform).filter(Boolean)).size < 2) errors.push('不足2个平台');
  if (new Set(rows.map((row) => row.region).filter((region) => region && !/未知|unknown/i.test(region))).size < 2) errors.push('不足2个已验证地区');
  return { ok: !errors.length, errors };
}

export function gateWorkResults(bundle, libraries = {}) {
  for (const task of bundle.tasks || []) {
    if (task.mode !== 'work') continue;
    const audit = auditCases(task.resource_cases || [], task, (libraries[categoryOf(task)] || []).filter((row) => row.batch_id !== task.id && !(row.task_ids || []).includes(task.id)));
    task.resource_audit = audit;
    if (!audit.ok) {
      for (const result of task.results || []) if (result.status === 'available') result.status = 'needs_review';
    }
  }
  return bundle;
}
