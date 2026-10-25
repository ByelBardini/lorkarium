import { existsSync, readdirSync, readFileSync } from 'node:fs';
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

// The dev-only key of server/.env.example, for a server/.env written before the key existed: the
// e2e database is emptied on every run, so nothing sealed with it outlives the run.
process.env.DATA_ENCRYPTION_KEY ??= 'EJ0VAPvnCxgUGYKDbckfwbxEca0bm7NndOkKfFJQjeQ=';

// The e2e server writes e-mail to its log (LogMailer) even if server/.env points at Mailpit: a run
// must not depend on Mailpit being up nor fill the dev inbox. Empty counts as unset for the server.
process.env.SMTP_URL = '';

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

// One project per CI job (`--project=<name>`): on one worker the whole suite passed 20 min.
// Groups are balanced by the specs' own timeouts; a heavy spec gets a group of its own.
const SPEC_GROUPS: Readonly<Record<string, readonly string[]>> = {
  table: [
    'smoke',
    'home',
    'table-presence',
    'open-tables',
    'board',
    'table-cards',
    'campaign-settings',
    'spectators',
  ],
  tokens: [
    'tokens',
    'main-token',
    'token-conditions',
    'condition-catalog',
    'token-resize',
    'images',
    'auras',
  ],
  scene: ['layers', 'token-hidden', 'drawings', 'effect-areas', 'pings'],
  combat: ['combat'],
  vision: ['vision', 'vision-cone'],
  lighting: ['lighting'],
  library: ['library', 'character'],
  // Borrows Bia and Caio for password and 2FA (undone at the end): kept away from the others.
  account: ['account'],
  // Invites, suspends and deletes accounts (Bia's table blocks her deletion): its own group too.
  backoffice: ['backoffice'],
};

assertEverySpecIsGrouped(SPEC_GROUPS);

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
  projects: Object.entries(SPEC_GROUPS).map(([name, specs]) => ({
    name,
    testMatch: specs.map((spec) => `${spec}.spec.ts`),
    use: { ...devices['Desktop Chrome'] },
  })),
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

// A spec outside every group would run locally and silently never in CI.
function assertEverySpecIsGrouped(groups: Readonly<Record<string, readonly string[]>>): void {
  const grouped = Object.values(groups).flat();
  const specs = readdirSync(new URL('./test/', import.meta.url))
    .filter((file) => file.endsWith('.spec.ts'))
    .map((file) => file.slice(0, -'.spec.ts'.length));
  const ungrouped = specs.filter((spec) => !grouped.includes(spec));
  const missing = grouped.filter((spec) => !specs.includes(spec));
  const repeated = grouped.filter((spec, index) => grouped.indexOf(spec) !== index);
  if (ungrouped.length + missing.length + repeated.length === 0) return;
  throw new Error(
    `every e2e spec must be in exactly one SPEC_GROUPS entry of playwright.config.ts; ungrouped: [${ungrouped.join(', ')}], listed but missing: [${missing.join(', ')}], repeated: [${repeated.join(', ')}]`,
  );
}

function e2eBucket(base: string | undefined): string {
  if (!base)
    throw new Error('the e2e needs S3_BUCKET (server/.env or the environment); received nothing');
  return base.endsWith('-e2e') ? base : `${base}-e2e`;
}
