import { describe, expect, it } from 'vitest';
import { bannerUrlOf } from '@/lib/banner-url';

describe('bannerUrlOf', () => {
  it('points at the server read route of the profile banner', () => {
    expect(bannerUrlOf('9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d')).toBe(
      '/api/banners/9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
    );
  });
});
