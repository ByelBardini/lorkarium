import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: 'http://localhost:5175' },
  expect: { timeout: 20_000 },
  webServer: [
    {
      name: 'server',
      command:
        'pnpm --filter @lorkarium/server e2e:database && pnpm --filter @lorkarium/server start',
      url: 'http://localhost:3335/api/health',
      env: { PORT: '3335' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      name: 'client',
      command: 'pnpm --filter @lorkarium/client exec vite --config vite.e2e-dice.config.ts',
      url: 'http://localhost:5175',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
