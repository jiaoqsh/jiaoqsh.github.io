# jiaoqsh.github.io

个人博客，记录与分享关于 AI 的思考、实践与观点：<https://jiaoqsh.github.io>

基于 [Astro](https://astro.build) 构建，推送到 `master` 后由 GitHub Actions 自动部署到 GitHub Pages。

## 本地开发

需要 Node.js 22.12 及以上。

```sh
npm install
npm run dev       # 本地预览：http://localhost:4321
npm run build     # 生产构建，输出到 dist/
npm run preview   # 预览生产构建
```

## 写文章

在 `src/content/posts/` 下新建一个 Markdown 文件，文件名即文章地址（`/posts/<文件名>/`）。frontmatter 字段定义在 `src/content.config.ts`：

```yaml
---
title: "文章标题"
description: "列表页和 RSS 中显示的摘要"
pubDate: 2026-09-28
category: "AI"
tags: ["AI", "Agent"]
draft: true        # 草稿：本地预览可见，生产构建和 RSS 中隐藏
---
```

写完后本地预览确认，把 `draft` 改为 `false`，再提交推送即可发布。文章发布后不要改文件名，否则已分享的链接会失效。

## 目录结构

| 路径 | 内容 |
|---|---|
| `src/content/posts/` | 文章 |
| `src/config.ts` | 站点标题、描述、导航、社交链接 |
| `src/pages/` | 首页、归档、标签、关于、RSS 等页面 |
| `src/components/`、`src/layouts/` | 页面组件与布局 |
| `public/` | 静态资源（图片、favicon） |
| `.github/workflows/deploy.yml` | GitHub Pages 部署流程 |
