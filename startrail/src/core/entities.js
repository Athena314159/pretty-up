import { isInjection } from './injection.js';
import { splitSentences } from './text.js';

const STOP = new Set(['这个', '那种', '一种', '我们', '他们', '研究', '资料', '内容', '图片', '视频', '文章']);

function cleanTerm(term) {
  return String(term || '')
    .replace(/^[\s:：,，、\-–—]+|[\s:：,，、\-–—]+$/g, '')
    .replace(/^(called|known as|即|名为|叫做|称为)\s*/i, '')
    .trim();
}

function accept(term) {
  const text = cleanTerm(term);
  if (text.length < 2 || text.length > 40) return '';
  if (STOP.has(text)) return '';
  if (isInjection(text)) return '';
  if (/^(https?:|www\.)/i.test(text)) return '';
  return text;
}

function push(found, term, sentence, type) {
  const name = accept(term);
  if (!name) return;
  const key = name.toLowerCase();
  if (found.some((item) => item.name.toLowerCase() === key)) return;
  const pattern = /版型|廓形|纹样|面料|剪裁|silhouette|waist|gown|pattern/i.test(name) || /版型|廓形|纹样/.test(sentence);
  found.push({
    name,
    type: pattern ? 'pattern' : type,
    sentence,
    followupQuery: pattern ? `${name} 版型来源` : name,
  });
}

export function extractEntities(text) {
  const found = [];
  const sentences = splitSentences(text);
  const source = sentences.length ? sentences : [String(text || '')];
  for (const sentence of source) {
    if (!sentence || isInjection(sentence)) continue;
    for (const match of sentence.matchAll(/（([^）]{2,40})）|\(([^)]{2,40})\)/g)) push(found, match[1] || match[2], sentence, 'term');
    for (const match of sentence.matchAll(/「([^」]{2,40})」|『([^』]{2,40})』/g)) push(found, match[1] || match[2], sentence, 'term');
    for (const match of sentence.matchAll(/(?:称为|叫做|名为|即|called|known as)\s*([^，。；,;]{2,40})/gi)) push(found, match[1], sentence, 'term');
  }
  return found;
}
