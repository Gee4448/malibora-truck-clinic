import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `dev-dist` is the service worker vite-plugin-pwa generates in dev. Linting
  // generated workbox output added 42 errors nobody can act on — importScripts,
  // FetchEvent and friends are undefined only because eslint is reading a
  // service worker with browser globals. It buried the real findings: 155
  // problems, of which 42 were noise from a folder that is rebuilt on every
  // `npm run dev` and is already in .gitignore.
  globalIgnores(['dist', 'dev-dist']),
  {
    // The dev tools in scripts/ run under node, not in a page. gradient-hotspot
    // and harvest-classes are node scripts; contrast-audit is the odd one out —
    // it is pasted into a browser console, so it keeps the browser globals
    // below and only needs node's for nothing. Giving the whole folder both is
    // simpler than splitting it and costs nothing: neither file is bundled.
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
])
