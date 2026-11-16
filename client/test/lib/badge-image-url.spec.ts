import { describe, expect, it } from 'vitest';
import { badgeImageUrlOf } from '@/lib/badge-image-url';

describe('badgeImageUrlOf', () => {
  it('points at the badge image route by the image id', () => {
    expect(badgeImageUrlOf('9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d')).toBe(
      '/api/badge-images/9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
    );
  });
});
