const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 393, height: 873 },
    deviceScaleFactor: 2.75,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 15; Infinix X6871) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'
  });
  const page = await context.newPage();
  const messages = [];
  page.on('console', message => messages.push({ type: message.type(), text: message.text() }));
  page.on('pageerror', error => messages.push({ type: 'pageerror', text: error.message }));
  await page.goto('http://127.0.0.1:4173/?__nexora_visual_test=1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const initial = await page.evaluate(() => {
    const video = document.querySelector('[data-nx-hero] video');
    return {
      documentHeight: document.documentElement.scrollHeight,
      cards: document.querySelectorAll('.tab-content.active .tools-card').length,
      hero: video && { paused: video.paused, ended: video.ended, readyState: video.readyState, currentTime: video.currentTime },
      mode: document.documentElement.className
    };
  });

  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const positions = [];
  for (let round = 0; round < 4; round += 1) {
    const target = round % 2 ? 0 : Math.max(0, height - 873);
    await page.evaluate(y => window.scrollTo(0, y), target);
    await page.waitForTimeout(35);
    positions.push(await page.evaluate(() => {
      const x = Math.round(innerWidth / 2);
      const y = Math.round(innerHeight / 2);
      const hit = document.elementFromPoint(x, y);
      const cards = Array.from(document.querySelectorAll('.tab-content.active .tools-card'));
      const visibleCards = cards.filter(card => {
        const rect = card.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < innerHeight;
      });
      return {
        scrollY,
        hit: hit && (hit.id || hit.className || hit.tagName),
        visibleCards: visibleCards.length,
        visibleCardOpacity: visibleCards.map(card => getComputedStyle(card).opacity),
        bodyHeight: document.body.getBoundingClientRect().height
      };
    }));
  }

  const expensive = await page.evaluate(() => {
    const result = { backdrop: [], filters: [], fixed: [], transform: [] };
    for (const node of document.querySelectorAll('body *')) {
      const style = getComputedStyle(node);
      const name = node.id ? '#' + node.id : String(node.className || node.tagName).split(/\s+/).filter(Boolean).slice(0, 2).join('.');
      if (style.backdropFilter !== 'none' || style.webkitBackdropFilter !== 'none') result.backdrop.push(name);
      if (style.filter !== 'none') result.filters.push(name);
      if (style.position === 'fixed' && style.display !== 'none') result.fixed.push(name);
      if (style.transform !== 'none') result.transform.push(name);
    }
    return result;
  });

  process.stdout.write(JSON.stringify({ initial, positions, expensive, messages }, null, 2) + '\n');
  await browser.close();
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
