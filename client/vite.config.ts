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
    // `ws` carries the Socket.IO upgrade; the Host stays as is (no changeOrigin), since the
    // server only accepts a handshake whose Origin matches it.
    proxy: { '/api': { target: 'http://localhost:3333', ws: true } },
  },
  test: {
    name: '@lorkarium/client',
    environment: 'jsdom',
    include: ['test/**/*.spec.{ts,tsx}'],
    setupFiles: ['./test/setup.ts'],
    // `pnpm bench`: the getter tracker counts every call into another module and weighs more than
    // the code measured (docs/context/client/performance.md).
    benchmark: { suppressExportGetterWarnings: true },
  },
});
