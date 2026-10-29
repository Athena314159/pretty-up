import { classifyPublished } from './time.js';

/**
 * Priority follows the v3.2 ranking rules.
 * P1 needs comparable growth evidence. Missing metrics stay missing and never become zero.
 */
export function assignPriority(doc, now, params) {
  const classified = classifyPublished(doc.publishedAt, now, params);
  const metrics = doc.metrics && typeof doc.metrics === 'object' ? doc.metrics : null;
  const growth = !!(metrics && metrics.growthComparable === true && typeof metrics.growthRate === 'number' && metrics.growthRate > 0);
  const recentGrowth = growth && (metrics.growthWindow === 'recent' || classified.bucket === 'recent' || classified.bucket === 'latest');
  if (recentGrowth) return { priority: 'P1', bucket: classified.bucket, growth: '有可比增长证据' };
  const hot = !!(metrics && metrics.heat === 'high' && metrics.sustained === true && (classified.bucket === 'recent' || classified.bucket === 'latest'));
  if (hot) return { priority: 'P2', bucket: classified.bucket, growth: '持续高热，未见可比加速度' };
  if (classified.bucket === 'latest' || classified.bucket === 'recent') {
    return { priority: 'P3', bucket: classified.bucket, growth: metrics?.growthComparable ? '增长未达到上升档' : '待验证' };
  }
  if (classified.bucket === 'history') return { priority: 'P4', bucket: classified.bucket, growth: '历史对照' };
  return { priority: 'P5', bucket: 'undated', growth: '时间未核实' };
}

export function splitQuota(budget, browserShare = 0.5) {
  const total = Math.max(0, Math.floor(budget));
  const share = Math.min(1, Math.max(0, Number(browserShare) || 0));
  const browser = Math.ceil(total * share);
  return { browser, api: total - browser };
}
