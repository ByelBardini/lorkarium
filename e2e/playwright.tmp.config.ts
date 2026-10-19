import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: 'http://localhost:5174' },
  webServer: [
    {
      name: 'server',
      command:
        'pnpm --filter @lorkarium/server e2e:database && pnpm --filter @lorkarium/server start',
      url: 'http://localhost:3334/api/health',
      env: { PORT: '3334' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      name: 'client',
      command: 'pnpm --filter @lorkarium/client exec vite --config vite.e2e-tmp.config.ts',
      url: 'http://localhost:5174',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
