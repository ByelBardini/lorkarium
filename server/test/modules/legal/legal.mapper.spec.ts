import { describe, expect, it } from 'vitest';
import { landingPageUrlOf } from '../../../src/modules/legal/legal.mapper';

describe('landingPageUrlOf', () => {
  it.each([
    ['terms', 'https://example.com/termos/'],
    ['privacy', 'https://example.com/privacidade/'],
    ['acceptable-use', 'https://example.com/uso/'],
  ] as const)('%s is the page %s of the landing', (document, url) => {
    expect(landingPageUrlOf('https://example.com', document)).toBe(url);
  });

  it('keeps the path of a landing served under a folder for the acceptable use policy too', () => {
    expect(landingPageUrlOf('https://example.com/lorkarium', 'acceptable-use')).toBe(
      'https://example.com/lorkarium/uso/',
    );
  });

  it('keeps the path of a landing served under a folder', () => {
    expect(landingPageUrlOf('https://example.com/lorkarium', 'terms')).toBe(
      'https://example.com/lorkarium/termos/',
    );
  });
});
