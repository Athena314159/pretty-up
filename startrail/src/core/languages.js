/** Approximate total speakers, used only to order the default language priority. */
export const LANGUAGES = [
  { code: 'en', name: '英语', speakers: 1500 },
  { code: 'zh', name: '中文', speakers: 1100 },
  { code: 'hi', name: '印地语', speakers: 600 },
  { code: 'es', name: '西班牙语', speakers: 560 },
  { code: 'ar', name: '阿拉伯语', speakers: 380 },
  { code: 'fr', name: '法语', speakers: 310 },
  { code: 'bn', name: '孟加拉语', speakers: 270 },
  { code: 'pt', name: '葡萄牙语', speakers: 260 },
  { code: 'ru', name: '俄语', speakers: 255 },
  { code: 'ur', name: '乌尔都语', speakers: 230 },
  { code: 'id', name: '印尼语', speakers: 200 },
  { code: 'de', name: '德语', speakers: 135 },
  { code: 'ja', name: '日语', speakers: 125 },
  { code: 'sw', name: '斯瓦希里语', speakers: 100 },
  { code: 'mr', name: '马拉地语', speakers: 99 },
  { code: 'te', name: '泰卢固语', speakers: 96 },
  { code: 'tr', name: '土耳其语', speakers: 90 },
  { code: 'ta', name: '泰米尔语', speakers: 86 },
  { code: 'vi', name: '越南语', speakers: 85 },
  { code: 'it', name: '意大利语', speakers: 85 },
  { code: 'ko', name: '韩语', speakers: 82 },
  { code: 'fa', name: '波斯语', speakers: 80 },
  { code: 'th', name: '泰语', speakers: 60 },
  { code: 'pl', name: '波兰语', speakers: 50 },
  { code: 'uk', name: '乌克兰语', speakers: 40 },
  { code: 'nl', name: '荷兰语', speakers: 25 },
  { code: 'el', name: '希腊语', speakers: 13 },
  { code: 'sv', name: '瑞典语', speakers: 13 },
  { code: 'he', name: '希伯来语', speakers: 9 },
  { code: 'ro', name: '罗马尼亚语', speakers: 24 },
].sort((a, b) => b.speakers - a.speakers);

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));
const MAX_SPEAKERS = LANGUAGES[0].speakers;

export const TOPIC_HINTS = [
  { re: /西班牙|伊比利亚|马德里|巴塞罗那|\bspain\b|hispania|reconquista/i, lang: 'es', boost: 2.5 },
  { re: /拿破仑|法兰西|法国|巴黎|\bfrance\b|napoleon/i, lang: 'fr', boost: 2.5 },
  { re: /日本|江户|东京|京都|\bjapan\b/i, lang: 'ja', boost: 2.5 },
  { re: /韩国|朝鲜|首尔|\bkorea\b/i, lang: 'ko', boost: 2.5 },
  { re: /德国|柏林|\bgermany\b|deutsch/i, lang: 'de', boost: 2.5 },
  { re: /俄国|俄罗斯|苏联|莫斯科/i, lang: 'ru', boost: 2.5 },
  { re: /阿拉伯|伊斯兰|开罗|中东/i, lang: 'ar', boost: 2.5 },
  { re: /印度|新德里|\bindia\b/i, lang: 'hi', boost: 2.2 },
  { re: /巴西|葡萄牙|\bbrazil\b|\bportugal\b/i, lang: 'pt', boost: 2.5 },
  { re: /越南|河内/i, lang: 'vi', boost: 2.5 },
  { re: /泰国|曼谷/i, lang: 'th', boost: 2.5 },
  { re: /意大利|罗马|佛罗伦萨/i, lang: 'it', boost: 2.5 },
  { re: /土耳其|伊斯坦布尔|奥斯曼/i, lang: 'tr', boost: 2.5 },
  { re: /伊朗|波斯/i, lang: 'fa', boost: 2.5 },
  { re: /印尼|印度尼西亚|雅加达/i, lang: 'id', boost: 2.5 },
];

export function detectScriptBoosts(text) {
  const boosts = {};
  if (/\p{Script=Han}/u.test(text)) boosts.zh = 1.2;
  if (/[ぁ-んァ-ン]/.test(text)) boosts.ja = 1.6;
  if (/[가-힣]/.test(text)) boosts.ko = 1.6;
  if (/[\u0600-\u06FF]/.test(text)) boosts.ar = 1.6;
  if (/[\u0400-\u04FF]/.test(text)) boosts.ru = 1.4;
  if (/[\u0E00-\u0E7F]/.test(text)) boosts.th = 1.6;
  if (/[A-Za-z]/.test(text)) boosts.en = (boosts.en || 0) + 0.4;
  return boosts;
}

export function topicBoosts(text) {
  const boosts = {};
  for (const hint of TOPIC_HINTS) {
    if (hint.re.test(text)) boosts[hint.lang] = Math.max(boosts[hint.lang] || 0, hint.boost);
  }
  return boosts;
}

export function rankLanguages({ topic = '', userWeights = {}, limit = 3 } = {}) {
  const script = detectScriptBoosts(topic);
  const hinted = topicBoosts(topic);
  const ranked = LANGUAGES.map((lang) => {
    const multiplier = userWeights[lang.code];
    const user = multiplier === undefined ? 1 : Number(multiplier);
    if (user <= 0) return null;
    const speakerPrior = lang.speakers / MAX_SPEAKERS;
    const weight = user * speakerPrior + (script[lang.code] || 0) + (hinted[lang.code] || 0);
    return { ...lang, weight, speakerPrior, hinted: !!hinted[lang.code] };
  }).filter(Boolean);
  ranked.sort((a, b) => b.weight - a.weight || b.speakers - a.speakers);
  return ranked.slice(0, Math.max(1, limit));
}

export function languageName(code) {
  return BY_CODE.get(code)?.name || code;
}
