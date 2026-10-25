/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { getViteConfig } from 'astro/config';

// The root `vitest.config.ts` runs this project from the repo root; Astro must load site/.
const SITE_ROOT = fileURLToPath(new URL('.', import.meta.url));

const TEST_ENV = {
  PUBLIC_APP_URL: 'https://mesa.lorkarium.test',
  PUBLIC_CONTACT_EMAIL: 'contato@lorkarium.test',
  LEGAL_DRAFTS_ALLOWED: 'true',
  SITE_URL: 'https://lorkarium.test',
};

// astro:env inlines its values while transforming, in this process, where `test.env` never
// reaches; without this a local site/.env would win over the test values.
Object.assign(process.env, TEST_ENV);

export default getViteConfig(
  {
    root: SITE_ROOT,
    test: {
      name: '@lorkarium/site',
      include: ['test/**/*.spec.ts'],
      globalSetup: ['test/support/sync-content.ts'],
      env: TEST_ENV,
    },
  },
  { root: SITE_ROOT },
);
