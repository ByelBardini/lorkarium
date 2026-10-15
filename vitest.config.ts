import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'client',
      'server/vitest.config.ts',
      'server/vitest.integration.config.ts',
      'packages/contracts',
      'packages/game-core',
    ],
    passWithNoTests: true,
    // Report only, no threshold: scenarios come from the contract, never from uncovered lines (skill testar).
    coverage: { provider: 'v8', reporter: ['text-summary', 'html'] },
  },
});
