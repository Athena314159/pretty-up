import { redact } from '../core/log.js';

export function chatCompletionsUrl(base) {
  const trimmed = String(base || '').replace(/\/$/, '');
  if (/\/chat\/completions$/.test(trimmed)) return trimmed;
  if (trimmed.endsWith('/v1')) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}

export function parseModelJSON(text) {
  const raw = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('模型没有返回 JSON');
  return JSON.parse(raw.slice(start, end + 1));
}

export async function chatJSON({ slot, system, user, fetchImpl, timeoutMs = 30000, signal }) {
  const apiKey = slot.apiKey;
  const fail = (message, code) => {
    const error = new Error(redact(message, [apiKey]));
    error.code = code;
    return error;
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (signal) signal.addEventListener('abort', onAbort, { once: true });
  try {
    const response = await fetchImpl(chatCompletionsUrl(slot.baseURL), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: slot.model,
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: controller.signal,
    });
    const body = await response.text();
    if (response.status === 401 || response.status === 403) throw fail('模型密钥被拒绝', 'AUTH');
    if (response.status === 429) throw fail('模型额度或速率已用尽', 'QUOTA');
    if (!response.ok) throw fail(`模型请求失败 ${response.status}`, 'HTTP');
    const data = JSON.parse(body);
    const content = data.choices?.[0]?.message?.content || '';
    return parseModelJSON(content);
  } catch (error) {
    if (error.code) throw error;
    throw fail(error.message || '模型请求失败', 'HTTP');
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}
