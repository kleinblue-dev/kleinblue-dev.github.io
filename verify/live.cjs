/* 线上验收：对 https://kleinblue-dev.github.io/ 实测
 * 用法: node verify/live.cjs
 */
const path = require('path');
const fs = require('fs');
const CHROME = process.env.CHROME_PATH || 'C:\\Users\\2006L\\AppData\\Local\\ms-playwright\\chromium-1124\\chrome-win\\chrome.exe';
const { chromium } = require(path.resolve(__dirname, '..', '..', 'node_modules', 'playwright-core'));
const SHOTS = path.join(__dirname, 'shots-live');
fs.mkdirSync(SHOTS, { recursive: true });
const URL = 'https://kleinblue-dev.github.io/';
const out = [];
const add = (ok, name, d) => { out.push({ ok: !!ok, name, d: d || '' }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (d ? '  → ' + d : '')); };

(async () => {
  const b = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const p = await ctx.newPage();
  const reqs = [], errs = [], cons = [];
  p.on('request', r => reqs.push(r.url()));
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') cons.push(m.text()); });

  const t0 = Date.now();
  const resp = await p.goto(URL, { waitUntil: 'load' });
  const tLoad = Date.now() - t0;
  add(resp.status() === 200, 'HTTP 200', String(resp.status()));
  add((await p.title()).includes('克莱因蓝'), '页面标题', await p.title());
  await p.waitForTimeout(400);

  const perf = await p.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const res = performance.getEntriesByType('resource');
    const paint = performance.getEntriesByType('paint').map(x => ({ n: x.name, t: Math.round(x.startTime) }));
    return { dcl: Math.round(nav.domContentLoadedEventEnd || 0), load: Math.round(nav.loadEventEnd || 0), resources: res.length, paint };
  });
  add(tLoad < 3000, '导航到 load 耗时', tLoad + ' ms');
  add(perf.resources === 0, '运行时子资源请求 = 0', String(perf.resources));
  add(perf.dcl < 1200, 'DOMContentLoaded', perf.dcl + ' ms');
  add(perf.paint.some(x => x.n === 'first-contentful-paint' && x.t < 1500), 'FCP < 1.5s', JSON.stringify(perf.paint));
  add(errs.length === 0, '无 pageerror', errs.join(' | '));
  add(cons.length === 0, '无 console error', cons.slice(0, 3).join(' | '));
  add((await p.locator('#cards .card').count()) === 8, '8 张卡片');
  add(await p.locator('#heroAside .aside-item').count() === 8, '右栏索引 8 条');
  add(await p.locator('.nojs').isHidden(), '有 JS 时 noscript 隐藏');

  // 成品图（线上）
  await p.screenshot({ path: path.join(SHOTS, 'live-desktop.png') });
  await p.keyboard.press('Control+k'); await p.waitForTimeout(300);
  add(await p.locator('#palette').evaluate(el => el.classList.contains('on')), '线上命令面板可开');
  await p.locator('#paletteInput').fill('量化'); await p.waitForTimeout(150);
  await p.keyboard.press('Enter'); await p.waitForTimeout(500);
  add((await p.locator('#drawerTitle').innerText()).includes('量化'), '线上搜索并打开抽屉', await p.locator('#drawerTitle').innerText());
  await p.screenshot({ path: path.join(SHOTS, 'live-drawer.png') });
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // 三个在线 demo 是否还能进
  const demos = ['https://kleinblue-dev.github.io/mojian/', 'https://kleinblue-dev.github.io/chaitai/', 'https://kleinblue-dev.github.io/ink-mind/'];
  for (const d of demos) {
    const r = await ctx.request.get(d, { timeout: 30000 });
    add(r.status() === 200, 'demo 可达 ' + d.replace('https://kleinblue-dev.github.io', ''), String(r.status()));
  }

  // 移动端
  const mctx = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const m = await mctx.newPage();
  await m.goto(URL, { waitUntil: 'load' }); await m.waitForTimeout(500);
  add(await m.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1, '移动端无横向溢出');
  await m.screenshot({ path: path.join(SHOTS, 'live-mobile.png'), fullPage: true });

  fs.writeFileSync(path.join(__dirname, 'report-live.json'), JSON.stringify({ url: URL, checks: out, perf, requests: reqs }, null, 2), 'utf8');
  const fails = out.filter(x => !x.ok);
  console.log(`\n线上验收: ${out.length - fails.length}/${out.length} 通过；外部请求域名: ${Array.from(new Set(reqs.map(u => { try { return new URL(u).host; } catch (e) { return 'inline'; } }))).join(', ')}`);
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
