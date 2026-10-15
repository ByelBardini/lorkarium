import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
    // Same origin as production: the session cookie stays first-party and no CORS is needed.
    proxy: { '/api': 'http://localhost:3333' },
  },
  test: {
    name: '@lorkarium/client',
    environment: 'jsdom',
    include: ['test/**/*.spec.{ts,tsx}'],
    setupFiles: ['./test/setup.ts'],
  },
});
