// Global site config — edit site-wide info here.
export const SITE = {
  title: 'jiaoqsh',
  // Shown as the homepage subtitle / browser tab suffix.
  description: '记录与分享关于 AI 的思考、实践与观点。',
  author: 'jiaoqsh',
  url: 'https://jiaoqsh.github.io',
  lang: 'zh-CN',
  // Default number of posts per list/home page.
  postsPerPage: 20,
} as const;

// Top navigation.
export const NAV = [
  { label: '文章', href: '/' },
  { label: '归档', href: '/archive' },
  { label: '标签', href: '/tags' },
  { label: '关于', href: '/about' },
] as const;

// Footer social links (empty ones are hidden automatically).
export const SOCIAL = {
  github: 'https://github.com/jiaoqsh',
  twitter: '',
  email: '',
  rss: '/rss.xml',
} as const;
