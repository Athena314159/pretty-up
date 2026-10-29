const ORIGIN = {
  xiaohongshu: 'https://www.xiaohongshu.com',
  douyin: 'https://www.douyin.com',
};

function searchUrl(site, query) {
  if (site === 'xiaohongshu') return `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(query)}&source=web_search_result_notes`;
  return `https://www.douyin.com/search/${encodeURIComponent(query)}`;
}

export const playwrightDriver = {
  async open({ site, profileDir, query, detailLimit = 3, headless = false, sleep, between }) {
    let chromium;
    try {
      ({ chromium } = await import('playwright'));
    } catch {
      const error = new Error('尚未安装 Playwright。请在 startrail 目录运行 npm install playwright，再执行 npx playwright install chromium。');
      error.code = 'NO_PLAYWRIGHT';
      throw error;
    }
    const context = await chromium.launchPersistentContext(profileDir, {
      headless,
      viewport: { width: 1360, height: 900 },
      locale: 'zh-CN',
    });
    try {
      const page = context.pages()[0] || await context.newPage();
      const wait = sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
      const pace = between || (() => 8000 + Math.floor(Math.random() * 7000));
      await page.goto(ORIGIN[site], { waitUntil: 'domcontentloaded', timeout: 45000 });
      await wait(pace());
      const box = page.locator('input[type="search"], input[placeholder*="搜索"]').first();
      if (await box.count()) {
        await box.click({ timeout: 5000 });
        await box.pressSequentially(query, { delay: 90 });
        await wait(600);
        await page.keyboard.press('Enter');
      } else {
        await page.goto(searchUrl(site, query), { waitUntil: 'domcontentloaded', timeout: 45000 });
      }
      await wait(pace());
      for (let i = 0; i < 3; i += 1) {
        await page.mouse.wheel(0, 500 + i * 120);
        await wait(Math.max(1200, Math.floor(pace() / 4)));
      }
      const part = site === 'xiaohongshu' ? '/explore/' : '/video/';
      let cards = await page.locator('a').evaluateAll((anchors, hrefPart) => anchors
        .filter((anchor) => anchor.href && anchor.href.includes(hrefPart))
        .slice(0, 8)
        .map((anchor) => ({ url: anchor.href.split('?')[0], title: (anchor.innerText || '').trim().slice(0, 140) })), part);
      const bodyText = await page.locator('body').innerText().catch(() => '');
      if (!cards.length && /登录|扫码登录/.test(bodyText)) return { loginRequired: true, items: [] };
      const unique = [];
      for (const card of cards) {
        if (!unique.some((item) => item.url === card.url)) unique.push(card);
      }
      cards = unique;
      const items = [];
      for (const card of cards.slice(0, detailLimit)) {
        await wait(pace());
        await page.goto(card.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await wait(Math.max(1500, Math.floor(pace() / 3)));
        const detail = await page.evaluate(() => {
          const nodes = [...document.querySelectorAll('article, main, [class*="content"], [class*="desc"]')];
          const text = nodes.map((node) => node.innerText || '').sort((a, b) => b.length - a.length)[0] || '';
          const images = [...document.querySelectorAll('article img, main img, img')]
            .map((img) => img.currentSrc || img.src)
            .filter((src) => src && !src.startsWith('data:') && imgArea(img));
          function imgArea(img) {
            const box = img.getBoundingClientRect();
            return box.width >= 80 && box.height >= 80;
          }
          return { text: text.slice(0, 8000), imageUrls: [...new Set(images)].slice(0, 4) };
        });
        items.push({
          url: card.url,
          title: card.title,
          text: detail.text,
          snippet: (detail.text || card.title).slice(0, 180),
          imageUrls: detail.imageUrls,
          platform: site,
          detailOpened: true,
        });
      }
      return { loginRequired: false, items };
    } finally {
      await context.close();
    }
  },
};
