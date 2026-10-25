import js from '@eslint/js';
import astro from 'eslint-plugin-astro';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // As fixtures dos drivers de .claude/skills violam regras de propósito; docs/pages é mockup exportado (com runtime vendorizado), não código.
  {
    ignores: [
      '**/dist',
      '**/coverage',
      '**/node_modules',
      '**/playwright-report',
      '**/test-results',
      '.claude/skills/*/fixtures',
      'docs/pages',
      'desktop/src-tauri/target',
      'desktop/src-tauri/gen',
      'site/.astro',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['client/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  ...astro.configs['flat/recommended'],
  {
    files: ['desktop/src/**/*.ts', 'site/src/**/*.{ts,astro}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: [
      'server/**/*.ts',
      'packages/**/*.ts',
      'e2e/**/*.ts',
      'site/test/**/*.ts',
      'site/*.{mjs,ts}',
      '*.{js,ts}',
      '.claude/**/*.mjs',
    ],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
