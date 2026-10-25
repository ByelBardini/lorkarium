import { defineConfig } from 'vitest/config';

// The splash is the only page the shell serves itself; `tauri dev` waits for this exact port.
export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { outDir: 'dist', target: 'es2023' },
  test: {
    name: '@lorkarium/desktop',
    include: ['test/**/*.spec.ts'],
  },
});
