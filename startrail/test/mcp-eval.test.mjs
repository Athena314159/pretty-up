import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { recommend } from '../eval/recommend.js';
import { scoreRules } from '../eval/score.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function frame(message) {
  const json = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`;
}

test('MCP 能列出工具', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'startrail-mcp-'));
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/mcp/server.js'], {
    cwd: root,
    env: { ...process.env, STARTRAIL_DATA: dir, STARTRAIL_MODEL_API_KEY: '' },
  });
  let buffer = Buffer.alloc(0);
  const messages = [];
  child.stdout.on('data', (chunk) => {
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
      messages.push(JSON.parse(buffer.slice(start, start + length).toString('utf8')));
      buffer = buffer.slice(start + length);
    }
  });
  child.stdin.write(frame({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } } }));
  child.stdin.write(frame({ jsonrpc: '2.0', method: 'notifications/initialized' }));
  child.stdin.write(frame({ jsonrpc: '2.0', id: 2, method: 'tools/list' }));
  const deadline = Date.now() + 8000;
  while (messages.length < 2 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 30));
  child.kill();
  assert.equal(messages[0].result.serverInfo.name, 'startrail');
  assert.equal(messages[0].result.serverInfo.version, '4.0.0');
  const names = messages[1].result.tools.map((tool) => tool.name);
  assert.ok(names.includes('startrail_create'));
  assert.ok(names.includes('startrail_confirm'));
  assert.ok(names.includes('startrail_run'));
  assert.ok(names.includes('startrail_export'));
});

test('评测脚本给规则模式打分并推荐一个主模型', () => {
  const rules = scoreRules();
  assert.equal(rules.passed, rules.total, rules.checks.filter((item) => !item.ok).map((item) => item.id).join(','));
  const suggestion = recommend({ rules, models: [] });
  assert.equal(suggestion.model, 'deepseek-chat');
  assert.equal(suggestion.backup, null);
  assert.match(suggestion.reason, /deepseek-chat/);
  const live = recommend({ rules, models: [{ model: 'backup-model', score: 90, live: true, cost: 2 }, { model: 'deepseek-chat', score: 90, live: true, cost: 1 }] });
  assert.equal(live.model, 'deepseek-chat');
});
