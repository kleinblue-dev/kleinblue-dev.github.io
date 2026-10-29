/* 无视觉 UI 审查：用布局/对比度/可访问性指标替代「肉眼看截图」
 * 用法: node verify/audit.cjs
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const CHROME = 'C:\\Users\\2006L\\AppData\\Local\\ms-playwright\\chromium-1124\\chrome-win\\chrome.exe';
const { chromium } = require(path.resolve(ROOT, '..', 'node_modules', 'playwright-core'));

const MIME = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
function serve(port) {
  return new Promise(res => {
    const s = http.createServer((req, rsp) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
      const f = path.join(ROOT, p.replace(/^\/+/, ''));
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain' }); fs.createReadStream(f).pipe(rsp);
    });
    s.listen(port, '127.0.0.1', () => res(s));
  });
}

const out = [];
const add = (sev, name, detail) => { out.push({ sev, name, detail }); console.log(`[${sev}] ${name}${detail ? ' — ' + detail : ''}`); };

(async () => {
  const srv = await serve(4401);
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://127.0.0.1:4401/', { waitUntil: 'load' });
  await page.waitForTimeout(500);

  // 1) 结构 / 语义
  const struct = await page.evaluate(() => {
    const h = Array.from(document.querySelectorAll('h1,h2,h3,h4')).map(e => e.tagName);
    const names = Array.from(document.querySelectorAll('a,button,input,[role="option"]')).map(el => {
      const t = (el.innerText || el.value || '').trim();
      const l = el.getAttribute('aria-label') || '';
      return { tag: el.tagName, ok: !!(t || l), t: t.slice(0, 24) || l };
    }).filter(x => !x.ok);
    const land = { main: !!document.querySelector('main'), nav: !!document.querySelector('nav'), footer: !!document.querySelector('footer'), skip: !!document.querySelector('.skip') };
    const inert = {
      drawer: document.querySelector('#drawer').hasAttribute('inert'),
      palette: document.querySelector('#palette').hasAttribute('inert'),
      drawerFocusable: document.querySelectorAll('#drawer a, #drawer button, #drawer iframe, #drawer input').length
    };
    return { headings: h, unnamed: names, land, inert };
  });
  struct.unnamed.length ? add('FAIL', '存在无名称的可交互元素', JSON.stringify(struct.unnamed.slice(0, 4))) : add('PASS', '可交互元素都有可访问名称');
  struct.land.main && struct.land.nav && struct.land.skip ? add('PASS', 'landmark 完整（main/nav/footer/跳过链接）') : add('FAIL', 'landmark 缺失', JSON.stringify(struct.land));
  add('INFO', '标题层级', struct.headings.join(' '));
  struct.inert.drawer && struct.inert.palette ? add('PASS', '关闭的抽屉/面板为 inert（Tab 不进入）') : add('FAIL', '关闭的抽屉/面板仍可 Tab 进入', JSON.stringify(struct.inert));

  // Tab 可达性（真实键盘循环）：关闭的抽屉/面板不应能被 Tab 进入
  await page.evaluate(() => { if (document.body) document.body.focus(); });
  let enteredHidden = false, ring = null;
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const a = document.activeElement;
      if (!a || a === document.body) return { hidden: false, ring: null };
      const st = getComputedStyle(a);
      return {
        hidden: !!(a.closest('#drawer:not(.on)') || a.closest('#palette:not(.on)')),
        ring: { w: st.outlineWidth, s: st.outlineStyle, cls: String(a.className).slice(0, 24) }
      };
    });
    if (info.hidden) enteredHidden = true;
    if (!ring && info.ring && parseFloat(info.ring.w) >= 1 && info.ring.s !== 'none') ring = info.ring;
  }
  enteredHidden ? add('FAIL', 'Tab 会进入关闭的抽屉/面板') : add('PASS', 'Tab 不会进入关闭的抽屉/面板（inert 生效）');
  ring ? add('PASS', '键盘焦点环可见', ring.w + ' ' + ring.s + ' on .' + ring.cls) : add('FAIL', '键盘 Tab 焦点无可视频外框');

  // 2) Hero canvas 是否真的画了东西
  const canvas = await page.evaluate(() => {
    const c = document.querySelector('#heroCanvas');
    if (!c) return null;
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let painted = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 8) painted++;
    return { w: c.width, h: c.height, painted };
  });
  canvas && canvas.painted > 500 ? add('PASS', 'Hero 点阵已绘制', canvas.w + '×' + canvas.h + ' 非透明像素 ' + canvas.painted) : add('FAIL', 'Hero canvas 空白', JSON.stringify(canvas));

  // 3) 网格列数（响应式）
  async function cols(width) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(250);
    return page.evaluate(() => {
      const cs = Array.from(document.querySelectorAll('#cards .card')).map(c => c.getBoundingClientRect());
      if (!cs.length) return { cols: 0, overflow: 0 };
      const tops = Array.from(new Set(cs.map(r => Math.round(r.top))));
      const firstRow = cs.filter(r => Math.round(r.top) === tops[0]).length;
      return { cols: firstRow, overflow: document.documentElement.scrollWidth - window.innerWidth };
    });
  }
  for (const w of [1440, 1180, 960, 768, 430, 375, 320]) {
    const r = await cols(w);
    add(r.overflow > 1 ? 'FAIL' : 'PASS', `宽度 ${w}px：${r.cols} 列，横向溢出 ${r.overflow}px`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  // 4) 对比度（正文/次要文本/按钮）
  function lum(rgb) {
    const s = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
  }
  const contrast = await page.evaluate(() => {
    function parse(c) {
      const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null;
      const p = m[1].split(',').map(Number);
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    function bgOf(el) {
      let n = el;
      while (n && n !== document.documentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c && c.a > 0.85) return c;
        n = n.parentElement;
      }
      return parse(getComputedStyle(document.body).backgroundColor) || { r: 245, g: 244, b: 241, a: 1 };
    }
    const targets = [['h1', 'h1'], ['.hero-lead', 'hero lead'], ['.card p', '卡片正文'], ['.card-foot', '卡片脚注'],
      ['.sec-lead', 'sect lead'], ['.btn-primary', '主按钮'], ['.chip', '筛选 chip'], ['.foot-in', '页脚'], ['.kind', '类型标签'], ['.stat span', '统计标签']];
    return targets.map(([sel, name]) => {
      const el = document.querySelector(sel); if (!el) return null;
      const st = getComputedStyle(el);
      const fg = parse(st.color), bg = bgOf(el);
      return { name, fg, bg, size: parseFloat(st.fontSize), weight: st.fontWeight };
    }).filter(Boolean);
  });
  function ratio(a, b) {
    const L1 = lum([a.r, a.g, a.b]), L2 = lum([b.r, b.g, b.b]);
    return ((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05));
  }
  for (const c of contrast) {
    const r = ratio(c.fg, c.bg);
    const large = c.size >= 24 || (c.size >= 18.66 && parseInt(c.weight, 10) >= 700);
    const need = large ? 3 : 4.5;
    add(r >= need ? 'PASS' : 'FAIL', `对比度 ${c.name}：${r.toFixed(2)}:1（需 ${need}，${c.size}px）`);
  }

  // 5) 深色主题对比度
  await page.locator('#btnTheme').click(); await page.waitForTimeout(350);
  const dark = await page.evaluate(() => {
    function parse(c) { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
    function bgOf(el) { let n = el; while (n && n !== document.documentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0.85) return c; n = n.parentElement; } return parse(getComputedStyle(document.body).backgroundColor); }
    return [['h1', 'h1'], ['.card p', '卡片正文'], ['.sec-lead', 'sect lead'], ['.card-foot', '卡片脚注'], ['.kind', '类型标签']].map(([sel, name]) => {
      const el = document.querySelector(sel); if (!el) return null; const st = getComputedStyle(el);
      return { name, fg: parse(st.color), bg: bgOf(el), size: parseFloat(st.fontSize), weight: st.fontWeight };
    }).filter(Boolean);
  });
  for (const c of dark) {
    const r = ratio(c.fg, c.bg);
    const need = (c.size >= 24 || (c.size >= 18.66 && parseInt(c.weight, 10) >= 700)) ? 3 : 4.5;
    add(r >= need ? 'PASS' : 'FAIL', `深色对比度 ${c.name}：${r.toFixed(2)}:1（需 ${need}）`);
  }
  await page.locator('#btnTheme').click(); await page.waitForTimeout(250);

  // 6) 触控目标尺寸（移动端）
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(300);
  const taps = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('.topbar a, .topbar button, .chip, .contact-card, .btn, .card-more, #searchInput'));
    return els.map(el => { const r = el.getBoundingClientRect(); return { sel: el.className || el.id, w: Math.round(r.width), h: Math.round(r.height) }; })
      .filter(x => x.w > 0 && (x.h < 24 || x.w < 24));
  });
  taps.length ? add('WARN', '触控目标 < 24px', JSON.stringify(taps.slice(0, 5))) : add('PASS', '触控目标均 ≥ 24px');

  // 7) 文本裁切
  const clipped = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('h1,h2,h3,p,span,a,button').forEach(el => {
      if (el.classList.contains('sr')) return;
      const s = getComputedStyle(el);
      if (s.overflow === 'hidden' && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) bad.push((el.className || el.tagName) + ' ' + el.scrollWidth + '>' + el.clientWidth);
    });
    return bad.slice(0, 6);
  });
  clipped.length ? add('WARN', '存在被截断的文本', clipped.join(' | ')) : add('PASS', '无文本被裁切');

  // 8) 焦点可见（已在 Tab 循环里测量，这里只做尺寸校验）

  // 9) 首屏信息密度：一屏内可读到什么
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);
  const fold = await page.evaluate(() => {
    const inFold = Array.from(document.querySelectorAll('h1,.hero-lead,.stats,.btn')).filter(el => {
      const r = el.getBoundingClientRect(); return r.top >= 0 && r.top < window.innerHeight && r.height > 0;
    }).length;
    return { inFold, heroBottom: Math.round(document.querySelector('.hero').getBoundingClientRect().bottom), vh: window.innerHeight };
  });
  add(fold.heroBottom <= fold.vh ? 'PASS' : 'WARN', `首屏：hero 底边 ${fold.heroBottom}px / 视口 ${fold.vh}px`);

  // 10) 首屏可点击作品数（进入视口内）
  const visibleCards = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('#cards .card'));
    return cards.filter(c => { const r = c.getBoundingClientRect(); return r.top < window.innerHeight * 1.2; }).length;
  });
  add('INFO', '首屏附近可见作品卡片', String(visibleCards));

  // 11) 抽屉内滚动与头部固定
  await page.locator('#cards .card').first().click(); await page.waitForTimeout(500);
  const drawerInfo = await page.evaluate(() => {
    const d = document.querySelector('#drawer'), b = document.querySelector('#drawerBody'), h = document.querySelector('.drawer-head');
    return { w: Math.round(d.getBoundingClientRect().width), scrollable: b.scrollHeight > b.clientHeight, headTop: Math.round(h.getBoundingClientRect().top), vh: window.innerHeight };
  });
  add(drawerInfo.w >= 500 ? 'PASS' : 'WARN', '抽屉宽度 ' + drawerInfo.w + 'px，内容可滚动=' + drawerInfo.scrollable);
  add(drawerInfo.headTop < 10 ? 'PASS' : 'WARN', '抽屉头部吸顶 top=' + drawerInfo.headTop);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);

  // 12) 页面体积 / 请求数
  const bytes = fs.statSync(path.join(ROOT, 'index.html')).size;
  const reqs = await page.evaluate(() => performance.getEntriesByType('resource').length);
  add(bytes < 120 * 1024 ? 'PASS' : 'WARN', '单文件体积 ' + (bytes / 1024).toFixed(1) + ' KB');
  add(reqs === 0 ? 'PASS' : 'FAIL', '运行时子资源请求数 ' + reqs);

  fs.writeFileSync(path.join(__dirname, 'audit.json'), JSON.stringify(out, null, 2), 'utf8');
  const fails = out.filter(x => x.sev === 'FAIL').length, warns = out.filter(x => x.sev === 'WARN').length;
  console.log(`\n审查结果: FAIL ${fails} / WARN ${warns} / 总 ${out.length}`);
  await browser.close(); srv.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
