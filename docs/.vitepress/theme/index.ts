import DefaultTheme from 'vitepress/theme';
import { theme, useOpenapi, useTheme } from 'vitepress-openapi/client';
import 'vitepress-openapi/dist/style.css';
import './custom.css';
// Generated from the hub's Huma OpenAPI spec by `npm run docs:spec`.
import spec from '../../public/openapi.json';

export default {
  extends: DefaultTheme,
  async enhanceApp({ app }: { app: import('vue').App }) {
    useOpenapi({ spec });
    // Point the interactive "Try it" requests at the public hub, not localhost.
    useTheme({ server: { getServers: () => [{ url: 'https://bpincentives.com' }] } });
    theme.enhanceApp({ app });
  },
};
