import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['client', 'server', 'packages/contracts', 'packages/game-core'],
    passWithNoTests: true,
  },
});
