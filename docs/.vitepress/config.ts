import { defineConfig } from 'vitepress';
import { useSidebar } from 'vitepress-openapi';
// Generated from the hub's Huma OpenAPI spec by `npm run docs:spec`.
import spec from '../public/openapi.json';

const oaSidebar = useSidebar({ spec, linkPrefix: '/operations/' });

// Docs site for docs.bpincentives.com. The API reference is rendered per-operation
// by the vitepress-openapi plugin under /operations/, with a tag-grouped sidebar.
export default defineConfig({
  title: 'Bloodpoint Incentives',
  description: 'Self-host and consume the Dead by Daylight bloodpoint incentives hub.',
  lang: 'en-US',
  cleanUrls: true,
  // Isolate PostCSS from the app's root Tailwind config (the docs don't use it).
  vite: { css: { postcss: {} } },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' }],
    ['link', { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }],
  ],
  themeConfig: {
    logo: '/favicon.svg',
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API Reference', link: '/operations/' },
      { text: 'App', link: 'https://bpincentives.com' },
    ],
    // One unified sidebar shown on every page, so the API reference lives in the
    // same menu as the guide instead of swapping in a separate one.
    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'Getting started', link: '/guide/getting-started' },
          { text: 'How it works', link: '/guide/how-it-works' },
        ],
      },
      {
        text: 'Contribute an agent',
        items: [
          { text: 'Running an agent', link: '/guide/running-an-agent' },
        ],
      },
      {
        text: 'Self-hosting',
        items: [
          { text: 'Running the hub', link: '/guide/self-hosting' },
          { text: 'Configuration', link: '/guide/configuration' },
        ],
      },
      {
        text: 'Accounts & API',
        items: [
          { text: 'Authentication', link: '/guide/authentication' },
          { text: 'API keys', link: '/guide/api-keys' },
          { text: 'Using the API', link: '/guide/api' },
          { text: 'Forecasting model', link: '/guide/forecasting' },
        ],
      },
      {
        text: 'API reference',
        collapsed: false,
        items: [
          { text: 'Overview', link: '/operations/' },
          // Each tag group is collapsible (and collapsed) so the long operation
          // list doesn't dominate the sidebar.
          ...oaSidebar
            .generateSidebarGroups({ linkPrefix: '/operations/' })
            .map((group) => ({ ...group, collapsed: true })),
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/Buco7854/bloodpoint-incentives' }],
    search: { provider: 'local' },
  },
});
