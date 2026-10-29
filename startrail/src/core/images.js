import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isSafePublicUrl } from './url.js';

export function imageExt(buf) {
  if (!buf || buf.length < 32 || buf.length > 8_000_000) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return '.jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return '.png';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return '.webp';
  if (buf.slice(0, 3).toString() === 'GIF') return '.gif';
  return null;
}

export async function saveImageFiles(record, payloads, { dir, fetchImpl = globalThis.fetch } = {}) {
  const saved = [];
  const queue = [...(payloads || [])];
  for (const url of record.imageUrls || []) {
    if (!url || queue.some((item) => item.url === url) || !isSafePublicUrl(url)) continue;
    try {
      const response = await fetchImpl(url);
      if (!response.ok) continue;
      queue.push({ url, bytes: Buffer.from(await response.arrayBuffer()) });
    } catch {
      // 单张图片失败不影响这条资料。
    }
  }
  if (dir) fs.mkdirSync(dir, { recursive: true });
  for (const item of queue.slice(0, 4)) {
    const buf = Buffer.isBuffer(item.bytes) ? item.bytes : Buffer.from(item.bytes || []);
    const ext = imageExt(buf);
    if (!ext || !dir) continue;
    const name = createHash('sha256').update(buf).digest('hex').slice(0, 16) + ext;
    fs.writeFileSync(path.join(dir, name), buf);
    saved.push({ path: `images/${name}`, sourceUrl: item.url || '', role: 'original' });
  }
  return saved;
}
