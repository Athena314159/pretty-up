import { isInjection } from './injection.js';
import { splitSentences, termOverlap } from './text.js';

export function extractQuotes(text, query, meta = {}) {
  const source = String(text || '');
  const sentences = splitSentences(source).filter((s) => !isInjection(s) && s.length <= 400);
  return sentences
    .map((sentence) => ({ sentence, score: termOverlap(sentence, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ sentence }) => {
      const start = source.indexOf(sentence);
      return {
        text: sentence,
        start,
        end: start + sentence.length,
        sourceUrl: meta.url || '',
        sourceTitle: meta.title || '',
        publishedAt: meta.publishedAt || null,
        capturedAt: meta.capturedAt || null,
      };
    })
    .filter((quote) => quote.start >= 0 && source.includes(quote.text));
}

export function keepFaithfulQuotes(quotes, sourceText) {
  const source = String(sourceText || '');
  return (quotes || []).filter((quote) => quote && source.includes(quote.text) && !isInjection(quote.text));
}
