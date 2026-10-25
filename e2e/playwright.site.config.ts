import { defineConfig, devices } from '@playwright/test';

const isCi = Boolean(process.env.CI);
// 4321 is the landing's `astro dev`; the e2e serves the production build on its own port.
const SITE_PORT = 4322;
const SITE_URL = `http://localhost:${SITE_PORT}`;

// The landing alone: a static build behind `astro preview`, no server and no database. The GitHub
// API and the installer are answered by `page.route` in the specs.
export default defineConfig({
  testDir: 'test/site',
  forbidOnly: isCi,
  retries: isCi ? 2 : 0,
  reporter: isCi ? [['github'], ['html', { open: 'never' }]] : [['html', { open: 'never' }]],
  use: { baseURL: SITE_URL, trace: 'on-first-retry' },
  projects: [{ name: 'site', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm --filter @lorkarium/site build && pnpm --filter @lorkarium/site preview --port ${SITE_PORT}`,
    url: SITE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      SITE_URL,
      PUBLIC_APP_URL: 'https://mesa.lorkarium.test',
      PUBLIC_CONTACT_EMAIL: 'contato@lorkarium.test',
      LEGAL_DRAFTS_ALLOWED: 'true',
    },
  },
});
