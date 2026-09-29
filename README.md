# jiaoqsh.github.io

Personal blog with notes and essays on AI: <https://jiaoqsh.github.io>

Built with [Astro](https://astro.build). Every push to `master` is deployed to GitHub Pages by GitHub Actions.

## Local development

Requires Node.js 22.12 or later.

```sh
npm install
npm run dev       # local preview at http://localhost:4321
npm run build     # production build into dist/
npm run preview   # preview the production build
```

## Writing a post

Create a Markdown file in `src/content/posts/`. The file name becomes the post URL (`/posts/<file-name>/`). Frontmatter fields are defined in `src/content.config.ts`:

```yaml
---
title: "Post title"
description: "Summary shown in post lists and RSS"
pubDate: 2026-09-28
category: "AI"
tags: ["AI", "Agent"]
draft: true        # visible in local preview; hidden from production builds and RSS
---
```

Preview the post locally, set `draft` to `false`, then commit and push to publish. Do not rename a published post's file, or links already shared will break.

## Project layout

| Path | Contents |
|---|---|
| `src/content/posts/` | Posts |
| `src/config.ts` | Site title, description, navigation, social links |
| `src/pages/` | Home, archive, tags, about, and RSS pages |
| `src/components/`, `src/layouts/` | Page components and layout |
| `public/` | Static assets (images, favicon) |
| `.github/workflows/deploy.yml` | GitHub Pages deployment |
