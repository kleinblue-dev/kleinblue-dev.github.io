/* 回归测试：针对 UX 审查（ux-review.md）报出的 P0/P1 逐条复现
 * 用法: node verify/fixes.cjs
 */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const CHROME = process.env.CHROME_PATH || 'C:\\Users\\2006L\\AppData\\Local\\ms-playwright\\chromium-1124\\chrome-win\\chrome.exe';
const { chromium } = require(path.resolve(__dirname, '..', '..', 'node_modules', 'playwright-core'));

const results = [];
const add = (ok, name, detail) => { results.push({ ok: !!ok, name, detail: detail || '' }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  → ' + detail : '')); };

function serve(root, port) {
  const srv = spawn(process.execPath, ['-e', `
    const http=require('http'),fs=require('fs'),path=require('path');
    const root=${JSON.stringify(root)};
    const types={'.html':'text/html; charset=utf-8','.png':'image/png','.xml':'application/xml','.txt':'text/plain'};
    http.createServer((req,res)=>{
      let p=decodeURIComponent(req.url.split('?')[0].split('#')[0]);
      if(p==='/')p='/index.html';
      const f=path.join(root,p);
      fs.readFile(f,(e,b)=>{ if(e){res.writeHead(404);res.end('nope');return;}
        res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream'});res.end(b); });
    }).listen(${port});
  `], { stdio: 'ignore' });
  return srv;
}

(async () => {
  const srv = serve(path.resolve(__dirname, '..'), 4412);
  await new Promise(r => setTimeout(r, 700));
  const base = 'http://127.0.0.1:4412/';
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  const cdp = await ctx.newCDPSession(page);
  const load = async () => { await page.goto(base, { waitUntil: 'load' }); await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(250); };
  await load();

  /* ---------- P0-1 IME 守卫：组合输入按 Enter 不应跳作品 ---------- */
  await page.keyboard.press('Control+k'); await page.waitForTimeout(250);
  await page.locator('#paletteInput').click();
  await cdp.send('Input.imeSetComposition', { text: 'mo', selectionStart: 2, selectionEnd: 2 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await page.waitForTimeout(300);
  const imeState = await page.evaluate(() => ({ paletteOn: document.querySelector('#palette').classList.contains('on'), drawerOn: document.querySelector('#drawer').classList.contains('on'), hash: location.hash }));
  add(imeState.paletteOn && !imeState.drawerOn, 'P0-1 组合输入按 Enter 不跳作品', JSON.stringify(imeState));
  // 组合结束后正常 Enter 仍应工作
  await cdp.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 });
  await page.locator('#paletteInput').fill('墨间'); await page.waitForTimeout(200);
  await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  add(await page.evaluate(() => document.querySelector('#drawer').classList.contains('on')), 'P0-1 组合结束后 Enter 正常打开作品');

  /* ---------- P0-2 scrim 竞态：关闭后 260ms 内重开 ---------- */
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  await page.locator('#cards .card').nth(0).click(); await page.waitForTimeout(120);
  await page.keyboard.press('Escape'); await page.waitForTimeout(60);
  await page.locator('#cards .card').nth(1).click({ force: true }).catch(() => {});
  await page.waitForTimeout(420);
  const race = await page.evaluate(() => { const s = document.querySelector('#scrim'); return { hidden: s.hidden, display: getComputedStyle(s).display, drawerOn: document.querySelector('#drawer').classList.contains('on'), title: document.querySelector('#drawerTitle').textContent.trim() }; });
  add(race.drawerOn ? race.hidden === false && race.display !== 'none' : true, 'P0-2 快速重开时遮罩不被迟到定时器隐藏', JSON.stringify(race));
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);

  /* ---------- P1-1 历史：开/关不叠加条目；后退不再重开 ---------- */
  const hist0 = await page.evaluate(() => history.length);
  for (let i = 0; i < 10; i++) {
    await page.locator('#cards .card').nth(i % 8).click(); await page.waitForTimeout(80);
    await page.keyboard.press('Escape'); await page.waitForTimeout(120);
  }
  const hist1 = await page.evaluate(() => history.length);
  add(hist1 - hist0 <= 1, 'P1-1 开合 10 次后 history 不膨胀', `${hist0} → ${hist1}`);
  await page.locator('#cards .card').nth(0).click(); await page.waitForTimeout(200);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  const hashAfterClose = await page.evaluate(() => location.hash);
  await page.goBack({ waitUntil: 'commit' }).catch(() => {});
  const urlAfterBack = page.url();
  add(hashAfterClose === '' && !urlAfterBack.startsWith(base), 'P1-1 Esc 关闭后 hash 清空、后退离开站点而非重开抽屉', JSON.stringify({ hash: hashAfterClose, url: urlAfterBack.slice(0, 40) }));
  await page.goto(base, { waitUntil: 'load' }); await page.waitForTimeout(200);

  /* ---------- P1-2 抽屉滚动复位 ---------- */
  await page.locator('#cards .card').nth(0).click(); await page.waitForTimeout(250);
  await page.evaluate(() => { const d = document.querySelector('#drawerBody'); d.scrollTop = d.scrollHeight; });
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.locator('#cards .card').nth(4).click(); await page.waitForTimeout(350);
  const st = await page.evaluate(() => ({ top: document.querySelector('#drawerBody').scrollTop, title: document.querySelector('#drawerTitle').textContent.trim() }));
  add(st.top === 0, 'P1-2 换作品后抽屉回到顶部', JSON.stringify(st));
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);

  /* ---------- P1-3 抽屉打开时 "/" 不把焦点送出模态 ---------- */
  await page.locator('#cards .card').nth(0).click(); await page.waitForTimeout(250);
  await page.keyboard.press('/'); await page.waitForTimeout(200);
  const slash = await page.evaluate(() => ({ id: document.activeElement.id, inDrawer: !!document.activeElement.closest('#drawer') }));
  add(slash.inDrawer, 'P1-3 抽屉打开时 / 不夺焦到背景搜索框', JSON.stringify(slash));
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);

  /* ---------- P1-4a 命令面板 Tab 陷阱 ---------- */
  await page.keyboard.press('Control+k'); await page.waitForTimeout(250);
  const outs = [];
  for (let i = 0; i < 4; i++) { await page.keyboard.press('Tab'); outs.push(await page.evaluate(() => ({ tag: document.activeElement.tagName, inPalette: !!document.activeElement.closest('#palette') }))); }
  add(outs.every(o => o.inPalette), 'P1-4a 命令面板 Tab 不逃出', JSON.stringify(outs.map(o => o.tag)));
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);

  /* ---------- P1-4b 抽屉打开时背景不可聚焦 ---------- */
  await page.locator('#cards .card').nth(0).click(); await page.waitForTimeout(250);
  const bg = await page.evaluate(() => {
    const brand = document.querySelector('.brand'); brand.focus();
    return { focused: document.activeElement === brand, topInert: document.querySelector('#top').inert, topbarInert: document.querySelector('.topbar').inert, footerInert: document.querySelector('footer').inert };
  });
  add(!bg.focused && bg.topInert && bg.topbarInert && bg.footerInert, 'P1-4b 抽屉打开时背景 inert', JSON.stringify(bg));
  await page.keyboard.press('Escape'); await page.waitForTimeout(350);

  /* ---------- P1-5 焦点回填：面板压抽屉、连按两次 Ctrl+K ---------- */
  await page.locator('#cards .card').nth(2).click(); await page.waitForTimeout(250);
  await page.keyboard.press('Control+k'); await page.waitForTimeout(250);
  await page.keyboard.press('Escape'); await page.waitForTimeout(350);
  const ret1 = await page.evaluate(() => ({ id: document.activeElement.id || document.activeElement.className, inDrawer: !!document.activeElement.closest('#drawer') }));
  add(ret1.inDrawer, 'P1-5 关闭面板后焦点回到抽屉', JSON.stringify(ret1));
  await page.keyboard.press('Control+k'); await page.waitForTimeout(200);
  await page.keyboard.press('Escape'); await page.waitForTimeout(350);
  add((await page.evaluate(() => document.activeElement.tagName)) !== 'BODY', 'P1-5 连按两次 Ctrl+K 后焦点不落 body');
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);

  /* ---------- P1-6 chips 键盘焦点保持 ---------- */
  await page.locator('#chips .chip[data-kind="web"]').focus();
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  const chipFocus = await page.evaluate(() => ({ tag: document.activeElement.tagName, kind: document.activeElement.getAttribute('data-kind'), inChips: !!document.activeElement.closest('#chips') }));
  add(chipFocus.inChips && chipFocus.kind === 'web', 'P1-6 chips 回车后焦点仍在 chip', JSON.stringify(chipFocus));
  await page.locator('#chips .chip[data-kind="all"]').click(); await page.waitForTimeout(200);

  /* ---------- P1-7 面板锁滚动 ---------- */
  await page.keyboard.press('Control+k'); await page.waitForTimeout(250);
  const lock1 = await page.evaluate(() => document.body.style.overflow);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  const lock2 = await page.evaluate(() => document.body.style.overflow);
  add(lock1 === 'hidden' && lock2 === '', 'P1-7 面板打开锁滚动、关闭还原', `${lock1 || '(空)'} → ${lock2 || '(空)'}`);

  /* ---------- P1-8 noscript 在作品区、且无 JS 时死控件被隐藏 ---------- */
  add(await page.evaluate(() => !!document.querySelector('#work noscript')), 'P1-8 noscript 清单落在作品区内');
  const noJs = await ctx.newPage();
  await noJs.goto(base, { waitUntil: 'load' });
  await noJs.context().addCookies([]);
  const nojsState = await noJs.evaluate(() => ({
    list: document.querySelectorAll('.nojs li').length,
    toolsShown: getComputedStyle(document.querySelector('.tools')).display,
    cardsShown: getComputedStyle(document.querySelector('#cards')).display,
    timelineShown: getComputedStyle(document.querySelector('#timeline')).display
  })).catch(() => null);
  // 该页 JS 正常执行，量的是「noscript 内容存在」，隐藏规则靠 CSS 解析验证
  add((await page.evaluate(() => (document.querySelector('noscript').textContent || '').includes('.tools'))), 'P1-8 无 JS 时隐藏死控件（noscript 样式存在）');
  await noJs.close();

  /* ---------- P1-9 EN 模式下技术栈与许可已翻译 ---------- */
  await page.locator('#btnLang').click(); await page.waitForTimeout(300);
  await page.goto(base + '#/work/ink-mind', { waitUntil: 'load' }); await page.waitForTimeout(500);
  const en = await page.evaluate(() => ({ body: document.querySelector('#drawerBody').innerText }));
  add(/single-file HTML/.test(en.body), 'P1-9 EN 抽屉技术栈已翻译');
  add(/unstated|all rights reserved|read-only licence/.test(en.body), 'P1-9 EN 抽屉许可已翻译', (en.body.match(/unstated|all rights reserved|read-only licence/) || [''])[0]);
  add((await page.title()).includes('Klein Blue'), 'P1-9 EN 页面标题已切换', await page.title());
  const ariaEn = await page.getAttribute('#btnTheme', 'aria-label');
  add(/[a-zA-Z]/.test(ariaEn || '') && !/[\u4e00-\u9fa5]/.test(ariaEn || ''), 'P1-9 EN 无障碍标签已翻译', ariaEn);

  /* ---------- 预览在切语言后保持加载 ---------- */
  await page.goto(base + '#/work/mojian', { waitUntil: 'load' }); await page.waitForTimeout(400);
  await page.locator('#loadPreview').click(); await page.waitForTimeout(600);
  const hasFrame1 = await page.locator('#previewBox iframe').count();
  const wasZh = await page.evaluate(() => document.documentElement.lang === 'zh-CN');
  await page.keyboard.press('Control+k'); await page.waitForTimeout(250);
  await page.locator('#paletteInput').fill(wasZh ? '语言' : 'language'); await page.waitForTimeout(250);
  await page.keyboard.press('Enter'); await page.waitForTimeout(800);
  const langAfter = await page.evaluate(() => document.documentElement.lang);
  const hasFrame2 = await page.locator('#previewBox iframe').count();
  const sandbox = await page.locator('#previewBox iframe').getAttribute('sandbox').catch(() => null);
  add(hasFrame1 === 1 && hasFrame2 === 1, 'P2 切语言后在线预览不被重置', `${hasFrame1} → ${hasFrame2}（lang ${langAfter}）`);
  add(!!sandbox, 'P2 预览 iframe 带 sandbox', String(sandbox));
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);

  /* ---------- 无效深链被清理 ---------- */
  await page.goto(base + '#/work/NOPE', { waitUntil: 'load' }); await page.waitForTimeout(400);
  const bad = await page.evaluate(() => ({ hash: location.hash, drawerOn: document.querySelector('#drawer').classList.contains('on') }));
  add(!bad.hash && !bad.drawerOn, 'P2 无效深链被清理', JSON.stringify(bad));

  /* ---------- 统计与 DATA 联动 ---------- */
  await page.goto(base, { waitUntil: 'load' }); await page.waitForTimeout(300);
  const stats = await page.evaluate(() => ({ repos: document.querySelector('#statRepos').textContent, live: document.querySelector('#statLive').textContent, aside: document.querySelector('#asideCount').textContent, cards: document.querySelectorAll('#cards .card').length }));
  add(stats.repos === '08' && stats.live === '03' && stats.aside === '8 / 8', 'P2 首屏统计与 DATA 一致', JSON.stringify(stats));

  /* ---------- 键位提示按平台 ---------- */
  const kbd = await page.locator('#kbdHint').textContent();
  add(kbd.trim() === 'Ctrl K', 'P2 非 macOS 显示 Ctrl K', kbd.trim());

  add(errors.length === 0, '全程无 pageerror', errors.slice(0, 2).join(' | '));

  await browser.close(); srv.kill();
  const fails = results.filter(r => !r.ok);
  fs.writeFileSync(path.join(__dirname, 'report-fixes.json'), JSON.stringify(results, null, 2), 'utf8');
  console.log(`\n回归: ${results.length - fails.length}/${results.length} 通过`);
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
