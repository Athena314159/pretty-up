import path from 'node:path';
import { createApp } from './app.js';
import { createRuntime } from '../runtime.js';
import { VERSION } from '../version.js';

const dataDir = process.env.STARTRAIL_DATA || path.join(process.cwd(), 'data');
const port = Number(process.env.PORT || 8877);
const runtime = createRuntime({ dataDir, cwd: process.cwd(), env: process.env });
runtime.libraryDir = path.join(process.cwd(), 'library');
const server = createApp(runtime);
server.listen(port, '127.0.0.1', () => {
  console.log(`星迹 ${VERSION} 已启动，默认调用模型：http://127.0.0.1:${port}`);
});
