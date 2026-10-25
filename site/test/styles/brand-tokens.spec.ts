import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { undeclaredBrandTokens } from '../support/brand-tokens';

const SITE_SRC = fileURLToPath(new URL('../../src', import.meta.url));
const BRAND_TOKENS = readFileSync(
  new URL('../../../packages/brand/tokens.css', import.meta.url),
  'utf8',
);

function sourceFilesOf(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.(css|astro|ts)$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

describe('brand tokens', () => {
  it('accepts a reference to a declared token', () => {
    const files = [{ path: 'a.css', text: 'color: var(--brand-gold);' }];

    expect(undeclaredBrandTokens(files, BRAND_TOKENS)).toEqual([]);
  });

  it('names the missing token and the file that uses it', () => {
    const files = [{ path: 'b.css', text: 'color: var(--brand-inexistente);' }];

    expect(undeclaredBrandTokens(files, BRAND_TOKENS)).toEqual([
      'b.css uses --brand-inexistente, which @lorkarium/brand/tokens.css does not declare',
    ]);
  });

  it('finds every --brand-* the site uses in the brand package', () => {
    const files = sourceFilesOf(SITE_SRC).map((path) => ({
      path,
      text: readFileSync(path, 'utf8'),
    }));

    expect(undeclaredBrandTokens(files, BRAND_TOKENS)).toEqual([]);
  });
});
