import { defineProject } from 'vitest/config';

// Integration specs need a disposable Postgres; they run in vitest.integration.config.ts.
export default defineProject({
  test: {
    name: '@lorkarium/server',
    include: ['test/**/*.spec.ts'],
    exclude: ['test/integration/**'],
  },
});
