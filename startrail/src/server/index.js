import path from 'node:path';
import { createApp } from './app.js';
import { createRuntime } from '../runtime.js';

const dataDir = process.env.STARTRAIL_DATA || path.join(process.cwd(), 'data');
const port = Number(process.env.PORT || 8877);
const runtime = createRuntime({ dataDir, cwd: process.cwd(), env: process.env });
const server = createApp(runtime);
server.listen(port, '127.0.0.1', () => {
  console.log(`星迹 ${runtime.config.primary.apiKey ? '模型' : '规则'}模式已启动：http://127.0.0.1:${port}`);
});
