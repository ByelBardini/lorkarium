import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const SITE_ROOT = fileURLToPath(new URL('../..', import.meta.url));

// `astro sync` writes the store to cacheDir, but under Vitest (a Vite "serve") the content
// module reads it from `.astro/`, so this sync points cacheDir there.
const SYNC_INTO_DOT_ASTRO = [
  "import { sync } from 'astro';",
  "await sync({ root: process.cwd(), cacheDir: './.astro/', logLevel: 'error' });",
].join('\n');

/**
 * Vitest global setup: fills the content data store, which the Container API only reads and a
 * fresh checkout (CI) lacks. A child process because Astro's Vite plugin empties `import 'astro'`.
 * Example: `test: { globalSetup: ['test/support/sync-content.ts'] }` in `site/vitest.config.ts`
 */
export default async function syncContent(): Promise<void> {
  const args = ['--input-type=module', '--eval', SYNC_INTO_DOT_ASTRO];
  await promisify(execFile)(process.execPath, args, { cwd: SITE_ROOT });
}
