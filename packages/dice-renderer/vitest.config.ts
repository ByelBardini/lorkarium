import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: '@lorkarium/dice-renderer',
    // The adapter specs draw on the jsdom document (canvas, body) with the real three.js.
    environment: 'jsdom',
    include: ['test/**/*.spec.ts'],
  },
});
