# 克莱因蓝 · 个人作品集

`https://kleinblue-dev.github.io/`

单文件作品集站点：**一个 index.html，零外部请求，零构建步骤，零托管成本**。
所有作品信息、中英文案、交互逻辑都在这一个文件里，改完推上去 30 秒生效。

## 为什么是单文件

| 约束 | 由此得出的设计 |
|---|---|
| 访客点开就要看到东西 | 内联全部 CSS/JS，首屏 1 个请求；无 CDN、无字体外链 |
| 免费托管（GitHub Pages） | 纯静态，所有功能在客户端完成；不做后端、不存数据 |
| 一个人维护 | 作品 = `const DATA` 里一个对象；不用构建、不用装依赖 |
| 可信 | 无追踪、无第三方脚本；`performance.getEntriesByType('resource')` 实测为 0 |

## 站内功能

- **作品筛选 / 搜索**：按类目过滤，按标题、描述、技术栈子串搜索
- **详情抽屉**：每件作品都有「是什么 / 约束 → 决策 / 本站核验 / 证据链接 / 元信息」，深链 `#/work/<id>` 可直接分享
- **命令面板 `⌘K` / `Ctrl+K`**：搜作品、跳区块、切主题、切语言、复制邮箱；`↑↓` 选择、`↵` 执行、`esc` 关闭
- **主题**：浅色 / 深色，跟随系统，选择保存在 localStorage，首屏无闪烁
- **语言**：中 / 英，全站文案与作品文案同步切换
- **在线预览**：抽屉里点一下才加载第三方页面，首屏不为它付钱
- **无 JS 兜底**：`<noscript>` 里是一份可点的完整作品清单
- **可访问性**：跳过链接、landmark、键盘可达、焦点环、`inert` 抽屉、`aria-live` 结果计数、`prefers-reduced-motion` 降级

## 怎么改（1 分钟）

1. 打开 `index.html`，找到 `/* DATA:START` 与 `/* DATA:END */`。
2. 复制一个作品对象，改 `id / title / tagline / what / fp / stack / live / source / verify / ev`。
3. 顶部 `CONFIG` 里可以改邮箱、GitHub 链接、核验日期。`email` 留空则全站自动隐藏邮箱入口。
4. 刷新页面即可看到；推送到 `main` 后 Pages 自动发布。

## 本地验收（可选）

需要 Node 20+ 与本机 Playwright 的 Chromium（`CHROME_PATH` 可覆盖）。

```powershell
node verify/shoot.cjs   # 功能断言 + 多尺寸/主题/语言截图
node verify/audit.cjs   # 布局、对比度、可访问性、响应式指标
```

两个脚本都会自己起一个本地静态服务（端口 4399 / 4401），不会发外部请求。
`shoot.cjs` 27 项断言、`audit.cjs` 37 项指标，当前全绿（2026-10-29）。

## 部署

仓库就是站点本体，Pages 从 `main` 根目录发布，无需 Actions：

```powershell
git add -A
git commit -m "update"
git push origin main
```

## 数据口径

站内数字分两类，抽屉里会写明是哪一类：

- **本站核验**（2026-10-29 用 `curl` / `gh api` 实测）：页面字节数、HTTP 状态、补丁行数、CI 运行结果等。
- **仓库自述**：README 里的行数、耗时、测试数等，未由本站复跑，原文照录并标注。

## 许可

站点代码可参考复用；站内作品各自遵循其仓库的许可（部分仓库为「仅授权阅读」，非开源）。
