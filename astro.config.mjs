// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build
export default defineConfig({
  site: 'https://jiaoqsh.github.io',
  trailingSlash: 'ignore',
  integrations: [sitemap()],
  // Keep links to renamed posts working.
  redirects: {
    '/posts/the-shape-of-agent-protocols': '/posts/agent-control-tower-session-protocol',
  },
  markdown: {
    shikiConfig: {
      // Dual theme: light / dark, switched on the client via CSS variables
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
      defaultColor: false,
      wrap: true,
    },
  },
});
