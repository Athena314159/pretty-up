import fs from 'node:fs';
import path from 'node:path';
import { playwrightDriver } from '../browser/driver.js';

const LABEL = { xiaohongshu: '小红书', douyin: '抖音' };

export function createSocialAdapter({
  site,
  store,
  profileDir,
  driver = playwrightDriver,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  rng = () => 8000 + Math.floor(Math.random() * 7000),
  now = () => Date.now(),
  headless = false,
} = {}) {
  return {
    id: site,
    kind: 'browser',
    label: LABEL[site] || site,
    enabled(task) {
      return site === 'xiaohongshu' ? !!task.params.enableXiaohongshu : !!task.params.enableDouyin;
    },
    async search({ query, task, signal }) {
      if (signal?.aborted) return { ok: false, items: [], error: '任务已取消' };
      const limit = task?.params?.socialMaxPerHour ?? 8;
      const used = store?.countRate(site, now() - 60 * 60 * 1000) || 0;
      if (used >= limit) return { ok: false, items: [], error: `${LABEL[site]}已达到本小时检索次数上限，请稍后再试。` };
      const delay = rng();
      await sleep(delay);
      store?.addRate(site, now());
      try {
        const page = await driver.open({
          site,
          profileDir,
          query,
          detailLimit: task?.params?.socialDetailLimit ?? 3,
          headless,
          sleep,
          between: rng,
        });
        if (page.loginRequired) {
          return { ok: false, items: [], error: `${LABEL[site]}需要登录。请先运行登录命令，在打开的浏览器里手动登录一次。`, code: 'login_required' };
        }
        return { ok: true, items: page.items || [], hasMore: false };
      } catch (error) {
        return { ok: false, items: [], error: error.message || `${LABEL[site]}检索失败` };
      }
    },
    loginMarker() {
      return path.join(profileDir, '.startrail-login-ok');
    },
  };
}

export function markLogin(profileDir) {
  fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(path.join(profileDir, '.startrail-login-ok'), new Date().toISOString());
}

export function loginMarked(profileDir) {
  return fs.existsSync(path.join(profileDir, '.startrail-login-ok'));
}
