import path from 'node:path';
import readline from 'node:readline';
import { markLogin } from '../src/adapters/social.js';

const site = process.argv[2];
if (!['xiaohongshu', 'douyin'].includes(site)) {
  console.error('用法：node scripts/login-browser.mjs xiaohongshu|douyin');
  process.exit(1);
}
const label = site === 'xiaohongshu' ? '小红书' : '抖音';
const dataDir = process.env.STARTRAIL_DATA || path.join(process.cwd(), 'data');
const profileDir = path.join(dataDir, 'browser', site);
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('还没有安装 Playwright。请先运行：npm install playwright && npx playwright install chromium');
  process.exit(1);
}
const context = await chromium.launchPersistentContext(profileDir, { headless: false, viewport: { width: 1360, height: 900 }, locale: 'zh-CN' });
const page = context.pages()[0] || await context.newPage();
await page.goto(site === 'xiaohongshu' ? 'https://www.xiaohongshu.com' : 'https://www.douyin.com', { waitUntil: 'domcontentloaded' });
console.log(`请在打开的浏览器里手动登录${label}。登录完成后回到这里按回车。星迹不会询问或保存密码。`);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
await new Promise((resolve) => rl.question('登录完成后按回车… ', resolve));
rl.close();
markLogin(profileDir);
await context.close();
console.log(`${label}的登录状态已记在本机浏览器配置里。之后检索会复用它。`);
