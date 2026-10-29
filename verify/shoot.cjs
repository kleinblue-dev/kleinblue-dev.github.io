/* 本地验收：静态服务 + Playwright 真实浏览器检查 + 截图
 * 用法: node verify/shoot.cjs
 * 输出: verify/shots/*.png + verify/report.json
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const CHROME = process.env.CHROME_PATH || 'C:\\Users\\2006L\\AppData\\Local\\ms-playwright\\chromium-1124\\chrome-win\\chrome.exe';
const { chromium } = require(path.resolve(ROOT, '..', 'node_modules', 'playwright-core'));

const MIME = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8' };

function serve(port) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/' || p === '') p = '/index.html';
      const file = path.join(ROOT, p.replace(/^\/+/, ''));
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('404');
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

const report = { checks: [], requests: [], console: [], pageErrors: [], shots: [] };
function check(name, ok, detail) {
  report.checks.push({ name, ok: !!ok, detail: detail === undefined ? '' : detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  → ' + detail : ''));
}

(async () => {
  const PORT = 4399;
  const srv = await serve(PORT);
  const base = `http://127.0.0.1:${PORT}/`;
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--font-render-hinting=none'] });

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'zh-CN' });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') report.console.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => report.pageErrors.push(String(e)));
  page.on('request', r => report.requests.push(r.url()));

  await page.goto(base, { waitUntil: 'load' });
  await page.waitForTimeout(600);

  // ---- 基本结构 ----
  check('title 正确', (await page.title()).includes('克莱因蓝'), await page.title());
  check('h1 存在且非空', (await page.locator('h1').innerText()).length > 4, await page.locator('h1').innerText());
  const cardCount = await page.locator('#cards .card').count();
  check('卡片数 = 8', cardCount === 8, String(cardCount));
  const asides = await page.locator('#heroAside .aside-item').count();
  check('右栏索引 = 8', asides === 8, String(asides));

  // ---- 资源零外部请求 ----
  const external = report.requests.filter(u => !u.startsWith(base) && !u.startsWith('data:'));
  check('零外部请求', external.length === 0, external.join(', '));
  const resCount = await page.evaluate(() => performance.getEntriesByType('resource').length);
  check('performance resource 条目 = 0', resCount === 0, String(resCount));
  check('无 pageerror', report.pageErrors.length === 0, report.pageErrors.join(' | '));
  check('无 console error/warn', report.console.length === 0, report.console.slice(0, 5).join(' | '));

  // ---- 首屏截图 ----
  await page.screenshot({ path: path.join(SHOTS, 'desktop-light.png') });
  report.shots.push('desktop-light.png');

  // ---- 筛选 ----
  await page.locator('#chips .chip[data-kind="web"]').click();
  await page.waitForTimeout(150);
  const webCount = await page.locator('#cards .card').count();
  check('筛选「网页」= 3', webCount === 3, String(webCount));
  await page.locator('#chips .chip[data-kind="all"]').click();
  await page.waitForTimeout(100);

  // ---- 搜索 ----
  await page.locator('#searchInput').fill('canvas');
  await page.waitForTimeout(300);
  const searchCount = await page.locator('#cards .card').count();
  check('搜索 canvas 有结果', searchCount >= 1 && searchCount <= 3, String(searchCount));
  await page.locator('#searchInput').fill('zzzznotfound');
  await page.waitForTimeout(300);
  check('空结果显示', await page.locator('#empty').isVisible());
  await page.locator('#searchInput').fill('');
  await page.waitForTimeout(300);
  check('清空后恢复 8', (await page.locator('#cards .card').count()) === 8);

  // ---- 抽屉 ----
  await page.locator('#cards .card').first().click();
  await page.waitForTimeout(450);
  check('抽屉打开', (await page.locator('#drawer').getAttribute('aria-hidden')) === 'false');
  const drawerTitle = await page.locator('#drawerTitle').innerText();
  check('抽屉标题为墨间', drawerTitle.includes('墨间'), drawerTitle);
  await page.screenshot({ path: path.join(SHOTS, 'drawer.png') });
  report.shots.push('drawer.png');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  check('Esc 关闭抽屉', (await page.locator('#drawer').getAttribute('aria-hidden')) === 'true');

  // ---- 命令面板 ----
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(300);
  check('Ctrl+K 打开面板', await page.locator('#palette').evaluate(el => el.classList.contains('on')));
  await page.locator('#paletteInput').fill('mojian');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(SHOTS, 'palette.png') });
  report.shots.push('palette.png');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  check('面板回车打开墨间', (await page.locator('#drawerTitle').innerText()).includes('墨间'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // ---- 主题 ----
  await page.locator('#btnTheme').click();
  await page.waitForTimeout(400);
  check('深色主题生效', (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'dark');
  await page.screenshot({ path: path.join(SHOTS, 'desktop-dark.png') });
  report.shots.push('desktop-dark.png');
  await page.locator('#btnTheme').click();
  await page.waitForTimeout(300);

  // ---- 语言 ----
  await page.locator('#btnLang').click();
  await page.waitForTimeout(400);
  check('英文 html lang', (await page.locator('html').getAttribute('lang')) === 'en');
  check('英文标题', (await page.locator('h1').innerText()).includes('I build'), await page.locator('h1').innerText());
  await page.screenshot({ path: path.join(SHOTS, 'desktop-en.png'), fullPage: false });
  report.shots.push('desktop-en.png');
  await page.locator('#btnLang').click();
  await page.waitForTimeout(300);

  // ---- 键盘可达性 ----
  await page.keyboard.press('/');
  await page.waitForTimeout(200);
  check('“/” 聚焦搜索框', await page.evaluate(() => document.activeElement && document.activeElement.id === 'searchInput'));
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('Tab');
  const firstFocus = await page.evaluate(() => document.activeElement && document.activeElement.className);
  check('Tab 有可见焦点目标', !!firstFocus, String(firstFocus));

  // ---- 深度链接 ----
  await page.goto(base + '#/work/quant-project', { waitUntil: 'load' });
  await page.waitForTimeout(700);
  check('深链直接打开量化项目', (await page.locator('#drawerTitle').innerText()).includes('量化'), await page.locator('#drawerTitle').innerText());

  // ---- 全页截图（浅色，回到顶部）----
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, 'desktop-full.png'), fullPage: true });
  report.shots.push('desktop-full.png');

  // ---- 移动端 ----
  const mctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'zh-CN' });
  const m = await mctx.newPage();
  m.on('pageerror', e => report.pageErrors.push('mobile: ' + e));
  await m.goto(base, { waitUntil: 'load' });
  await m.waitForTimeout(600);
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('375px 无横向溢出', overflow <= 1, 'overflow=' + overflow);
  await m.screenshot({ path: path.join(SHOTS, 'mobile.png'), fullPage: true });
  report.shots.push('mobile.png');
  await m.locator('#cards .card').first().click();
  await m.waitForTimeout(500);
  check('移动端抽屉全宽', await m.locator('#drawer').evaluate(el => Math.round(el.getBoundingClientRect().width) >= 370), '');
  await m.screenshot({ path: path.join(SHOTS, 'mobile-drawer.png') });
  report.shots.push('mobile-drawer.png');
  await mctx.close();

  // ---- 无 JS 兜底 ----
  const nctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, javaScriptEnabled: false });
  const n = await nctx.newPage();
  await n.goto(base, { waitUntil: 'load' });
  const nojsText = await n.locator('.nojs').innerText();
  check('无 JS 时作品清单可见', nojsText.includes('墨间') && nojsText.includes('cmover'), nojsText.split('\n')[0]);
  await n.screenshot({ path: path.join(SHOTS, 'nojs.png') });
  report.shots.push('nojs.png');
  await nctx.close();

  // ---- 尺寸与性能 ----
  const size = fs.statSync(path.join(ROOT, 'index.html')).size;
  check('index.html ≤ 160KB', size <= 160 * 1024, (size / 1024).toFixed(1) + ' KB');
  const perf = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0] || {};
    return { dcl: Math.round(n.domContentLoadedEventEnd || 0), load: Math.round(n.loadEventEnd || 0) };
  });
  report.perf = perf;
  console.log('导航耗时:', JSON.stringify(perf));

  fs.writeFileSync(path.join(__dirname, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  const fails = report.checks.filter(c => !c.ok);
  console.log(`\n结果: ${report.checks.length - fails.length}/${report.checks.length} 通过`);
  if (fails.length) console.log('失败项: ' + fails.map(f => f.name).join('; '));

  await browser.close();
  srv.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
