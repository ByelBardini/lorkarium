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

// The e2e gets a database of its own (<db>_e2e), emptied on every run, so it never fills the dev
// one. The server and its prepare step inherit this from the webServer environment.
process.env.DATABASE_URL = e2eDatabaseUrl(process.env.DATABASE_URL);
// The same for the images: a bucket of its own (<bucket>-e2e), created by the server at boot.
process.env.S3_BUCKET = e2eBucket(process.env.S3_BUCKET);

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
      command:
        'pnpm --filter @lorkarium/server e2e:database && pnpm --filter @lorkarium/server start',
      url: SERVER_HEALTH_URL,
      // Never reuse: a running `pnpm dev` server writes to the dev database.
      reuseExistingServer: false,
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

// Idempotent: the config is loaded again by every worker.
function e2eDatabaseUrl(base: string | undefined): string {
  if (!base)
    throw new Error(
      'the e2e needs DATABASE_URL (server/.env or the environment); received nothing',
    );
  const url = new URL(base);
  if (!url.pathname.endsWith('_e2e')) url.pathname = `${url.pathname}_e2e`;
  return url.toString();
}

function e2eBucket(base: string | undefined): string {
  if (!base)
    throw new Error('the e2e needs S3_BUCKET (server/.env or the environment); received nothing');
  return base.endsWith('-e2e') ? base : `${base}-e2e`;
}
