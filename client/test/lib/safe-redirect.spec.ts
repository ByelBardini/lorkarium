import { describe, expect, it } from 'vitest';
import { safeRedirectTarget } from '@/lib/safe-redirect';

describe('safeRedirectTarget', () => {
  it.each([
    ['/admin', '/admin'],
    ['/campaigns/42?tab=scenes#top', '/campaigns/42?tab=scenes#top'],
  ])('an in-app path %s is kept', (next, expected) => {
    expect(safeRedirectTarget(next)).toBe(expected);
  });

  it.each([
    ['protocol-relative //evil.com', '//evil.com'],
    ['absolute https://evil.com', 'https://evil.com'],
    ['javascript: URL', 'javascript:alert(1)'],
    ['backslash /\\evil.com', '/\\evil.com'],
    ['the login page itself', '/login'],
    ['an empty value', ''],
    ['a missing value', null],
  ])('%s falls back to /', (_case, next) => {
    expect(safeRedirectTarget(next)).toBe('/');
  });
});
