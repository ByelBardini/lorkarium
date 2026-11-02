import { defineProject } from 'vitest/config';

// The same dev-only key as server/.env.example: the scratch databases are thrown away, so a public
// key is fine here (and a fixed one keeps a spec from depending on the shell).
const TEST_DATA_ENCRYPTION_KEY = 'EJ0VAPvnCxgUGYKDbckfwbxEca0bm7NndOkKfFJQjeQ=';

// One Postgres, one database per worker (test/support/integration-setup.ts): truncation never races
// another spec. Fixed at 4, the size of the CI runner, so a local run behaves like the pipeline.
export default defineProject({
  test: {
    name: '@lorkarium/server-integration',
    include: ['test/integration/**/*.spec.ts'],
    // The server benches (`pnpm bench`) belong to the unit project; without this they ran twice.
    benchmark: { include: [] },
    maxWorkers: 4,
    setupFiles: ['test/support/integration-setup.ts'],
    hookTimeout: 30_000,
    env: { DATA_ENCRYPTION_KEY: TEST_DATA_ENCRYPTION_KEY },
  },
});
