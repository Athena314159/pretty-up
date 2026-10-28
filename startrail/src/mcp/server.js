import path from 'node:path';
import { createService } from '../core/service.js';
import { createRuntime } from '../runtime.js';
import { VERSION } from '../version.js';

const dataDir = process.env.STARTRAIL_DATA || path.join(process.cwd(), 'data');
const runtime = createRuntime({ dataDir, cwd: process.cwd(), env: process.env });
const service = createService(runtime);

const tools = [
  { name: 'startrail_create', description: '创建星迹任务并返回改写后、尚未执行的查询', inputSchema: { type: 'object', properties: { topic: { type: 'string' }, mode: { type: 'string' }, track: { type: 'string' }, params: { type: 'object' } }, required: ['topic'] } },
  { name: 'startrail_confirm', description: '确认查询并加入队列，不会立即检索', inputSchema: { type: 'object', properties: { id: { type: 'string' }, queries: { type: 'array' } }, required: ['id'] } },
  { name: 'startrail_run', description: '执行已确认的任务，或从断点继续', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  { name: 'startrail_status', description: '查看任务状态、摘抄和缺口', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  { name: 'startrail_export', description: '导出资料包摘要。完整压缩包请用本地网页下载。', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
];

function send(message) {
  const json = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
}

async function callTool(name, args) {
  if (name === 'startrail_create') return service.create(args || {});
  if (name === 'startrail_confirm') return service.confirm(args.id, args.queries);
  if (name === 'startrail_run') return service.run(args.id);
  if (name === 'startrail_status') return service.get(args.id);
  if (name === 'startrail_export') {
    const { pack } = service.exportTask(args.id);
    return { schema_version: pack.bundle.schema_version, items: pack.bundle.items.length, gaps: pack.bundle.gaps, notices: pack.bundle.notices };
  }
  throw new Error('未知工具');
}

async function handle(message) {
  if (!message || message.jsonrpc !== '2.0') return;
  if (message.method === 'initialize') {
    return send({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'startrail', version: VERSION } } });
  }
  if (message.method === 'notifications/initialized') return undefined;
  if (message.method === 'tools/list') return send({ jsonrpc: '2.0', id: message.id, result: { tools } });
  if (message.method === 'tools/call') {
    try {
      const data = await callTool(message.params?.name, message.params?.arguments || {});
      return send({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: JSON.stringify(data) }] } });
    } catch (error) {
      return send({ jsonrpc: '2.0', id: message.id, result: { isError: true, content: [{ type: 'text', text: error.message || '失败' }] } });
    }
  }
  if (message.id !== undefined) return send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: '方法不存在' } });
  return undefined;
}

let buffer = Buffer.alloc(0);
process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.length) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd < 0) return;
    const header = buffer.slice(0, headerEnd).toString('utf8');
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }
    const length = Number(match[1]);
    const start = headerEnd + 4;
    if (buffer.length < start + length) return;
    const body = buffer.slice(start, start + length).toString('utf8');
    buffer = buffer.slice(start + length);
    handle(JSON.parse(body)).catch((error) => {
      send({ jsonrpc: '2.0', id: null, error: { code: -32000, message: error.message || '失败' } });
    });
  }
});
