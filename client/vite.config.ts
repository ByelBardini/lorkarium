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
  // Both manifests feed `scripts/check-entry-chunk.ts`: which chunks the entry loads statically,
  // and which modules each chunk holds. The source maps are public on purpose: the code already is
  // (AGPL), and Sentry resolves the browser's stack from them without a token in the build.
  build: { manifest: true, ssrManifest: true, sourcemap: true },
  server: {
    port: 5173,
    // The dev tunnel of the billing service (cloudflared quick tunnel): the Mercado Pago only
    // returns to an HTTPS address and only reaches the webhook from the internet.
    allowedHosts: ['.trycloudflare.com'],
    // Same origin as production: the session cookie stays first-party and no CORS is needed.
    // `ws` carries the Socket.IO upgrade; the Host stays as is (no changeOrigin), since the
    // server only accepts a handshake whose Origin matches it.
    // `/api/billing` first: the billing service (another repository, port 3340) answers it, as
    // the production proxy routes it before the game server.
    proxy: {
      '/api/billing': { target: 'http://localhost:3340' },
      '/api': { target: 'http://localhost:3333', ws: true },
    },
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
