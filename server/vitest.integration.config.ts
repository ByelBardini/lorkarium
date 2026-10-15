import { defineProject } from 'vitest/config';

// One shared Postgres: files run one at a time so truncation never races another spec.
export default defineProject({
  test: {
    name: '@lorkarium/server-integration',
    include: ['test/integration/**/*.spec.ts'],
    fileParallelism: false,
    hookTimeout: 30_000,
  },
});
