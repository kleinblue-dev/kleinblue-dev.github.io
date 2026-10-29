/* 生成社交分享图 og.png（1200×630），零外部字体/图片，纯排版 + CSS 点阵
 * 用法: node verify/og.cjs
 */
const path = require('path');
const CHROME = process.env.CHROME_PATH || 'C:\\Users\\2006L\\AppData\\Local\\ms-playwright\\chromium-1124\\chrome-win\\chrome.exe';
const { chromium } = require(path.resolve(__dirname, '..', '..', 'node_modules', 'playwright-core'));

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:1200px;height:630px;overflow:hidden}
  body{
    background:#f5f4f1;color:#12141a;
    font-family:"Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif;
    position:relative;display:grid;grid-template-columns:1fr 380px;
  }
  body::before{content:"";position:absolute;inset:0;opacity:.35;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)' opacity='.22'/%3E%3C/svg%3E");
    background-size:180px 180px;}
  .bar{position:absolute;left:0;top:0;bottom:0;width:10px;background:#002FA7}
  .left{padding:64px 40px 52px 76px;display:flex;flex-direction:column;position:relative;z-index:1}
  .mono{font-family:Consolas,"Cascadia Mono",monospace;font-size:15px;letter-spacing:.22em;color:#666c79;text-transform:uppercase}
  .rule{height:1px;background:rgba(18,20,26,.16);margin:26px 0 30px}
  h1{font-size:92px;line-height:1;letter-spacing:-.04em;font-weight:700}
  h1 em{font-style:normal;color:#002FA7}
  .sub{margin-top:26px;font-size:40px;line-height:1.3;letter-spacing:-.02em;color:#3b404b;font-weight:600}
  .sub b{color:#12141a;font-weight:700}
  .foot{margin-top:auto;display:flex;align-items:center;gap:14px}
  .foot .dot{width:8px;height:8px;border-radius:50%;background:#002FA7}
  .foot span{font-family:Consolas,"Cascadia Mono",monospace;font-size:14px;color:#3b404b;letter-spacing:.06em}
  .right{position:relative;z-index:1;display:flex;flex-direction:column;justify-content:center;align-items:center;border-left:1px solid rgba(18,20,26,.13)}
  .dots{position:absolute;inset:0;background-image:radial-gradient(rgba(18,20,26,.20) 1.4px,transparent 1.4px);background-size:22px 22px;opacity:.55}
  .num{font-family:Consolas,"Cascadia Mono",monospace;font-size:220px;line-height:.86;font-weight:700;color:#002FA7;letter-spacing:-.06em;position:relative}
  .num-label{margin-top:16px;font-size:15px;letter-spacing:.3em;color:#666c79;font-family:Consolas,monospace;text-transform:uppercase;position:relative}
  .seal{position:absolute;right:24px;top:22px;width:34px;height:34px;border-radius:9px;background:#002FA7;display:grid;place-items:center}
  .seal i{width:11px;height:11px;border-radius:50%;background:#f5f4f1;display:block}
</style></head><body>
  <div class="bar"></div>
  <div class="left">
    <div class="mono">KLEINBLUE-DEV / PORTFOLIO</div>
    <div class="rule"></div>
    <h1>克莱因蓝<em>.</em></h1>
    <div class="sub">我做<b>小而完整</b>的东西。</div>
    <div class="foot"><i class="dot"></i><span>单文件 · 零依赖 · 可离线 · 零外部请求</span></div>
  </div>
  <div class="right">
    <div class="dots"></div><div class="seal"><i></i></div>
    <div class="num">08</div>
    <div class="num-label">作品 / 3 LIVE</div>
  </div>
</body></html>`;

(async () => {
  const b = await chromium.launch({ executablePath: CHROME, headless: true });
  const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await p.setContent(html, { waitUntil: 'load' });
  await p.waitForTimeout(250);
  await p.screenshot({ path: path.join(__dirname, '..', 'og.png') });
  const s = (await p.evaluate(() => document.querySelector('.num').innerText)).trim();
  console.log('og.png 已生成；右上角数字=' + s);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
