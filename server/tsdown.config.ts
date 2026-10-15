import { defineConfig } from 'tsdown';

// The @lorkarium/* packages export raw .ts, so Node cannot load them from node_modules: they go in
// the bundle. Every other dependency (argon2's native binary included) stays external.
export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  sourcemap: true,
  dts: false,
  deps: { alwaysBundle: [/^@lorkarium\//] },
});
