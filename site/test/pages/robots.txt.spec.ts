import { describe, expect, it } from 'vitest';
import { GET } from '@/pages/robots.txt';

describe('robots.txt', () => {
  it('allows every crawler and points at the sitemap index of SITE_URL', async () => {
    const response = GET({ site: new URL('https://lorkarium.test') });

    expect(await response.text()).toBe(
      'User-agent: *\nAllow: /\n\nSitemap: https://lorkarium.test/sitemap-index.xml\n',
    );
  });

  it('refuses to build without a site, naming the missing value', () => {
    expect(() => GET({ site: undefined })).toThrow(/site is undefined; expected SITE_URL/);
  });
});
