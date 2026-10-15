import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { defineConfig, devices } from '@playwright/test';

// Locally the specs sign in with the admin the server seeds from server/.env; an exported
// variable (the CI job env) wins over the file.
const SERVER_ENV_FILE = new URL('../server/.env', import.meta.url);
if (existsSync(SERVER_ENV_FILE)) {
  for (const [key, value] of Object.entries(parseEnv(readFileSync(SERVER_ENV_FILE, 'utf8')))) {
    process.env[key] ??= value;
  }
}

const isCi = Boolean(process.env.CI);

const SERVER_HEALTH_URL = 'http://localhost:3333/api/health';
const CLIENT_URL = 'http://localhost:5173';

// In CI the client is the production build behind `vite preview`, which inherits `server.proxy`.
const CLIENT_COMMAND = isCi
  ? 'pnpm --filter @lorkarium/client exec vite build && pnpm --filter @lorkarium/client exec vite preview --port 5173 --strictPort'
  : 'pnpm --filter @lorkarium/client dev';

export default defineConfig({
  testDir: 'test',
  forbidOnly: isCi,
  retries: isCi ? 2 : 0,
  workers: isCi ? 1 : undefined,
  reporter: isCi ? [['github'], ['html', { open: 'never' }]] : [['html', { open: 'never' }]],
  use: {
    baseURL: CLIENT_URL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      name: 'server',
      command: 'pnpm --filter @lorkarium/server start',
      url: SERVER_HEALTH_URL,
      reuseExistingServer: !isCi,
      timeout: 60_000,
    },
    {
      name: 'client',
      command: CLIENT_COMMAND,
      url: CLIENT_URL,
      reuseExistingServer: !isCi,
      timeout: 120_000,
    },
  ],
});
